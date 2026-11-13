"""
Script to scan and sanitize all download URLs and filenames across the catalog.
Replaces competitor watermarks (KMMOVIES, VegaMovies, KatDrama, KatmovieHD, HDHub4u, MoviesMod, etc.)
with pristine clean filenames.
"""

import os
import sys
import json
import re

# Add scrapers path to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'scrapers')))
try:
    from filename_sanitizer import sanitize_download_url, sanitize_filename
except ImportError:
    from scrapers.filename_sanitizer import sanitize_download_url, sanitize_filename

CATALOG_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'data', 'content.json'))
ITEMS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'data', 'items'))

def clean_download_item(d, title, year, season=None, ep=None):
    if not isinstance(d, dict):
        return False
    changed = False

    quality = d.get('quality', '')
    codec = d.get('codec', '')

    for field in ['direct_url', 'url', 'multi_url']:
        val = d.get(field, '')
        if val and isinstance(val, str) and ('filename=' in val or any(x in val.lower() for x in ['.mkv', '.mp4', 'kmmovies', 'katdrama', 'vegamovies', 'hdhub4u'])):
            cleaned_val = sanitize_download_url(
                val,
                fallback_title=title,
                year=year,
                quality=quality,
                codec=codec,
                season=season,
                episode=ep
            )
            if cleaned_val != val:
                d[field] = cleaned_val
                changed = True

    # Also clean explicit filename attribute if present
    if 'filename' in d and d['filename']:
        clean_fn = sanitize_filename(
            d['filename'],
            fallback_title=title,
            year=year,
            quality=quality,
            codec=codec,
            season=season,
            episode=ep
        )
        if clean_fn != d['filename']:
            d['filename'] = clean_fn
            changed = True

    return changed

def process_catalog():
    if not os.path.exists(CATALOG_PATH):
        print(f"Error: {CATALOG_PATH} not found")
        return

    with open(CATALOG_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)

    movies = data.get('movies', [])
    cleaned_count = 0

    for m in movies:
        if not isinstance(m, dict):
            continue
        title = m.get('title', '')
        year = m.get('year')
        item_changed = False

        # Clean movie downloads
        for d in m.get('downloads', []):
            if clean_download_item(d, title, year):
                item_changed = True

        # Clean series seasons/episodes downloads
        for s in m.get('seasons', []):
            s_num = s.get('seasonNumber', 1)
            for d in s.get('downloads', []):
                if clean_download_item(d, title, year, season=s_num):
                    item_changed = True
            for ep in s.get('episodes', []):
                ep_num = ep.get('episodeNumber', 1)
                for d in ep.get('downloads', []):
                    if clean_download_item(d, title, year, season=s_num, ep=ep_num):
                        item_changed = True

        if item_changed:
            cleaned_count += 1
            # Also update individual shard file if it exists
            item_id = str(m.get('id', ''))
            shard_path = os.path.join(ITEMS_DIR, f"{item_id}.json")
            if os.path.exists(shard_path):
                try:
                    with open(shard_path, 'w', encoding='utf-8') as sf:
                        json.dump(m, sf, ensure_ascii=False, separators=(',', ':'))
                except Exception as e:
                    print(f"Warning: could not update shard {shard_path}: {e}")

    if cleaned_count > 0:
        with open(CATALOG_PATH, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"✅ Successfully cleaned filenames across {cleaned_count} titles in catalog and shards.")
    else:
        print("ℹ️ Catalog download URLs are already clean.")

if __name__ == '__main__':
    process_catalog()
