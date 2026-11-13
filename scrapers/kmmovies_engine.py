import requests
from bs4 import BeautifulSoup
import re
from typing import List, Dict, Optional, Tuple
try:
    from scrapers.filename_sanitizer import sanitize_download_url, sanitize_filename
except ImportError:
    from filename_sanitizer import sanitize_download_url, sanitize_filename

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5'
}

BASE_SEARCH_URLS = [
    'https://kmmovies.beer/?s={query}',
    'https://kmmovies.baby/?s={query}',
    'https://kmmovies.pics/?s={query}'
]

QUALITY_TIERS = [
    ('2160p', '4K Ultra HD', '#c084fc'),
    ('4k', '4K Ultra HD', '#c084fc'),
    ('1080p', '1080p Full HD', '#34d399'),
    ('720p', '720p HD', '#38bdf8'),
    ('480p', '480p SD', '#fbbf24')
]

class KMMoviesEngine:
    """
    Scrapes verified movie download links (480p, 720p, 1080p, 4K) from KM Movies
    and automatically resolves the ultimate direct CDN link (last link) alongside
    the multi-host mirrors hub link (first link).
    """

    def __init__(self):
        self.active_base = 'https://kmmovies.beer'

    def find_movie_page(self, title: str, year: int = None) -> Optional[str]:
        """Searches KM Movies for a title and returns the movie article page URL."""
        clean_title = re.sub(r'[^a-zA-Z0-9\s]', '', title).strip()
        query = clean_title.replace(' ', '+')

        for base in BASE_SEARCH_URLS:
            search_url = base.format(query=query)
            try:
                resp = requests.get(search_url, headers=HEADERS, timeout=7)
                if resp.status_code == 200:
                    soup = BeautifulSoup(resp.text, 'html.parser')
                    articles = soup.find_all('article') or soup.find_all('div', class_='post')
                    first_word = clean_title.split()[0].lower() if clean_title else ''

                    for art in articles:
                        link_tag = art.find('a', href=True)
                        header_tag = art.find(['h2', 'h3', 'h1']) or link_tag
                        if link_tag and header_tag:
                            text = header_tag.get_text(strip=True).lower()
                            if first_word and first_word in text:
                                if year and str(year) in text:
                                    return link_tag['href']
                                return link_tag['href']
            except Exception:
                continue
        return None

    def resolve_kmcloud_direct_link(self, kmcloud_url: str, title: Optional[str] = None, year: Optional[int] = None, quality: Optional[str] = None) -> Optional[str]:
        """
        Resolves the ultimate direct CDN download link from a KMCloud intermediate URL.
        Bypasses landing pages to fetch the final direct media URL (e.g. cdn-files.alcyone.so)
        and automatically sanitizes competitor brand watermarks from the filename parameter.
        """
        if not kmcloud_url or 'kmcloud' not in kmcloud_url:
            return None
        try:
            r = requests.get(kmcloud_url, headers=HEADERS, timeout=5)
            if r.status_code != 200:
                return None
            soup = BeautifulSoup(r.text, 'html.parser')

            resolve_url = None
            for a in soup.find_all('a', href=True):
                h = a['href']
                txt = a.get_text(strip=True).lower()
                if 'md2stream' in h or 'direct download' in txt or '/rootz' in h:
                    resolve_url = h
                    break

            if not resolve_url and '/s/' in kmcloud_url:
                code = kmcloud_url.split('/s/')[-1].split('/')[0]
                resolve_url = f'https://r1.md2stream.site/resolve?url=https%3A%2F%2Fone.kmcloud.lol%2Fd%2F{code}%2Frootz'

            if resolve_url:
                r2 = requests.get(resolve_url, headers=HEADERS, timeout=5, allow_redirects=False)
                if r2.status_code in (301, 302) and 'Location' in r2.headers:
                    raw_cdn_url = r2.headers['Location']
                    return sanitize_download_url(
                        raw_cdn_url,
                        fallback_title=title,
                        year=year,
                        quality=quality
                    )
        except Exception:
            pass
        return None

    def search_movie_downloads(self, title: str, year: int = None, resolve_direct: bool = True) -> Tuple[List[Dict], Optional[str]]:
        """
        Searches KM Movies for a title and returns:
          1. List of quality options with both 'direct_url' (last link) and 'multi_url' (first hub link).
          2. The native direct stream URL (for zero-ad streaming player).
        """
        article_url = self.find_movie_page(title, year)
        if not article_url:
            return [], None

        try:
            art_resp = requests.get(article_url, headers=HEADERS, timeout=8)
            if art_resp.status_code != 200:
                return [], None

            soup = BeautifulSoup(art_resp.text, 'html.parser')
            links = soup.find_all('a', href=True)

            quality_map: Dict[str, Dict] = {}

            for a in links:
                raw_text = a.get_text(strip=True)
                href = a['href'].strip()
                classes = a.get('class', [])

                if not href.startswith('http') or any(x in href.lower() for x in ['category', 'tag', 'author', 'contact', 'dmca', 'genre', 'request']):
                    continue

                for q_key, q_label, color in QUALITY_TIERS:
                    if q_key in raw_text.lower():
                        # Extract file size
                        size_match = re.search(r'(\d+(?:\.\d+)?\s*(?:GB|MB))', raw_text, re.IGNORECASE)
                        size_str = size_match.group(1).upper() if size_match else ''

                        # Detect codec info
                        codec_parts = []
                        if '10bit' in raw_text.lower(): codec_parts.append('10-Bit')
                        if '265' in raw_text.lower() or 'hevc' in raw_text.lower(): codec_parts.append('x265 HEVC')
                        elif '264' in raw_text.lower(): codec_parts.append('x264')
                        if 'av1' in raw_text.lower(): codec_parts.append('AV1')
                        if 'dual' in raw_text.lower() or 'hindi' in raw_text.lower(): codec_parts.append('Dual Audio')
                        codec_str = ' • '.join(codec_parts) if codec_parts else 'WebRip Clean'

                        if q_label not in quality_map:
                            quality_map[q_label] = {
                                "quality": q_label,
                                "size": size_str,
                                "codec": codec_str,
                                "server": "KM Cloud Fast",
                                "direct_url": "",
                                "multi_url": "",
                                "url": href,
                                "color": color
                            }

                        if size_str and not quality_map[q_label]["size"]:
                            quality_map[q_label]["size"] = size_str

                        # Classify: encoded (KMCloud direct) vs webdl (MagicLinks multi-hub)
                        if 'encoded' in classes or 'kmcloud' in href:
                            quality_map[q_label]["direct_url"] = href
                            quality_map[q_label]["url"] = href
                        elif 'webdl' in classes or 'magiclinks' in href or 'hubcloud' in href:
                            quality_map[q_label]["multi_url"] = href
                            if not quality_map[q_label]["url"]:
                                quality_map[q_label]["url"] = href
                        break

            # Resolve ultimate direct links
            native_stream = None
            results = []

            for q_label, data in quality_map.items():
                km_direct_landing = data["direct_url"]

                if resolve_direct and km_direct_landing:
                    final_cdn = self.resolve_kmcloud_direct_link(
                        km_direct_landing,
                        title=title,
                        year=year,
                        quality=q_label
                    )
                    if final_cdn:
                        data["direct_url"] = final_cdn
                        data["url"] = final_cdn
                        if not native_stream and ('720p' in q_label or '1080p' in q_label):
                            native_stream = final_cdn

                # Fallback pairings
                if not data["direct_url"] and data["multi_url"]:
                    data["direct_url"] = data["multi_url"]
                if not data["multi_url"] and km_direct_landing:
                    data["multi_url"] = km_direct_landing

                results.append(data)

            # Sort: 4K -> 1080p -> 720p -> 480p
            tier_ranks = {'4K Ultra HD': 4, '1080p Full HD': 3, '720p HD': 2, '480p SD': 1}
            results.sort(key=lambda x: tier_ranks.get(x['quality'], 0), reverse=True)

            if not native_stream and results:
                for r in results:
                    if r.get('direct_url') and r['direct_url'].startswith('http'):
                        native_stream = r['direct_url']
                        break

            return results, native_stream

        except Exception as e:
            print(f"[KMMoviesEngine] Error: {e}")
            return [], None

if __name__ == '__main__':
    engine = KMMoviesEngine()
    print("Testing KM Movies automated resolution on Jailer 2...")
    downloads, stream = engine.search_movie_downloads("Jailer 2", 2026, resolve_direct=True)
    print("Found download options:", len(downloads))
    for d in downloads:
        print(f"[{d['quality']}] ({d['size']}):")
        print(f"  ⚡ Direct Link: {d['direct_url'][:80]}")
        print(f"  🌐 Multi Link:  {d['multi_url'][:80]}")
    print("🎬 Native Zero-Ad Stream Server:", stream[:80] if stream else "None")
