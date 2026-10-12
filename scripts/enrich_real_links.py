import json
import re
import time
import sys
import os

# Set UTF-8 encoding for standard output
sys.stdout.reconfigure(encoding='utf-8')

# Ensure repo root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Import our best multi-source scraper (HDHub4u -> ROG Movies -> KM Movies)
from scripts.auto_sync import fetch_best_real_downloads

def main():
    print("🚀 Starting comprehensive real download enrichment via HDHub4u & ROG Movies...")
    content_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'content.json')
    with open(content_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    movies = data.get('movies', [])
    enriched_count = 0

    # Limit to movies that don't have direct cloud links yet
    target_movies = []
    for m in movies:
        dls = m.get('downloads', [])
        has_real = any(
            d.get('url', '') and 
            any(h in d.get('url', '').lower() for h in ['hubcdn', 'hubdrive', 'nexdrive', '4khdhub', 'greenmotors', 'gofile', 'pixeldrain', 'fastdl', 'drive'])
            for d in dls
        )
        if not has_real:
            target_movies.append(m)

    print(f"📊 Total catalog: {len(movies)} titles. Unenriched titles: {len(target_movies)}")

    # Enrich first 25 target titles to prevent timeout during regular sync runs
    batch_size = int(sys.argv[1]) if len(sys.argv) > 1 else 25
    to_process = target_movies[:batch_size]

    for i, m in enumerate(to_process):
        title = m.get('title', '')
        if not title:
            continue
        try:
            real_dls = fetch_best_real_downloads(title)
            if real_dls:
                m['downloads'] = real_dls
                enriched_count += 1
                servers = list(set(d.get('server', 'Cloud') for d in real_dls))
                print(f"[{i+1}/{len(to_process)}] ✓ Enriched '{title}': {len(real_dls)} links ({', '.join(servers)})")
            else:
                print(f"[{i+1}/{len(to_process)}] - No new links found for '{title}'")
            time.sleep(0.4)
        except Exception as e:
            print(f"[{i+1}/{len(to_process)}] ⚠️ Error enriching '{title}': {e}")

    # Clean out any old dummy/redirect links from all movies
    for m in movies:
        if m.get('downloads'):
            m['downloads'] = [
                d for d in m['downloads'] 
                if not d.get('url', '').startswith('download.html') 
                and 'kmmovies.' not in d.get('url', '').lower()
                and 'magiclinks.lol/download/' not in d.get('url', '').lower()
            ]

    with open(content_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"🎉 Enrichment completed! Added verified direct cloud links to {enriched_count} titles.")

if __name__ == '__main__':
    main()
