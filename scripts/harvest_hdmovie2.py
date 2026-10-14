#!/usr/bin/env python3
"""
HDMovie2 Streaming & Download Harvester for Phantom Movies
==========================================================
Scrapes and integrates HDMovie2 (hdmovie2r.si) and its download hub (hdm2.xyz):
1. Dynamically discovers fresh search nonce from hdmovie2r.si
2. Searches HDMovie2 for titles matching our catalog
3. Harvests multi-server live streaming embeds from DooPlayer REST API
4. Extracts direct cloud downloads (HubDrive, GDFlix, DriveHub, MultiCloud) from hdm2.xyz
5. Updates data/content.json with rich streams and downloads
"""

import os
import sys
import re
import json
import time
import ssl
import urllib.request
import urllib.parse
from typing import Dict, List, Optional, Tuple

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Referer': 'https://hdmovie2r.si/'
}

CONTENT_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "content.json")

def clean_tokens(text: str) -> List[str]:
    t = re.sub(r'\(.*?\)|\[.*?\]', ' ', text)
    t = re.sub(r'\b(hindi|dubbed|dual audio|org|hd|4k|uhd|2160p|1080p|720p|480p|amzn|netflix|hotstar|hdtc|web-dl|rip|full|movie|download|watch|online|free|tamil|telugu|kannada|malayalam)\b', ' ', t, flags=re.I)
    t = re.sub(r'[^a-zA-Z0-9\s]', ' ', t)
    stop = {'the', 'a', 'an', 'in', 'of', 'and', 'to', 'for', 'part'}
    tokens = [w.lower() for w in t.split() if w.lower() not in stop]
    return tokens

def extract_year(text: str) -> int:
    m = re.findall(r'\b(19\d\d|20\d\d)\b', text)
    return int(m[-1]) if m else 0

def is_title_match(catalog_title: str, candidate_title: str, catalog_year: int = 0) -> bool:
    cand_year = extract_year(candidate_title)
    cat_year = catalog_year or extract_year(catalog_title)
    
    if cat_year and cand_year and abs(cat_year - cand_year) > 1:
        return False

    tokens_cat = clean_tokens(catalog_title)
    tokens_cand = clean_tokens(candidate_title)
    if not tokens_cat or not tokens_cand:
        return False
        
    set_cat = set(tokens_cat)
    set_cand = set(tokens_cand)
    
    nums_cat = {t for t in tokens_cat if t.isdigit() and not (len(t) == 4 and (t.startswith('19') or t.startswith('20')))}
    nums_cand = {t for t in tokens_cand if t.isdigit() and not (len(t) == 4 and (t.startswith('19') or t.startswith('20')))}
    if nums_cat and not nums_cat.issubset(nums_cand):
        return False

    phrase_cat = ' '.join(tokens_cat)
    phrase_cand = ' '.join(tokens_cand)
    if phrase_cat in phrase_cand:
        return True
        
    overlap = set_cat.intersection(set_cand)
    overlap_ratio = len(overlap) / len(set_cat)
    
    if overlap_ratio >= 0.7:
        return True
    if len(tokens_cat) == 1 and tokens_cat[0] in set_cand:
        return True
    return False

def clean_title(title: str) -> str:
    """Normalize title for search query."""
    t = re.sub(r'\(.*?\)|\[.*?\]', '', title)
    t = re.sub(r'\b(hindi|dubbed|dual audio|org|hd|4k|uhd|2160p|1080p|720p|480p|amzn|netflix|hotstar|hdtc|web-dl|rip)\b', '', t, flags=re.I)
    t = re.sub(r'[^a-zA-Z0-9\s]', ' ', t)
    return ' '.join(t.split()).strip().lower()

class HDMovie2Harvester:
    def __init__(self):
        self.base_url = "https://hdmovie2r.si"
        self.nonce: Optional[str] = None

    def get_fresh_nonce(self) -> Optional[str]:
        """Fetch latest DooPlay search nonce from homepage."""
        try:
            req = urllib.request.Request(self.base_url, headers=HEADERS)
            with urllib.request.urlopen(req, context=ctx, timeout=10) as res:
                html = res.read().decode('utf-8', errors='ignore')
                m = re.search(r'dtGonza\s*=\s*\{[^}]*[\'"]nonce[\'"]\s*:\s*[\'"]([a-zA-Z0-9]+)[\'"]', html)
                if m:
                    self.nonce = m.group(1)
                    print(f"[*] Fetched fresh HDMovie2 nonce: {self.nonce}", flush=True)
                    return self.nonce
                m2 = re.search(r'[\'"]nonce[\'"]\s*:\s*[\'"]([a-f0-9]{10})[\'"]', html)
                if m2:
                    self.nonce = m2.group(1)
                    print(f"[*] Fetched fallback nonce: {self.nonce}", flush=True)
                    return self.nonce
        except Exception as e:
            print(f"[!] Error fetching HDMovie2 nonce: {e}", flush=True)
        return None

    def search_title(self, title: str) -> List[Dict]:
        """Search title using DooPlay REST API."""
        if not self.nonce:
            self.get_fresh_nonce()
        if not self.nonce:
            return []

        search_query = clean_title(title)
        if not search_query:
            return []

        url = f"{self.base_url}/wp-json/dooplay/search/?keyword={urllib.parse.quote(search_query)}&nonce={self.nonce}"
        try:
            req = urllib.request.Request(url, headers={
                **HEADERS,
                'Accept': 'application/json, text/javascript, */*; q=0.01'
            })
            with urllib.request.urlopen(req, context=ctx, timeout=8) as res:
                raw = res.read().decode('utf-8', errors='ignore')
                data = json.loads(raw)
                if isinstance(data, dict) and 'error' not in data:
                    results = []
                    for post_id, item in data.items():
                        if isinstance(item, dict):
                            results.append({
                                'post_id': str(post_id),
                                'title': item.get('title', ''),
                                'url': item.get('url', ''),
                                'img': item.get('img', ''),
                                'extra': item.get('extra', {})
                            })
                    return results
                elif isinstance(data, dict) and data.get('error') == 'no_verify_nonce':
                    print("[!] Nonce expired, re-fetching...", flush=True)
                    self.nonce = None
                    self.get_fresh_nonce()
        except Exception:
            pass
        return []

    def harvest_streams(self, post_id: str, movie_url: str = "") -> List[Dict]:
        """Harvest streaming embeds for post_id from DooPlayer v2 endpoint."""
        streams = []
        referer = movie_url if movie_url else self.base_url
        req_headers = {
            **HEADERS,
            'Referer': referer,
            'Accept': 'application/json, text/javascript, */*; q=0.01'
        }

        # Query main server sources (1 to 7)
        for s_idx in ['1', '2', '3', '4', '5', '6', '7']:
            api_url = f"{self.base_url}/wp-json/dooplayer/v2/{post_id}/movie/{s_idx}"
            try:
                req = urllib.request.Request(api_url, headers=req_headers)
                with urllib.request.urlopen(req, context=ctx, timeout=5) as res:
                    js = json.loads(res.read().decode('utf-8', errors='ignore'))
                    embed = js.get('embed_url')
                    if embed and embed.startswith('http') and 'youtube' not in embed:
                        domain = urllib.parse.urlparse(embed).netloc.lower()
                        
                        if any(k in domain for k in ['gorri', 'veyda', 'ski', 'qixno', 'fikka']):
                            label = "Server 2 (HDMovie2 - P2P HLS)"
                        elif 'multicloud' in domain:
                            label = "Server 3 (HDMovie2 - MultiCloud HD)"
                        elif 'hubstream' in domain:
                            label = "Server 4 (HubStream)"
                        elif 'morencius' in domain or 'streamwish' in domain:
                            label = "Server 5 (StreamWish)"
                        elif 'prvs' in domain or 'vidhide' in domain:
                            label = "Server 6 (VidHide)"
                        elif 'vsembed' in domain:
                            label = "Server 7 (VSEmbed)"
                        else:
                            label = f"Server {len(streams) + 2} ({domain})"

                        if not any(st['url'] == embed for st in streams):
                            streams.append({
                                'name': label,
                                'url': embed
                            })
            except Exception:
                pass
        return streams

    def harvest_downloads(self, movie_page_url: str) -> List[Dict]:
        """Scrape download page links from movie detail page and hdm2.xyz."""
        downloads = []
        if not movie_page_url:
            return downloads

        try:
            req = urllib.request.Request(movie_page_url, headers=HEADERS)
            with urllib.request.urlopen(req, context=ctx, timeout=8) as res:
                html = res.read().decode('utf-8', errors='ignore')

            # Find download hub links
            hub_links = re.findall(r'href=[\'"](https?://hdm2\.xyz/[^\'"]+)[\'"]', html)
            if not hub_links:
                hub_links = re.findall(r'href=[\'"](https?://[^/]+/download/[^\'"]+)[\'"]', html)

            if hub_links:
                target_hub = hub_links[0]
                hub_req = urllib.request.Request(target_hub, headers={
                    'User-Agent': HEADERS['User-Agent'],
                    'Referer': movie_page_url
                })
                with urllib.request.urlopen(hub_req, context=ctx, timeout=8) as hub_res:
                    hub_html = hub_res.read().decode('utf-8', errors='ignore')

                from bs4 import BeautifulSoup
                soup = BeautifulSoup(hub_html, 'html.parser')
                for a in soup.find_all('a'):
                    href = a.get('href', '').strip()
                    txt = a.get_text(strip=True)
                    
                    if any(k in href.lower() for k in ['hubdrive', 'drivehub', 'gdflix', 'multicloud', 'gofile']):
                        quality = "1080p Full HD"
                        if '2160p' in txt or '4k' in txt.lower() or '2160p' in href:
                            quality = "2160p (4K UHD)"
                        elif '1080p' in txt or '1080p' in href:
                            quality = "1080p Full HD"
                        elif '720p' in txt or '720p' in href:
                            quality = "720p HD"
                        elif '480p' in txt or '480p' in href:
                            quality = "480p SD"

                        size_match = re.search(r'(\d+(?:\.\d+)?\s*(?:GB|MB))', txt, re.I)
                        size = size_match.group(1).upper() if size_match else ("2.4 GB" if "1080" in quality else ("1.2 GB" if "720" in quality else "450 MB"))
                        server = "HubDrive Direct" if "hubdrive" in href else ("GDFlix High Speed" if "gdflix" in href else ("DriveHub Cloud" if "drivehub" in href else "MultiCloud Mirror"))

                        if not any(d['url'] == href for d in downloads):
                            downloads.append({
                                'quality': quality,
                                'size': size,
                                'server': server,
                                'url': href
                            })
        except Exception:
            pass

        return downloads

    def enrich_catalog(self, limit: int = 35) -> int:
        """Enrich existing movies in data/content.json with HDMovie2 streams and downloads."""
        if not os.path.exists(CONTENT_FILE):
            print(f"[!] content.json not found at {CONTENT_FILE}", flush=True)
            return 0

        with open(CONTENT_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)

        catalog = data.get("movies", [])
        print(f"[*] Starting HDMovie2 enrichment for up to {limit} movies...", flush=True)
        
        self.get_fresh_nonce()
        if not self.nonce:
            print("[!] Could not obtain nonce. Aborting enrichment.", flush=True)
            return 0

        enriched_count = 0
        for m in catalog:
            if enriched_count >= limit:
                break
            
            # Check if this movie needs HDMovie2 stream or download enrichment
            existing_streams = m.get("streams", [])
            has_hdmovie2 = any("hdmovie2" in str(s.get("name", "")).lower() or any(d in str(s.get("url", "")) for d in ["gorri", "veyda", "fikka", "qixno"]) for s in existing_streams)
            
            if has_hdmovie2:
                continue

            title = m.get("title", "")
            print(f"[*] Searching HDMovie2 for: {title}", flush=True)
            results = self.search_title(title)
            
            if not results:
                # Try simple title without year
                simple_title = re.sub(r'\b(19\d\d|20\d\d)\b', '', title).strip()
                if simple_title != title:
                    results = self.search_title(simple_title)

            year_val = 0
            try:
                year_val = int(m.get("year", 0))
            except Exception:
                pass

            matched_candidate = None
            if results:
                for cand in results:
                    if is_title_match(title, cand.get("title", ""), year_val):
                        matched_candidate = cand
                        break

            if matched_candidate:
                match = matched_candidate
                post_id = match['post_id']
                movie_url = match.get('url', '')
                print(f"  [+] Confirmed Match: '{match['title']}' for '{title}' (ID: {post_id})", flush=True)

                # Harvest streams
                new_streams = self.harvest_streams(post_id, movie_url)
                if new_streams:
                    if "streams" not in m or not isinstance(m["streams"], list):
                        m["streams"] = []
                    for ns in new_streams:
                        if not any(s.get("url") == ns["url"] for s in m["streams"]):
                            # Insert HDMovie2 stream right after Server 1
                            if len(m["streams"]) > 0:
                                m["streams"].insert(1, ns)
                            else:
                                m["streams"].append(ns)
                    print(f"  [+] Added {len(new_streams)} HDMovie2 streams", flush=True)

                # Harvest downloads
                new_downloads = self.harvest_downloads(movie_url)
                if new_downloads:
                    if "downloads" not in m or not isinstance(m["downloads"], list):
                        m["downloads"] = []
                    for nd in new_downloads:
                        if not any(d.get("url") == nd["url"] for d in m["downloads"]):
                            m["downloads"].append(nd)
                    print(f"  [+] Added {len(new_downloads)} cloud downloads", flush=True)

                if new_streams or new_downloads:
                    enriched_count += 1
                    time.sleep(0.5)

        if enriched_count > 0:
            data["movies"] = catalog
            with open(CONTENT_FILE, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            print(f"[SUCCESS] Enriched {enriched_count} movies with HDMovie2 streams and downloads!", flush=True)
        else:
            print("[INFO] No new items needed enrichment.", flush=True)

        return enriched_count

if __name__ == "__main__":
    harvester = HDMovie2Harvester()
    limit = 25
    if len(sys.argv) > 1 and sys.argv[1].isdigit():
        limit = int(sys.argv[1])
    harvester.enrich_catalog(limit=limit)
