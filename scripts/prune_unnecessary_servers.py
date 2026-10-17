import json
import os

CONTENT_FILE = 'phantommovies_site/data/content.json'
BACKUP_FILE = 'phantommovies_site/data/content.json.bak'

def build_movie_streams(movie):
    imdb = movie.get('imdb_id', '').strip()
    tmdb = str(movie.get('tmdb_id', '')).strip() if movie.get('tmdb_id') else ''
    
    streams = []
    
    # Server 1: NetMirror VIP Ultra HD (requires tmdb)
    if tmdb:
        streams.append({
            "name": "Server 1 (VIP Ultra HD)",
            "url": f"https://net27.cc/watch-tmdb/{tmdb}"
        })
    elif movie.get('streamLink') and 'net27.cc' in movie.get('streamLink'):
        streams.append({
            "name": "Server 1 (VIP Ultra HD)",
            "url": movie.get('streamLink')
        })
        
    # Server 2: AllMovieLand (HDVB P2P) (requires imdb)
    if imdb:
        streams.append({
            "name": "Server 2 (AllMovieLand - HDVB P2P)",
            "url": f"https://slast430did.com/play/{imdb}"
        })
        
    # Server 3: HDMovie2 (P2P HLS) (requires imdb)
    if imdb:
        streams.append({
            "name": "Server 3 (HDMovie2 - P2P HLS)",
            "url": f"https://gorri421kos.com/play/{imdb}"
        })
        
    # Server 4: CineSrc (No Ads) (requires tmdb)
    if tmdb:
        streams.append({
            "name": "Server 4 (CineSrc - No Ads)",
            "url": f"https://cinesrc.st/embed/movie/{tmdb}"
        })
        
    # Server 5: VidLink (Fast HD) (requires imdb)
    if imdb:
        streams.append({
            "name": "Server 5 (VidLink - Fast HD)",
            "url": f"https://vidlink.pro/movie/{imdb}"
        })
        
    return streams

def build_tv_streams(imdb, tmdb, season_num=1, episode_num=1):
    streams = []
    s = season_num
    e = episode_num
    
    # Server 1: NetMirror VIP Ultra HD (requires tmdb)
    if tmdb:
        streams.append({
            "name": "Server 1 (VIP Ultra HD)",
            "url": f"https://net27.cc/watch-tmdb/{tmdb}?type=tv&se={s}&ep={e}"
        })
        
    # Server 2: AllMovieLand (HDVB P2P) (requires imdb)
    if imdb:
        streams.append({
            "name": "Server 2 (AllMovieLand - HDVB P2P)",
            "url": f"https://slast430did.com/play/{imdb}?s={s}&e={e}"
        })
        
    # Server 3: HDMovie2 (P2P HLS) (requires imdb)
    if imdb:
        streams.append({
            "name": "Server 3 (HDMovie2 - P2P HLS)",
            "url": f"https://gorri421kos.com/play/{imdb}?s={s}&e={e}"
        })
        
    # Server 4: CineSrc (No Ads) (requires tmdb)
    if tmdb:
        streams.append({
            "name": "Server 4 (CineSrc - No Ads)",
            "url": f"https://cinesrc.st/embed/tv/{tmdb}?s={s}&e={e}"
        })
        
    # Server 5: VidLink (Fast HD) (requires imdb)
    if imdb:
        streams.append({
            "name": "Server 5 (VidLink - Fast HD)",
            "url": f"https://vidlink.pro/tv/{imdb}/{s}/{e}"
        })
        
    return streams

def prune_and_standardize():
    with open(CONTENT_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    movies = data['movies']
    print(f"Loaded {len(movies)} catalog items.")
    
    pruned_movie_streams = 0
    pruned_series_streams = 0
    
    for item in movies:
        is_series = item.get('type') == 'series'
        imdb = item.get('imdb_id', '').strip()
        tmdb = str(item.get('tmdb_id', '')).strip() if item.get('tmdb_id') else ''
        
        # 1. Update movie-level streams
        item['streams'] = build_movie_streams(item)
        if item.get('streamLink') and not any(s['url'] == item['streamLink'] for s in item['streams']):
            if item['streams']:
                item['streamLink'] = item['streams'][0]['url']
        pruned_movie_streams += 1
        
        # 2. Update series seasons and episodes if applicable
        if is_series and item.get('seasons'):
            for s_idx, season in enumerate(item['seasons']):
                s_num = season.get('seasonNumber', s_idx + 1)
                season['streams'] = build_tv_streams(imdb, tmdb, s_num, 1)
                
                for ep_idx, ep in enumerate(season.get('episodes', [])):
                    e_num = ep.get('episodeNumber', ep_idx + 1)
                    ep['streams'] = build_tv_streams(imdb, tmdb, s_num, e_num)
                    pruned_series_streams += 1

    # Save cleaned data
    with open(CONTENT_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        
    print(f"Standardized {pruned_movie_streams} items and {pruned_series_streams} episode streams.")
    print("All unnecessary/failing streaming servers removed completely from content.json.")

if __name__ == '__main__':
    prune_and_standardize()
