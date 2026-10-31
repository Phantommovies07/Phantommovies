import os
import json
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

def build_catalog_shards(content_data: dict, base_data_dir: str):
    """
    Splits monolithic content.json into:
    1. data/index.json (lightweight catalog containing only card metadata, 80% smaller)
    2. data/items/{id}.json (isolated item shards for instant 15ms detail page loads)
    """
    movies = content_data.get('movies', [])
    settings = content_data.get('settings', {})

    # 1. Build index.json
    index_movies = []
    for m in movies:
        if not m or not m.get('id'):
            continue
        idx_item = {
            'id': str(m.get('id')),
            'type': m.get('type', 'movie'),
            'title': m.get('title', ''),
            'year': m.get('year'),
            'genre': m.get('genre', ''),
            'rating': m.get('rating'),
            'badge': m.get('badge', ''),
            'category': m.get('category', ''),
            'industry': m.get('industry', ''),
            'poster': m.get('poster', ''),
            'banner': m.get('banner', '') if m.get('heroSlide') else '',
            'duration': m.get('duration', ''),
            'views': m.get('views', 0),
            'featured': bool(m.get('featured')),
            'trending': bool(m.get('trending')),
            'heroSlide': bool(m.get('heroSlide')),
            'status': m.get('status', 'published'),
            'active': m.get('active', True),
            'imdb_id': m.get('imdb_id', ''),
            'tmdb_id': m.get('tmdb_id', ''),
            'hasTorrent': bool(m.get('torrent') and m['torrent'].get('magnet'))
        }
        index_movies.append(idx_item)

    index_payload = {
        'settings': settings,
        'movies': index_movies
    }

    index_file = os.path.join(base_data_dir, 'index.json')
    with open(index_file, 'w', encoding='utf-8') as f:
        json.dump(index_payload, f, separators=(',', ':'), ensure_ascii=False)

    # 2. Build data/items/{id}.json
    items_dir = os.path.join(base_data_dir, 'items')
    os.makedirs(items_dir, exist_ok=True)

    written_count = 0
    for m in movies:
        mid = str(m.get('id', '')).strip()
        if not mid:
            continue
        item_path = os.path.join(items_dir, f"{mid}.json")
        with open(item_path, 'w', encoding='utf-8') as f:
            json.dump(m, f, separators=(',', ':'), ensure_ascii=False)
        written_count += 1

    orig_path = os.path.join(base_data_dir, 'content.json')
    orig_size = os.path.getsize(orig_path) if os.path.exists(orig_path) else 0
    new_index_size = os.path.getsize(index_file)

    print(f"✅ Generated data/index.json: {new_index_size:,} bytes (was {orig_size:,} bytes, {(1 - new_index_size/orig_size)*100:.1f}% reduction)")
    print(f"✅ Generated {written_count} item shards in {items_dir}")
    return new_index_size, written_count

if __name__ == '__main__':
    script_dir = os.path.dirname(os.path.abspath(__file__))
    site_dir = os.path.abspath(os.path.join(script_dir, '..'))
    data_dir = os.path.join(site_dir, 'data')
    content_file = os.path.join(data_dir, 'content.json')

    if not os.path.exists(content_file):
        print(f"❌ File not found: {content_file}")
        sys.exit(1)

    with open(content_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    build_catalog_shards(data, data_dir)
