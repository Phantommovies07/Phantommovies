import os
import sys
import json
import time
import re
import argparse
from datetime import datetime, timezone
from typing import Dict, List, Tuple, Optional

# UTF-8 stdout encoding for cross-platform compatibility
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

try:
    import requests
except ImportError:
    print("[Error] 'requests' library is required. Install via: pip install requests")
    sys.exit(1)

try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None

# Default headers
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "application/json,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# Quality styling and matching order
QUALITY_ORDER = [
    ('2160p', '4K Ultra HD', '#8b5cf6'),
    ('4k', '4K Ultra HD', '#8b5cf6'),
    ('1080p', '1080p Full HD', '#10b981'),
    ('720p', '720p HD', '#06b6d4'),
    ('480p', '480p SD', '#ffd70f')
]

# Paths (relative to phantommovies_site root)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
CONTENT_FILE = os.path.join(REPO_ROOT, "data", "content.json")

def format_duration(runtime_minutes: int) -> str:
    if not runtime_minutes or runtime_minutes <= 0:
        return "2h 00m"
    hours = runtime_minutes // 60
    mins = runtime_minutes % 60
    return f"{hours}h {mins:02d}m"

def generate_stream_servers(imdb_id: str, tmdb_id: str = "") -> Tuple[str, List[Dict]]:
    """Generates stealth whitelisted multi-server movie streaming embed links."""
    identifier = imdb_id or tmdb_id
    if not identifier:
        return "", []

    primary_url = f"https://multiembed.mov/?video_id={imdb_id}&tmdb_id={tmdb_id}" if imdb_id else f"https://multiembed.mov/?tmdb_id={tmdb_id}"
    servers = [
        {"name": "Server 1 (HD)", "url": primary_url},
        {"name": "Server 2 (Fast)", "url": f"https://player.autoembed.cc/embed/movie/{tmdb_id or imdb_id}"},
        {"name": "Server 3 (VIP)", "url": f"https://embed.su/embed/movie/{tmdb_id or imdb_id}"},
        {"name": "Server 4 (Ultra)", "url": f"https://vidsrc.cc/v2/embed/movie/{imdb_id or tmdb_id}"},
        {"name": "Server 5 (Cloud)", "url": f"https://player.smashystream.com/movie/{tmdb_id or imdb_id}"}
    ]
    return primary_url, servers

def generate_tv_stream_servers(imdb_id: str, tmdb_id: str = "", season: int = 1, episode: int = 1) -> List[Dict]:
    """Generates stealth whitelisted multi-server TV/reality show streaming embed links."""
    identifier = imdb_id or tmdb_id
    if not identifier:
        return []
    s = season or 1
    e = episode or 1
    primary_url = f"https://multiembed.mov/?video_id={imdb_id}&s={s}&e={e}" if imdb_id else f"https://multiembed.mov/?tmdb_id={tmdb_id}&s={s}&e={e}"
    return [
        {"name": "Server 1 (HD)", "url": primary_url},
        {"name": "Server 2 (Fast)", "url": f"https://player.autoembed.cc/embed/tv/{tmdb_id or imdb_id}/{s}/{e}"},
        {"name": "Server 3 (VIP)", "url": f"https://embed.su/embed/tv/{tmdb_id or imdb_id}/{s}/{e}"},
        {"name": "Server 4 (Ultra)", "url": f"https://vidsrc.cc/v2/embed/tv/{imdb_id or tmdb_id}/{s}/{e}"},
        {"name": "Server 5 (Cloud)", "url": f"https://player.smashystream.com/tv/{tmdb_id or imdb_id}?s={s}&e={e}"}
    ]

class IMDbSearchEngine:
    """Zero-key scraper using IMDb suggestion API (AWS CloudFront CDN) for movies and TV series."""

    def search(self, query: str, prefer_series: bool = False) -> Optional[Dict]:
        if not query or not query.strip():
            return None
        clean_q = re.sub(r'[^a-zA-Z0-9_\s]', '', query).strip().lower()
        if not clean_q:
            return None
        first_char = clean_q[0]
        encoded_q = clean_q.replace(" ", "_")
        url = f"https://v3.sg.media-imdb.com/suggestion/{first_char}/{encoded_q}.json"

        try:
            resp = requests.get(url, headers=HEADERS, timeout=8)
            if resp.status_code != 200:
                return None
            data = resp.json()
            items = data.get("d", [])
            if not items:
                return None

            best_match = None
            for item in items:
                qid = item.get("qid", "")
                imdb_id = item.get("id")
                title = item.get("l")
                if not imdb_id or not str(imdb_id).startswith("tt") or not title:
                    continue

                is_tv = qid in ["tvSeries", "tvMiniSeries"]
                if prefer_series and is_tv:
                    best_match = item
                    break
                elif not prefer_series and not best_match:
                    best_match = item

            if not best_match:
                best_match = items[0]

            imdb_id = best_match.get("id")
            if not imdb_id or not str(imdb_id).startswith("tt"):
                return None

            title = best_match.get("l", query)
            year = best_match.get("y")
            cast = best_match.get("s", "")
            poster = best_match.get("i", {}).get("imageUrl", "") if "i" in best_match else ""
            qid = best_match.get("qid", "")
            is_series = qid in ["tvSeries", "tvMiniSeries"]

            return {
                "imdb_id": imdb_id,
                "tmdb_id": "",
                "title": title,
                "year": int(year) if year else 2024,
                "cast": cast,
                "genre": best_match.get("q", "Drama" if is_series else "Action").title(),
                "rating": 7.5,
                "runtime": 45 if is_series else 120,
                "overview": f"{title} ({year}) starring {cast}.",
                "poster": poster,
                "banner": poster,
                "is_series": is_series,
                "trailer": f"https://www.youtube.com/results?search_query={title.replace(' ', '+')}+{year}+trailer"
            }
        except Exception as e:
            print(f"  [IMDb] Search error for '{query}': {e}")
        return None

class TMDBEngine:
    """TMDb API engine for rich metadata, 4K banners, trailers, and trending feeds."""

    BASE_URL = "https://api.themoviedb.org/3"
    IMAGE_BASE = "https://image.tmdb.org/t/p"

    def __init__(self, api_key: str):
        self.api_key = api_key.strip() if api_key else ""

    def is_configured(self) -> bool:
        return bool(self.api_key and len(self.api_key) > 10)

    def get_details(self, tmdb_id: int, is_tv: bool = False) -> Optional[Dict]:
        endpoint = "tv" if is_tv else "movie"
        url = f"{self.BASE_URL}/{endpoint}/{tmdb_id}"
        params = {"api_key": self.api_key, "append_to_response": "videos,credits"}
        try:
            resp = requests.get(url, params=params, headers=HEADERS, timeout=8)
            if resp.status_code == 200:
                data = resp.json()
                trailer = ""
                for vid in data.get("videos", {}).get("results", []):
                    if vid.get("site") == "YouTube" and vid.get("type") in ["Trailer", "Teaser"]:
                        trailer = f"https://www.youtube.com/embed/{vid.get('key')}"
                        break

                credits = data.get("credits", {})
                cast_names = [c.get("name") for c in credits.get("cast", [])[:5]]
                genres = [g.get("name") for g in data.get("genres", [])]

                poster_path = data.get("poster_path")
                backdrop_path = data.get("backdrop_path")
                poster = f"{self.IMAGE_BASE}/w500{poster_path}" if poster_path else ""
                banner = f"{self.IMAGE_BASE}/original{backdrop_path}" if backdrop_path else poster

                release_date = data.get("first_air_date" if is_tv else "release_date", "")
                year = int(release_date.split("-")[0]) if release_date and "-" in release_date else 2024
                title = data.get("name" if is_tv else "title", "")

                return {
                    "imdb_id": data.get("imdb_id") or "",
                    "tmdb_id": str(tmdb_id),
                    "title": title,
                    "year": year,
                    "cast": ", ".join(cast_names),
                    "genre": genres[0] if genres else ("Drama" if is_tv else "Action"),
                    "rating": round(float(data.get("vote_average") or 7.5), 1),
                    "runtime": (data.get("episode_run_time", [45]) or [45])[0] if is_tv else (data.get("runtime") or 120),
                    "overview": data.get("overview") or f"Watch {title} online in full HD.",
                    "poster": poster,
                    "banner": banner,
                    "is_series": is_tv,
                    "trailer": trailer
                }
        except Exception as e:
            print(f"  [TMDb] Details error for ID {tmdb_id}: {e}")
        return None

    def fetch_feed(self, endpoint: str, extra_params: Dict = None) -> List[Dict]:
        url = f"{self.BASE_URL}/{endpoint.lstrip('/')}"
        params = {"api_key": self.api_key}
        if extra_params:
            params.update(extra_params)
        items = []
        try:
            resp = requests.get(url, params=params, headers=HEADERS, timeout=8)
            if resp.status_code == 200:
                results = resp.json().get("results", [])
                for item in results[:10]:
                    details = self.get_details(item.get("id"))
                    if details:
                        items.append(details)
        except Exception as e:
            print(f"  [TMDb] Feed error for {endpoint}: {e}")
        return items

def parse_title_info(raw_title: str) -> Dict:
    """Parses clean title, year, season list, episode number, and series flag from raw post titles."""
    t = re.sub(r'\[.*?\]', '', raw_title)
    t = re.sub(r'Download\s+', '', t, flags=re.IGNORECASE).strip()

    # Extract year if present
    year_match = re.search(r'\b(19\d\d|20\d\d)\b', t)
    year = int(year_match.group(1)) if year_match else None

    # Detect seasons
    season_range = re.search(r'S(\d{1,2})\s*-\s*S?(\d{1,2})', t, re.IGNORECASE) or re.search(r'Season\s*(\d{1,2})\s*-\s*(\d{1,2})', t, re.IGNORECASE)
    season_single = re.search(r'(?:S|Season\s*)(\d{1,2})', t, re.IGNORECASE)

    seasons = []
    if season_range:
        s_start, s_end = int(season_range.group(1)), int(season_range.group(2))
        seasons = list(range(s_start, s_end + 1))
    elif season_single:
        seasons = [int(season_single.group(1))]

    # Detect episode
    ep_match = re.search(r'(?:Ep|Episode|E)\s*(\d{1,2})', t, re.IGNORECASE)
    episode = int(ep_match.group(1)) if ep_match else None

    # Clean title
    clean = re.sub(r'\(\s*(?:19\d\d|20\d\d)(?:\s*-\s*(?:19\d\d|20\d\d))?\s*\)', '', t)
    clean = re.sub(r'\b(19\d\d|20\d\d)\b', '', clean)
    clean = re.sub(r'(?:Season\s*\d+(?:\s*-\s*\d+)?|S\d+(?:\s*-\s*S?\d+)?|Complete|Original|Web\s*Series|Hindi|Dual\s*Audio|English|Tamil|Telugu|Kannada|WEB-DL|HDRip|PreDVD|Pre-DvDRip|DD5\.1|AAC-2\.0|480p|720p|1080p|4K|UNCENSORED|LiNE|Amazon|Paramount|ZEE5|Atrangii|HGM).*', '', clean, flags=re.IGNORECASE)
    clean = clean.replace(':', ' ').replace('(', '').replace(')', '').strip()
    clean = re.sub(r'\s+', ' ', clean)

    is_series = bool(seasons or episode or 'series' in raw_title.lower() or 'show' in raw_title.lower())

    return {
        "raw_title": raw_title,
        "clean_title": clean,
        "year": year or 2024,
        "is_series": is_series,
        "seasons": seasons or ([1] if is_series else []),
        "episode": episode
    }

class LiveRecentCrawler:
    """Crawls active recent feeds from KM Movies & RogMovies to ingest newly published movies & series 24/7."""

    FEEDS = [
        ("https://kmmovies.baby/", "kmmovies", False),
        ("https://kmmovies.baby/category/tv-series/", "kmmovies", True),
        ("https://kmmovies.pics/", "kmmovies", False),
        ("https://rogmovies.casa/", "rogmovies", False),
        ("https://rogmovies.casa/web-series/", "rogmovies", True),
    ]

    def fetch_recent_posts(self, max_posts: int = 15) -> List[Dict]:
        if not BeautifulSoup:
            return []

        posts = []
        seen_urls = set()

        for feed_url, source, is_tv_feed in self.FEEDS:
            try:
                resp = requests.get(feed_url, headers=HEADERS, timeout=6)
                if resp.status_code != 200:
                    continue
                soup = BeautifulSoup(resp.text, "html.parser")
                articles = soup.find_all("article")
                if not articles:
                    articles = soup.select('.post, .item, div[class*="post"], div[class*="item"]')

                for art in articles:
                    a_tag = art.find("a", href=True)
                    title_tag = art.find(["h2", "h3", "h1"]) or a_tag
                    if not a_tag or not title_tag:
                        continue
                    href = a_tag["href"]
                    title_text = title_tag.get_text(strip=True)

                    if href in seen_urls or not href.startswith("http"):
                        continue
                    if len(title_text) < 4 or any(k in href for k in ["/category/", "/page/", "/actor/", "/genre/"]):
                        continue

                    seen_urls.add(href)
                    parsed = parse_title_info(title_text)
                    if is_tv_feed:
                        parsed["is_series"] = True
                        if not parsed["seasons"]:
                            parsed["seasons"] = [1]

                    posts.append({
                        "post_title": title_text,
                        "url": href,
                        "source": source,
                        "parsed": parsed
                    })
                    if len(posts) >= max_posts:
                        break
            except Exception as e:
                continue

        return posts

    def extract_downloads_from_post(self, post_url: str) -> List[Dict]:
        """Extracts quality download buttons (480p, 720p, 1080p, 4K) for a movie post."""
        if not BeautifulSoup:
            return []
        try:
            resp = requests.get(post_url, headers=HEADERS, timeout=8)
            if resp.status_code != 200:
                return []
            soup = BeautifulSoup(resp.text, "html.parser")
            links = soup.find_all("a", href=True)

            downloads = []
            seen = set()
            for a in links:
                href = a["href"]
                text = a.get_text(strip=True)
                if not href.startswith("http") or any(skip in href for skip in ["kmmovies", "rogmovies", "category", "facebook", "twitter", "telegram", "whatsapp"]):
                    continue

                for q_key, q_label, color in QUALITY_ORDER:
                    if (q_key in text.lower() or q_key in href.lower()) and q_key not in seen:
                        size_match = re.search(r'(\d+(?:\.\d+)?\s*(?:GB|MB))', text, re.IGNORECASE)
                        size_str = size_match.group(1).upper() if size_match else ""

                        downloads.append({
                            "quality": q_label,
                            "size": size_str,
                            "server": "Fast Cloud",
                            "url": href,
                            "color": color
                        })
                        seen.add(q_key)
                        break
            return downloads
        except Exception:
            return []

    def extract_series_content(self, post_url: str, default_seasons: List[int]) -> Dict[int, Dict]:
        """Extracts season packs and episodes from a series/show post."""
        if not BeautifulSoup:
            return {}
        try:
            resp = requests.get(post_url, headers=HEADERS, timeout=8)
            if resp.status_code != 200:
                return {}
            soup = BeautifulSoup(resp.text, "html.parser")
            links = soup.find_all("a", href=True)

            seasons_dict: Dict[int, Dict] = {}
            for s_num in default_seasons:
                seasons_dict[s_num] = {
                    "seasonNumber": s_num,
                    "title": f"Season {s_num}",
                    "combined": True,
                    "streams": [],
                    "downloads": [],
                    "episodes": []
                }

            current_s_num = default_seasons[0] if default_seasons else 1

            for a in links:
                href = a["href"]
                text = a.get_text(strip=True)
                if not href.startswith("http") or any(skip in href for skip in ["kmmovies", "rogmovies", "category", "facebook", "twitter", "telegram", "whatsapp"]):
                    continue

                s_match = re.search(r'(?:S|Season\s*)(\d{1,2})', text, re.IGNORECASE) or re.search(r'(?:s|season-)(\d{1,2})', href, re.IGNORECASE)
                s_num = int(s_match.group(1)) if s_match else current_s_num

                if s_num not in seasons_dict:
                    seasons_dict[s_num] = {
                        "seasonNumber": s_num,
                        "title": f"Season {s_num}",
                        "combined": True,
                        "streams": [],
                        "downloads": [],
                        "episodes": []
                    }

                matched_quality = None
                for q_key, q_label, color in QUALITY_ORDER:
                    if q_key in text.lower() or q_key in href.lower():
                        size_match = re.search(r'(\d+(?:\.\d+)?\s*(?:GB|MB))', text, re.IGNORECASE)
                        size_str = size_match.group(1).upper() if size_match else ""
                        matched_quality = (q_label, size_str, color)
                        break

                if matched_quality:
                    q_label, size_str, color = matched_quality
                    ep_match = re.search(r'(?:ep|episode|e)(\d{1,2})', text.lower()) or re.search(r'(?:ep|episode|e)(\d{1,2})', href.lower())
                    if ep_match:
                        ep_num = int(ep_match.group(1))
                        ep_obj = next((e for e in seasons_dict[s_num]["episodes"] if e["episodeNumber"] == ep_num), None)
                        if not ep_obj:
                            ep_obj = {
                                "episodeNumber": ep_num,
                                "title": f"Episode {ep_num}",
                                "duration": "45m",
                                "streams": [],
                                "downloads": []
                            }
                            seasons_dict[s_num]["episodes"].append(ep_obj)
                        ep_obj["downloads"].append({
                            "quality": q_label,
                            "size": size_str,
                            "server": "Fast Cloud",
                            "url": href,
                            "color": color
                        })
                    else:
                        if not any(d["quality"] == q_label for d in seasons_dict[s_num]["downloads"]):
                            seasons_dict[s_num]["downloads"].append({
                                "quality": q_label,
                                "size": size_str,
                                "server": "Fast Cloud",
                                "url": href,
                                "color": color
                            })

            return seasons_dict
        except Exception:
            return {}

def load_content(path: str = CONTENT_FILE) -> Dict:
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {
        "movies": [],
        "settings": {
            "siteName": "Phantom Movies",
            "siteDescription": "Stream unlimited movies & shows",
            "totalMovies": 0,
            "lastUpdated": datetime.now(timezone.utc).isoformat()
        }
    }

def save_content(data: Dict, path: str = CONTENT_FILE) -> bool:
    try:
        if os.path.exists(path):
            backup_path = path + ".bak"
            with open(path, "r", encoding="utf-8") as src, open(backup_path, "w", encoding="utf-8") as dst:
                dst.write(src.read())

        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"[Error] Failed to save {path}: {e}")
        return False

def format_phantom_movie(m: Dict) -> Dict:
    now_iso = datetime.now(timezone.utc).isoformat()
    unique_id = str(int(time.time() * 1000) + hash(m.get("title", "")) % 10000)

    imdb_id = m.get("imdb_id", "")
    tmdb_id = m.get("tmdb_id", "")
    primary_stream, stream_servers = generate_stream_servers(imdb_id, tmdb_id)

    duration = format_duration(m.get("runtime", 120))
    poster = m.get("poster", "")
    banner = m.get("banner") or poster
    trailer = m.get("trailer") or f"https://www.youtube.com/results?search_query={m.get('title','').replace(' ','+')}+trailer"

    return {
        "id": unique_id,
        "type": "movie",
        "title": m.get("title", ""),
        "genre": m.get("genre", "Action"),
        "year": m.get("year", 2024),
        "duration": duration,
        "rating": round(float(m.get("rating") or 7.5), 1),
        "badge": "HD",
        "poster": poster,
        "banner": banner,
        "streamLink": primary_stream,
        "streams": stream_servers,
        "downloads": m.get("downloads", []),
        "seasons": [],
        "trailerLink": trailer,
        "description": m.get("overview", f"Watch {m.get('title')} online in full HD with multiple streaming servers."),
        "featured": False,
        "trending": True,
        "heroSlide": False,
        "status": "published",
        "active": True,
        "views": 0,
        "ratingCount": 0,
        "ratingSum": 0,
        "imdb_id": imdb_id,
        "tmdb_id": tmdb_id,
        "createdAt": now_iso,
        "updatedAt": now_iso
    }

def format_phantom_series(meta: Dict, seasons_dict: Dict[int, Dict]) -> Dict:
    now_iso = datetime.now(timezone.utc).isoformat()
    unique_id = str(int(time.time() * 1000) + hash(meta.get("title", "")) % 10000)

    imdb_id = meta.get("imdb_id", "")
    tmdb_id = meta.get("tmdb_id", "")
    poster = meta.get("poster", "")
    banner = meta.get("banner") or poster
    trailer = meta.get("trailer") or f"https://www.youtube.com/results?search_query={meta.get('title','').replace(' ','+')}+trailer"

    formatted_seasons = []
    for s_num in sorted(seasons_dict.keys()):
        s_data = seasons_dict[s_num]
        s_streams = generate_tv_stream_servers(imdb_id, tmdb_id, s_num, 1)

        # For episodes, attach TV stream servers
        formatted_episodes = []
        for ep in s_data.get("episodes", []):
            ep_num = ep.get("episodeNumber", 1)
            formatted_episodes.append({
                "episodeNumber": ep_num,
                "title": ep.get("title", f"Episode {ep_num}"),
                "duration": ep.get("duration", "45m"),
                "streams": generate_tv_stream_servers(imdb_id, tmdb_id, s_num, ep_num),
                "downloads": ep.get("downloads", [])
            })

        formatted_seasons.append({
            "seasonNumber": s_num,
            "title": f"Season {s_num}",
            "combined": bool(s_data.get("downloads") and not formatted_episodes),
            "streams": s_streams,
            "downloads": s_data.get("downloads", []),
            "episodes": formatted_episodes
        })

    return {
        "id": unique_id,
        "type": "series",
        "title": meta.get("title", ""),
        "genre": meta.get("genre", "Drama"),
        "year": meta.get("year", 2024),
        "duration": "",
        "rating": round(float(meta.get("rating") or 7.8), 1),
        "badge": "HD",
        "poster": poster,
        "banner": banner,
        "combined": False,
        "streamLink": "",
        "streams": [],
        "downloads": [],
        "seasons": formatted_seasons,
        "trailerLink": trailer,
        "description": meta.get("overview", f"Watch {meta.get('title')} web series & episodes in full HD."),
        "featured": False,
        "trending": True,
        "heroSlide": False,
        "status": "published",
        "active": True,
        "views": 0,
        "ratingCount": 0,
        "ratingSum": 0,
        "imdb_id": imdb_id,
        "tmdb_id": tmdb_id,
        "createdAt": now_iso,
        "updatedAt": now_iso
    }

# Curated library as fallback/top-up
CURATED_CANDIDATES = [
    "Stree 2", "Khel Khel Mein", "Vedaa", "Fighter", "Shaitaan", "Jawan", "Animal",
    "Dunki", "Chandu Champion", "Kill", "Munjya", "Srikanth", "Crew", "Article 370",
    "Bade Miyan Chote Miyan", "Yodha", "Sam Bahadur", "Tiger 3", "OMG 2", "Gadar 2",
    "Kalki 2898 AD", "Devara: Part 1", "Pushpa 2: The Rule", "GOAT", "Hanu-Man",
    "Salaar: Part 1 - Ceasefire", "Captain Miller", "Aavesham", "Manjummel Boys",
    "Deadpool & Wolverine", "Alien: Romulus", "Inside Out 2", "Gladiator II",
    "Twisters", "Beetlejuice Beetlejuice", "Civil War", "The Substance",
    "Bad Boys: Ride or Die", "Kingdom of the Planet of the Apes", "Furiosa: A Mad Max Saga"
]

def run_auto_sync(target_new_count: int = 5, tmdb_key: str = None) -> Dict:
    """Executes the automatic 24/7 movie & series ingestion pipeline."""
    print("=" * 65)
    print("🎬 Phantom Movies — 24/7 Live Movie & Series Automation Engine")
    print("=" * 65)

    content_data = load_content()
    existing_catalog = content_data.get("movies", [])
    existing_by_title = {m.get("title", "").strip().lower(): m for m in existing_catalog}
    existing_by_imdb = {m.get("imdb_id"): m for m in existing_catalog if m.get("imdb_id")}

    print(f"📊 Current site catalog: {len(existing_catalog)} titles")
    print(f"🎯 Target additions/updates: {target_new_count}")

    tmdb_key = tmdb_key or os.getenv("TMDB_API_KEY", "")
    tmdb = TMDBEngine(tmdb_key)
    imdb = IMDbSearchEngine()
    crawler = LiveRecentCrawler()

    newly_added = []
    updated_series_count = 0

    # ─────────────────────────────────────────────────────────────
    # STEP 1: Crawl Live Recent Feeds from KM Movies & RogMovies
    # ─────────────────────────────────────────────────────────────
    print("\n🌐 Crawling live recent feeds (KM Movies, RogMovies TV & Series)...")
    recent_posts = crawler.fetch_recent_posts(max_posts=20)
    print(f"📥 Discovered {len(recent_posts)} live recent posts.")

    for item in recent_posts:
        if len(newly_added) >= target_new_count:
            break

        post_url = item["url"]
        parsed = item["parsed"]
        clean_title = parsed["clean_title"]
        year = parsed["year"]
        is_series = parsed["is_series"]
        detected_seasons = parsed["seasons"]

        if not clean_title or len(clean_title) < 2:
            continue

        existing_entry = existing_by_title.get(clean_title.lower())

        # ─── CASE A: TV Series / Reality Show / Web Series ───
        if is_series:
            # Check if this series is already in our catalog
            if existing_entry and existing_entry.get("type") == "series":
                # Check for new seasons or episodes to add
                series_data = existing_entry
                seasons_dict = crawler.extract_series_content(post_url, detected_seasons)
                if not seasons_dict:
                    continue

                changes_made = False
                existing_seasons = series_data.setdefault("seasons", [])
                existing_s_nums = {s.get("seasonNumber") for s in existing_seasons}

                for s_num, s_new in seasons_dict.items():
                    if s_num not in existing_s_nums:
                        # Brand new season added!
                        imdb_id = series_data.get("imdb_id", "")
                        tmdb_id = series_data.get("tmdb_id", "")
                        new_s_obj = {
                            "seasonNumber": s_num,
                            "title": f"Season {s_num}",
                            "combined": bool(s_new.get("downloads") and not s_new.get("episodes")),
                            "streams": generate_tv_stream_servers(imdb_id, tmdb_id, s_num, 1),
                            "downloads": s_new.get("downloads", []),
                            "episodes": s_new.get("episodes", [])
                        }
                        existing_seasons.append(new_s_obj)
                        existing_s_nums.add(s_num)
                        changes_made = True
                        print(f"  ✨ [Series Update] Added NEW Season {s_num} to '{series_data['title']}'!")
                    else:
                        # Season exists; check if new downloads or episodes are present
                        curr_s = next(s for s in existing_seasons if s.get("seasonNumber") == s_num)
                        curr_dls = curr_s.setdefault("downloads", [])
                        for d in s_new.get("downloads", []):
                            if not any(cd.get("quality") == d.get("quality") for cd in curr_dls):
                                curr_dls.append(d)
                                changes_made = True

                if changes_made:
                    series_data["updatedAt"] = datetime.now(timezone.utc).isoformat()
                    # Reorder seasons
                    series_data["seasons"].sort(key=lambda x: x.get("seasonNumber", 1))
                    # Move series to the top of the homepage
                    existing_catalog.remove(series_data)
                    existing_catalog.insert(0, series_data)
                    updated_series_count += 1
                    print(f"  🔄 [Live Sync] Bumped '{series_data['title']}' to top of catalog with fresh content.")
                continue

            # Brand new series not in catalog
            meta = imdb.search(clean_title, prefer_series=True)
            if not meta:
                continue

            seasons_dict = crawler.extract_series_content(post_url, detected_seasons)
            if not seasons_dict:
                # Provide at least empty season 1
                seasons_dict = {1: {"seasonNumber": 1, "title": "Season 1", "downloads": [], "episodes": []}}

            series_obj = format_phantom_series(meta, seasons_dict)
            newly_added.append(series_obj)
            existing_by_title[clean_title.lower()] = series_obj
            if series_obj.get("imdb_id"):
                existing_by_imdb[series_obj["imdb_id"]] = series_obj

            print(f"  📺 [Live Ingest] Added Series: {series_obj['title']} ({series_obj['year']}) with {len(series_obj['seasons'])} season(s)")
            continue

        # ─── CASE B: Feature Movie ───
        if clean_title.lower() in existing_by_title:
            # Check if downloads were missing and can be enriched
            if not existing_entry.get("downloads"):
                dls = crawler.extract_downloads_from_post(post_url)
                if dls:
                    existing_entry["downloads"] = dls
                    print(f"  📦 [Movie Enriched] Added {len(dls)} download links to existing '{clean_title}'.")
            continue

        meta = imdb.search(clean_title, prefer_series=False)
        if not meta or not meta.get("imdb_id"):
            continue

        if meta["imdb_id"] in existing_by_imdb:
            continue

        dls = crawler.extract_downloads_from_post(post_url)
        if dls:
            meta["downloads"] = dls

        movie_obj = format_phantom_movie(meta)
        newly_added.append(movie_obj)
        existing_by_title[clean_title.lower()] = movie_obj
        existing_by_imdb[movie_obj["imdb_id"]] = movie_obj

        print(f"  🎬 [Live Ingest] Added Movie: {movie_obj['title']} ({movie_obj['year']})")

    # ─────────────────────────────────────────────────────────────
    # STEP 2: Top-Up from Curated Candidates if target not met
    # ─────────────────────────────────────────────────────────────
    if len(newly_added) < target_new_count:
        print("\n🔍 Checking curated blockbuster library for additional top-ups...")
        for title in CURATED_CANDIDATES:
            if len(newly_added) >= target_new_count:
                break
            if title.lower() in existing_by_title:
                continue

            meta = imdb.search(title, prefer_series=False)
            if not meta or not meta.get("imdb_id") or meta["imdb_id"] in existing_by_imdb:
                continue

            movie_obj = format_phantom_movie(meta)
            newly_added.append(movie_obj)
            existing_by_title[title.lower()] = movie_obj
            existing_by_imdb[movie_obj["imdb_id"]] = movie_obj
            print(f"  ✨ [Top-Up] Added: {movie_obj['title']} ({movie_obj['year']})")
            time.sleep(0.1)

    # ─────────────────────────────────────────────────────────────
    # STEP 3: Save Updated Catalog
    # ─────────────────────────────────────────────────────────────
    if newly_added or updated_series_count > 0:
        content_data["movies"] = newly_added + existing_catalog
        if "settings" not in content_data:
            content_data["settings"] = {}
        content_data["settings"]["totalMovies"] = len(content_data["movies"])
        content_data["settings"]["lastUpdated"] = datetime.now(timezone.utc).isoformat()

        if save_content(content_data):
            print(f"\n✅ Successfully updated content.json! Total catalog count: {len(content_data['movies'])}")
        else:
            print("\n❌ Failed to save updated content.json.")
    else:
        print("\nℹ️ Catalog is 100% up to date with live feeds. No new items needed.")

    return {
        "success": True,
        "newly_added_count": len(newly_added),
        "updated_series_count": updated_series_count,
        "total_catalog": len(content_data.get("movies", [])),
        "added_titles": [m["title"] for m in newly_added]
    }

def main():
    parser = argparse.ArgumentParser(description="Phantom Movies Automated Sync")
    parser.add_argument("--count", type=int, default=5, help="Number of new items to add (default: 5)")
    parser.add_argument("--tmdb-key", type=str, default=None, help="Optional TMDb API key")
    args = parser.parse_args()

    res = run_auto_sync(target_new_count=args.count, tmdb_key=args.tmdb_key)
    print("\nSummary:")
    print(f"  - New titles added: {res['newly_added_count']}")
    print(f"  - Series updated: {res['updated_series_count']}")
    print(f"  - Total catalog: {res['total_catalog']}")

if __name__ == "__main__":
    main()
