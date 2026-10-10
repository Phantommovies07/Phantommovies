// ═══════════════════════════════════════════════════
// PHANTOM MOVIES - MOVIE DETAIL PAGE
// ═══════════════════════════════════════════════════

function getMovieIdFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
}

function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[char]));
}

function isDirectVideo(url) {
    return /\.(mp4|webm|ogg)(\?|#|$)/i.test(url || '');
}

function getYouTubeEmbed(url) {
    if (!url) return '';
    try {
        const u = new URL(url);
        // Exact hostname match (not substring) to defeat CodeQL
        // "incomplete-url-substring-sanitization" — a hostile host like
        // "evil.com/youtube.com" must NOT be accepted.
        const host = u.hostname.replace(/^www\./, '').toLowerCase();
        let id = '';
        if (host === 'youtu.be') {
            id = u.pathname.slice(1).split('/')[0] || '';
        } else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
            id = u.searchParams.get('v')
                || (u.pathname.startsWith('/embed/') ? (u.pathname.split('/')[2] || '') : '');
        }
        // Only allow a well-formed YouTube video id before embedding.
        if (id && !/^[A-Za-z0-9_-]{5,20}$/.test(id)) id = '';
        return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : '';
    } catch (_) {
        return '';
    }
}

let currentMovie = null;
let currentStreams = [];

function playerMarkup(movie, streamUrl) {
    const streamLink = streamUrl || movie.streamLink || '';
    const trailerEmbed = getYouTubeEmbed(movie.trailerLink || '');

    if (isDirectVideo(streamLink)) {
        return `<video class="stream-frame" controls playsinline poster="${escapeHTML(movie.banner || movie.poster || '')}">
            <source src="${escapeHTML(streamLink)}">
            Your browser does not support the video tag.
        </video>`;
    }

    if (streamLink) {
        return `<iframe class="stream-frame" src="${escapeHTML(streamLink)}" title="${escapeHTML(movie.title)}" allowfullscreen loading="lazy" sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"></iframe>`;
    }

    if (trailerEmbed) {
        return `<iframe class="stream-frame" src="${escapeHTML(trailerEmbed)}" title="${escapeHTML(movie.title)} trailer" allowfullscreen loading="lazy"></iframe>`;
    }

    return `<div class="stream-placeholder">
        <div>▶</div>
        <p>Streaming link is not available yet.</p>
    </div>`;
}

// Whitelisted, stealth stream server providers (hiding underlying host identities)
const SERVER_LABELS = ["Server 1 (HD)", "Server 2 (Fast)", "Server 3 (VIP)", "Server 4 (Ultra)", "Server 5 (Cloud)", "Server 6 (Backup)"];

function cleanServerLabel(name, index) {
    if (!name || /vidsrc|superembed|autoembed|embedsu|smashy|multiembed|azonahub/i.test(name)) {
        return SERVER_LABELS[index] || `Server ${index + 1}`;
    }
    return name;
}

const DEFAULT_STREAM_PROVIDERS = [
    { name: "Server 1 (HD)", template: "https://multiembed.mov/?video_id={imdb}&tmdb_id={tmdb}" },
    { name: "Server 2 (Fast)", template: "https://player.autoembed.cc/embed/movie/{tmdb}" },
    { name: "Server 3 (VIP)", template: "https://embed.su/embed/movie/{tmdb}" },
    { name: "Server 4 (Ultra)", template: "https://vidsrc.cc/v2/embed/movie/{imdb}" },
    { name: "Server 5 (Cloud)", template: "https://player.smashystream.com/movie/{tmdb}" }
];

function normalizeStreams(movie) {
    const customStreams = Array.isArray(movie.streams) && movie.streams.length
        ? movie.streams.filter(item => item && item.url).map((item, index) => ({
            name: cleanServerLabel(item.name || item.label, index),
            url: item.url
        }))
        : (movie.streamLink ? [{ name: 'Server 1 (HD)', url: movie.streamLink }] : []);

    // If the movie has a direct custom link, prioritize it
    const isDirectCustom = customStreams.length > 0 && !customStreams[0].url.includes('vidsrc.to');

    // Build dynamic servers if imdb_id or tmdb_id exists
    const imdb = movie.imdb_id || '';
    const tmdb = movie.tmdb_id || '';
    const dynamicStreams = [];

    if (imdb || tmdb) {
        DEFAULT_STREAM_PROVIDERS.forEach((p, idx) => {
            let u = p.template
                .replace('{imdb}', encodeURIComponent(imdb || tmdb))
                .replace('{tmdb}', encodeURIComponent(tmdb || imdb));
            if (!customStreams.some(s => s.url === u)) {
                dynamicStreams.push({ name: p.name, url: u });
            }
        });
    }

    const merged = isDirectCustom ? [...customStreams, ...dynamicStreams] : (dynamicStreams.length ? dynamicStreams : customStreams);
    // Final sanitization of all stream names to guarantee no third-party branding leaks
    return merged.map((s, i) => ({
        name: cleanServerLabel(s.name, i),
        url: s.url
    }));
}


let currentStreamIndex = 0;
let failoverWatchdogTimer = null;
let testedFailedUrls = new Set();

function renderFailoverBar() {
    if (!currentStreams || currentStreams.length <= 1) return '';
    const activeStream = currentStreams[currentStreamIndex] || currentStreams[0];
    return `
        <div class="stream-failover-bar" id="streamFailoverBar">
            <div class="failover-status">
                <span class="failover-dot online" id="failoverDot"></span>
                <span id="failoverText">⚡ Active: ${escapeHTML(activeStream ? activeStream.name : 'Server 1 (HD)')} (Auto-Failover On)</span>
            </div>
            <button type="button" class="failover-quick-btn" onclick="autoFailoverNext('manual')">Switch Server ↻</button>
        </div>
    `;
}

function updateFailoverStatus(message, isSwitching = false) {
    const textEl = document.getElementById('failoverText');
    const dotEl = document.getElementById('failoverDot');
    if (textEl) textEl.textContent = message;
    if (dotEl) {
        dotEl.className = isSwitching ? 'failover-dot switching' : 'failover-dot online';
    }
}

function startFailoverWatchdog(streamUrl, streamName) {
    if (failoverWatchdogTimer) clearTimeout(failoverWatchdogTimer);

    // 1. Pre-check: If we have multiple servers and domain is known to be dead, switch immediately
    if (currentStreams.length > 1 && !testedFailedUrls.has(streamUrl)) {
        try {
            const controller = new AbortController();
            const preTimer = setTimeout(() => controller.abort(), 2200);
            fetch(streamUrl, { mode: 'no-cors', cache: 'no-store', signal: controller.signal })
                .then(() => clearTimeout(preTimer))
                .catch(() => {
                    clearTimeout(preTimer);
                    // Network / DNS failure detected
                    testedFailedUrls.add(streamUrl);
                    console.warn(`[Auto-Failover] Domain ${streamName} failed health pre-check. Auto-switching...`);
                    autoFailoverNext('health_check');
                });
        } catch (_) {}
    }

    // 2. Timeout Watchdog: If embed is unresponsive or blank after 7s, auto-switch to next server
    failoverWatchdogTimer = setTimeout(() => {
        const iframe = document.querySelector('.stream-frame');
        if (iframe && iframe.tagName.toLowerCase() === 'iframe') {
            // Check if user is still on this screen and hasn't manually switched
            if (currentStreams.length > 1 && currentStreamIndex === 0) {
                console.log(`[Auto-Failover] Server 1 watchdog expired, switching to fast fallback...`);
                autoFailoverNext('timeout');
            }
        }
    }, 7000);
}

function autoFailoverNext(reason = 'auto') {
    if (!currentStreams || currentStreams.length <= 1) return;
    if (failoverWatchdogTimer) clearTimeout(failoverWatchdogTimer);

    const prevIndex = currentStreamIndex;
    currentStreamIndex = (currentStreamIndex + 1) % currentStreams.length;
    const nextStream = currentStreams[currentStreamIndex];

    const reasonText = reason === 'manual' ? 'Switched to' : 'Auto-switched to';
    updateFailoverStatus(`⚠️ ${reasonText} ${nextStream.name} (Live)...`, true);

    switchStream(currentStreamIndex, true);

    setTimeout(() => {
        updateFailoverStatus(`⚡ Connected: ${nextStream.name} (Auto-Failover Active)`, false);
    }, 1500);
}

function renderStreamButtons() {
    if (!currentStreams.length || currentStreams.length === 1) return '';
    return `<div class="stream-server-row">${currentStreams.map((stream, index) => `
        <button class="stream-server-btn ${index === currentStreamIndex ? 'active' : ''}" onclick="switchStream(${index})">${escapeHTML(stream.name)}</button>
    `).join('')}</div>`;
}

function switchStream(index, isFailover = false) {
    if (!isFailover) handleClickAd('stream');
    if (!currentMovie || !currentStreams[index]) return;

    currentStreamIndex = index;
    const stream = currentStreams[index];

    const player = document.getElementById('playerBox');
    if (player) {
        player.innerHTML = playerMarkup(currentMovie, stream.url);
    }

    document.querySelectorAll('.stream-server-btn').forEach((btn, i) => {
        btn.classList.toggle('active', i === index);
    });

    startFailoverWatchdog(stream.url, stream.name);

    if (typeof gtag !== 'undefined') {
        gtag('event', 'stream_server_switch', {
            movie_title: currentMovie.title,
            movie_id: currentMovie.id,
            server: stream.name
        });
    }
}


function generateFallbackDownloads(movie) {
    const id = movie.id || movie.imdb_id || 'phantom';
    return [
        { quality: '480p SD', size: '450 MB', server: 'Fast Cloud Mirror', url: `download.html?id=${encodeURIComponent(id)}&quality=480p&size=450MB`, color: '#ffd70f' },
        { quality: '720p HD', size: '1.2 GB', server: 'High Speed Cloud', url: `download.html?id=${encodeURIComponent(id)}&quality=720p&size=1.2GB`, color: '#06b6d4' },
        { quality: '1080p Full HD', size: '2.6 GB', server: 'VIP Fast Server', url: `download.html?id=${encodeURIComponent(id)}&quality=1080p&size=2.6GB`, color: '#10b981' },
        { quality: '4K Ultra HD', size: '6.4 GB', server: 'Ultra HD Cloud', url: `download.html?id=${encodeURIComponent(id)}&quality=4k&size=6.4GB`, color: '#ec4899' }
    ];
}

function isStreamingUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const lower = url.toLowerCase();
    return lower.includes('embed') || 
           lower.includes('stream') || 
           lower.includes('vidsrc') || 
           lower.includes('autoembed') || 
           lower.includes('multiembed') || 
           lower.includes('smashystream') || 
           lower.includes('player.') || 
           lower.includes('2embed');
}

function sanitizeDownloadUrl(url, movie, quality, size) {
    if (!url || isStreamingUrl(url)) return `download.html?id=${encodeURIComponent(movie.id)}&quality=${encodeURIComponent(quality)}`;
    // If it's the broken/fake pattern, route to working download portal
    if (url.includes('magiclinks.lol/download/')) {
        return `download.html?id=${encodeURIComponent(movie.id)}&quality=${encodeURIComponent(quality)}&size=${encodeURIComponent(size || '')}`;
    }
    return url;
}

function normalizeDownloads(movie) {
    if (!movie) return [];
    if (Array.isArray(movie.downloads) && movie.downloads.length) {
        const valid = movie.downloads
            .filter(item => item && item.url && !isStreamingUrl(item.url))
            .map(item => ({
                ...item,
                url: sanitizeDownloadUrl(item.url, movie, item.quality || 'HD', item.size || '')
            }));
        if (valid.length) return valid;
    }
    if (Array.isArray(movie.seasons) && movie.seasons.length) {
        for (const s of movie.seasons) {
            if (Array.isArray(s.downloads) && s.downloads.length) {
                const valid = s.downloads
                    .filter(item => item && item.url && !isStreamingUrl(item.url))
                    .map(item => ({
                        ...item,
                        url: sanitizeDownloadUrl(item.url, movie, item.quality || 'HD', item.size || '')
                    }));
                if (valid.length) return valid;
            }
        }
    }
    return generateFallbackDownloads(movie);
}

function renderDownloads(movie) {
    const downloads = normalizeDownloads(movie);

    if (!downloads.length) {
        return `<div class="download-empty">No download options added yet.</div>`;
    }

    return downloads.map((item, index) => {
        const quality = item.quality || item.label || `Option ${index + 1}`;
        const server = item.server || '';
        const size = item.size || '';
        const color = item.color || '#5bc4f5';
        return `<a class="download-card" href="${escapeHTML(item.url)}" target="_blank" rel="noopener noreferrer" data-quality="${escapeHTML(quality)}" style="--download-color:${escapeHTML(color)}">
            <div>
                <strong>${escapeHTML(quality)}</strong>
                <span>${escapeHTML([server, size].filter(Boolean).join(' • '))}</span>
            </div>
            <em>Download</em>
        </a>`;
    }).join('');
}

function renderMovie(movie) {
    currentMovie = movie;
    currentStreams = normalizeStreams(movie);

    const detail = document.getElementById('movieDetail');
    const banner = movie.banner || movie.poster || '';
    const meta = [movie.genre, movie.year, movie.duration, movie.rating ? `⭐ ${movie.rating}` : ''].filter(Boolean).join(' • ');

    document.title = `${movie.title} - Phantom Movies`;
    updateSEOMeta(movie.title, movie.description || '', movie.poster || movie.banner || '');

    detail.innerHTML = `
        <section class="watch-section">
            <div class="detail-hero-bg" style="background-image:url('${escapeHTML(banner)}')"></div>
            <div class="watch-wrap">
                <div class="player-box" id="playerBox">
                    ${playerMarkup(movie, currentStreams[0] ? currentStreams[0].url : '')}
                </div>
                ${renderFailoverBar()}
                ${renderStreamButtons()}
            </div>

        </section>

        <section class="movie-detail-content">
            <div class="detail-poster-card">
                ${movie.poster ? `<img src="${escapeHTML(movie.poster)}" alt="${escapeHTML(movie.title)} poster">` : '<div class="poster-fallback">🎬</div>'}
            </div>

            <div class="detail-info-card">
                ${movie.badge ? `<div class="feat-tag">${escapeHTML(movie.badge)}</div>` : ''}
                <h1>${escapeHTML(movie.title)}</h1>
                <p class="detail-meta">${escapeHTML(meta)}</p>
                <p class="detail-desc">${escapeHTML(movie.description || 'No description available.')}</p>

                <div class="download-section">
                    <div class="sec-title">DOWNLOAD <span>OPTIONS</span></div>
                    <div class="download-grid">
                        ${renderDownloads(movie)}
                    </div>
                </div>
            </div>
        </section>
    `;

    document.querySelectorAll('.download-card').forEach(link => {
        link.addEventListener('click', (event) => {
            if (handleClickAd('download', link.href)) event.preventDefault();
            if (typeof gtag !== 'undefined') {
                gtag('event', 'download_option_click', {
                    movie_title: movie.title,
                    movie_id: movie.id,
                    quality: link.dataset.quality || ''
                });
            }
        });
    });

    if (currentStreams[0]) {
        startFailoverWatchdog(currentStreams[0].url, currentStreams[0].name);
    }

    if (typeof gtag !== 'undefined') {
        gtag('event', 'movie_detail_view', {
            movie_title: movie.title,
            movie_id: movie.id,
            genre: movie.genre || ''
        });
    }
}


function showError(message) {
    document.getElementById('movieDetail').innerHTML = `
        <section class="detail-error">
            <div class="empty-state">${escapeHTML(message)}</div>
            <a class="btn-primary" href="index.html">← Back to Home</a>
        </section>
    `;
}

// ─── HIGH-SPEED CONTENT CACHE ───
async function getContentData() {
    if (window.PHANTOM_CONTENT_CACHE) return window.PHANTOM_CONTENT_CACHE;
    try {
        const cached = sessionStorage.getItem('phantom_content_cache');
        const cacheTime = sessionStorage.getItem('phantom_content_time');
        if (cached && cacheTime && (Date.now() - Number(cacheTime) < 10 * 60 * 1000)) {
            const parsed = JSON.parse(cached);
            window.PHANTOM_CONTENT_CACHE = parsed;
            return parsed;
        }
    } catch (_) {}

    const response = await fetch('data/content.json');
    if (!response.ok) throw new Error('Failed to load content.json');
    const data = await response.json();
    window.PHANTOM_CONTENT_CACHE = data;
    try {
        sessionStorage.setItem('phantom_content_cache', JSON.stringify(data));
        sessionStorage.setItem('phantom_content_time', String(Date.now()));
    } catch (_) {}
    return data;
}

async function loadMovieDetail() {
    const movieId = getMovieIdFromURL();
    if (!movieId) {
        showError('Movie ID missing.');
        return;
    }

    try {
        const data = await getContentData();
        const movies = (data.movies || []).filter(m => m.active !== false);
        const movie = movies.find(m => String(m.id) === String(movieId));

        if (!movie) {
            showError('Movie not found or inactive.');
            return;
        }

        renderMovie(movie);

        const ads = data.settings && data.settings.ads;
        if (ads) applyAds(ads, 'movie');
    } catch (error) {
        console.error(error);
        showError('Unable to load movie details.');
    }
}

loadMovieDetail();


// ─── ADS RENDERING ───
function applyAds(ads, page) {
    currentAds = ads;
    if (!ads || ads.enabled === false) return;

    if (page === 'movie') {
        insertAdBefore('#playerBox', 'ad-movie-player-top', ads.moviePlayerTop);
        insertAdBefore('.download-grid', 'ad-movie-downloads', ads.movieDownloads);
        insertAdAfter('.movie-detail-content', 'ad-movie-bottom', ads.movieBottom);
    }

    renderFloatingAd(ads.floatingBottom);
    renderPopupAd(ads.popup);
}

async function loadAndRenderAds(page) {
    try {
        const data = await getContentData();
        const ads = data.settings && data.settings.ads;
        if (ads) applyAds(ads, page);
    } catch (error) {
        console.warn('Ads failed to load:', error);
    }
}

function createAdSlot(id, code, extraClass = '') {
    if (!code || !String(code).trim()) return null;
    let slot = document.getElementById(id);
    if (!slot) {
        slot = document.createElement('div');
        slot.id = id;
        slot.className = 'ad-slot ' + extraClass;
    }
    slot.innerHTML = code;
    executeAdScripts(slot);
    return slot;
}

function insertAdBefore(selector, id, code) {
    const target = document.querySelector(selector);
    const slot = createAdSlot(id, code);
    if (target && slot && !slot.parentElement) target.insertAdjacentElement('beforebegin', slot);
}

function insertAdAfter(selector, id, code) {
    const target = document.querySelector(selector);
    const slot = createAdSlot(id, code);
    if (target && slot && !slot.parentElement) target.insertAdjacentElement('afterend', slot);
}

function executeAdScripts(container) {
    container.querySelectorAll('script').forEach(oldScript => {
        const newScript = document.createElement('script');
        Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
        newScript.textContent = oldScript.textContent;
        oldScript.replaceWith(newScript);
    });
}

function renderFloatingAd(code) {
    if (!code || document.getElementById('floatingAdSlot')) return;
    const wrap = createAdSlot('floatingAdSlot', code, 'floating-ad-slot');
    if (!wrap) return;
    const close = document.createElement('button');
    close.className = 'ad-close-btn';
    close.textContent = '×';
    close.onclick = () => wrap.remove();
    wrap.appendChild(close);
    document.body.appendChild(wrap);
}

function renderPopupAd(code) {
    if (!code || sessionStorage.getItem('popup_ad_shown')) return;
    sessionStorage.setItem('popup_ad_shown', '1');
    setTimeout(() => {
        const backdrop = document.createElement('div');
        backdrop.className = 'popup-ad-backdrop';
        backdrop.id = 'popupAdBackdrop';
        backdrop.innerHTML = `<div class="popup-ad-box"><button class="ad-close-btn" onclick="document.getElementById('popupAdBackdrop').remove()">×</button><div id="popupAdContent"></div></div>`;
        document.body.appendChild(backdrop);
        const content = document.getElementById('popupAdContent');
        content.innerHTML = code;
        executeAdScripts(content);
    }, 1800);
}


// ─── SEO META ───
function updateSEOMeta(title, description, image) {
    setMeta('description', description || `Watch ${title} on Phantom Movies`);
    setMeta('og:title', `${title} - Phantom Movies`, true);
    setMeta('og:description', description || `Watch ${title} on Phantom Movies`, true);
    if (image) setMeta('og:image', image, true);
    setMeta('twitter:card', 'summary_large_image');
}

function setMeta(name, content, property = false) {
    const attr = property ? 'property' : 'name';
    let tag = document.querySelector(`meta[${attr}="${name}"]`);
    if (!tag) {
        tag = document.createElement('meta');
        tag.setAttribute(attr, name);
        document.head.appendChild(tag);
    }
    tag.setAttribute('content', content);
}

// ─── CLICK / REDIRECT ADS ───
let currentAds = null;
function shouldShowClickAd(frequency) {
    if (frequency === 'every') return true;
    if (frequency === 'session') {
        if (sessionStorage.getItem('click_ad_shown')) return false;
        sessionStorage.setItem('click_ad_shown', '1');
        return true;
    }
    const key = 'click_ad_last_time';
    const last = Number(localStorage.getItem(key) || 0);
    const now = Date.now();
    if (now - last > 10 * 60 * 1000) {
        localStorage.setItem(key, String(now));
        return true;
    }
    return false;
}

function handleClickAd(type, targetUrl = '') {
    if (!currentAds || currentAds.enabled === false) return false;
    const clickAd = currentAds.clickAd;
    if (!clickAd || !clickAd.enabled || !clickAd.url) return false;
    if (type === 'download' && clickAd.applyDownloads === false) return false;
    if (type === 'stream' && !clickAd.applyStreams) return false;
    if (!shouldShowClickAd(clickAd.frequency || 'session')) return false;

    window.open(clickAd.url, '_blank', 'noopener,noreferrer');
    if (targetUrl) setTimeout(() => window.open(targetUrl, '_blank', 'noopener,noreferrer'), 650);
    return !!targetUrl;
}
