
// ─── REAL-TIME VIEWS ENGINE (SUBTLE & UN-HIGHLIGHTED) ───
function formatViewNumber(num) {
    const n = parseInt(num) || 0;
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toLocaleString();
}

function getMovieViewsData(movieId, baseViews) {
    const rawBase = parseInt(baseViews) || 4500;
    const storeKey = 'phantom_view_counts';
    let localStore = {};
    try {
        localStore = JSON.parse(localStorage.getItem(storeKey) || '{}');
    } catch (_) {}

    const hash = String(movieId).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const refTime = 1730000000000;
    const hoursElapsed = Math.max(0, (Date.now() - refTime) / (1000 * 60 * 60));
    const hourlyRate = 1 + (hash % 4);
    const dynamicTotal = rawBase + Math.floor(hoursElapsed * hourlyRate) + (localStore[String(movieId)] || 0);
    const baseWatchers = Math.max(25, Math.min(480, Math.floor(dynamicTotal / 95) + (hash % 45)));

    return {
        totalViews: dynamicTotal,
        formattedViews: formatViewNumber(dynamicTotal),
        activeWatchers: baseWatchers
    };
}

let liveWatcherTimer = null;
function initLiveWatcherTicker(movieId, baseViews) {
    if (liveWatcherTimer) clearInterval(liveWatcherTimer);
    let { totalViews, activeWatchers } = getMovieViewsData(movieId, baseViews);

    const sessionKey = 'phantom_viewed_' + movieId;
    if (!sessionStorage.getItem(sessionKey)) {
        sessionStorage.setItem(sessionKey, '1');
        try {
            const storeKey = 'phantom_view_counts';
            const localStore = JSON.parse(localStorage.getItem(storeKey) || '{}');
            localStore[String(movieId)] = (localStore[String(movieId)] || 0) + 1;
            localStorage.setItem(storeKey, JSON.stringify(localStore));
            totalViews += 1;
        } catch (_) {}
    }

    const updateUI = (watchers, views) => {
        const watchEl = document.getElementById('liveWatchersCount');
        const viewEl = document.getElementById('liveViewsCount');
        if (watchEl) watchEl.textContent = watchers.toLocaleString();
        if (viewEl) viewEl.textContent = formatViewNumber(views);
    };

    updateUI(activeWatchers, totalViews);

    liveWatcherTimer = setInterval(() => {
        const change = (Math.random() > 0.48 ? 1 : -1) * Math.floor(Math.random() * 3);
        activeWatchers = Math.max(15, activeWatchers + change);
        const watchEl = document.getElementById('liveWatchersCount');
        if (watchEl) watchEl.textContent = activeWatchers.toLocaleString();
    }, 14000);
}

// ═══════════════════════════════════════════════════
// PHANTOM MOVIES - MOVIE DETAIL PAGE
// ═══════════════════════════════════════════════════

// ─── PHANTOM ANTI-HIJACK & UBLOCK POPUNDER DEFENSE ENGINE ───
window.addEventListener('beforeunload', (e) => {
    if (document.activeElement && (document.activeElement.tagName === 'IFRAME' || document.activeElement.closest('.player-box'))) {
        e.preventDefault();
        return (e.returnValue = '');
    }
});

// Defuse rogue window.open calls with uBlock Origin-style mock defuser
const _originalWindowOpen = window.open;
window.open = function(url, target, features) {
    if (document.activeElement && (document.activeElement.tagName === 'IFRAME' || document.activeElement.closest('.player-box'))) {
        console.warn('[Phantom Ad-Shield] Defused unauthorized popup attempt from player embed:', url);
        // Return dummy mock so anti-adblock check in player thinks popup succeeded!
        return {
            closed: false,
            focus: function() {},
            blur: function() {},
            close: function() {},
            location: { href: url || '' },
            document: {}
        };
    }
    return _originalWindowOpen.call(window, url, target, features);
};

// Focus recovery against click-hijacking popunders
window.addEventListener('blur', () => {
    if (document.activeElement && document.activeElement.tagName === 'IFRAME') {
        setTimeout(() => {
            window.focus();
        }, 120);
    }
});

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
let liveMirrorsConfig = null;

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
        // Complete Sandbox Elimination: Removing sandbox completely resolves 'Please disable the sandbox' across all providers
        // while the page-level Anti-Hijack Guard protects the parent window from rogue ad redirects.
        return `<iframe class="stream-frame" src="${escapeHTML(streamLink)}" title="${escapeHTML(movie.title)}" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media; accelerometer; gyroscope" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
    }

    if (trailerEmbed) {
        return `<iframe class="stream-frame" src="${escapeHTML(trailerEmbed)}" title="${escapeHTML(movie.title)} trailer" allowfullscreen loading="lazy"></iframe>`;
    }

    return `<div class="stream-placeholder">
        <div>▶</div>
        <p>Streaming link is not available yet.</p>
    </div>`;
}

// Streamlined, verified stream server providers (high availability & fast CDN playback)
const SERVER_LABELS = [
    "Server 1 (VIP Ultra HD)",
    "Server 2 (High Speed HD)",
    "Server 3 (Backup Server)"
];

let DEFAULT_STREAM_PROVIDERS = [
    { id: "vidlink", name: "Server 1 (VIP Ultra HD)", template: "https://vidlink.pro/movie/{imdb}?primaryColor=0284c7&autoplay=false", requiresImdb: true },
    { id: "cinesrc", name: "Server 2 (High Speed HD)", template: "https://cinesrc.st/embed/movie/{id}", requiresTmdb: false },
    { id: "autoembed", name: "Server 3 (Backup Server)", template: "https://autoembed.co/movie/imdb/{imdb}", requiresImdb: true }
];

async function loadLiveMirrors() {
    if (window.PHANTOM_MIRRORS_CACHE) {
        liveMirrorsConfig = window.PHANTOM_MIRRORS_CACHE;
        applyLiveMirrors(liveMirrorsConfig);
        return;
    }
    try {
        const cached = sessionStorage.getItem('phantom_mirrors_cache_v3');
        const cacheTime = sessionStorage.getItem('phantom_mirrors_time_v3');
        if (cached && cacheTime && (Date.now() - Number(cacheTime) < 5 * 60 * 1000)) {
            liveMirrorsConfig = JSON.parse(cached);
            window.PHANTOM_MIRRORS_CACHE = liveMirrorsConfig;
            applyLiveMirrors(liveMirrorsConfig);
            return;
        }
    } catch (_) {}

    try {
        const resp = await fetch('data/mirrors.json?v=' + Date.now());
        if (resp.ok) {
            const data = await resp.json();
            liveMirrorsConfig = data;
            window.PHANTOM_MIRRORS_CACHE = data;
            sessionStorage.setItem('phantom_mirrors_cache_v3', JSON.stringify(data));
            sessionStorage.setItem('phantom_mirrors_time_v3', String(Date.now()));
            applyLiveMirrors(data);
        }
    } catch (err) {
        console.warn('[Mirrors] Using default stream providers:', err);
    }
}

function applyLiveMirrors(data) {
    if (!data) return;
    const provs = data.streaming?.providers || [];
    provs.forEach(p => {
        const found = DEFAULT_STREAM_PROVIDERS.find(dp => dp.id === p.id || dp.name.includes(p.name));
        if (found && p.domains && p.domains.length) {
            const activeDomain = p.domains[0].replace(/\/+$/, '');
            const tmpl = p.movieTemplate || found.template.replace(/^https?:\/\/[^\/]+/, '');
            found.template = activeDomain + (tmpl.startsWith('/') ? tmpl : '/' + tmpl);
        }
    });
}

function isAllowedStreamUrl(url) {
    if (!url) return false;
    // Check against standard verified domains and any live dynamic domains loaded from mirrors.json
    return /cinesrc\.st|autoembed\.co|autoembed\.cc|vidlink\.pro|vidlink\.online|2embed\.cc|allmovieland|1xcinema|\.(mp4|webm|m3u8)(\?|#|$)/i.test(url);
}

function cleanServerLabel(name, index, url) {
    const combined = ((name || '') + ' ' + (url || '')).toLowerCase();
    if (combined.includes('vidlink') || (/server\s*1/i.test(name) && !combined.includes('cinesrc') && !combined.includes('autoembed')) || index === 0) {
        return "Server 1 (VIP Ultra HD)";
    }
    if (combined.includes('cinesrc') || (/server\s*2/i.test(name) && !combined.includes('vidlink') && !combined.includes('autoembed')) || index === 1) {
        return "Server 2 (High Speed HD)";
    }
    if (combined.includes('autoembed') || combined.includes('2embed') || /server\s*3/i.test(name) || index === 2) {
        return "Server 3 (Backup Server)";
    }
    return SERVER_LABELS[index] || `Server ${index + 1}`;
}

function normalizeStreams(movie) {
    const rawStreams = Array.isArray(movie.streams) && movie.streams.length
        ? movie.streams.filter(item => item && item.url && isAllowedStreamUrl(item.url))
        : (movie.streamLink && isAllowedStreamUrl(movie.streamLink) ? [{ name: 'Server 1 (AllMovieLand - HDVB P2P)', url: movie.streamLink }] : []);

    const imdb = movie.imdb_id || '';
    const tmdb = movie.tmdb_id || '';

    const streamMap = new Map();

    // 1. First add any pre-existing custom streams that match our approved domains
    rawStreams.forEach((item) => {
        let u = item.url.trim();
        const label = cleanServerLabel(item.name || item.label, undefined, u);
        streamMap.set(label, { name: label, url: u });
    });

    // 2. Generate standard providers for any missing verified slots
    DEFAULT_STREAM_PROVIDERS.forEach((p) => {
        if (p.requiresTmdb && !tmdb) return;
        if (p.requiresImdb && !imdb) return;
        const id = tmdb || imdb;
        const u = p.template
            .replace('{id}', encodeURIComponent(id))
            .replace('{imdb}', encodeURIComponent(imdb || tmdb))
            .replace('{tmdb}', encodeURIComponent(tmdb || imdb));
        if (!streamMap.has(p.name)) {
            streamMap.set(p.name, { name: p.name, url: u });
        }
    });

    // 3. Return cleanly ordered list according to canonical SERVER_LABELS
    const result = [];
    SERVER_LABELS.forEach((label) => {
        if (streamMap.has(label)) {
            result.push(streamMap.get(label));
        }
    });

    return result.length ? result : Array.from(streamMap.values());
}


let currentStreamIndex = 0;
let failoverWatchdogTimer = null;
let testedFailedUrls = new Set();

function getStreamStatusText(stream) {
    if (!stream) return 'Server 1 (Auto-Failover On)';
    if (/server\s*1/i.test(stream.name)) {
        return `🛡️ Active: ${escapeHTML(stream.name)} — Ultra Clean Stream (Zero Pre-roll Ads)`;
    }
    if (/server\s*2/i.test(stream.name)) {
        return `🚀 Active: ${escapeHTML(stream.name)} — High-Speed Multi-Audio CDN Active`;
    }
    if (/server\s*3/i.test(stream.name)) {
        return `🌐 Active: ${escapeHTML(stream.name)} — Global VIP Stream Active`;
    }
    return `🚀 Active: ${escapeHTML(stream.name)} — High-Speed Stream`;
}

function renderFailoverBar() {
    if (!currentStreams || currentStreams.length <= 1) return '';
    const activeStream = currentStreams[currentStreamIndex] || currentStreams[0];
    return `
        <div class="stream-failover-bar" id="streamFailoverBar">
            <div class="failover-status">
                <span class="failover-dot online" id="failoverDot"></span>
                <span id="failoverText">${getStreamStatusText(activeStream)}</span>
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
    // User can manually switch using the "Switch Server ↻" button.
    // Removed the blind 4.5-second interrupt timer so streams play smoothly and uninterrupted.
}

function autoFailoverNext(reason = 'auto') {
    if (!currentStreams || currentStreams.length <= 1) return;
    if (failoverWatchdogTimer) clearTimeout(failoverWatchdogTimer);

    currentStreamIndex = (currentStreamIndex + 1) % currentStreams.length;
    const nextStream = currentStreams[currentStreamIndex];

    const isTimeout = reason === 'buffer_timeout';
    const reasonText = isTimeout ? 'Server 1 buffering. Auto-switched to' : (reason === 'manual' ? 'Switched to' : 'Auto-switched to');
    updateFailoverStatus(`⚠️ ${reasonText} ${nextStream.name} (Live)...`, true);

    switchStream(currentStreamIndex, true);

    setTimeout(() => {
        updateFailoverStatus(getStreamStatusText(nextStream), false);
    }, 1200);
}

function renderStreamButtons() {
    if (!currentStreams || currentStreams.length <= 1) return '';
    return `
        <div class="source-server-card">
            <div class="source-server-header">
                <span class="source-server-title">SELECT SOURCE SERVER</span>
                <span class="source-server-count">${currentStreams.length} VERIFIED SERVERS</span>
            </div>
            <div class="stream-server-row">
                ${currentStreams.map((stream, index) => {
                    const isP2P = /p2p|hdvb|mesh/i.test(stream.name);
                    const isNoAds = /no ads/i.test(stream.name);
                    const activeClass = index === currentStreamIndex ? 'active' : '';
                    const extraClasses = [
                        isP2P ? 'p2p' : '',
                        isNoAds ? 'no-ads' : ''
                    ].filter(Boolean).join(' ');

                    let icon = '▶';
                    if (isP2P) icon = '⚡';
                    else if (isNoAds) icon = '🛡️';
                    else icon = '🚀';

                    return `<button type="button" class="stream-server-btn ${activeClass} ${extraClasses}" onclick="switchStream(${index})" title="${isP2P ? 'Peer-to-Peer Accelerated (Buffer-free)' : escapeHTML(stream.name)}">
                        <span>${icon}</span>
                        <span>${escapeHTML(stream.name)}</span>
                    </button>`;
                }).join('')}
            </div>
        </div>
    `;
}



let isPlaybackStarted = false;

function getWatchProgress(id) {
    try {
        const store = JSON.parse(localStorage.getItem('phantom_watch_progress') || '{}');
        return store[String(id)] || null;
    } catch (_) { return null; }
}

function setWatchProgress(id, progress, meta = {}) {
    try {
        const store = JSON.parse(localStorage.getItem('phantom_watch_progress') || '{}');
        const existing = store[String(id)] || {};
        store[String(id)] = {
            ...existing,
            progress: Math.min(100, Math.max(5, Math.round(progress))),
            updatedAt: Date.now(),
            ...meta
        };
        localStorage.setItem('phantom_watch_progress', JSON.stringify(store));
    } catch (_) {}
}

function renderMovieCurtain(movie, activeStream) {
    const backdrop = movie.banner || movie.poster || '';
    const serverLabel = activeStream ? activeStream.name : 'Server 1 (VIP Ultra HD)';
    return `
        <div class="player-curtain" id="playerCurtain" onclick="startMoviePlayback()">
            <div class="curtain-backdrop" style="background-image: url('${escapeHTML(backdrop)}');"></div>
            <div class="curtain-overlay"></div>
            <div class="curtain-content">
                <div class="curtain-play-btn"><span class="play-ico">▶</span></div>
                <div class="curtain-title">${escapeHTML(movie.title)}</div>
                <div class="curtain-meta">
                    <span>${escapeHTML(movie.year || '2025')}</span>
                    <span>•</span>
                    <span>${escapeHTML(movie.duration || 'Full Movie')}</span>
                    <span>•</span>
                    <span>⭐ ${escapeHTML(movie.rating || '8.5')}</span>
                </div>
                <div class="curtain-badge">▶ CLICK TO PLAY • ${escapeHTML(serverLabel)}</div>
            </div>
        </div>
    `;
}

function startMoviePlayback() {
    if (!currentMovie) return;
    isPlaybackStarted = true;
    const player = document.getElementById('playerBox');
    const activeStream = currentStreams[currentStreamIndex] || currentStreams[0];
    if (player && activeStream) {
        player.innerHTML = playerMarkup(currentMovie, activeStream.url);
        startFailoverWatchdog(activeStream.url, activeStream.name);
        updateFailoverStatus(getStreamStatusText(activeStream), false);
    }
    setWatchProgress(currentMovie.id, 25, { title: currentMovie.title, type: 'movie' });
    trackMovieProgress(currentMovie);
}

// Progress increment interval while watching
setInterval(() => {
    if (isPlaybackStarted && currentMovie) {
        const cur = getWatchProgress(currentMovie.id);
        const nextProg = Math.min(95, (cur?.progress || 25) + 5);
        setWatchProgress(currentMovie.id, nextProg, { title: currentMovie.title, type: 'movie' });
    }
}, 20000);

window.openTrailerModal = function(trailerUrl, title = 'Trailer') {
    let embedUrl = getYouTubeEmbed(trailerUrl);
    if (!embedUrl) {
        embedUrl = `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(title + ' official trailer')}`;
    }
    const modal = document.getElementById('trailerModal');
    const wrap = document.getElementById('trailerVideoWrap');
    const caption = document.getElementById('trailerCaption');
    if (!modal || !wrap) return;

    if (caption) caption.textContent = `${title} — Official Trailer`;
    wrap.innerHTML = `<iframe src="${embedUrl}&autoplay=1" allow="autoplay; fullscreen; encrypted-media" allowfullscreen title="${escapeHTML(title)} trailer"></iframe>`;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
};

window.closeTrailerModal = function() {
    const modal = document.getElementById('trailerModal');
    const wrap = document.getElementById('trailerVideoWrap');
    if (wrap) wrap.innerHTML = '';
    if (modal) {
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
    }
    document.body.style.overflow = '';
};

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        window.closeTrailerModal();
    }
});


function switchStream(index, isFailover = false) {
    if (!currentMovie || !currentStreams || !currentStreams[index]) return;

    currentStreamIndex = index;
    const stream = currentStreams[index];

    // Immediately start playing the selected stream
    isPlaybackStarted = true;

    const player = document.getElementById('playerBox');
    if (player) {
        player.innerHTML = playerMarkup(currentMovie, stream.url);
    }
    startFailoverWatchdog(stream.url, stream.name);
    setWatchProgress(currentMovie.id, 35, { title: currentMovie.title, type: 'movie' });

    document.querySelectorAll('.stream-server-btn').forEach((btn, i) => {
        btn.classList.toggle('active', i === index);
    });

    updateFailoverStatus(getStreamStatusText(stream), false);

    if (typeof gtag !== 'undefined') {
        gtag('event', 'stream_server_switch', {
            movie_title: currentMovie.title,
            movie_id: currentMovie.id,
            server: stream.name
        });
    }
}


function generateFallbackDownloads(movie) {
    const qTitle = encodeURIComponent(movie?.title || '');
    const mId = encodeURIComponent(movie?.id || '');
    return [
        { quality: '480p SD', size: '450 MB', server: 'Fast Cloud Mirror', url: `download.html?id=${mId}&quality=480p&size=450+MB&title=${qTitle}`, color: '#ffd70f' },
        { quality: '720p HD', size: '1.2 GB', server: 'High Speed Cloud', url: `download.html?id=${mId}&quality=720p&size=1.2+GB&title=${qTitle}`, color: '#06b6d4' },
        { quality: '1080p Full HD', size: '2.6 GB', server: 'VIP Direct Cloud', url: `download.html?id=${mId}&quality=1080p&size=2.6+GB&title=${qTitle}`, color: '#10b981' },
        { quality: '4K Ultra HD', size: '6.4 GB', server: 'Ultra HD Master Cloud', url: `download.html?id=${mId}&quality=4K&size=6.4+GB&title=${qTitle}`, color: '#ec4899' }
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

function isValidDownloadUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const clean = url.trim();
    if (!clean || clean === '#' || clean.startsWith('javascript:')) return false;
    if (clean.includes('download.html')) return false;
    if (clean.includes('kmmovies.') || clean.includes('vegamovies.')) return false;
    if (clean.includes('magiclinks.lol/download/')) return false;
    if (isStreamingUrl(clean)) return false;
    return true;
}

function sanitizeDownloadUrl(url, movie, quality, size) {
    if (!url || !isValidDownloadUrl(url)) return '';
    return url;
}

function normalizeDownloads(movie) {
    if (!movie) return [];
    let pool = [];
    if (Array.isArray(movie.downloads) && movie.downloads.length) {
        pool = movie.downloads;
    } else if (Array.isArray(movie.seasons) && movie.seasons.length) {
        for (const s of movie.seasons) {
            if (Array.isArray(s.downloads) && s.downloads.length) {
                pool = s.downloads;
                break;
            }
        }
    }

    const seen = new Set();
    const valid = [];
    for (const item of pool) {
        if (!item || !item.url || !isValidDownloadUrl(item.url)) continue;
        const qKey = (item.quality || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (seen.has(qKey)) continue;
        seen.add(qKey);
        valid.push({ ...item, url: item.url });
    }
    return valid;
}

function renderDownloads(movie) {
    const downloads = normalizeDownloads(movie);

    if (!downloads.length && !movie.torrent) {
        return `<div class="download-empty" style="text-align:center; padding: 18px 12px; color: #94a3b8; font-size: 13px; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px dashed rgba(255,255,255,0.12); line-height: 1.5;">⚡ Direct cloud download links are currently refreshing for this title.<br><span style="color: #2dce89; font-weight:600;">Please use the HD streaming servers above to watch online instantly without waiting.</span></div>`;
    }

    let cards = downloads.map((item, index) => {
        const quality = item.quality || item.label || `Option ${index + 1}`;
        const server = item.server || 'Fast Cloud';
        const size = item.size || '';
        const color = item.color || '#5bc4f5';
        const rawUrl = (item.url && !item.url.includes('download.html')) ? item.url : '';
        const dlLink = `download.html?id=${encodeURIComponent(movie.id)}&title=${encodeURIComponent(movie.title || '')}&poster=${encodeURIComponent(movie.poster || movie.banner || '')}&quality=${encodeURIComponent(quality)}&size=${encodeURIComponent(size)}&url=${encodeURIComponent(rawUrl)}`;
        return `<a class="download-card" href="${dlLink}" target="_blank" rel="noopener noreferrer" data-quality="${escapeHTML(quality)}" style="--download-color:${escapeHTML(color)}">
            <div>
                <strong>${escapeHTML(quality)}</strong>
                <span>${escapeHTML([server, size].filter(Boolean).join(' • '))}</span>
            </div>
            <em>Download ⬇</em>
        </a>`;
    });

    if (movie.torrent && movie.torrent.magnet) {
        const t = movie.torrent;
        const seedersText = t.seeders ? `${t.seeders} Seeders Active` : 'High Speed P2P';
        const magnetDlLink = `download.html?id=${encodeURIComponent(movie.id)}&title=${encodeURIComponent(movie.title || '')}&poster=${encodeURIComponent(movie.poster || movie.banner || '')}&quality=4K/1080p&size=${encodeURIComponent(t.size || '')}`;
        cards.push(`
            <a class="download-card" href="${magnetDlLink}" target="_blank" rel="noopener noreferrer" data-quality="Torrent/Magnet" style="--download-color:#8b5cf6; border-color:rgba(139,92,246,0.4); background:linear-gradient(135deg, rgba(139,92,246,0.15), rgba(99,102,241,0.08));">
                <div>
                    <strong>🧲 Direct Torrent & Magnet (4K / 1080p)</strong>
                    <span>${escapeHTML([t.size, seedersText, 'P2P Instant Client'].filter(Boolean).join(' • '))}</span>
                </div>
                <em>Magnet 🧲</em>
            </a>
        `);
    }

    return cards.join('');
}


// ─── MEDIA SPECIFICATIONS & CAST CHIPS ───
function extractCastList(item) {
    if (Array.isArray(item.cast) && item.cast.length) return item.cast;
    const desc = item.description || '';
    const match = desc.match(/starring\s+([^.\n]+)/i);
    if (match && match[1]) {
        return match[1].split(',').map(s => s.trim()).filter(Boolean);
    }
    return [];
}

function renderCastChips(movie) {
    const cast = extractCastList(movie);
    if (!cast.length) return '';
    return `
        <div class="cast-section">
            <div class="cast-header">
                <span class="cast-title">🎭 STARRING CAST</span>
                <span class="cast-hint">Click actor to discover filmography</span>
            </div>
            <div class="cast-chips-wrap">
                ${cast.map(actor => `
                    <a class="cast-chip" href="movies.html?search=${encodeURIComponent(actor)}">
                        <span class="cast-icon">👤</span>
                        <span class="cast-name">${escapeHTML(actor)}</span>
                    </a>
                `).join('')}
            </div>
        </div>
    `;
}

function renderMediaSpecs(movie) {
    const isDual = (movie.title && /dual|hindi/i.test(movie.title)) || (movie.industry === 'Bollywood' || movie.industry === 'South') || true;
    const is4K = (movie.badge && /4k/i.test(movie.badge)) || (movie.title && /4k|2160p/i.test(movie.title)) || (Array.isArray(movie.downloads) && movie.downloads.some(d => /4k/i.test(d.quality || '')));
    
    const audioSpec = isDual ? "Hindi (Clean Master DDP 5.1) + English DD 5.1" : "Original Dual Audio (Dolby Digital Plus 5.1)";
    const videoSpec = is4K ? "4K UHD 2160p HEVC 10-Bit (HDR10+ / Dolby Vision)" : "1080p Full HD HEVC x265 (High Dynamic Bitrate)";
    const sourceSpec = is4K ? "Official 4K UHD Master Remux" : "Official Studio WEB-DL Master";
    const subSpec = "English [Muxed & External SRT] • Multi-Language";

    return `
        <div class="tech-specs-card">
            <div class="specs-header">
                <span class="specs-title">⚡ MEDIA SPECIFICATIONS & AUDIO CHANNELS</span>
                <span class="specs-badge">10-BIT HEVC</span>
            </div>
            <div class="specs-grid">
                <div class="spec-item">
                    <span class="spec-icon">🔊</span>
                    <div class="spec-text">
                        <span class="spec-label">Audio Tracks</span>
                        <span class="spec-val">${escapeHTML(audioSpec)}</span>
                    </div>
                </div>
                <div class="spec-item">
                    <span class="spec-icon">🎞️</span>
                    <div class="spec-text">
                        <span class="spec-label">Video Codec</span>
                        <span class="spec-val">${escapeHTML(videoSpec)}</span>
                    </div>
                </div>
                <div class="spec-item">
                    <span class="spec-icon">📀</span>
                    <div class="spec-text">
                        <span class="spec-label">Master Source</span>
                        <span class="spec-val">${escapeHTML(sourceSpec)}</span>
                    </div>
                </div>
                <div class="spec-item">
                    <span class="spec-icon">💬</span>
                    <div class="spec-text">
                        <span class="spec-label">Subtitles</span>
                        <span class="spec-val">${escapeHTML(subSpec)}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}



function renderMovie(movie) {
    currentMovie = movie;
    currentStreams = normalizeStreams(movie);
    isPlaybackStarted = false;

    const vData = getMovieViewsData(movie.id, movie.views);
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
                    ${renderMovieCurtain(movie, currentStreams[0])}
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
                <p class="detail-meta">
                    <span>${escapeHTML(meta)}</span>
                    <span class="meta-sep">•</span>
                    <span class="subtle-live-viewers" title="Active viewers right now">
                        <span class="subtle-live-dot"></span>
                        <span id="liveWatchersCount">${vData.activeWatchers}</span> watching now
                    </span>
                    <span class="meta-sep">•</span>
                    <span class="subtle-views-count">
                        <span id="liveViewsCount">${vData.formattedViews}</span> views
                    </span>
                </p>
                <div style="display: flex; gap: 10px; flex-wrap: wrap; margin: 14px 0 16px;">
                    <button class="btn-watchlist-toggle" id="btnWatchlistToggle" onclick="toggleWatchlist()">
                        <span id="watchlistIcon">🤍</span> <span id="watchlistText">Add to Watchlist</span>
                    </button>
                    ${movie.trailerLink ? `<button class="btn-watchlist-toggle" onclick="openTrailerModal('${escapeHTML(movie.trailerLink)}', '${escapeHTML(movie.title)}')">
                        <span>🎬</span> <span>Watch Trailer</span>
                    </button>` : ''}
                </div>
                <p class="detail-desc">${escapeHTML(movie.description || 'No description available.')}</p>
                ${renderCastChips(movie)}

                ${renderMediaSpecs(movie)}

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
            if (typeof gtag !== 'undefined') {
                gtag('event', 'download_option_click', {
                    movie_title: movie.title,
                    movie_id: movie.id,
                    quality: link.dataset.quality || ''
                });
            }
        });
    });

    // Watchdog deferred until user clicks Play on the curtain (no autoplay)

    trackMovieProgress(movie);
    updateWatchlistButtonState();

    if (typeof gtag !== 'undefined') {
        gtag('event', 'movie_detail_view', {
            movie_title: movie.title,
            movie_id: movie.id,
            genre: movie.genre || ''
        });
    }
}

// ─── USER PROGRESS & WATCHLIST ───
function trackMovieProgress(movie) {
    try {
        let list = JSON.parse(localStorage.getItem('phantom_continue_watching') || '[]');
        list = list.filter(x => String(x.id) !== String(movie.id));
        list.unshift({
            id: movie.id,
            title: movie.title,
            poster: movie.poster || movie.banner || '',
            banner: movie.banner || movie.poster || '',
            type: 'movie',
            timestamp: Date.now()
        });
        localStorage.setItem('phantom_continue_watching', JSON.stringify(list.slice(0, 15)));
    } catch (_) {}
}

function toggleWatchlist() {
    if (!currentMovie) return;
    try {
        let list = JSON.parse(localStorage.getItem('phantom_watchlist') || '[]');
        const idx = list.findIndex(x => String(x.id) === String(currentMovie.id));
        const btn = document.getElementById('btnWatchlistToggle');
        const icon = document.getElementById('watchlistIcon');
        const text = document.getElementById('watchlistText');
        if (idx >= 0) {
            list.splice(idx, 1);
            if (btn) btn.classList.remove('active');
            if (icon) icon.textContent = '🤍';
            if (text) text.textContent = 'Add to Watchlist';
            showToast('Removed from Watchlist');
        } else {
            list.unshift({
                id: currentMovie.id,
                title: currentMovie.title,
                poster: currentMovie.poster || currentMovie.banner || '',
                rating: currentMovie.rating || '8.5',
                type: 'movie'
            });
            if (btn) btn.classList.add('active');
            if (icon) icon.textContent = '❤️';
            if (text) text.textContent = 'In Watchlist';
            showToast('Saved to Watchlist! ❤️');
        }
        localStorage.setItem('phantom_watchlist', JSON.stringify(list.slice(0, 30)));
    } catch (_) {}
}

function updateWatchlistButtonState() {
    if (!currentMovie) return;
    try {
        const list = JSON.parse(localStorage.getItem('phantom_watchlist') || '[]');
        const exists = list.some(x => String(x.id) === String(currentMovie.id));
        const btn = document.getElementById('btnWatchlistToggle');
        const icon = document.getElementById('watchlistIcon');
        const text = document.getElementById('watchlistText');
        if (btn) btn.classList.toggle('active', exists);
        if (icon) icon.textContent = exists ? '❤️' : '🤍';
        if (text) text.textContent = exists ? 'In Watchlist' : 'Add to Watchlist';
    } catch (_) {}
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
        const cached = sessionStorage.getItem('phantom_content_cache_v4');
        const cacheTime = sessionStorage.getItem('phantom_content_time_v4');
        if (cached && cacheTime && (Date.now() - Number(cacheTime) < 5 * 60 * 1000)) {
            const parsed = JSON.parse(cached);
            window.PHANTOM_CONTENT_CACHE = parsed;
            return parsed;
        }
    } catch (_) {}

    const response = await fetch('data/content.json?v=' + Date.now());
    if (!response.ok) throw new Error('Failed to load content.json');
    const data = await response.json();
    window.PHANTOM_CONTENT_CACHE = data;
    try {
        sessionStorage.setItem('phantom_content_cache_v4', JSON.stringify(data));
        sessionStorage.setItem('phantom_content_time_v4', String(Date.now()));
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
        // Dynamic live mirrors hook: updates active domains in real time
        await loadLiveMirrors();

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
    return false;
}
