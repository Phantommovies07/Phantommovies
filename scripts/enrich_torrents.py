#!/usr/bin/env python3
"""
Enrich movies and series in data/content.json with high-speed P2P Torrent & Magnet links
using live verified seeders from the PirateBay backend (apibay.org).
Zero VPS/hosting cost, instant P2P downloads with qBit, uTorrent, Flud, 1DM, Stremio.
"""

import json
import os
import re
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

TRACKERS = [
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://open.demonii.com:1337/announce',
    'udp://open.stealth.si:80/announce',
    'udp://tracker.torrent.eu.org:451/announce',
    'udp://explodie.org:6969/announce',
    'udp://tracker.coppersurfer.tk:6969/announce',
    'udp://p4p.arenabg.com:1337/announce'
]

CONTENT_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'content.json')

def clean_title(title):
    if not title:
        return ''
    # Remove bracketed info
    t = re.sub(r'\(.*?\)|\[.*?\]', '', title)
    # Remove subtitles after colon or dash
    t = re.split(r'[:\-–—]', t)[0]
    # Remove punctuation
    t = re.sub(r'[^\w\s]', ' ', t)
    # Collapse spaces
    t = re.sub(r'\s+', ' ', t).strip()
    return t

def format_size(bytes_val):
    try:
        b = int(bytes_val)
        if b >= 1024**3:
            return f"{b / (1024**3):.1f} GB"
        elif b >= 1024**2:
            return f"{b / (1024**2):.1f} MB"
    except Exception:
        pass
    return ""

def query_apibay(search_str):
    url = f"https://apibay.org/q.php?q={urllib.parse.quote(search_str)}"
    req = urllib.request.Request(
        url,
        headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            if isinstance(data, list) and len(data) > 0 and data[0].get('id') != '0':
                return data
    except Exception:
        pass
    return None

def fetch_torrent_for_movie(movie):
    title = movie.get('title', '')
    if not title:
        return None

    cleaned = clean_title(title)
    if not cleaned:
        cleaned = title

    # Strategy 1: Cleaned title
    results = query_apibay(cleaned)

    # Strategy 2: If no results, try first 2 words
    if not results:
        words = cleaned.split()
        if len(words) > 2:
            results = query_apibay(' '.join(words[:2]))

    # Strategy 3: Original raw title
    if not results and cleaned != title:
        results = query_apibay(title)

    if not results:
        return None

    # Filter items with seeders > 0
    valid = [item for item in results if int(item.get('seeders', 0)) > 0]
    if not valid:
        valid = results

    # Sort preference: 1080p / 2160p / 4k with high seeders
    def score_item(item):
        seeders = int(item.get('seeders', 0))
        name_lower = item.get('name', '').lower()
        score = seeders
        if '1080p' in name_lower:
            score += 150
        elif '2160p' in name_lower or '4k' in name_lower:
            score += 120
        elif '720p' in name_lower:
            score += 50
        if 'hindi' in name_lower:
            score += 60
        return score

    valid.sort(key=score_item, reverse=True)
    top = valid[0]

    hash_val = top.get('info_hash')
    if not hash_val or hash_val == '0' * 40:
        return None

    name = top.get('name', cleaned)
    seeders = int(top.get('seeders', 0))
    size_str = format_size(top.get('size', 0))

    tr_query = '&'.join([f"tr={urllib.parse.quote(t)}" for t in TRACKERS])
    magnet = f"magnet:?xt=urn:btih:{hash_val}&dn={urllib.parse.quote(name)}&{tr_query}"

    return {
        "name": name,
        "seeders": seeders,
        "size": size_str,
        "magnet": magnet,
        "info_hash": hash_val
    }

def enrich_all(limit=None, max_workers=6):
    print(f"Loading {CONTENT_PATH}...")
    with open(CONTENT_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)

    movies = data.get('movies', [])
    print(f"Total entries: {len(movies)}")

    to_process = []
    for idx, m in enumerate(movies):
        if not m.get('torrent'):
            to_process.append((idx, m))

    if limit:
        to_process = to_process[:limit]

    print(f"Found {len(to_process)} entries to enrich with torrents...")
    success_count = 0

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_idx = {
            executor.submit(fetch_torrent_for_movie, m): (idx, m)
            for idx, m in to_process
        }

        for future in as_completed(future_to_idx):
            idx, m = future_to_idx[future]
            try:
                torrent_info = future.result()
                if torrent_info:
                    movies[idx]['torrent'] = torrent_info
                    success_count += 1
                    print(f"[{success_count}] OK: {m.get('title')} -> {torrent_info['name'][:40]} (Seeders: {torrent_info['seeders']})")
                else:
                    pass
            except Exception as e:
                print(f"Err {m.get('title')}: {e}")

    print(f"\nSuccessfully enriched {success_count} entries with live torrents!")

    with open(CONTENT_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print("Saved updated content.json.")

if __name__ == '__main__':
    import sys
    lim = int(sys.argv[1]) if len(sys.argv) > 1 else None
    enrich_all(limit=lim)
