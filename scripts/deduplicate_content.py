import json
from collections import defaultdict
import re

CONTENT_FILE = 'phantommovies_site/data/content.json'

print(f"Loading {CONTENT_FILE}...")
with open(CONTENT_FILE, 'r', encoding='utf-8') as f:
    data = json.load(f)

movies = data.get('movies', [])
total_initial = len(movies)
print(f"Initial count: {total_initial}")

def get_dedup_key(item):
    imdb = (item.get('imdb_id') or '').strip().lower()
    tmdb = str(item.get('tmdb_id') or '').strip()
    title = re.sub(r'[^a-zA-Z0-9]', '', (item.get('title') or '')).lower()
    m_type = item.get('type', 'movie')
    year = str(item.get('year') or '')

    # If IMDb ID exists, key by (imdb, m_type)
    if imdb and imdb.startswith('tt'):
        return f"imdb_{imdb}_{m_type}"
    # If TMDB ID exists, key by (tmdb, m_type)
    if tmdb and tmdb != 'None' and tmdb != '0':
        return f"tmdb_{tmdb}_{m_type}"
    # Otherwise title + year + type
    return f"title_{title}_{year}_{m_type}"

grouped = defaultdict(list)
for item in movies:
    key = get_dedup_key(item)
    grouped[key].append(item)

deduped_movies = []
merged_count = 0

for key, items in grouped.items():
    if len(items) == 1:
        deduped_movies.append(items[0])
        continue

    merged_count += len(items) - 1
    # Sort items by richness of data (downloads, streams, seasons, overview length)
    items.sort(key=lambda x: (
        len(x.get('downloads', [])),
        len(x.get('streams', [])),
        len(x.get('seasons', [])),
        len(x.get('overview', '') or '')
    ), reverse=True)

    primary = items[0]
    print(f"Merging {len(items)} duplicates for: '{primary.get('title')}' (Key: {key})")

    # Merge downloads from all copies
    all_dls = primary.get('downloads', []) or []
    seen_dl_urls = {d.get('url') for d in all_dls if d.get('url')}
    for other in items[1:]:
        for d in other.get('downloads', []) or []:
            u = d.get('url')
            if u and u not in seen_dl_urls:
                all_dls.append(d)
                seen_dl_urls.add(u)
    primary['downloads'] = all_dls

    # Merge streams
    all_streams = primary.get('streams', []) or []
    seen_stream_urls = {s.get('url') for s in all_streams if s.get('url')}
    for other in items[1:]:
        for s in other.get('streams', []) or []:
            u = s.get('url')
            if u and u not in seen_stream_urls:
                all_streams.append(s)
                seen_stream_urls.add(u)
    primary['streams'] = all_streams

    # Merge seasons if series
    if primary.get('type') == 'series':
        all_seasons = primary.get('seasons', []) or []
        for other in items[1:]:
            for s_other in other.get('seasons', []) or []:
                s_num = s_other.get('seasonNumber')
                existing_s = next((s for s in all_seasons if s.get('seasonNumber') == s_num), None)
                if not existing_s:
                    all_seasons.append(s_other)
                else:
                    # Merge episodes
                    ep_list = existing_s.get('episodes', []) or []
                    seen_eps = {e.get('episodeNumber') for e in ep_list}
                    for ep in s_other.get('episodes', []) or []:
                        if ep.get('episodeNumber') not in seen_eps:
                            ep_list.append(ep)
                            seen_eps.add(ep.get('episodeNumber'))
                    existing_s['episodes'] = ep_list
        primary['seasons'] = all_seasons

    deduped_movies.append(primary)

print(f"\nDeduplication complete!")
print(f"Removed {merged_count} duplicate items.")
print(f"Final catalog count: {len(deduped_movies)} (from {total_initial})")

data['movies'] = deduped_movies

with open(CONTENT_FILE, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"Saved clean {CONTENT_FILE}!")
