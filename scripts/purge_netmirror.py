#!/usr/bin/env python3
"""
Purges all NetMirror servers, URLs, and metadata from data/content.json.
Re-aligns primary streamLink and server arrays to:
  Server 1: AllMovieLand - HDVB P2P
  Server 2: HDMovie2 - P2P HLS
  Server 3: CineSrc - No Ads
  Server 4: VidLink - Fast HD
"""

import json
import os
import re

CONTENT_FILE = r"d:\Projects\scrapper\phantommovies_site\data\content.json"

SERVER_LABELS = [
    "Server 1 (AllMovieLand - HDVB P2P)",
    "Server 2 (HDMovie2 - P2P HLS)",
    "Server 3 (CineSrc - No Ads)",
    "Server 4 (VidLink - Fast HD)"
]

def is_netmirror(text: str) -> bool:
    if not text:
        return False
    lower = str(text).lower()
    return any(k in lower for k in ['net27', 'net79', 'netmirror', 'vip ultra hd'])

def clean_server_label(name: str, index: int = 0) -> str:
    lower = str(name).lower()
    if any(k in lower for k in ['allmovieland', 'slast430did', 'hdvb']):
        return "Server 1 (AllMovieLand - HDVB P2P)"
    if any(k in lower for k in ['hdmovie2', 'gorri', 'fikka']):
        return "Server 2 (HDMovie2 - P2P HLS)"
    if 'cinesrc' in lower:
        return "Server 3 (CineSrc - No Ads)"
    if 'vidlink' in lower:
        return "Server 4 (VidLink - Fast HD)"
    if index < len(SERVER_LABELS):
        return SERVER_LABELS[index]
    return f"Server {index + 1}"

def generate_movie_streams(imdb_id: str, tmdb_id: str):
    imdb = imdb_id or tmdb_id or ""
    tmdb = tmdb_id or imdb_id or ""
    streams = []
    if imdb:
        streams.append({"name": "Server 1 (AllMovieLand - HDVB P2P)", "url": f"https://slast430did.com/play/{imdb}"})
        streams.append({"name": "Server 2 (HDMovie2 - P2P HLS)", "url": f"https://gorri421kos.com/play/{imdb}"})
    if tmdb:
        streams.append({"name": "Server 3 (CineSrc - No Ads)", "url": f"https://cinesrc.st/embed/movie/{tmdb}"})
    if imdb:
        streams.append({"name": "Server 4 (VidLink - Fast HD)", "url": f"https://vidlink.pro/movie/{imdb}"})
    return streams

def generate_tv_streams(imdb_id: str, tmdb_id: str, season: int, episode: int):
    imdb = imdb_id or tmdb_id or ""
    tmdb = tmdb_id or imdb_id or ""
    streams = []
    if imdb:
        streams.append({"name": "Server 1 (AllMovieLand - HDVB P2P)", "url": f"https://slast430did.com/play/{imdb}?s={season}&e={episode}"})
        streams.append({"name": "Server 2 (HDMovie2 - P2P HLS)", "url": f"https://gorri421kos.com/play/{imdb}?s={season}&e={episode}"})
    if tmdb:
        streams.append({"name": "Server 3 (CineSrc - No Ads)", "url": f"https://cinesrc.st/embed/tv/{tmdb}?s={season}&e={episode}"})
    if imdb:
        streams.append({"name": "Server 4 (VidLink - Fast HD)", "url": f"https://vidlink.pro/tv/{imdb}/{season}/{episode}"})
    return streams

def purge_content():
    with open(CONTENT_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)

    movies = data.get('movies', [])
    modified_count = 0

    for m in movies:
        imdb_id = m.get('imdb_id', '')
        tmdb_id = m.get('tmdb_id', '')
        m_type = m.get('type', 'movie')

        # 1. Remove all netmirror properties (netmirror_id, netmirror_dp, etc.)
        for k in [k for k in list(m.keys()) if 'netmirror' in k.lower()]:
            del m[k]
            modified_count += 1

        # 2. Process movies
        if m_type == 'movie':
            current_streams = m.get('streams', [])
            cleaned_streams = []
            for s in current_streams:
                s_url = s.get('url', '')
                s_name = s.get('name', '')
                if not is_netmirror(s_url) and not is_netmirror(s_name):
                    lbl = clean_server_label(s_name, len(cleaned_streams))
                    cleaned_streams.append({"name": lbl, "url": s_url})

            # If cleaned streams empty or missing, regenerate standard 4-server fleet
            if not cleaned_streams and (imdb_id or tmdb_id):
                cleaned_streams = generate_movie_streams(imdb_id, tmdb_id)

            m['streams'] = cleaned_streams

            # Re-align streamLink
            if is_netmirror(m.get('streamLink', '')) or not m.get('streamLink'):
                if cleaned_streams:
                    m['streamLink'] = cleaned_streams[0]['url']
                elif imdb_id:
                    m['streamLink'] = f"https://slast430did.com/play/{imdb_id}"
                elif tmdb_id:
                    m['streamLink'] = f"https://cinesrc.st/embed/movie/{tmdb_id}"

        # 3. Process series
        elif m_type == 'series':
            # Clean season streams if present
            for s_idx, season in enumerate(m.get('seasons', [])):
                s_num = season.get('seasonNumber', s_idx + 1)
                if 'streams' in season:
                    c_streams = []
                    for st in season['streams']:
                        if not is_netmirror(st.get('url', '')) and not is_netmirror(st.get('name', '')):
                            c_streams.append({"name": clean_server_label(st.get('name', ''), len(c_streams)), "url": st.get('url', '')})
                    season['streams'] = c_streams

                for ep_idx, episode in enumerate(season.get('episodes', [])):
                    ep_num = episode.get('episodeNumber', ep_idx + 1)
                    ep_streams = episode.get('streams', [])
                    cleaned_ep_streams = []
                    for st in ep_streams:
                        if not is_netmirror(st.get('url', '')) and not is_netmirror(st.get('name', '')):
                            cleaned_ep_streams.append({"name": clean_server_label(st.get('name', ''), len(cleaned_ep_streams)), "url": st.get('url', '')})

                    if not cleaned_ep_streams and (imdb_id or tmdb_id):
                        cleaned_ep_streams = generate_tv_streams(imdb_id, tmdb_id, s_num, ep_num)

                    episode['streams'] = cleaned_ep_streams

            # If top-level series streams exist
            if 'streams' in m:
                c_streams = []
                for st in m['streams']:
                    if not is_netmirror(st.get('url', '')) and not is_netmirror(st.get('name', '')):
                        c_streams.append({"name": clean_server_label(st.get('name', ''), len(c_streams)), "url": st.get('url', '')})
                m['streams'] = c_streams

            if is_netmirror(m.get('streamLink', '')):
                m['streamLink'] = ''

    # Save cleaned content.json
    with open(CONTENT_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"[SUCCESS] Purged NetMirror from {len(movies)} items in {CONTENT_FILE}")

if __name__ == '__main__':
    purge_content()
