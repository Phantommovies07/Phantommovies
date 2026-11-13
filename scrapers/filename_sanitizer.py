"""
Filename Sanitizer Module
Automatically cleans and strips competitor brand watermarks, site domains,
and promotional tags from movie and series filenames and download URLs.

Supported competitor patterns:
- KatDrama, KatmovieHD, KatMovie
- KM Movies, KMMOVIES.COM
- VegaMovies, VegaMovies.to, VegaMovies.is
- HDHub4u, HDHub4u.Tv, HDHub4u.ms, HDHub4u.one
- MoviesMod, MoviesMod.org
- BollyFlix, BollyFlix.org
- Bolly4u, Bolly4u.org
- Rogmovies, Rogmovies.autos
- Dotmovies, Dotmovies.today
- HubCloud, 9xmovies, Filmyzilla, ExtraMovies, AllMoviesHub, Cinevood, Worldfree4u, Movies4u
"""

import re
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
from typing import Optional, Dict

BRAND_PATTERNS = [
    # Bracketed / Parenthesized tags
    r'\[[^\]]*(?:KatDrama|KatmovieHD|KatMovie|VegaMovies|KMMOVIES|HDHub4u|MoviesMod|BollyFlix|Bolly4u|Rogmovies|Dotmovies|HubCloud|9xmovies|Filmyzilla|ExtraMovies|AllMoviesHub|Cinevood|Worldfree4u|Movies4u|Khatrimaza|Desiremovies)[^\]]*\]',
    r'\([^\)]*(?:KatDrama|KatmovieHD|KatMovie|VegaMovies|KMMOVIES|HDHub4u|MoviesMod|BollyFlix|Bolly4u|Rogmovies|Dotmovies|HubCloud|9xmovies|Filmyzilla|ExtraMovies|AllMoviesHub|Cinevood|Worldfree4u|Movies4u|Khatrimaza|Desiremovies)[^\)]*\)',
    # Hyphenated, dot, or bare brand names
    r'[-_.\s]+(?:KatDrama|KatmovieHD|KatMovie|VegaMovies(?:\.to|\.is)?|KMMOVIES(?:\.COM)?|HDHub4u(?:\.Tv|\.ms|\.one)?|MoviesMod(?:\.org)?|BollyFlix(?:\.org)?|Bolly4u(?:\.org)?|Rogmovies(?:\.autos)?|Dotmovies(?:\.today)?|HubCloud|9xmovies|Filmyzilla|ExtraMovies|AllMoviesHub|Cinevood|Worldfree4u|Movies4u|Khatrimaza|Desiremovies)(?=[-_\.\s]|\.mkv|\.mp4|\.avi|$)',
    # Bare mentions
    r'(?:KatDrama|KatmovieHD|KatMovie|VegaMovies(?:\.to|\.is)?|KMMOVIES(?:\.COM)?|HDHub4u(?:\.Tv|\.ms|\.one)?|MoviesMod(?:\.org)?|BollyFlix(?:\.org)?|Bolly4u(?:\.org)?|Rogmovies(?:\.autos)?|Dotmovies(?:\.today)?|HubCloud|9xmovies|Filmyzilla|ExtraMovies|AllMoviesHub|Cinevood|Worldfree4u|Movies4u|Khatrimaza|Desiremovies)'
]

COMBINED_BRAND_REGEX = re.compile('|'.join(BRAND_PATTERNS), re.IGNORECASE)

MEDIA_EXT_REGEX = re.compile(r'\.(mkv|mp4|avi|webm|m4v|ts)$', re.IGNORECASE)

def build_standard_filename(
    title: str,
    year: Optional[int] = None,
    quality: Optional[str] = None,
    codec: Optional[str] = None,
    season: Optional[int] = None,
    episode: Optional[int] = None,
    ext: str = 'mkv'
) -> str:
    """Generates a clean standard scene-style filename."""
    clean_title = re.sub(r'[^a-zA-Z0-9]+', '.', title.strip()).strip('.')
    parts = [clean_title]

    if season is not None and episode is not None:
        parts.append(f'S{season:02d}E{episode:02d}')
    elif season is not None:
        parts.append(f'S{season:02d}')
    elif year:
        parts.append(str(year))

    if quality:
        # Standardize quality token
        q_lower = quality.lower()
        if '2160' in q_lower or '4k' in q_lower:
            parts.append('2160p')
        elif '1080' in q_lower:
            parts.append('1080p')
        elif '720' in q_lower:
            parts.append('720p')
        elif '480' in q_lower:
            parts.append('480p')

    if codec:
        c_clean = re.sub(r'[^a-zA-Z0-9]+', '.', codec.strip()).strip('.')
        if c_clean:
            parts.append(c_clean)

    clean_ext = ext.lstrip('.')
    return f"{'.'.join([p for p in parts if p])}.{clean_ext}"


def sanitize_filename(
    raw_name: str,
    fallback_title: Optional[str] = None,
    year: Optional[int] = None,
    quality: Optional[str] = None,
    codec: Optional[str] = None,
    season: Optional[int] = None,
    episode: Optional[int] = None
) -> str:
    """
    Cleans a media filename by removing all competitor brands, website URLs,
    and residual separators.
    """
    if not raw_name or not isinstance(raw_name, str):
        if fallback_title:
            return build_standard_filename(fallback_title, year, quality, codec, season, episode)
        return "Movie.mkv"

    # Extract extension
    ext_match = MEDIA_EXT_REGEX.search(raw_name)
    ext = ext_match.group(0) if ext_match else '.mkv'
    base = raw_name[:-len(ext)] if ext_match else raw_name

    # Remove competitor brands
    cleaned = COMBINED_BRAND_REGEX.sub('', base)

    # Strip general website domains (e.g. www.something.com, site.net)
    cleaned = re.sub(r'(?:www\.)?[a-zA-Z0-9\-]+\.(?:com|org|net|in|to|is|lol|so|club|top|autos|tv|ms|pics|beer|cam|pw|xyz)', '', cleaned, flags=re.IGNORECASE)

    # Strip telegram tags like @mychannel
    cleaned = re.sub(r'@\w+', '', cleaned)

    # Cleanup trailing/consecutive separators (. - _)
    cleaned = re.sub(r'[-_.\s]+$', '', cleaned)
    cleaned = re.sub(r'^[-_.\s]+', '', cleaned)
    cleaned = re.sub(r'[-_.\s]{2,}', '.', cleaned)
    cleaned = cleaned.replace('-.', '.').replace('.-', '.').strip('.-_ ')

    # If the cleaned base became too short or empty, construct standard name
    if len(cleaned) < 3 and fallback_title:
        return build_standard_filename(fallback_title, year, quality, codec, season, episode, ext=ext)

    return f"{cleaned}{ext}"


def sanitize_download_url(
    url: str,
    fallback_title: Optional[str] = None,
    year: Optional[int] = None,
    quality: Optional[str] = None,
    codec: Optional[str] = None,
    season: Optional[int] = None,
    episode: Optional[int] = None
) -> str:
    """
    Sanitizes any filename parameter or URL path in a download URL.
    Updates ?filename=CleanName.mkv so browsers save the file cleanly.
    """
    if not url or not isinstance(url, str):
        return url

    try:
        parsed = urlparse(url)
        qs = parse_qs(parsed.query)

        if 'filename' in qs and qs['filename']:
            raw_fn = qs['filename'][0]
            clean_fn = sanitize_filename(
                raw_fn,
                fallback_title=fallback_title,
                year=year,
                quality=quality,
                codec=codec,
                season=season,
                episode=episode
            )
            qs['filename'] = [clean_fn]
            new_query = urlencode(qs, doseq=True)
            return urlunparse(parsed._replace(query=new_query))

        # Check if filename is embedded at the end of the path
        path_parts = parsed.path.split('/')
        last_part = path_parts[-1] if path_parts else ''
        if MEDIA_EXT_REGEX.search(last_part):
            clean_fn = sanitize_filename(
                last_part,
                fallback_title=fallback_title,
                year=year,
                quality=quality,
                codec=codec,
                season=season,
                episode=episode
            )
            # If the path part had a brand name, add clean ?filename= parameter
            if clean_fn != last_part:
                qs['filename'] = [clean_fn]
                new_query = urlencode(qs, doseq=True)
                return urlunparse(parsed._replace(query=new_query))

    except Exception:
        pass

    return url
