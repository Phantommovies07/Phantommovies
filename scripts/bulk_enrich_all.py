import json
import re
import sys
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from scripts.auto_sync import fetch_best_real_downloads

def main():
    content_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'content.json')
    with open(content_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    movies = data.get('movies', [])
    print(f"📊 Starting bulk enrichment for {len(movies)} catalog titles...")

    # Filter movies that still need downloads
    to_enrich = []
    for idx, m in enumerate(movies):
        dls = m.get('downloads', [])
        has_real = any(
            d.get('url') and any(h in d['url'].lower() for h in ['hubcdn', 'hubdrive', 'nexdrive', '4khdhub', 'greenmotors', 'gofile', 'pixeldrain', 'fastdl', 'drive'])
            for d in dls
        )
        if not has_real:
            to_enrich.append((idx, m))

    print(f"🎯 Titles needing download links: {len(to_enrich)}")

    enriched_count = 0
    total_processed = 0

    def process_movie(item):
        idx, m = item
        title = m.get('title', '')
        if not title:
            return idx, []
        try:
            dls = fetch_best_real_downloads(title)
            return idx, dls
        except Exception:
            return idx, []

    # Run with 6 worker threads to be fast while gentle on endpoints
    with ThreadPoolExecutor(max_workers=6) as executor:
        futures = {executor.submit(process_movie, item): item for item in to_enrich}
        for future in as_completed(futures):
            idx, item = futures[future]
            title = item.get('title', '')
            total_processed += 1
            try:
                res_idx, dls = future.result()
                if dls:
                    movies[res_idx]['downloads'] = dls
                    enriched_count += 1
                    srvs = list(set(d.get('server', 'Cloud') for d in dls))
                    print(f"[{total_processed}/{len(to_enrich)}] ✓ '{title}': {len(dls)} links ({', '.join(srvs)})")
                else:
                    if total_processed % 25 == 0 or total_processed == len(to_enrich):
                        print(f"[{total_processed}/{len(to_enrich)}] Progress update... ({enriched_count} enriched so far)")
            except Exception as e:
                pass

            # Save progress periodically every 50 processed items
            if total_processed % 50 == 0:
                with open(content_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)

    # Final save
    with open(content_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"\n🎉 Bulk enrichment completed! Successfully added verified direct cloud links to {enriched_count} titles.")

if __name__ == '__main__':
    main()
