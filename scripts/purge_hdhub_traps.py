"""
Purges fake 4khdhub.one and greenmotors redirect traps from data/content.json and item shards.
"""

import os
import json

SITE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
CONTENT_PATH = os.path.join(SITE_DIR, 'data', 'content.json')
ITEMS_DIR = os.path.join(SITE_DIR, 'data', 'items')

TRAP_DOMAINS = ['4khdhub.one', 'greenmotors.', 'hdhub4u.', 'azonahub.', 'fastdl.']

def is_trap(url):
    if not url or not isinstance(url, str):
        return False
    u = url.lower()
    return any(t in u for t in TRAP_DOMAINS)

def purge():
    if not os.path.exists(CONTENT_PATH):
        print(f"Error: {CONTENT_PATH} not found")
        return

    with open(CONTENT_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)

    movies = data.get('movies', [])
    purged_total = 0
    updated_items = 0

    for m in movies:
        if not isinstance(m, dict):
            continue

        item_changed = False

        # Clean movie-level downloads
        if 'downloads' in m and isinstance(m['downloads'], list):
            new_dl = []
            for d in m['downloads']:
                if isinstance(d, dict):
                    u = d.get('url', '')
                    du = d.get('direct_url', '')
                    mu = d.get('multi_url', '')
                    if is_trap(u) or is_trap(du) or is_trap(mu):
                        purged_total += 1
                        item_changed = True
                    else:
                        new_dl.append(d)
                else:
                    new_dl.append(d)
            m['downloads'] = new_dl

        # Clean series seasons / episodes downloads
        if 'seasons' in m and isinstance(m['seasons'], list):
            for s in m['seasons']:
                if isinstance(s, dict) and 'downloads' in s and isinstance(s['downloads'], list):
                    new_sdl = []
                    for d in s['downloads']:
                        if isinstance(d, dict) and (is_trap(d.get('url')) or is_trap(d.get('direct_url'))):
                            purged_total += 1
                            item_changed = True
                        else:
                            new_sdl.append(d)
                    s['downloads'] = new_sdl

                if isinstance(s, dict) and 'episodes' in s and isinstance(s['episodes'], list):
                    for ep in s['episodes']:
                        if isinstance(ep, dict) and 'downloads' in ep and isinstance(ep['downloads'], list):
                            new_edl = []
                            for d in ep['downloads']:
                                if isinstance(d, dict) and (is_trap(d.get('url')) or is_trap(d.get('direct_url'))):
                                    purged_total += 1
                                    item_changed = True
                                else:
                                    new_edl.append(d)
                            ep['downloads'] = new_edl

        if item_changed:
            updated_items += 1
            # Update shard
            item_id = str(m.get('id', ''))
            shard_path = os.path.join(ITEMS_DIR, f"{item_id}.json")
            if os.path.exists(shard_path):
                try:
                    with open(shard_path, 'w', encoding='utf-8') as sf:
                        json.dump(m, sf, ensure_ascii=False, separators=(',', ':'))
                except Exception as e:
                    pass

    with open(CONTENT_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"✅ Successfully purged {purged_total} redirect trap links across {updated_items} titles.")

if __name__ == '__main__':
    purge()
