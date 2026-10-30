#!/usr/bin/env python3
"""
Upgrades streaming servers in data/content.json to top-tier ad-free providers:
  Server 1: CineSrc - Zero Ads (https://cinesrc.st)
  Server 2: VidLink - Modern CDN (https://vidlink.pro)
  Server 3: 2Embed - Global & Hindi (https://www.2embed.cc)
  Server 4: AllMovieLand - HDVB P2P (https://1xcinema.net)

Completely eliminates HDMovie2 (gorri421kos / slast430did) 10-second unskippable
video ads and pause banners for both Movies and Web Series.
"""

import json
import os
import re

CONTENT_FILE = r"d:\Projects\scrapper\phantommovies_site\data\content.json"
MIRRORS_FILE = r"d:\Projects\scrapper\phantommovies_site\data\mirrors.json"

SERVER_LABELS = [
    "Server 1 (CineSrc - Zero Ads)",
    "Server 2 (VidLink - Modern CDN)",
    "Server 3 (2Embed - Global & Hindi)",
    "Server 4 (AllMovieLand - HDVB P2P)"
]

def generate_movie_streams(imdb_id: str, tmdb_id: str):
    imdb = (imdb_id or "").strip()
    tmdb = (tmdb_id or "").strip()
    streams = []

    # Server 1: CineSrc (Zero Ads) - prefers TMDB, falls back to IMDb
    if tmdb or imdb:
        t = tmdb if tmdb else imdb
        streams.append({"name": "Server 1 (CineSrc - Zero Ads)", "url": f"https://cinesrc.st/embed/movie/{t}"})

    # Server 2: VidLink (Modern CDN) - prefers IMDb, falls back to TMDB
    if imdb or tmdb:
        t = imdb if imdb else tmdb
        streams.append({"name": "Server 2 (VidLink - Modern CDN)", "url": f"https://vidlink.pro/movie/{t}"})

    # Server 3: 2Embed (Global & Hindi)
    if imdb or tmdb:
        t = imdb if imdb else tmdb
        streams.append({"name": "Server 3 (2Embed - Global & Hindi)", "url": f"https://www.2embed.cc/embed/{t}"})

    # Server 4: AllMovieLand (HDVB P2P)
    if imdb or tmdb:
        t = imdb if imdb else tmdb
        streams.append({"name": "Server 4 (AllMovieLand - HDVB P2P)", "url": f"https://1xcinema.net/play/{t}"})

    return streams

def generate_tv_streams(imdb_id: str, tmdb_id: str, season: int = 1, episode: int = 1):
    imdb = (imdb_id or "").strip()
    tmdb = (tmdb_id or "").strip()
    streams = []

    # Server 1: CineSrc (Zero Ads)
    if tmdb or imdb:
        t = tmdb if tmdb else imdb
        streams.append({"name": "Server 1 (CineSrc - Zero Ads)", "url": f"https://cinesrc.st/embed/tv/{t}?s={season}&e={episode}"})

    # Server 2: VidLink (Modern CDN) - VidLink TV requires TMDB ID for 100% reliability
    if tmdb or imdb:
        t = tmdb if tmdb else imdb
        streams.append({"name": "Server 2 (VidLink - Modern CDN)", "url": f"https://vidlink.pro/tv/{t}/{season}/{episode}"})

    # Server 3: 2Embed (Global & Hindi)
    if imdb or tmdb:
        t = imdb if imdb else tmdb
        streams.append({"name": "Server 3 (2Embed - Global & Hindi)", "url": f"https://www.2embed.cc/embedtv/{t}&s={season}&e={episode}"})

    # Server 4: AllMovieLand (HDVB P2P)
    if imdb or tmdb:
        t = imdb if imdb else tmdb
        streams.append({"name": "Server 4 (AllMovieLand - HDVB P2P)", "url": f"https://1xcinema.net/play/{t}?s={season}&e={episode}"})

    return streams

def upgrade_content():
    if not os.path.exists(CONTENT_FILE):
        print(f"Error: {CONTENT_FILE} not found.")
        return

    with open(CONTENT_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)

    movies = data.get('movies', [])
    updated_count = 0

    for m in movies:
        imdb = m.get('imdb_id', '').strip()
        tmdb = m.get('tmdb_id', '').strip()
        is_series = m.get('type') == 'series'

        if is_series:
            # Upgrade top-level streams
            new_streams = generate_tv_streams(imdb, tmdb, 1, 1)
            m['streams'] = new_streams
            if new_streams:
                m['streamLink'] = new_streams[0]['url']
            
            # Upgrade per-episode streams if present
            seasons = m.get('seasons', [])
            for s in seasons:
                s_num = int(s.get('season_number', 1) or 1)
                for ep in s.get('episodes', []):
                    ep_num = int(ep.get('episode_number', 1) or 1)
                    ep['streams'] = generate_tv_streams(imdb, tmdb, s_num, ep_num)
                    if ep['streams']:
                        ep['streamLink'] = ep['streams'][0]['url']
        else:
            new_streams = generate_movie_streams(imdb, tmdb)
            m['streams'] = new_streams
            if new_streams:
                m['streamLink'] = new_streams[0]['url']

        updated_count += 1

    with open(CONTENT_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"[+] Successfully upgraded streaming servers for {updated_count} movies & series in {CONTENT_FILE}!")

def upgrade_mirrors():
    if not os.path.exists(MIRRORS_FILE):
        return

    with open(MIRRORS_FILE, 'r', encoding='utf-8') as f:
        mirrors = json.load(f)

    mirrors["streaming"] = {
        "providers": [
            {
                "id": "cinesrc",
                "name": "Server 1 (CineSrc - Zero Ads)",
                "domains": ["https://cinesrc.st"],
                "movieTemplate": "/embed/movie/{tmdb}",
                "tvTemplate": "/embed/tv/{tmdb}?s={s}&e={e}"
            },
            {
                "id": "vidlink",
                "name": "Server 2 (VidLink - Modern CDN)",
                "domains": ["https://vidlink.pro", "https://vidlink.online"],
                "movieTemplate": "/movie/{imdb}",
                "tvTemplate": "/tv/{tmdb}/{s}/{e}"
            },
            {
                "id": "2embed",
                "name": "Server 3 (2Embed - Global & Hindi)",
                "domains": ["https://www.2embed.cc"],
                "movieTemplate": "/embed/{imdb}",
                "tvTemplate": "/embedtv/{imdb}&s={s}&e={e}"
            },
            {
                "id": "allmovieland",
                "name": "Server 4 (AllMovieLand - HDVB P2P)",
                "domains": ["https://1xcinema.net", "https://allmovieland.link"],
                "movieTemplate": "/play/{imdb}",
                "tvTemplate": "/play/{imdb}?s={s}&e={e}"
            }
        ]
    }

    with open(MIRRORS_FILE, 'w', encoding='utf-8') as f:
        json.dump(mirrors, f, indent=2, ensure_ascii=False)

    print(f"[+] Successfully updated {MIRRORS_FILE} streaming providers!")

if __name__ == '__main__':
    upgrade_content()
    upgrade_mirrors()
