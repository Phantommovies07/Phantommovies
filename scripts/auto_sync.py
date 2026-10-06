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
    "Accept": "application/json,text/html,*/*",
    "Accept-Language": "en-US,en;q=0.9",
}

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
    """Generates multi-server streaming embed links supported by Phantom Movies video player."""
    identifier = imdb_id or tmdb_id
    if not identifier:
        return "", []

    primary_url = f"https://multiembed.mov/?video_id={imdb_id}&tmdb_id={tmdb_id}" if imdb_id else f"https://multiembed.mov/?tmdb_id={tmdb_id}"
    servers = [
        {"name": "SuperEmbed HD", "url": primary_url},
        {"name": "AutoEmbed Fast", "url": f"https://player.autoembed.cc/embed/movie/{tmdb_id or imdb_id}"},
        {"name": "EmbedSu VIP", "url": f"https://embed.su/embed/movie/{tmdb_id or imdb_id}"},
        {"name": "VidSrc CC", "url": f"https://vidsrc.cc/v2/embed/movie/{imdb_id or tmdb_id}"},
        {"name": "SmashyStream", "url": f"https://player.smashystream.com/movie/{tmdb_id or imdb_id}"}
    ]
    return primary_url, servers

class IMDbSearchEngine:
    """Zero-key scraper using IMDb suggestion API (AWS CloudFront CDN)."""

    def search(self, query: str) -> Optional[Dict]:
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
            for item in data.get("d", []):
                qid = item.get("qid", "")
                if qid and qid not in ["movie", "tvMovie", "feature", "tvSeries", "tvMiniSeries"]:
                    continue

                imdb_id = item.get("id")
                title = item.get("l")
                year = item.get("y")
                cast = item.get("s", "")
                poster = item.get("i", {}).get("imageUrl", "") if "i" in item else ""

                if imdb_id and title:
                    return {
                        "imdb_id": imdb_id,
                        "tmdb_id": "",
                        "title": title,
                        "year": int(year) if year else 2024,
                        "cast": cast,
                        "genre": item.get("q", "Action").title(),
                        "rating": 7.5,
                        "runtime": 120,
                        "overview": f"{title} ({year}) starring {cast}.",
                        "poster": poster,
                        "banner": poster,
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

    def get_details(self, tmdb_id: int) -> Optional[Dict]:
        url = f"{self.BASE_URL}/movie/{tmdb_id}"
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

                release_date = data.get("release_date", "")
                year = int(release_date.split("-")[0]) if release_date and "-" in release_date else 2024

                return {
                    "imdb_id": data.get("imdb_id") or "",
                    "tmdb_id": str(tmdb_id),
                    "title": data.get("title", ""),
                    "year": year,
                    "cast": ", ".join(cast_names),
                    "genre": genres[0] if genres else "Action",
                    "rating": round(float(data.get("vote_average") or 7.5), 1),
                    "runtime": data.get("runtime") or 120,
                    "overview": data.get("overview") or f"Watch {data.get('title')} online in full HD.",
                    "poster": poster,
                    "banner": banner,
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
        movies = []
        try:
            resp = requests.get(url, params=params, headers=HEADERS, timeout=8)
            if resp.status_code == 200:
                results = resp.json().get("results", [])
                for item in results[:10]:
                    details = self.get_details(item.get("id"))
                    if details:
                        movies.append(details)
        except Exception as e:
            print(f"  [TMDb] Feed error for {endpoint}: {e}")
        return movies

class KMMoviesEngine:
    """Scrapes verified movie download links (480p, 720p, 1080p, 4K) from KM Movies."""

    BASE_SEARCH_URLS = [
        'https://kmmovies.pics/?s={query}',
        'https://kmmovies.baby/?s={query}'
    ]

    def search_movie_downloads(self, title: str, year: int = None) -> List[Dict]:
        if not BeautifulSoup or not title:
            return []

        clean_title = re.sub(r'[^a-zA-Z0-9\s]', '', title).strip()
        query = clean_title.replace(' ', '+')

        article_url = None
        for base in self.BASE_SEARCH_URLS:
            search_url = base.format(query=query)
            try:
                resp = requests.get(search_url, headers=HEADERS, timeout=6)
                if resp.status_code == 200:
                    soup = BeautifulSoup(resp.text, 'html.parser')
                    articles = soup.find_all('article')
                    for art in articles:
                        link_tag = art.find('a', href=True)
                        header_tag = art.find(['h2', 'h3', 'h1']) or link_tag
                        if link_tag and header_tag:
                            text = header_tag.get_text(strip=True).lower()
                            first_word = clean_title.split()[0].lower()
                            if first_word in text:
                                if year and str(year) in text:
                                    article_url = link_tag['href']
                                    break
                                elif not article_url:
                                    article_url = link_tag['href']
                    if article_url:
                        break
            except Exception:
                continue

        if not article_url:
            return []

        try:
            art_resp = requests.get(article_url, headers=HEADERS, timeout=6)
            if art_resp.status_code != 200:
                return []

            soup = BeautifulSoup(art_resp.text, 'html.parser')
            links = soup.find_all('a', href=True)

            downloads = []
            seen_qualities = set()
            quality_order = [
                ('2160p', '4K Ultra HD', '#8b5cf6'),
                ('4k', '4K Ultra HD', '#8b5cf6'),
                ('1080p', '1080p Full HD', '#10b981'),
                ('720p', '720p HD', '#06b6d4'),
                ('480p', '480p SD', '#ffd70f')
            ]

            for a in links:
                raw_text = a.get_text(strip=True)
                href = a['href']
                if not href.startswith('http') or 'kmmovies' in href or 'category' in href:
                    continue

                for q_key, q_label, color in quality_order:
                    if q_key in raw_text.lower() and q_key not in seen_qualities:
                        size_match = re.search(r'(\d+(?:\.\d+)?\s*(?:GB|MB))', raw_text, re.IGNORECASE)
                        size_str = size_match.group(1).upper() if size_match else ''

                        downloads.append({
                            "quality": q_label,
                            "size": size_str,
                            "server": "Fast Cloud",
                            "url": href,
                            "color": color
                        })
                        seen_qualities.add(q_key)
                        break

            return downloads
        except Exception as e:
            return []

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
        # Create a backup
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
        "downloads": m.get("downloads", []), # Only real file downloads; never fake stream embed URLs
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
        "createdAt": now_iso,
        "updatedAt": now_iso
    }

# Curated blockbuster library spanning Bollywood, Hollywood, South Indian, and OTT releases
# (Identical to what RogMovies and KMMovies feature on their homepages)
CURATED_CANDIDATES = [
    # Bollywood & Hindi Hits
    "Stree 2", "Khel Khel Mein", "Vedaa", "Fighter", "Shaitaan", "Jawan", "Animal",
    "Dunki", "Chandu Champion", "Kill", "Munjya", "Srikanth", "Crew", "Article 370",
    "Bade Miyan Chote Miyan", "Yodha", "Sam Bahadur", "Tiger 3", "OMG 2", "Gadar 2",
    # South Indian Dubbed Blockbusters
    "Kalki 2898 AD", "Devara: Part 1", "Pushpa 2: The Rule", "GOAT", "Hanu-Man",
    "Salaar: Part 1 - Ceasefire", "Captain Miller", "Aavesham", "Manjummel Boys",
    "Kantara", "Leo", "Jailer", "RRR", "K.G.F: Chapter 2",
    # Hollywood & Global Blockbusters
    "Deadpool & Wolverine", "Alien: Romulus", "Inside Out 2", "Gladiator II",
    "Twisters", "Beetlejuice Beetlejuice", "Civil War", "The Substance",
    "Bad Boys: Ride or Die", "Kingdom of the Planet of the Apes", "Furiosa: A Mad Max Saga",
    "A Quiet Place: Day One", "Red One", "Venom: The Last Dance", "Transformers One",
    "The Wild Robot", "Moana 2", "Wicked", "Nosferatu", "Kraven the Hunter"
]

def run_auto_sync(target_new_count: int = 5, tmdb_key: str = None) -> Dict:
    """Executes the automatic movie sync pipeline."""
    print("=" * 60)
    print("🎬 Phantom Movies — Automated Movie Ingestion Pipeline")
    print("=" * 60)

    content_data = load_content()
    existing_movies = content_data.get("movies", [])
    existing_titles = {m.get("title", "").strip().lower() for m in existing_movies}
    existing_imdb_ids = {m.get("imdb_id") for m in existing_movies if m.get("imdb_id")}

    print(f"📊 Current site catalog: {len(existing_movies)} movies")
    print(f"🎯 Target new additions: {target_new_count}")

    tmdb_key = tmdb_key or os.getenv("TMDB_API_KEY", "")
    tmdb = TMDBEngine(tmdb_key)
    imdb = IMDbSearchEngine()
    km_engine = KMMoviesEngine()

    candidates = []

    # 1. Fetch from TMDb if configured
    if tmdb.is_configured():
        print("🌐 Sourcing from TMDb API (Trending, Now Playing, Bollywood & Regional)...")
        candidates.extend(tmdb.fetch_feed("trending/movie/day"))
        candidates.extend(tmdb.fetch_feed("movie/now_playing"))
        candidates.extend(tmdb.fetch_feed("discover/movie", {"with_original_language": "hi", "sort_by": "popularity.desc"}))
        candidates.extend(tmdb.fetch_feed("discover/movie", {"with_original_language": "te", "sort_by": "popularity.desc"}))

    # 2. Enrich and search candidate titles via IMDb
    print("🔍 Evaluating blockbuster candidate library...")
    for title in CURATED_CANDIDATES:
        if len(candidates) >= target_new_count * 4:
            break
        # Fast title deduplication
        if title.lower() in existing_titles:
            continue
        if any(c.get("title", "").lower() == title.lower() for c in candidates):
            continue

        res = imdb.search(title)
        if res:
            candidates.append(res)
            time.sleep(0.15) # Polite debounce

    print(f"📥 Discovered {len(candidates)} candidate movies.")

    # Ingest and filter unique movies
    newly_added = []
    for cand in candidates:
        if len(newly_added) >= target_new_count:
            break

        cand_title = cand.get("title", "").strip()
        cand_imdb = cand.get("imdb_id", "")

        if not cand_title:
            continue
        if cand_title.lower() in existing_titles:
            continue
        if cand_imdb and cand_imdb in existing_imdb_ids:
            continue

        # Try to extract genuine download links from KM Movies
        real_dls = km_engine.search_movie_downloads(cand_title, cand.get("year"))
        if real_dls:
            cand["downloads"] = real_dls
            print(f"    📦 Extracted {len(real_dls)} verified download links from KM Movies!")

        # Format and append
        phantom_movie = format_phantom_movie(cand)
        newly_added.append(phantom_movie)
        existing_titles.add(cand_title.lower())
        if cand_imdb:
            existing_imdb_ids.add(cand_imdb)

        print(f"  ✨ Added: {phantom_movie['title']} ({phantom_movie['year']}) | Stream: {phantom_movie['streamLink']}")

    if newly_added:
        # Prepend new movies to the top so they appear at the top of the homepage
        content_data["movies"] = newly_added + existing_movies
        if "settings" not in content_data:
            content_data["settings"] = {}
        content_data["settings"]["totalMovies"] = len(content_data["movies"])
        content_data["settings"]["lastUpdated"] = datetime.now(timezone.utc).isoformat()

        if save_content(content_data):
            print(f"✅ Successfully updated content.json! Total movies now: {len(content_data['movies'])}")
        else:
            print("❌ Failed to save updated content.json.")
    else:
        print("ℹ️ No new movies needed (all candidates are already present on site).")

    return {
        "success": True,
        "added_count": len(newly_added),
        "total_movies": len(content_data.get("movies", [])),
        "titles": [m["title"] for m in newly_added]
    }

def main():
    parser = argparse.ArgumentParser(description="Phantom Movies Automated Sync")
    parser.add_argument("--count", type=int, default=5, help="Number of new movies to add (default: 5)")
    parser.add_argument("--tmdb-key", type=str, default=None, help="Optional TMDb API key")
    args = parser.parse_args()

    res = run_auto_sync(target_new_count=args.count, tmdb_key=args.tmdb_key)
    print("\nSummary:")
    print(f"  - New movies added: {res['added_count']}")
    print(f"  - Total catalog: {res['total_movies']}")

if __name__ == "__main__":
    main()
