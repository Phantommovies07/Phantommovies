/**
 * Phantom Movies - Automated Filename Sanitizer
 * Strips competitor brand watermarks, site domains, and promotional tags
 * from downloaded filenames and media URLs.
 */
(function(window) {
    'use strict';

    const BRAND_REGEX = /[-_.\s]*(\[[^\]]*(?:KatDrama|KatmovieHD|KatMovie|VegaMovies|KMMOVIES|HDHub4u|MoviesMod|BollyFlix|Bolly4u|Rogmovies|Dotmovies|HubCloud|9xmovies|Filmyzilla|ExtraMovies|AllMoviesHub|Cinevood|Worldfree4u|Movies4u|Khatrimaza|Desiremovies)[^\]]*\]|\([^\)]*(?:KatDrama|KatmovieHD|KatMovie|VegaMovies|KMMOVIES|HDHub4u|MoviesMod|BollyFlix|Bolly4u|Rogmovies|Dotmovies|HubCloud|9xmovies|Filmyzilla|ExtraMovies|AllMoviesHub|Cinevood|Worldfree4u|Movies4u|Khatrimaza|Desiremovies)[^\)]*\)|(?:KatDrama|KatmovieHD|KatMovie|VegaMovies(?:\.to|\.is)?|KMMOVIES(?:\.COM)?|HDHub4u(?:\.Tv|\.ms|\.one)?|MoviesMod(?:\.org)?|BollyFlix(?:\.org)?|Bolly4u(?:\.org)?|Rogmovies(?:\.autos)?|Dotmovies(?:\.today)?|HubCloud|9xmovies|Filmyzilla|ExtraMovies|AllMoviesHub|Cinevood|Worldfree4u|Movies4u|Khatrimaza|Desiremovies))(?=[-_\.\s]|\.mkv|\.mp4|\.avi|$)/gi;

    const DOMAIN_REGEX = /(?:www\.)?[a-zA-Z0-9\-]+\.(?:com|org|net|in|to|is|lol|so|club|top|autos|tv|ms|pics|beer|cam|pw|xyz)/gi;
    const TELEGRAM_REGEX = /@\w+/g;
    const EXT_REGEX = /\.(mkv|mp4|avi|webm|m4v|ts)$/i;

    function buildStandardFilename(meta = {}) {
        const title = (meta.title || 'Movie').replace(/[^a-zA-Z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
        const parts = [title];

        if (meta.s !== undefined && meta.ep !== undefined && meta.s !== '' && meta.ep !== '') {
            const sNum = String(meta.s).padStart(2, '0');
            const epNum = String(meta.ep).padStart(2, '0');
            parts.push(`S${sNum}E${epNum}`);
        } else if (meta.s !== undefined && meta.s !== '') {
            const sNum = String(meta.s).padStart(2, '0');
            parts.push(`S${sNum}`);
        } else if (meta.year) {
            parts.push(String(meta.year));
        }

        if (meta.quality) {
            const q = String(meta.quality).toLowerCase();
            if (q.includes('2160') || q.includes('4k')) parts.push('2160p');
            else if (q.includes('1080')) parts.push('1080p');
            else if (q.includes('720')) parts.push('720p');
            else if (q.includes('480')) parts.push('480p');
        }

        if (meta.codec) {
            const c = String(meta.codec).replace(/[^a-zA-Z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
            if (c) parts.push(c);
        }

        const ext = (meta.ext || 'mkv').replace(/^\./, '');
        return `${parts.filter(Boolean).join('.')}.${ext}`;
    }

    function cleanFilename(rawName, meta = {}) {
        if (!rawName || typeof rawName !== 'string') {
            return buildStandardFilename(meta);
        }

        const extMatch = rawName.match(EXT_REGEX);
        const ext = extMatch ? extMatch[0] : '.mkv';
        let base = extMatch ? rawName.slice(0, -ext.length) : rawName;

        // Strip competitor brands
        base = base.replace(BRAND_REGEX, '');

        // Strip generic domains
        base = base.replace(DOMAIN_REGEX, '');

        // Strip telegram handles
        base = base.replace(TELEGRAM_REGEX, '');

        // Clean punctuation artifacts (. - _ spaces)
        base = base.replace(/[-_.\s]+$/g, '');
        base = base.replace(/^[-_.\s]+/g, '');
        base = base.replace(/[-_.\s]{2,}/g, '.');
        base = base.replace(/\-\.|\.\-/g, '.').trim();

        if (base.length < 3) {
            return buildStandardFilename(meta);
        }

        return `${base}${ext}`;
    }

    function cleanUrl(url, meta = {}) {
        if (!url || typeof url !== 'string') return url;

        try {
            const u = new URL(url, window.location.href);

            if (u.searchParams.has('filename')) {
                const rawFn = u.searchParams.get('filename');
                const sanitized = cleanFilename(rawFn, meta);
                u.searchParams.set('filename', sanitized);
                return u.toString();
            }

            // Check pathname
            const pathname = u.pathname;
            const segments = pathname.split('/');
            const lastSegment = segments[segments.length - 1] || '';
            if (EXT_REGEX.test(lastSegment)) {
                const sanitized = cleanFilename(lastSegment, meta);
                if (sanitized !== lastSegment) {
                    u.searchParams.set('filename', sanitized);
                    return u.toString();
                }
            }
        } catch (_) {}

        return url;
    }

    function triggerDirectDownload(url, filename) {
        if (!url) return;
        const cleanFn = filename || cleanFilename('', {});
        const finalUrl = cleanUrl(url, { filename: cleanFn });

        const a = document.createElement('a');
        a.href = finalUrl;
        a.download = cleanFn;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => a.remove(), 1000);
    }

    window.PhantomSanitizer = {
        cleanFilename: cleanFilename,
        cleanUrl: cleanUrl,
        buildStandardFilename: buildStandardFilename,
        triggerDirectDownload: triggerDirectDownload
    };

})(typeof window !== 'undefined' ? window : this);
