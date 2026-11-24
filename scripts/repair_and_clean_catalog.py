#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════════════
PHANTOM MOVIES - CATALOG REPAIR, DEDUPLICATION & SANITIZATION ENGINE
═══════════════════════════════════════════════════════════════════════════════
Performs comprehensive repair across data/content.json and data/items/*.json:
  1. Fixes misclassified feature films incorrectly tagged as series.
     Moves their downloads to top-level, removes fake seasons, and re-assigns
     verified movie embed streaming servers (eliminating 404 player errors).
  2. Purges all fake HDHub4u / Greenmotors / Azonahub redirect traps.
  3. Sanitizes all competitor branding from server labels and filenames
     ([VegaMovies], -KatDrama, KMMOVIES, HDHub4u, etc.).
  4. Deduplicates repeatedly ingested titles (*Pradhama Drishtiya Kuttakkar*,
     *Ranabaali*, *Parivarik ManuRanjan*, *Mirzapur: The Movie*).
  5. Synchronizes data/content.json and rebuilds item shards.
═══════════════════════════════════════════════════════════════════════════════
"""

import os
import sys
import re
import json
import glob
from collections import defaultdict

SITE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
CONTENT_PATH = os.path.join(SITE_DIR, 'data', 'content.json')
ITEMS_DIR = os.path.join(SITE_DIR, 'data', 'items')

TRAP_DOMAINS = ['4khdhub.one', 'greenmotors.', 'azonahub.', 'hdhub4u.']

BRAND_REGEX = re.compile(
    r'[-_.\s]*(\[[^\]]*(?:KatDrama|KatmovieHD|KatMovie|VegaMovies|KMMOVIES|HDHub4u|MoviesMod|BollyFlix|Bolly4u|Rogmovies|Dotmovies|HubCloud|9xmovies|Filmyzilla|ExtraMovies|AllMoviesHub|Cinevood|Worldfree4u|Movies4u|Khatrimaza|Desiremovies)[^\]]*\]|\([^\)]*(?:KatDrama|KatmovieHD|KatMovie|VegaMovies|KMMOVIES|HDHub4u|MoviesMod|BollyFlix|Bolly4u|Rogmovies|Dotmovies|HubCloud|9xmovies|Filmyzilla|ExtraMovies|AllMoviesHub|Cinevood|Worldfree4u|Movies4u|Khatrimaza|Desiremovies)[^\)]*\)|(?:KatDrama|KatmovieHD|KatMovie|VegaMovies(?:\.to|\.is)?|KMMOVIES(?:\.COM)?|HDHub4u(?:\.Tv|\.ms|\.one)?|MoviesMod(?:\.org)?|BollyFlix(?:\.org)?|Bolly4u(?:\.org)?|Rogmovies(?:\.autos)?|Dotmovies(?:\.today)?|HubCloud|9xmovies|Filmyzilla|ExtraMovies|AllMoviesHub|Cinevood|Worldfree4u|Movies4u|Khatrimaza|Desiremovies))(?=[-_\.\s]|\.mkv|\.mp4|\.avi|$)',
    re.IGNORECASE
)

def is_trap(url: str) -> bool:
    if not url or not isinstance(url, str):
        return False
    u = url.lower()
    return any(t in u for t in TRAP_DOMAINS)

def clean_server_label(server: str) -> str:
    if not server:
        return 'Fast Cloud'
    s = re.sub(r'HDHub4u(?:\s*Cloud\s*Mirror)?', 'Fast Cloud Mirror', server, flags=re.I)
    s = re.sub(r'KatDrama(?:\s*VIP)?', 'VIP Direct Cloud', s, flags=re.I)
    s = re.sub(r'VegaMovies(?:\s*Fast\s*Cloud)?', 'V-Cloud Fast', s, flags=re.I)
    s = re.sub(r'KMMOVIES(?:\s*Cloud\s*Fast)?', 'High Speed Cloud', s, flags=re.I)
    s = re.sub(r'Rogmovies', 'Ultra Cloud', s, flags=re.I)
    s = re.sub(r'BollyFlix', 'Direct Cloud', s, flags=re.I)
    return s.strip() or 'Fast Cloud'

def clean_filename(filename: str, fallback_title: str = 'Movie', year: int = None, quality: str = '1080p') -> str:
    if not filename or not isinstance(filename, str):
        safe_title = re.sub(r'[^a-zA-Z0-9]+', '.', fallback_title).strip('.')
        y_str = f".{year}" if year else ""
        return f"{safe_title}{y_str}.{quality}.mkv"
    
    ext_match = re.search(r'\.(mkv|mp4|avi|webm|m4v|ts)$', filename, re.I)
    ext = ext_match.group(0) if ext_match else '.mkv'
    base = filename[:len(filename) - len(ext)] if ext_match else filename

    base = BRAND_REGEX.sub('', base)
    base = re.sub(r'[-_.\s]+$', '', base)
    base = re.sub(r'^[-_.\s]+', '', base)
    base = re.sub(r'[-_.\s]{2,}', '.', base)
    base = re.sub(r'\-\.|\.\-', '.', base).strip()

    if len(base) < 3:
        safe_title = re.sub(r'[^a-zA-Z0-9]+', '.', fallback_title).strip('.')
        y_str = f".{year}" if year else ""
        return f"{safe_title}{y_str}.{quality}{ext}"

    return f"{base}{ext}"

def sanitize_download_item(d: dict, movie_title: str, movie_year: int) -> dict:
    item = dict(d)
    if 'server' in item:
        item['server'] = clean_server_label(item['server'])
    q = item.get('quality', '1080p')
    raw_fn = item.get('filename', '')
    item['filename'] = clean_filename(raw_fn, fallback_title=movie_title, year=movie_year, quality=q)
    return item

def repair_catalog():
    if not os.path.exists(CONTENT_PATH):
        print(f"Error: {CONTENT_PATH} not found!")
        return

    with open(CONTENT_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)

    movies = data.get('movies', [])
    initial_count = len(movies)
    print(f"Loaded {initial_count} titles from catalog.")

    fixed_misclassified = 0
    purged_traps = 0

    # 1. First Pass: Fix misclassified feature films
    for m in movies:
        if not isinstance(m, dict):
            continue

        genre = str(m.get('genre', '')).lower()
        title = str(m.get('title', '')).lower()
        m_type = m.get('type')

        is_feature = (
            m_type == 'series' and (
                'feature' in genre or
                'movie' in title or
                'film' in genre or
                title.endswith('the movie')
            )
        )

        if is_feature:
            fixed_misclassified += 1
            m['type'] = 'movie'
            m['category'] = 'movie'
            m['badge'] = 'HD'

            # Gather all downloads from seasons and episodes
            gathered_dls = list(m.get('downloads', [])) if isinstance(m.get('downloads'), list) else []
            if 'seasons' in m and isinstance(m['seasons'], list):
                for s in m['seasons']:
                    if isinstance(s, dict):
                        if isinstance(s.get('downloads'), list):
                            gathered_dls.extend(s['downloads'])
                        if isinstance(s.get('episodes'), list):
                            for ep in s['episodes']:
                                if isinstance(ep, dict) and isinstance(ep.get('downloads'), list):
                                    gathered_dls.extend(ep['downloads'])

            # Clean gathered downloads
            valid_dls = []
            seen_urls = set()
            for d in gathered_dls:
                if not isinstance(d, dict):
                    continue
                u = d.get('url', '')
                du = d.get('direct_url', '')
                mu = d.get('multi_url', '')
                if is_trap(u) or is_trap(du) or is_trap(mu):
                    purged_traps += 1
                    continue
                check_u = u or du or mu
                if check_u and check_u in seen_urls:
                    continue
                if check_u:
                    seen_urls.add(check_u)
                valid_dls.append(sanitize_download_item(d, m.get('title', 'Movie'), m.get('year')))

            m['downloads'] = valid_dls
            if 'seasons' in m:
                del m['seasons']

            # Assign proper movie embed streams
            imdb = m.get('imdb_id', '')
            tmdb = m.get('tmdb_id', '')
            id_ref = tmdb or imdb or m.get('id', '')
            m['streams'] = [
                {
                    "name": "Server 1 (VIP Ultra HD)",
                    "url": f"https://vidlink.pro/movie/{imdb}?primaryColor=0284c7&autoplay=false" if imdb else f"https://cinesrc.st/embed/movie/{id_ref}"
                },
                {
                    "name": "Server 2 (High Speed HD)",
                    "url": f"https://cinesrc.st/embed/movie/{id_ref}"
                },
                {
                    "name": "Server 3 (Backup Server)",
                    "url": f"https://autoembed.co/movie/imdb/{imdb}" if imdb else f"https://autoembed.co/movie/tmdb/{tmdb or id_ref}"
                }
            ]
            m['streamLink'] = m['streams'][0]['url']

        else:
            # Clean movie downloads
            if 'downloads' in m and isinstance(m['downloads'], list):
                clean_dls = []
                for d in m['downloads']:
                    if isinstance(d, dict):
                        u = d.get('url', '')
                        du = d.get('direct_url', '')
                        mu = d.get('multi_url', '')
                        if is_trap(u) or is_trap(du) or is_trap(mu):
                            purged_traps += 1
                            continue
                        clean_dls.append(sanitize_download_item(d, m.get('title', 'Movie'), m.get('year')))
                    else:
                        clean_dls.append(d)
                m['downloads'] = clean_dls

            # Clean series downloads
            if 'seasons' in m and isinstance(m['seasons'], list):
                for s in m['seasons']:
                    if isinstance(s, dict):
                        if 'downloads' in s and isinstance(s['downloads'], list):
                            clean_sdls = []
                            for d in s['downloads']:
                                if isinstance(d, dict):
                                    u = d.get('url', '')
                                    du = d.get('direct_url', '')
                                    mu = d.get('multi_url', '')
                                    if is_trap(u) or is_trap(du) or is_trap(mu):
                                        purged_traps += 1
                                        continue
                                    clean_sdls.append(sanitize_download_item(d, m.get('title', 'Series'), m.get('year')))
                                else:
                                    clean_sdls.append(d)
                            s['downloads'] = clean_sdls

                        if 'episodes' in m and isinstance(s.get('episodes'), list):
                            for ep in s['episodes']:
                                if isinstance(ep, dict) and 'downloads' in ep and isinstance(ep['downloads'], list):
                                    clean_edls = []
                                    for d in ep['downloads']:
                                        if isinstance(d, dict):
                                            u = d.get('url', '')
                                            du = d.get('direct_url', '')
                                            mu = d.get('multi_url', '')
                                            if is_trap(u) or is_trap(du) or is_trap(mu):
                                                purged_traps += 1
                                                continue
                                            clean_edls.append(sanitize_download_item(d, m.get('title', 'Series'), m.get('year')))
                                        else:
                                            clean_edls.append(d)
                                    ep['downloads'] = clean_edls

    print(f"Fixed {fixed_misclassified} misclassified feature films.")
    print(f"Purged {purged_traps} redirect trap URLs.")

    # 2. Second Pass: Deduplicate repeated ingest copies
    def get_dedup_key(item):
        imdb = (item.get('imdb_id') or '').strip().lower()
        tmdb = str(item.get('tmdb_id') or '').strip()
        title = re.sub(r'[^a-zA-Z0-9]', '', (item.get('title') or '')).lower()
        m_type = item.get('type', 'movie')
        year = str(item.get('year') or '')

        if imdb and imdb.startswith('tt'):
            return f"imdb_{imdb}_{m_type}"
        if tmdb and tmdb != 'None' and tmdb != '0' and tmdb != '':
            return f"tmdb_{tmdb}_{m_type}"
        return f"title_{title}_{year}_{m_type}"

    grouped = defaultdict(list)
    for item in movies:
        k = get_dedup_key(item)
        grouped[k].append(item)

    deduped_movies = []
    removed_duplicates = 0
    all_kept_ids = set()
    merged_alias_map = {}  # alias_id -> primary_item

    for k, items in grouped.items():
        if len(items) == 1:
            primary = items[0]
            deduped_movies.append(primary)
            all_kept_ids.add(str(primary.get('id', '')))
            continue

        removed_duplicates += len(items) - 1
        # Sort by rich data
        items.sort(key=lambda x: (
            len(x.get('downloads', []) or []),
            len(x.get('streams', []) or []),
            len(x.get('seasons', []) or []),
            len(x.get('description', '') or '')
        ), reverse=True)

        primary = items[0]
        primary_id = str(primary.get('id', ''))
        all_kept_ids.add(primary_id)

        # Merge downloads
        existing_dls = primary.get('downloads', []) or []
        seen_urls = set()
        for d in existing_dls:
            u = (d.get('url') or '') + (d.get('direct_url') or '')
            if u: seen_urls.add(u)

        for other in items[1:]:
            other_id = str(other.get('id', ''))
            if other_id and other_id != primary_id:
                merged_alias_map[other_id] = primary
                all_kept_ids.add(other_id)
            for d in other.get('downloads', []) or []:
                u = (d.get('url') or '') + (d.get('direct_url') or '')
                if u and u not in seen_urls:
                    existing_dls.append(d)
                    seen_urls.add(u)
        primary['downloads'] = existing_dls

        deduped_movies.append(primary)

    print(f"Removed {removed_duplicates} duplicate titles. New catalog size: {len(deduped_movies)}")

    # Update settings counts
    total_m = sum(1 for x in deduped_movies if x.get('type') != 'series')
    total_s = sum(1 for x in deduped_movies if x.get('type') == 'series')

    if 'settings' in data:
        data['settings']['totalMovies'] = total_m
        data['settings']['totalSeries'] = total_s

    data['movies'] = deduped_movies

    with open(CONTENT_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"✅ Saved updated content.json (Total Movies: {total_m}, Total Series: {total_s})")

    # 3. Third Pass: Clean orphaned item shards and write updated shards
    all_shards = glob.glob(os.path.join(ITEMS_DIR, '*.json'))
    cleaned_shards = 0
    orphans_removed = 0

    for s_path in all_shards:
        base_name = os.path.splitext(os.path.basename(s_path))[0]
        if base_name not in all_kept_ids:
            try:
                os.remove(s_path)
                orphans_removed += 1
            except Exception:
                pass

    for m in deduped_movies:
        item_id = str(m.get('id', ''))
        shard_path = os.path.join(ITEMS_DIR, f"{item_id}.json")
        try:
            with open(shard_path, 'w', encoding='utf-8') as sf:
                json.dump(m, sf, ensure_ascii=False, separators=(',', ':'))
            cleaned_shards += 1
        except Exception:
            pass

    alias_shards = 0
    for alias_id, primary_item in merged_alias_map.items():
        shard_path = os.path.join(ITEMS_DIR, f"{alias_id}.json")
        try:
            with open(shard_path, 'w', encoding='utf-8') as sf:
                json.dump(primary_item, sf, ensure_ascii=False, separators=(',', ':'))
            alias_shards += 1
        except Exception:
            pass

    print(f"✅ Synchronized {cleaned_shards} primary item shards + {alias_shards} compatibility alias shards. Removed {orphans_removed} orphaned duplicate shards.")

if __name__ == '__main__':
    repair_catalog()
