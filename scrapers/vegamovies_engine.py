#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════════════
PHANTOM MOVIES - VEGAMOVIES (V-CLOUD / HUBCLOUD) HARVESTING ENGINE
═══════════════════════════════════════════════════════════════════════════════
Automated scraper engine for Vegamovies:
  1. Searches movies and TV series across live Vegamovies mirrors using
     high-speed Typesense JSON API (/ts-search.php) with HTML fallback.
  2. Extracts multi-quality releases (4K UHD 2160p, 1080p FHD, 720p HD, 480p SD).
  3. Resolves mirror hubs (NexDrive / VgList) to extract paired download options:
     - direct_url: Instant direct CDN link (FastDL / V-Cloud) [Last Link]
     - multi_url: Multi-host cloud mirrors (Filepress, GDToT, DropGalaxy) [First Link]
  4. Automatically cleans and sanitizes all filenames to enforce zero competitor
     brand watermarks ([VegaMovies], -KatDrama, KMMOVIES, etc.).
═══════════════════════════════════════════════════════════════════════════════
"""

import os
import sys
import re
import json
import time
import requests
import urllib3
from typing import List, Dict, Optional, Tuple
from bs4 import BeautifulSoup

# Suppress insecure SSL warnings for dynamic proxy mirrors
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

try:
    from scrapers.filename_sanitizer import sanitize_download_url, sanitize_filename
except ImportError:
    try:
        from filename_sanitizer import sanitize_download_url, sanitize_filename
    except ImportError:
        def sanitize_filename(name, **kwargs):
            clean = re.sub(r'\[.*?VegaMovies.*?\]|VegaMovies(?:\.to|\.is|\.lease)?', '', name or '', flags=re.I).strip(' .-')
            fallback = kwargs.get('fallback_title') or 'Movie'
            return f"{clean or fallback}.mkv"
        def sanitize_download_url(url, **kwargs):
            return url

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate',
    'Connection': 'keep-alive'
}

BASE_MIRRORS = [
    'https://vegamovies.lease',
    'https://vegamovies.free',
    'https://vegamovies.ph',
    'https://vegamovies.is',
    'https://vegamovies.fun'
]

QUALITY_TIERS = [
    ('2160p', '4K Ultra HD', '#c084fc'),
    ('4k', '4K Ultra HD', '#c084fc'),
    ('1080p', '1080p Full HD', '#34d399'),
    ('720p', '720p HD', '#38bdf8'),
    ('480p', '480p SD', '#fbbf24')
]


class VegamoviesEngine:
    """
    Scrapes verified movie download links and direct streaming mirrors from Vegamovies.
    Supports V-Cloud, FastDL, NexDrive, and HubCloud direct extraction.
    """

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update(HEADERS)
        self.active_base = 'https://vegamovies.lease'

    def find_active_mirror(self) -> str:
        """Finds the fastest responding active Vegamovies base domain."""
        for mirror in BASE_MIRRORS:
            try:
                r = self.session.get(mirror, timeout=4, verify=False, allow_redirects=True)
                if r.status_code == 200:
                    self.active_base = r.url.rstrip('/')
                    return self.active_base
            except Exception:
                continue
        return self.active_base

    def fetch_stream_text(self, url: str, timeout: int = 15) -> str:
        """Fetches URL using stream=True and iter_content to prevent chunked read timeouts."""
        try:
            r = self.session.get(url, timeout=timeout, verify=False, stream=True)
            if r.status_code != 200:
                return ""
            chunks = []
            for chunk in r.iter_content(chunk_size=16384, decode_unicode=True):
                if chunk:
                    chunks.append(chunk)
            return "".join(chunks)
        except Exception:
            return ""

    def search_movie(self, title: str, year: Optional[int] = None) -> Optional[Dict]:
        """
        Searches Vegamovies for a movie using Typesense search endpoint or HTML fallback.
        Returns dictionary with {id, title, permalink, year, imdb_id, poster, base}.
        """
        clean_title = re.sub(r'[^a-zA-Z0-9]+', ' ', title).strip()
        clean_title = re.sub(r'\s+', ' ', clean_title)
        words = clean_title.split()
        first_word = words[0].lower() if words else ''

        search_queries = [clean_title]
        if '&' in title or ' and ' in title.lower():
            search_queries.append(title.split('&')[0].strip())
        if len(words) > 2:
            search_queries.append(f"{words[0]} {words[1]}")
        if first_word:
            search_queries.append(first_word)

        # 1. High-speed Typesense search
        base = self.active_base
        for q in search_queries:
            if not q.strip():
                continue
            try:
                ts_url = f"{base}/ts-search.php?q={requests.utils.quote(q)}"
                r = self.session.get(ts_url, timeout=6, verify=False)
                if r.status_code == 200 and r.text.startswith('{'):
                    data = r.json()
                    hits = data.get('hits', [])
                    for hit in hits:
                        doc = hit.get('document', {})
                        p_title = doc.get('post_title', '')
                        permalink = doc.get('permalink', '')

                        p_lower = p_title.lower()
                        if first_word in p_lower:
                            if year and str(year) in p_lower:
                                return {
                                    'title': p_title,
                                    'permalink': permalink,
                                    'imdb_id': doc.get('imdb_id', ''),
                                    'poster': doc.get('post_thumbnail', ''),
                                    'base': base
                                }
                            elif not year:
                                return {
                                    'title': p_title,
                                    'permalink': permalink,
                                    'imdb_id': doc.get('imdb_id', ''),
                                    'poster': doc.get('post_thumbnail', ''),
                                    'base': base
                                }
                    # Fallback to first hit if first_word matches
                    for hit in hits:
                        doc = hit.get('document', {})
                        p_title = doc.get('post_title', '')
                        if first_word in p_title.lower():
                            return {
                                'title': p_title,
                                'permalink': doc.get('permalink', ''),
                                'imdb_id': doc.get('imdb_id', ''),
                                'poster': doc.get('post_thumbnail', ''),
                                'base': base
                            }
            except Exception:
                continue

        # 2. HTML search fallback
        try:
            html_search = f"{base}/?s={requests.utils.quote(clean_title)}"
            html_text = self.fetch_stream_text(html_search, timeout=8)
            if html_text:
                soup = BeautifulSoup(html_text, 'html.parser')
                articles = soup.find_all('article')
                for art in articles:
                    a_tag = art.find('a', href=True)
                    h_tag = art.find(['h2', 'h3']) or a_tag
                    if a_tag and h_tag:
                        t_text = h_tag.get_text(strip=True)
                        if first_word in t_text.lower():
                            href = a_tag['href']
                            permalink = '/' + href.replace(base, '').lstrip('/')
                            return {
                                'title': t_text,
                                'permalink': permalink,
                                'imdb_id': '',
                                'poster': '',
                                'base': base
                            }
        except Exception:
            pass

        return None

    def resolve_nexdrive_hub(self, nexdrive_url: str) -> Dict[str, str]:
        """
        Extracts verified direct links and mirror services from a NexDrive / VgList landing page.
        Returns dict with:
          - direct_url (e.g. FastDL instant CDN or V-Cloud direct)
          - multi_url (The landing hub or Filepress mirror)
          - gdrive_url (Filepress / GDToT link if present)
        """
        results = {'direct_url': '', 'multi_url': nexdrive_url, 'gdrive_url': ''}
        if not nexdrive_url or not nexdrive_url.startswith('http'):
            return results

        try:
            html_text = self.fetch_stream_text(nexdrive_url, timeout=8)
            if not html_text:
                return results

            soup = BeautifulSoup(html_text, 'html.parser')
            for a in soup.find_all('a', href=True):
                h = a['href']
                txt = a.get_text(strip=True).lower()

                # Instant Direct Download (FastDL)
                if 'fastdl' in h or 'instant' in txt or 'g-direct' in txt:
                    if not results['direct_url']:
                        results['direct_url'] = h
                # V-Cloud Resumable
                elif 'vcloud' in h or 'v-cloud' in txt:
                    if not results['direct_url']:
                        results['direct_url'] = h
                # G-Drive (Filepress / GDToT)
                elif 'filepress' in txt or 'filebee' in h or 'gdtot' in h or 'g-drive' in txt:
                    results['gdrive_url'] = h
        except Exception:
            pass

        return results

    def search_movie_downloads(self, title: str, year: Optional[int] = None, resolve_direct: bool = True) -> Tuple[List[Dict], Optional[str]]:
        """
        Searches Vegamovies and returns:
          1. List of quality-ranked download options with paired 'direct_url' (Last Link) and 'multi_url' (First Link).
          2. Native stream URL if directly accessible.
        """
        movie_info = self.search_movie(title, year)
        if not movie_info:
            return [], None

        base = movie_info.get('base', self.active_base)
        permalink = movie_info.get('permalink', '')
        article_url = f"{base.rstrip('/')}/{permalink.lstrip('/')}"

        try:
            art_html = self.fetch_stream_text(article_url, timeout=12)
            if not art_html:
                return [], None

            soup = BeautifulSoup(art_html, 'html.parser')
            links = soup.find_all('a', href=True)

            quality_map: Dict[str, Dict] = {}

            for a in links:
                href = a['href'].strip()
                if not href.startswith('http') or any(x in href.lower() for x in ['category', 'tag', 'movies-by-quality', 'disclaimer', 'contact', 'apk', 'privacy']):
                    continue

                if not any(k in href.lower() for k in ['nexdrive', 'vglist', 'fastdl', 'vcloud', 'hubcloud']):
                    continue

                raw_text = a.get_text(strip=True)
                prev = a.find_previous_sibling() or a.parent.find_previous_sibling() or a.find_previous(['h4', 'h3', 'p', 'strong'])
                prev_text = prev.get_text(strip=True) if prev else ''

                # 1. Determine quality tier
                target_q = None
                target_color = '#38bdf8'

                # Check raw_text first for exact button precision
                for q_key, q_label, color in QUALITY_TIERS:
                    if q_key in raw_text.lower():
                        target_q = q_label
                        target_color = color
                        break

                # If not in button text, check preceding sibling/heading
                if not target_q:
                    for q_key, q_label, color in QUALITY_TIERS:
                        if q_key in prev_text.lower():
                            target_q = q_label
                            target_color = color
                            break

                if not target_q or target_q in quality_map:
                    continue

                combined_context = f"{raw_text} {prev_text}"

                # 2. Extract file size
                size_match = re.search(r'(\d+(?:\.\d+)?\s*(?:GB|MB))', combined_context, re.IGNORECASE)
                size_str = size_match.group(1).upper() if size_match else 'Cloud Fast'

                # 3. Detect codec info
                codec_parts = []
                if '10bit' in combined_context.lower(): codec_parts.append('10-Bit')
                if '265' in combined_context.lower() or 'hevc' in combined_context.lower(): codec_parts.append('x265 HEVC')
                elif '264' in combined_context.lower(): codec_parts.append('x264')
                if '4k' in combined_context.lower() or '2160p' in combined_context.lower(): codec_parts.append('UHD Remux')
                if 'dual' in combined_context.lower() or 'hindi' in combined_context.lower(): codec_parts.append('Dual Audio Hindi')
                codec_str = ' • '.join(codec_parts) if codec_parts else 'Clean WEB-DL'

                quality_map[target_q] = {
                    "quality": target_q,
                    "size": size_str,
                    "codec": codec_str,
                    "server": "V-Cloud Direct",
                    "direct_url": "",
                    "multi_url": href,
                    "url": href,
                    "color": target_color
                }

            # Resolve direct links and clean filenames
            results = []
            native_stream = None

            for q_label, data in quality_map.items():
                landing_url = data["multi_url"]
                clean_fn = sanitize_filename(
                    "",
                    fallback_title=title,
                    year=year,
                    quality=q_label,
                    codec=data.get('codec', '')
                )
                data['filename'] = clean_fn

                if resolve_direct and ('nexdrive' in landing_url or 'vglist' in landing_url):
                    hub_links = self.resolve_nexdrive_hub(landing_url)
                    if hub_links.get('direct_url'):
                        data['direct_url'] = sanitize_download_url(
                            hub_links['direct_url'],
                            fallback_title=title,
                            year=year,
                            quality=q_label
                        )
                        data['url'] = data['direct_url']
                        if not native_stream and ('720p' in q_label or '1080p' in q_label):
                            native_stream = data['direct_url']
                    elif hub_links.get('gdrive_url'):
                        data['direct_url'] = hub_links['gdrive_url']

                # Fallback pairings
                if not data['direct_url']:
                    data['direct_url'] = data['multi_url']
                if not data['multi_url']:
                    data['multi_url'] = data['direct_url']

                results.append(data)

            # Sort: 4K -> 1080p -> 720p -> 480p
            tier_ranks = {'4K Ultra HD': 4, '1080p Full HD': 3, '720p HD': 2, '480p SD': 1}
            results.sort(key=lambda x: tier_ranks.get(x['quality'], 0), reverse=True)

            return results, native_stream

        except Exception as e:
            print(f"[VegamoviesEngine] Error harvesting {title}: {e}")
            return [], None


if __name__ == '__main__':
    engine = VegamoviesEngine()
    print("Testing VegamoviesEngine on 'Deadpool & Wolverine'...")
    dls, st = engine.search_movie_downloads("Deadpool & Wolverine", 2024, resolve_direct=True)
    print(f"Discovered {len(dls)} download tiers:")
    for d in dls:
        print(f"  [{d['quality']}] ({d['size']}) - {d['codec']}")
        print(f"    ⚡ Direct Link: {d['direct_url'][:80]}")
        print(f"    🌐 Multi Link:  {d['multi_url'][:80]}")
        print(f"    📄 Clean Name:  {d['filename']}")
    print(f"🎬 Stream: {st}")
