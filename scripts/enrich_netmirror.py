#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════════
PHANTOM MOVIES - NETMIRROR VIP ENRICHMENT ENGINE
═══════════════════════════════════════════════════════════════════════════
Enriches content.json by resolving titles against NetMirror's massive OTT
database (Netflix, Amazon Prime, Disney+ Hotstar, SonyLIV, Zee5).

Features:
- Queries NetMirror hybrid search (https://net27.cc/api/catalog/search-hybrid)
- Matches titles and release years with fuzzy scoring
- Injects Server 1 (VIP Ultra HD) native player (1080p direct ad-free stream)
- Populates missing tmdb_id across movies and series
- Caches results in data/netmirror_cache.json for instant subsequent runs
- Atomic file writes with automatic backups
═══════════════════════════════════════════════════════════════════════════
"""

import os
import sys
import json
import time
import re
import argparse
import urllib.request
import urllib.parse
from typing import Dict, List, Optional, Tuple

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
CONTENT_FILE = os.path.join(REPO_ROOT, "data", "content.json")
CACHE_FILE = os.path.join(REPO_ROOT, "data", "netmirror_cache.json")

NETMIRROR_BASE = "https://net27.cc"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
}

SERVER_LABELS = [
    "Server 1 (VIP Ultra HD)",
    "Server 2 (HD)",
    "Server 3 (Fast)",
    "Server 4 (VIP)",
    "Server 5 (Ultra)",
    "Server 6 (Cloud)",
    "Server 7 (Backup)"
]


def load_cache() -> Dict[str, Dict]:
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_cache(cache: Dict[str, Dict]):
    try:
        temp_path = CACHE_FILE + ".tmp"
        with open(temp_path, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False, indent=2)
        os.replace(temp_path, CACHE_FILE)
    except Exception as e:
        print(f"[Warning] Failed to save cache: {e}")


def clean_query_title(title: str) -> str:
    """Cleans title of year, resolutions, and brackets for higher search precision."""
    t = re.sub(r'\s*[\(\[\{].*?[\)\]\}]', '', title)
    t = re.sub(r'\b(1080p|720p|480p|2160p|4k|hd|fhd|sd|web-dl|bluray|hindi|dual audio|season|complete)\b', '', t, flags=re.IGNORECASE)
    t = re.sub(r'[\s_]+', ' ', t).strip()
    return t


def query_netmirror_catalog(title: str, year: Optional[int] = None, timeout: int = 6) -> Optional[Dict]:
    """Queries NetMirror hybrid catalog search and scores results against title and year."""
    clean_t = clean_query_title(title)
    if not clean_t:
        return None

    # First attempt: full cleaned title
    # Second attempt: primary title before punctuation if different
    queries = [clean_t]
    base_split = re.split(r'[:\-–]', clean_t)[0].strip()
    if base_split and base_split != clean_t:
        queries.append(base_split)

    for q in queries:
        try:
            url = f"{NETMIRROR_BASE}/api/catalog/search-hybrid?q={urllib.parse.quote(q)}"
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = json.loads(resp.read().decode("utf-8", errors="ignore"))
                items = data.get("items", [])
                if not items:
                    continue

                best = None
                best_score = -1
                q_lower = q.lower()
                title_lower = title.lower()

                for it in items:
                    score = 0
                    it_title = it.get("title", "").strip().lower()
                    it_year = it.get("year")

                    # Title exact & containment matching
                    if it_title == q_lower or it_title == title_lower:
                        score += 60
                    elif q_lower in it_title or it_title in q_lower:
                        score += 35

                    # Year matching
                    if year and it_year:
                        try:
                            diff = abs(int(it_year) - int(year))
                            if diff == 0:
                                score += 35
                            elif diff == 1:
                                score += 20
                            elif diff > 3:
                                score -= 30
                        except Exception:
                            pass

                    # Preference for items with active stream ready
                    if it.get("subjectId"):
                        score += 15
                    if it.get("streamable"):
                        score += 10

                    if score > best_score:
                        best_score = score
                        best = it

                if best and best_score >= 35:
                    return best
        except Exception:
            continue

    return None


def renumber_streams(streams: List[Dict]) -> List[Dict]:
    """Ensures consistent, stealth server numbering across all stream links."""
    renamed = []
    for i, s in enumerate(streams):
        renamed.append({
            "name": SERVER_LABELS[i] if i < len(SERVER_LABELS) else f"Server {i + 1}",
            "url": s["url"]
        })
    return renamed


def enrich_item(item: Dict, cache: Dict[str, Dict], force: bool = False) -> Tuple[bool, str]:
    """Enriches a single movie or series item with NetMirror streaming links."""
    title = item.get("title", "").strip()
    year = item.get("year")
    if not title:
        return False, "No title"

    cache_key = f"{title.lower()}::{year or ''}"
    match_data = None

    if not force and cache_key in cache:
        match_data = cache[cache_key]
    else:
        match_data = query_netmirror_catalog(title, year)
        cache[cache_key] = match_data  # None or Dict
        time.sleep(0.15)  # Polite pacing

    if not match_data:
        return False, "Not found in catalog"

    sub_id = match_data.get("subjectId")
    dp = match_data.get("detailPath")
    tmdb_id = match_data.get("tmdbId")

    # Update TMDb ID if available and not present
    if tmdb_id and not item.get("tmdb_id"):
        item["tmdb_id"] = str(tmdb_id)

    # Determine best NetMirror player URL
    if sub_id and dp:
        enc_title = urllib.parse.quote(title)
        player_url = f"{NETMIRROR_BASE}/native/{sub_id}?dp={dp}&t={enc_title}"
        item["netmirror_id"] = str(sub_id)
        item["netmirror_dp"] = str(dp)
    elif tmdb_id:
        player_url = f"{NETMIRROR_BASE}/watch-tmdb/{tmdb_id}"
    else:
        return False, "Missing streaming identifiers"

    # Prepend or update Server 1 (VIP Ultra HD)
    existing_streams = item.get("streams", [])
    filtered_streams = [s for s in existing_streams if "net27.cc" not in s.get("url", "") and "netmirror" not in s.get("url", "")]

    new_streams = [{"name": "Server 1 (VIP Ultra HD)", "url": player_url}] + filtered_streams
    item["streams"] = renumber_streams(new_streams)
    item["streamLink"] = player_url

    return True, f"Enriched with {player_url[:55]}..."


def main():
    parser = argparse.ArgumentParser(description="Enrich content.json with NetMirror VIP Ultra HD streams")
    parser.add_argument("--limit", type=int, default=0, help="Limit number of items to process (0 = all)")
    parser.add_argument("--force", action="store_true", help="Force refresh bypassing cache")
    args = parser.parse_args()

    print("═════════════════════════════════════════════════════════════════")
    print("  PHANTOM MOVIES: NETMIRROR VIP ULTRA HD ENRICHMENT ENGINE")
    print(f"  Target: {CONTENT_FILE}")
    print("═════════════════════════════════════════════════════════════════")

    if not os.path.exists(CONTENT_FILE):
        print(f"[Error] Content file not found: {CONTENT_FILE}")
        sys.exit(1)

    with open(CONTENT_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    movies = data.get("movies", [])
    series = data.get("series", [])
    total_items = len(movies) + len(series)
    print(f"[Info] Loaded {len(movies)} movies and {len(series)} series ({total_items} total).")

    cache = load_cache()
    print(f"[Info] Loaded {len(cache)} cached titles from {CACHE_FILE}.")

    target_movies = movies[:args.limit] if args.limit > 0 else movies
    target_series = series[:args.limit] if args.limit > 0 else series

    enriched_count = 0
    skipped_count = 0
    missed_count = 0

    print(f"\n[Processing Movies ({len(target_movies)})]...")
    for idx, m in enumerate(target_movies, 1):
        # If already enriched and not forcing, keep count
        first_stream = (m.get("streams") or [{}])[0].get("url", "")
        if "net27.cc" in first_stream and not args.force:
            enriched_count += 1
            continue

        ok, msg = enrich_item(m, cache, force=args.force)
        if ok:
            enriched_count += 1
            print(f" [{idx}/{len(target_movies)}] ✅ {m.get('title')} ({m.get('year')}): {msg}")
        else:
            missed_count += 1
            if idx % 10 == 0:
                print(f" [{idx}/{len(target_movies)}] ℹ️ Progress ({enriched_count} matched so far)...")

        # Periodically save cache every 25 items
        if idx % 25 == 0:
            save_cache(cache)

    print(f"\n[Processing Series ({len(target_series)})]...")
    for idx, s in enumerate(target_series, 1):
        ok, msg = enrich_item(s, cache, force=args.force)
        if ok:
            enriched_count += 1
            print(f" [{idx}/{len(target_series)}] ✅ {s.get('title')}: {msg}")
        else:
            missed_count += 1

    save_cache(cache)

    # Atomic write to content.json with backup
    print("\n[Saving] Writing enriched content.json with atomic backup...")
    bak_file = CONTENT_FILE + ".bak"
    try:
        import shutil
        shutil.copy2(CONTENT_FILE, bak_file)
        print(f"[Backup] Created backup at {bak_file}")
    except Exception as e:
        print(f"[Warning] Could not create backup: {e}")

    temp_content = CONTENT_FILE + ".tmp"
    with open(temp_content, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(temp_content, CONTENT_FILE)

    print("═════════════════════════════════════════════════════════════════")
    print(f"  ENRICHMENT COMPLETE!")
    print(f"  Enriched Titles: {enriched_count}")
    print(f"  Unmatched:       {missed_count}")
    print(f"  Success Rate:    {enriched_count / max(1, (enriched_count + missed_count)) * 100:.1f}%")
    print("═════════════════════════════════════════════════════════════════")


if __name__ == "__main__":
    main()
