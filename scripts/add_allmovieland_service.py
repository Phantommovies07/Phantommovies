import json
import urllib.request
import urllib.parse
import time
import os

CONTENT_FILE = 'phantommovies_site/data/content.json'
MIRRORS_FILE = 'phantommovies_site/data/mirrors.json'

print(f"Loading {CONTENT_FILE}...")
with open(CONTENT_FILE, 'r', encoding='utf-8') as f:
    data = json.load(f)

movies = data.get('movies', [])
print(f"Total catalog items: {len(movies)}")

# 1. Resolve missing IMDb IDs
missing_imdb = [m for m in movies if not m.get('imdb_id')]
print(f"Titles needing IMDb ID: {len(missing_imdb)}")

resolved = 0
for m in missing_imdb:
    title = m.get('title', '').strip()
    clean_title = title.split('(')[0].split('Season')[0].replace('Dual Audio', '').replace('Hindi', '').strip()
    try:
        url = f"https://v3.sg.media-imdb.com/suggestion/x/{urllib.parse.quote(clean_title)}.json"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=5) as r:
            res = json.load(r)
            items = res.get('d', [])
            if items:
                imdb_id = items[0].get('id')
                if imdb_id and imdb_id.startswith('tt'):
                    m['imdb_id'] = imdb_id
                    resolved += 1
                    print(f"  [IMDb Resolved] {title} -> {imdb_id} ({items[0].get('l')})")
        time.sleep(0.15)
    except Exception as e:
        print(f"  [IMDb Lookup Skip] {title}: {e}")

print(f"Resolved {resolved} missing IMDb IDs.")

# 2. Inject Server 2 (AllMovieLand - HDVB P2P) into all movies and series
updated_count = 0
for m in movies:
    imdb = m.get('imdb_id')
    tmdb = m.get('tmdb_id')
    title_id = imdb or tmdb
    if not title_id:
        continue

    is_series = m.get('type') == 'series'
    allmovieland_url = f"https://slast430did.com/play/{title_id}" + ("?s=1&e=1" if is_series else "")

    new_server = {
        "name": "Server 2 (AllMovieLand - HDVB P2P)",
        "url": allmovieland_url
    }

    # If item has a streams array
    streams = m.get('streams', [])
    # Check if allmovieland already present
    has_aml = any('slast430did' in s.get('url', '') or 'allmovieland' in s.get('name', '').lower() for s in streams)
    
    if not has_aml:
        # Insert right after Server 1 if Server 1 exists, else at index 0
        server1_idx = -1
        for idx, s in enumerate(streams):
            if 'Server 1' in s.get('name', ''):
                server1_idx = idx
                break
        
        if server1_idx != -1:
            streams.insert(server1_idx + 1, new_server)
        else:
            streams.insert(0, new_server)
        
        # Renumber/clean subsequent servers if they were numbered
        for i, s in enumerate(streams):
            name = s.get('name', '')
            if 'Server 1 (' in name:
                continue
            elif 'AllMovieLand' in name:
                s['name'] = "Server 2 (AllMovieLand - HDVB P2P)"
            elif 'HDMovie2' in name:
                s['name'] = "Server 3 (HDMovie2 - P2P HLS)"
            elif 'CineSrc' in name:
                s['name'] = "Server 4 (CineSrc - No Ads)"
            elif 'MoviesAPI' in name:
                s['name'] = "Server 5 (MoviesAPI - No Ads)"
            elif 'Mapple' in name:
                s['name'] = "Server 6 (Mapple - No Ads)"
            elif 'AutoEmbed' in name:
                s['name'] = "Server 7 (AutoEmbed)"
            elif 'VidEasy' in name:
                s['name'] = "Server 8 (VidEasy)"
            elif 'VidLink' in name:
                s['name'] = "Server 9 (VidLink)"
            elif 'VixSrc' in name:
                s['name'] = "Server 10 (VixSrc)"
            elif 'MultiEmbed' in name:
                s['name'] = "Server 11 (MultiEmbed)"
            elif '2Embed' in name:
                s['name'] = "Server 12 (2Embed)"
            elif 'VidSrc' in name:
                s['name'] = "Server 13 (VidSrc Embed)"
            elif '111Movies' in name:
                s['name'] = "Server 14 (111Movies)"
            elif 'PrimeSrc' in name:
                s['name'] = "Server 15 (PrimeSrc)"
        
        m['streams'] = streams
        updated_count += 1

print(f"Updated {updated_count} movies/series with AllMovieLand (HDVB P2P) stream server!")

# Save content.json
with open(CONTENT_FILE, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print(f"Successfully saved {CONTENT_FILE}!")

# 3. Update mirrors.json
with open(MIRRORS_FILE, 'r', encoding='utf-8') as f:
    mirrors_data = json.load(f)

streaming_providers = mirrors_data.get('streaming', {}).get('providers', [])
if not any(p.get('id') == 'allmovieland' for p in streaming_providers):
    new_provider = {
        "id": "allmovieland",
        "name": "Server 2 (AllMovieLand - HDVB P2P)",
        "domains": [
            "https://slast430did.com",
            "https://allmovieland.link",
            "https://1xcinema.net"
        ],
        "movieTemplate": "/play/{imdb}",
        "tvTemplate": "/play/{imdb}?s={s}&e={e}"
    }
    # Insert right after netmirror (index 1)
    streaming_providers.insert(1, new_provider)
    
    # Renumber subsequent provider names
    for i, p in enumerate(streaming_providers):
        p_name = p.get('name', '')
        core_name = p_name.split('(')[-1].replace(')', '').strip() if '(' in p_name else p_name
        p['name'] = f"Server {i + 1} ({core_name})"

    mirrors_data['streaming']['providers'] = streaming_providers

    with open(MIRRORS_FILE, 'w', encoding='utf-8') as f:
        json.dump(mirrors_data, f, ensure_ascii=False, indent=2)
    print(f"Successfully updated {MIRRORS_FILE} with AllMovieLand provider!")
