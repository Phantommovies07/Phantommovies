import json
import re
import time
import sys
import requests
from bs4 import BeautifulSoup

sys.stdout.reconfigure(encoding='utf-8')

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
}

QUALITY_ORDER = [
    ('4k', '4K Ultra HD', '#ec4899'),
    ('2160p', '4K Ultra HD', '#ec4899'),
    ('1080p', '1080p Full HD', '#10b981'),
    ('720p', '720p HD', '#06b6d4'),
    ('480p', '480p SD', '#ffd70f')
]

def clean_query(title):
    t = re.sub(r'\(\d{4}\)', '', title)
    t = re.sub(r'[:\-–—]', ' ', t)
    t = re.sub(r'\s+', ' ', t).strip()
    words = t.split()
    return ' '.join(words[:4])

def search_kmmovies(title):
    q = clean_query(title)
    if not q:
        return None
    url = f"https://kmmovies.baby/?s={requests.utils.quote(q)}"
    try:
        r = requests.get(url, headers=HEADERS, timeout=6)
        if r.status_code != 200:
            return None
        soup = BeautifulSoup(r.text, 'html.parser')
        articles = soup.find_all('article')
        if not articles:
            return None

        norm_q = re.sub(r'[^a-z0-9]', '', q.lower())
        for art in articles[:5]:
            a = art.find('a', href=True)
            if not a:
                continue
            post_title = a.get_text(strip=True).lower()
            norm_pt = re.sub(r'[^a-z0-9]', '', post_title)
            # Match first 6 characters or inclusion
            if norm_q[:6] in norm_pt or norm_pt[:6] in norm_q:
                return a['href']

        return articles[0].find('a', href=True)['href']
    except Exception:
        return None

def extract_downloads(post_url):
    try:
        r = requests.get(post_url, headers=HEADERS, timeout=6)
        if r.status_code != 200:
            return []
        soup = BeautifulSoup(r.text, 'html.parser')
        downloads = []
        seen = set()

        for a in soup.find_all('a', href=True):
            href = a['href']
            text = a.get_text(strip=True)

            if ('magiclinks.lol' in href and re.search(r'/\d+-?\d*/?', href)) or 'short.azonahub' in href or 'gofile.io' in href or 'hubcloud' in href:
                for q_key, q_label, color in QUALITY_ORDER:
                    if q_key in text.lower() and q_label not in seen:
                        size_match = re.search(r'(\d+(?:\.\d+)?\s*(?:GB|MB))', text, re.IGNORECASE)
                        size_str = size_match.group(1).upper() if size_match else ''
                        downloads.append({
                            'quality': q_label,
                            'size': size_str,
                            'server': 'Fast Cloud Mirror',
                            'url': href,
                            'color': color
                        })
                        seen.add(q_label)
                        break

        quality_rank = {'480p SD': 1, '720p HD': 2, '1080p Full HD': 3, '4K Ultra HD': 4}
        downloads.sort(key=lambda d: quality_rank.get(d['quality'], 9))
        return downloads
    except Exception:
        return []

def main():
    print("🚀 Starting comprehensive real download enrichment...")
    with open('data/content.json', 'r', encoding='utf-8') as f:
        data = json.load(f)

    movies = data.get('movies', [])
    enriched_count = 0

    for i, m in enumerate(movies):
        dls = m.get('downloads', [])
        # If movie has no real downloads or only has old fallback urls
        has_real = any(d.get('url', '') and not d.get('url', '').startswith('download.html') and not 'magiclinks.lol/download/' in d.get('url', '') for d in dls)

        if not has_real:
            title = m.get('title', '')
            post_url = search_kmmovies(title)
            if post_url:
                real_dls = extract_downloads(post_url)
                if real_dls:
                    m['downloads'] = real_dls
                    enriched_count += 1
                    print(f"[{i+1}/{len(movies)}] ✓ Enriched '{title}': {len(real_dls)} real download servers")
            time.sleep(0.3)
        else:
            # Clean out any old dummy items if mixed
            m['downloads'] = [d for d in dls if not d.get('url', '').startswith('download.html') and not 'magiclinks.lol/download/' in d.get('url', '')]

    # Clean series downloads as well
    for m in movies:
        if m.get('type') == 'series':
            for s in m.get('seasons', []):
                s['downloads'] = [d for d in s.get('downloads', []) if not d.get('url', '').startswith('download.html') and not 'magiclinks.lol/download/' in d.get('url', '')]
                for ep in s.get('episodes', []):
                    ep['downloads'] = [d for d in ep.get('downloads', []) if not d.get('url', '').startswith('download.html') and not 'magiclinks.lol/download/' in d.get('url', '')]

    with open('data/content.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"🎉 Finished enrichment! Successfully added real download links to {enriched_count} titles.")

if __name__ == '__main__':
    main()
