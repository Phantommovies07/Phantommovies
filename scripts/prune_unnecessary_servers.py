import json
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SITE_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
CONTENT_FILE = os.path.join(SITE_DIR, 'data', 'content.json')

def build_movie_streams(movie):
    imdb = (movie.get('imdb_id') or '').strip()
    tmdb = str(movie.get('tmdb_id', '')).strip() if movie.get('tmdb_id') else ''
    streams = []

    # Server 1: CineSrc (Zero Ads) - prefers TMDB
    if tmdb or imdb:
        t = tmdb if tmdb else imdb
        streams.append({
            "name": "Server 1 (VIP Ultra HD)",
            "url": f"https://cinesrc.st/embed/movie/{t}"
        })

    # Server 2: VidLink (Modern CDN) - prefers IMDb
    if imdb or tmdb:
        t = imdb if imdb else tmdb
        streams.append({
            "name": "Server 2 (High Speed HD)",
            "url": f"https://vidlink.pro/movie/{t}"
        })

    # Server 3: 2Embed (Global Backup)
    if imdb or tmdb:
        t = imdb if imdb else tmdb
        streams.append({
            "name": "Server 3 (Backup Server)",
            "url": f"https://www.2embed.cc/embed/{t}"
        })

    return streams

def build_tv_streams(imdb, tmdb, season_num=1, episode_num=1):
    streams = []
    s = season_num
    e = episode_num
    imdb = (imdb or "").strip()
    tmdb = (tmdb or "").strip()

    # Server 1: CineSrc (Zero Ads)
    if tmdb or imdb:
        t = tmdb if tmdb else imdb
        streams.append({
            "name": "Server 1 (VIP Ultra HD)",
            "url": f"https://cinesrc.st/embed/tv/{t}?s={s}&e={e}"
        })

    # Server 2: VidLink (Modern CDN)
    if tmdb or imdb:
        t = tmdb if tmdb else imdb
        streams.append({
            "name": "Server 2 (High Speed HD)",
            "url": f"https://vidlink.pro/tv/{t}/{s}/{e}"
        })

    # Server 3: 2Embed (Global Backup)
    if imdb or tmdb:
        t = imdb if imdb else tmdb
        streams.append({
            "name": "Server 3 (Backup Server)",
            "url": f"https://www.2embed.cc/embedtv/{t}&s={s}&e={e}"
        })

    return streams

def prune_and_standardize():
    if not os.path.exists(CONTENT_FILE):
        print(f"Error: {CONTENT_FILE} not found.")
        return

    with open(CONTENT_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)

    movies = data.get('movies', [])
    print(f"Loaded {len(movies)} catalog items from {CONTENT_FILE}.")

    pruned_movie_streams = 0
    pruned_series_streams = 0

    for item in movies:
        is_series = item.get('type') == 'series'
        imdb = (item.get('imdb_id') or '').strip()
        tmdb = str(item.get('tmdb_id', '')).strip() if item.get('tmdb_id') else ''

        # 1. Update movie-level streams to top 3 ad-free servers
        if is_series:
            item['streams'] = build_tv_streams(imdb, tmdb, 1, 1)
        else:
            item['streams'] = build_movie_streams(item)

        if item['streams']:
            item['streamLink'] = item['streams'][0]['url']
        pruned_movie_streams += 1

        # 2. Update series seasons and episodes if applicable
        if is_series and item.get('seasons'):
            for s_idx, season in enumerate(item['seasons']):
                s_num = season.get('season_number', season.get('seasonNumber', s_idx + 1))
                season['streams'] = build_tv_streams(imdb, tmdb, s_num, 1)
                if season['streams']:
                    season['streamLink'] = season['streams'][0]['url']

                for ep_idx, ep in enumerate(season.get('episodes', [])):
                    e_num = ep.get('episode_number', ep.get('episodeNumber', ep_idx + 1))
                    ep['streams'] = build_tv_streams(imdb, tmdb, s_num, e_num)
                    if ep['streams']:
                        ep['streamLink'] = ep['streams'][0]['url']
                    pruned_series_streams += 1

    # Save cleaned data
    with open(CONTENT_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"Standardized {pruned_movie_streams} items and {pruned_series_streams} episode streams.")
    print("All catalog items now use the top 3 ad-free streaming sources.")

if __name__ == '__main__':
    prune_and_standardize()
