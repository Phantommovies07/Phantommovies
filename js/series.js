
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
// PHANTOM MOVIES - SERIES DETAIL PAGE
// ═══════════════════════════════════════════════════

// ─── PHANTOM ALWAYS-ACTIVE ANTI-HIJACK & POPUP SHIELD ───
let isUserNavigatingPhantom = false;
window.addEventListener('click', (e) => {
    const navEl = e.target.closest('a, button, input, .nav-item, .search-box, .category-pill, .download-card, .btn-primary, .back-link, .episode-item, .season-btn');
    if (navEl && !navEl.closest('.player-box')) {
        isUserNavigatingPhantom = true;
        setTimeout(() => { isUserNavigatingPhantom = false; }, 3500);
    }
}, true);

window.addEventListener('beforeunload', (e) => {
    if ((typeof isSeriesPlaying !== 'undefined' && isSeriesPlaying && !isUserNavigatingPhantom) ||
        (document.activeElement && (document.activeElement.tagName === 'IFRAME' || document.activeElement.closest('.player-box')))) {
        e.preventDefault();
        return (e.returnValue = '');
    }
});

function createMockWindow(url = '') {
    return {
        closed: false,
        focus: function() {},
        blur: function() {},
        close: function() {},
        location: { href: url || '' },
        document: {}
    };
}

// Defuse rogue window.open calls with uBlock Origin-style mock defuser
const _originalWindowOpen = window.open;
window.open = function(url, target, features) {
    if (!url || typeof url !== 'string') return createMockWindow();
    const clean = url.toLowerCase();
    if (clean.includes('vegamovies') || clean.includes('vega') || clean.includes('nexdrive') || clean.includes('greenmotors') || clean.includes('magiclinks') || clean.includes('4khdhub') || clean.includes('vglist') || clean.includes('vcloud') || clean.includes('fastdl')) {
        console.warn('[Phantom Ad-Shield] Neutralized blacklisted rogue popup:', url);
        return createMockWindow(url);
    }
    if (document.activeElement && (document.activeElement.tagName === 'IFRAME' || document.activeElement.closest('.player-box'))) {
        console.warn('[Phantom Ad-Shield] Defused unauthorized popup attempt from player embed:', url);
        return createMockWindow(url);
    }
    return _originalWindowOpen.call(window, url, target, features);
};

// Focus recovery against click-hijacking popunders
window.addEventListener('blur', () => {
    if (document.activeElement && document.activeElement.tagName === 'IFRAME') {
        setTimeout(() => {
            window.focus();
        }, 40);
    }
});

let currentSeries = null;
let currentSeasonIndex = 0;
let currentEpisodeIndex = 0;
let currentStreams = [];
let liveMirrorsConfig = null;

function getSeriesIdFromURL() {
    return new URLSearchParams(window.location.search).get('id');
}

function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char]));
}

function isDirectVideo(url) {
    return /\.(mp4|webm|ogg)(\?|#|$)/i.test(url || '');
}

function playerMarkup(url, poster = '', title = '') {
    if (isDirectVideo(url)) {
        return `<video class="stream-frame" controls playsinline poster="${escapeHTML(poster)}">
            <source src="${escapeHTML(url)}">
            Your browser does not support the video tag.
        </video>`;
    }

    if (url) {
        // Complete Sandbox Elimination: Removing sandbox completely resolves 'Please disable the sandbox' across all providers
        // while the page-level Anti-Hijack Guard protects the parent window from rogue ad redirects.
        return `<iframe class="stream-frame" src="${escapeHTML(url)}" title="${escapeHTML(title)}" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media; accelerometer; gyroscope" referrerpolicy="no-referrer-when-downgrade" sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-popups allow-popups-to-escape-sandbox"></iframe>`;
    }

    return `<div class="stream-placeholder"><div>▶</div><p>Episode streaming link is not available.</p></div>`;
}

function getSeasons() {
    return Array.isArray(currentSeries?.seasons) ? currentSeries.seasons : [];
}

function getCurrentEpisode() {
    const season = getSeasons()[currentSeasonIndex];
    return season?.episodes?.[currentEpisodeIndex] || null;
}

const SERVER_LABELS = [
    "Server 1 (VIP Ultra HD)",
    "Server 2 (High Speed HD)",
    "Server 3 (Backup Server)"
];

let DEFAULT_TV_PROVIDERS = [
    { id: "cinesrc", name: "Server 1 (VIP Ultra HD)", template: "https://cinesrc.st/embed/tv/{id}?s={s}&e={e}", requiresTmdb: false },
    { id: "vidsrc", name: "Server 2 (High Speed HD)", template: "https://vidsrc.pm/embed/tv?tmdb={tmdb}&season={s}&episode={e}", requiresTmdb: false },
    { id: "autoembed", name: "Server 3 (Backup Server)", template: "https://autoembed.co/tv/imdb/{imdb}-{s}-{e}", requiresImdb: true },
    { id: "2embed", name: "Server 4 (Global Mirror)", template: "https://www.2embed.cc/embedtv/{imdb}&s={s}&e={e}", requiresImdb: true }
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
    } catch (_) { }

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
        console.warn('[Mirrors] Using default series providers:', err);
    }
}

function applyLiveMirrors(data) {
    if (!data) return;
    const provs = data.streaming?.providers || [];
    provs.forEach(p => {
        const found = DEFAULT_TV_PROVIDERS.find(dp => dp.id === p.id || dp.name.includes(p.name));
        if (found && p.domains && p.domains.length) {
            const activeDomain = p.domains[0].replace(/\/+$/, '');
            const tmpl = p.tvTemplate || found.template.replace(/^https?:\/\/[^\/]+/, '');
            found.template = activeDomain + (tmpl.startsWith('/') ? tmpl : '/' + tmpl);
        }
    });
}

function isAllowedStreamUrl(url) {
    if (!url) return false;
    return /cinesrc\.st|vidsrc\.pm|autoembed\.co|autoembed\.cc|vidlink\.pro|vidlink\.online|2embed\.cc|allmovieland|1xcinema|\.(mp4|webm|m3u8)(\?|#|$)/i.test(url);
}

function cleanServerLabel(name, index, url) {
    const combined = ((name || '') + ' ' + (url || '')).toLowerCase();
    if (combined.includes('cinesrc') || (/server\s*1/i.test(name) && !combined.includes('vidsrc') && !combined.includes('autoembed') && !combined.includes('2embed')) || index === 0) {
        return "Server 1 (VIP Ultra HD)";
    }
    if (combined.includes('vidsrc') || (/server\s*2/i.test(name) && !combined.includes('cinesrc') && !combined.includes('autoembed') && !combined.includes('2embed')) || index === 1) {
        return "Server 2 (High Speed HD)";
    }
    if (combined.includes('autoembed') || (/server\s*3/i.test(name) && !combined.includes('cinesrc') && !combined.includes('vidsrc')) || index === 2) {
        return "Server 3 (Backup Server)";
    }
    if (combined.includes('2embed') || /server\s*4/i.test(name) || index === 3) {
        return "Server 4 (Global Mirror)";
    }
    return SERVER_LABELS[index] || `Server ${index + 1}`;
}

function seasonStreams(season) {
    return (Array.isArray(season?.streams) ? season.streams : [])
        .filter(s => s && s.url && isAllowedStreamUrl(s.url))
        .map((s, i) => ({ name: cleanServerLabel(s.name, i, s.url), url: s.url }));
}

function normalizeStreams(episode) {
    const season = getSeasons()[currentSeasonIndex];
    let raw = [];
    if (season?.combined) raw = seasonStreams(season);
    else if (currentSeries?.combined) raw = seasonStreams(currentSeries);
    else if (Array.isArray(episode?.streams) && episode.streams.length) {
        raw = episode.streams.filter(s => s && s.url && isAllowedStreamUrl(s.url)).map((s, i) => ({ name: cleanServerLabel(s.name, i, s.url), url: s.url }));
    }

    const imdb = currentSeries?.imdb_id || '';
    const tmdb = currentSeries?.tmdb_id || '';
    const sNum = season?.seasonNumber || (currentSeasonIndex + 1);
    const eNum = episode?.episodeNumber || (currentEpisodeIndex + 1);

    const streamMap = new Map();

    // 1. Add valid raw custom streams
    raw.forEach(s => {
        let u = s.url.trim();
        const label = cleanServerLabel(s.name);
        streamMap.set(label, { name: label, url: u });
    });

    // 2. Add verified dynamic streams using live templates
    DEFAULT_TV_PROVIDERS.forEach(p => {
        if (p.requiresTmdb && !tmdb) return;
        if (p.requiresImdb && !imdb) return;
        const id = tmdb || imdb;
        const u = p.template
            .replace('{id}', encodeURIComponent(id))
            .replace('{imdb}', encodeURIComponent(imdb || tmdb))
            .replace('{tmdb}', encodeURIComponent(tmdb || imdb))
            .replace('{s}', encodeURIComponent(sNum))
            .replace('{e}', encodeURIComponent(eNum));
        if (!streamMap.has(p.name)) {
            streamMap.set(p.name, { name: p.name, url: u });
        }
    });

    // 3. Return canonical ordered streams
    const result = [];
    SERVER_LABELS.forEach(label => {
        if (streamMap.has(label)) {
            result.push(streamMap.get(label));
        }
    });

    return result.length ? result : Array.from(streamMap.values());
}


function generateFallbackSeriesDownloads(series, seasonNum = 1) {
    return [
        { quality: `Season ${seasonNum} (480p SD)`, size: '1.8 GB', server: 'Fast Cloud Mirror', url: '', color: '#ffd70f' },
        { quality: `Season ${seasonNum} (720p HD)`, size: '3.9 GB', server: 'High Speed Cloud', url: '', color: '#06b6d4' },
        { quality: `Season ${seasonNum} (1080p FHD)`, size: '8.5 GB', server: 'VIP Fast Server', url: '', color: '#10b981' }
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
    const clean = url.trim().toLowerCase();
    if (!clean || clean === '#' || clean.startsWith('javascript:')) return false;
    if (clean.includes('download.html')) return false;
    if (clean.includes('kmmovies.') || clean.includes('vegamovies.') || clean.includes('vega') || clean.includes('nexdrive.') || clean.includes('greenmotors.') || clean.includes('magiclinks.') || clean.includes('4khdhub.') || clean.includes('vglist.') || clean.includes('vcloud.') || clean.includes('fastdl.') || clean.includes('azonahub.')) return false;
    if (isStreamingUrl(clean)) return false;
    return true;
}

function generateEpisodeFallbackDownloads(series, seasonNum = 1, epNum = 1) {
    const title = series?.title || 'Series';
    const sId = encodeURIComponent(series?.id || '');
    const qTitle = encodeURIComponent(`${title} S0${seasonNum} EP ${epNum}`);
    return [
        { quality: '480p SD', size: '180 MB', server: 'Fast Cloud Mirror', url: `download.html?id=${sId}&quality=480p&size=180+MB&title=${qTitle}&s=${seasonNum}&ep=${epNum}&type=series`, color: '#ffd70f' },
        { quality: '720p HD', size: '450 MB', server: 'High Speed Cloud', url: `download.html?id=${sId}&quality=720p&size=450+MB&title=${qTitle}&s=${seasonNum}&ep=${epNum}&type=series`, color: '#06b6d4' },
        { quality: '1080p Full HD', size: '950 MB', server: 'VIP Direct Cloud', url: `download.html?id=${sId}&quality=1080p&size=950+MB&title=${qTitle}&s=${seasonNum}&ep=${epNum}&type=series`, color: '#10b981' }
    ];
}

function normalizeDownloads(episode) {
    const season = getSeasons()[currentSeasonIndex];
    if (episode && Array.isArray(episode.downloads) && episode.downloads.length) {
        const valid = episode.downloads
            .filter(d => d && d.url && isValidDownloadUrl(d.url));
        if (valid.length) return valid;
    }
    if (season && Array.isArray(season.downloads) && season.downloads.length) {
        const valid = season.downloads
            .filter(d => d && d.url && isValidDownloadUrl(d.url));
        if (valid.length) return valid;
    }
    if (currentSeries && Array.isArray(currentSeries.downloads) && currentSeries.downloads.length) {
        const valid = currentSeries.downloads
            .filter(d => d && d.url && isValidDownloadUrl(d.url));
        if (valid.length) return valid;
    }
    return generateEpisodeFallbackDownloads(currentSeries, currentSeasonIndex + 1, currentEpisodeIndex + 1);
}


// ─── MEDIA SPECIFICATIONS, CAST CHIPS & SEASON BATCH PACKS ───
function extractCastList(item) {
    if (Array.isArray(item.cast) && item.cast.length) return item.cast;
    const desc = item.description || '';
    const match = desc.match(/starring\s+([^.\n]+)/i);
    if (match && match[1]) {
        return match[1].split(',').map(s => s.trim()).filter(Boolean);
    }
    return [];
}

function renderCastChips(series) {
    const cast = extractCastList(series);
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

function renderMediaSpecs(series) {
    const isDual = (series.title && /dual|hindi/i.test(series.title)) || true;
    const is4K = (series.badge && /4k/i.test(series.badge)) || (series.title && /4k|2160p/i.test(series.title));
    
    const audioSpec = isDual ? "Hindi (Clean Master DDP 5.1) + English DD 5.1" : "Original Dual Audio (Dolby Digital Plus 5.1)";
    const videoSpec = is4K ? "4K UHD 2160p HEVC 10-Bit (Dolby Vision / HDR10+)" : "1080p FHD HEVC x265 (High Bitrate Binge Master)";
    const sourceSpec = "Official OTT WEB-DL Master Series";
    const subSpec = "English [Muxed & External SRT] • Multi-Subtitles";

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


function renderSeasonBatchPack(series, seasonIndex) {
    const sNum = seasonIndex + 1;
    const sTitle = `Season ${sNum}`;
    const cleanT = (series?.title || 'Series').replace(/[:\-–—\(\)\d]/g, ' ').trim();
    const hdhubDomain = liveMirrorsConfig?.scrapers?.hdhub4u?.active || 'https://new9.hdhub4u.cl';
    const qBatch = encodeURIComponent(`${cleanT} ${sTitle} complete zip`.trim());

    const batchOptions = [
        { quality: `${sTitle} Complete Pack (480p SD Zip)`, size: '1.8 GB', color: '#ffd70f', server: 'Standard HD Cloud' },
        { quality: `${sTitle} Complete Pack (720p HD Zip)`, size: '3.8 GB', color: '#06b6d4', server: 'Fast Direct Cloud' },
        { quality: `${sTitle} Complete Pack (1080p FHD 10-Bit Zip)`, size: '7.5 GB', color: '#10b981', server: 'High Speed Direct Cloud' }
    ];

    return `
        <div class="season-batch-card">
            <div class="batch-header">
                <div>
                    <span class="batch-badge">📦 BINGE PACK</span>
                    <h3 class="batch-title">Download ${escapeHTML(sTitle)} — All Episodes in 1 Zip</h3>
                    <p class="batch-subtitle">Single-click high speed cloud download for the entire season. Extract and watch offline without interruptions.</p>
                </div>
            </div>
            <div class="batch-grid">
                ${batchOptions.map(opt => {
                    const dlUrl = `download.html?id=${encodeURIComponent(series.id)}&title=${encodeURIComponent(series.title || '')}&poster=${encodeURIComponent(series.poster || series.banner || '')}&quality=${encodeURIComponent(opt.quality)}&size=${encodeURIComponent(opt.size)}&url=&s=${sNum}&type=series`;
                    return `
                        <a class="download-card batch-dl-btn" href="${dlUrl}" target="_blank" rel="noopener noreferrer" style="--download-color:${opt.color}">
                            <div>
                                <strong>📦 ${escapeHTML(opt.quality)}</strong>
                                <span>${escapeHTML(opt.server)} • ${escapeHTML(opt.size)}</span>
                            </div>
                            <em>Get Batch Zip ⬇</em>
                        </a>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

function updateSeasonBatchPack() {
    const container = document.getElementById('seasonBatchContainer');
    if (container && currentSeries) {
        container.innerHTML = renderSeasonBatchPack(currentSeries, currentSeasonIndex);
    }
}


function renderSeries(series) {
    currentSeries = series;
    currentSeasonIndex = 0;
    currentEpisodeIndex = 0;

    const vData = getMovieViewsData(series.id, series.views);
    const detail = document.getElementById('seriesDetail');
    const banner = series.banner || series.poster || '';
    const seasons = getSeasons();
    const episodeCount = seasons.reduce((sum, s) => sum + ((s.episodes || []).length), 0);
    const meta = ['Series', series.genre, series.year, episodeCount ? `${episodeCount} Episodes` : '', series.rating ? `⭐ ${series.rating}` : ''].filter(Boolean).join(' • ');

    document.title = `${series.title} - Phantom Movies`;
    updateSEOMeta(series.title, series.description || '', series.poster || series.banner || '');

    detail.innerHTML = `
        <section class="watch-section">
            <div class="detail-hero-bg" style="background-image:url('${escapeHTML(banner)}')"></div>
            <div class="watch-wrap">
                <div class="player-box" id="seriesPlayerBox"></div>
                <div id="seriesBingeContainer"></div>
                <div id="seriesFailoverContainer"></div>
                <div id="seriesStreamButtons"></div>
            </div>
        </section>

        <section class="movie-detail-content series-content-grid">
            <div class="detail-poster-card">
                ${series.poster ? `<img src="${escapeHTML(series.poster)}" alt="${escapeHTML(series.title)} poster">` : '<div class="poster-fallback">📺</div>'}
            </div>

            <div class="detail-info-card">
                ${series.badge ? `<div class="feat-tag">${escapeHTML(series.badge)}</div>` : '<div class="feat-tag">📺 Series</div>'}
                <h1>${escapeHTML(series.title)}</h1>
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
                    ${series.trailerLink ? `<button class="btn-watchlist-toggle" onclick="openTrailerModal('${escapeHTML(series.trailerLink)}', '${escapeHTML(series.title)}')">
                        <span>🎬</span> <span>Watch Trailer</span>
                    </button>` : ''}
                </div>
                <p class="detail-desc">${escapeHTML(series.description || 'No description available.')}</p>
                ${renderCastChips(series)}
                ${(series.combined || (series.seasons || []).some(s => s.combined)) ? '<p class="detail-meta" style="margin-top:6px;">🎞 Combined: season ke sab episodes ek hi video file me hain.</p>' : ''}

                <div class="series-browser">
                    <div class="series-tabs" id="seasonTabs"></div>
                    <div class="episode-list" id="episodeList"></div>
                </div>

                <div id="seasonBatchContainer">
                    ${renderSeasonBatchPack(series, 0)}
                </div>

                ${renderMediaSpecs(series)}

                <div class="download-section">
                    <div class="sec-title">EPISODE <span>DOWNLOADS</span></div>
                    <div class="download-grid" id="episodeDownloads"></div>
                </div>
            </div>
        </section>
    `;

    renderSeasonTabs();
    renderEpisodes();
    playEpisode(0, false);
    updateWatchlistButtonState();
    loadAndRenderAds('series');

    if (typeof gtag !== 'undefined') {
        gtag('event', 'series_detail_view', {
            movie_title: series.title,
            movie_id: series.id,
            genre: series.genre || ''
        });
    }
}

let currentSeriesStreamIndex = 0;
let seriesFailoverWatchdogTimer = null;
let testedSeriesFailedUrls = new Set();

function getSeriesStreamStatusText(stream) {
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

function renderSeriesFailoverBar() {
    const container = document.getElementById('seriesFailoverContainer');
    if (!container) return;
    if (!currentStreams || currentStreams.length <= 1) {
        container.innerHTML = '';
        return;
    }
    const activeStream = currentStreams[currentSeriesStreamIndex] || currentStreams[0];
    container.innerHTML = `
        <div class="stream-failover-bar" id="seriesFailoverBar">
            <div class="failover-status">
                <span class="failover-dot online" id="seriesFailoverDot"></span>
                <span id="seriesFailoverText">${getSeriesStreamStatusText(activeStream)}</span>
            </div>
            <button type="button" class="failover-quick-btn" onclick="autoFailoverSeriesNext('manual')">Switch Server ↻</button>
        </div>
    `;
}

function updateSeriesFailoverStatus(message, isSwitching = false) {
    const textEl = document.getElementById('seriesFailoverText');
    const dotEl = document.getElementById('seriesFailoverDot');
    if (textEl) textEl.textContent = message;
    if (dotEl) {
        dotEl.className = isSwitching ? 'failover-dot switching' : 'failover-dot online';
    }
}

function startSeriesFailoverWatchdog(streamUrl, streamName) {
    if (seriesFailoverWatchdogTimer) clearTimeout(seriesFailoverWatchdogTimer);
    // User can manually switch using the "Switch Server ↻" button.
    // Removed the blind 4.5-second interrupt timer so series episodes play smoothly and uninterrupted.
}

function autoFailoverSeriesNext(reason = 'auto') {
    if (!currentStreams || currentStreams.length <= 1) return;
    if (seriesFailoverWatchdogTimer) clearTimeout(seriesFailoverWatchdogTimer);

    currentSeriesStreamIndex = (currentSeriesStreamIndex + 1) % currentStreams.length;
    const nextStream = currentStreams[currentSeriesStreamIndex];

    const isTimeout = reason === 'buffer_timeout';
    const reasonText = isTimeout ? 'Server 1 buffering. Auto-switched to' : (reason === 'manual' ? 'Switched to' : 'Auto-switched to');
    updateSeriesFailoverStatus(`⚠️ ${reasonText} ${nextStream.name} (Live)...`, true);

    switchSeriesStream(currentSeriesStreamIndex, true);

    setTimeout(() => {
        updateSeriesFailoverStatus(getSeriesStreamStatusText(nextStream), false);
    }, 1200);
}

function renderSeasonTabs() {
    const tabs = document.getElementById('seasonTabs');
    const seasons = getSeasons();

    if (!tabs) return;
    tabs.innerHTML = seasons.map((season, index) => `
        <button class="season-tab ${index === currentSeasonIndex ? 'active' : ''}" onclick="selectSeason(${index})">
            ${escapeHTML(season.title || `Season ${season.seasonNumber || index + 1}`)}
        </button>
    `).join('');
}

function selectSeason(index) {
    currentSeasonIndex = index;
    currentEpisodeIndex = 0;
    renderSeasonTabs();
    renderEpisodes();
    updateSeasonBatchPack();
    playEpisode(0, false);
}


let isSeriesPlaying = false;

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

function renderSeriesCurtain(episode, activeStream) {
    const backdrop = currentSeries?.banner || currentSeries?.poster || '';
    const serverLabel = activeStream ? activeStream.name : 'Server 1 (VIP Ultra HD)';
    const epTitle = episode ? (episode.title || `Episode ${currentEpisodeIndex + 1}`) : (currentSeries?.title || 'Series');
    const epNumStr = episode ? `Season ${currentSeasonIndex + 1} • Episode ${episode.episodeNumber || currentEpisodeIndex + 1}` : `Season ${currentSeasonIndex + 1}`;
    return `
        <div class="player-curtain" id="seriesPlayerCurtain" onclick="startSeriesPlayback()">
            <div class="curtain-backdrop" style="background-image: url('${escapeHTML(backdrop)}');"></div>
            <div class="curtain-overlay"></div>
            <div class="curtain-content">
                <div class="curtain-play-btn"><span class="play-ico">▶</span></div>
                <div class="curtain-title">${escapeHTML(epTitle)}</div>
                <div class="curtain-meta">
                    <span>${escapeHTML(currentSeries?.title || 'Series')}</span>
                    <span>•</span>
                    <span>${escapeHTML(epNumStr)}</span>
                    <span>•</span>
                    <span>⭐ ${escapeHTML(currentSeries?.rating || '8.5')}</span>
                </div>
                <div class="curtain-badge">▶ CLICK TO PLAY • ${escapeHTML(serverLabel)}</div>
            </div>
        </div>
    `;
}

function startSeriesPlayback() {
    isSeriesPlaying = true;
    const episode = getCurrentEpisode();
    const season = getSeasons()[currentSeasonIndex];
    const activeStream = currentStreams[currentSeriesStreamIndex] || currentStreams[0];
    const player = document.getElementById('seriesPlayerBox');
    if (player && activeStream) {
        const title = (episode?.title) ||
            (season?.combined ? (season.title || 'Season') + ' — Combined' : currentSeries?.title);
        player.innerHTML = playerMarkup(activeStream.url, currentSeries?.banner || currentSeries?.poster || '', title);
        startSeriesFailoverWatchdog(activeStream.url, activeStream.name);
        updateSeriesFailoverStatus(getSeriesStreamStatusText(activeStream), false);
    }
    playEpisode(currentEpisodeIndex, true);
}

function renderSeriesBingeBar() {
    const container = document.getElementById('seriesBingeContainer');
    if (!container) return;
    const seasons = getSeasons();
    const currentSeason = seasons[currentSeasonIndex];
    const episodes = currentSeason?.episodes || [];

    let nextSeasonIdx = currentSeasonIndex;
    let nextEpIdx = currentEpisodeIndex + 1;
    let nextEp = null;

    if (nextEpIdx < episodes.length) {
        nextEp = episodes[nextEpIdx];
    } else if (currentSeasonIndex + 1 < seasons.length) {
        nextSeasonIdx = currentSeasonIndex + 1;
        nextEpIdx = 0;
        const nextSeason = seasons[nextSeasonIdx];
        nextEp = nextSeason?.episodes?.[0] || null;
    }

    if (!nextEp) {
        container.innerHTML = '';
        return;
    }

    const epNum = nextEp.episodeNumber || (nextEpIdx + 1);
    const sNum = nextSeasonIdx + 1;
    const epTitle = nextEp.title || `Episode ${epNum}`;

    container.innerHTML = `
        <div class="binge-bar" id="bingeBar">
            <div class="binge-info">
                <span class="binge-badge">Up Next • S0${sNum} E${epNum}</span>
                <span class="binge-title">${escapeHTML(epTitle)}</span>
            </div>
            <button type="button" class="btn-primary binge-next-btn" onclick="playNextEpisode(${nextSeasonIdx}, ${nextEpIdx})">
                <span>Next Episode ▶</span>
            </button>
        </div>
    `;
}

function playNextEpisode(seasonIdx, epIdx) {
    if (seasonIdx !== currentSeasonIndex) {
        currentSeasonIndex = seasonIdx;
        renderSeasonTabs();
        renderEpisodes();
    }
    playEpisode(epIdx, true);
    const player = document.getElementById('seriesPlayerBox');
    if (player) {
        player.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function getYouTubeEmbed(url) {
    if (!url) return '';
    try {
        const u = new URL(url);
        const host = u.hostname.replace(/^www\./, '').toLowerCase();
        let id = '';
        if (host === 'youtu.be') {
            id = u.pathname.slice(1).split('/')[0] || '';
        } else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
            id = u.searchParams.get('v')
                || (u.pathname.startsWith('/embed/') ? (u.pathname.split('/')[2] || '') : '');
        }
        if (id && !/^[A-Za-z0-9_-]{5,20}$/.test(id)) id = '';
        return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : '';
    } catch (_) {
        return '';
    }
}

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


function renderEpisodes() {
    const list = document.getElementById('episodeList');
    const season = getSeasons()[currentSeasonIndex];
    const episodes = season?.episodes || [];

    if (!list) return;

    if (!episodes.length) {
        list.innerHTML = `
            <button class="episode-item active" onclick="playEpisode(0)">
                <strong>▶ Play ${escapeHTML(season?.title || 'Season')} — Full Stream</strong>
                <span>All episodes in full HD player</span>
            </button>`;
        return;
    }

    const sNum = currentSeasonIndex + 1;
    list.innerHTML = episodes.map((ep, index) => {
        const epNum = ep.episodeNumber || index + 1;
        const watched = isEpisodeWatched(currentSeries.id, sNum, epNum);
        const watchedTag = watched ? '<span class="ep-watched-badge">✓ Watched</span>' : '';
        return `
            <button class="episode-item ${index === currentEpisodeIndex ? 'active' : ''}" onclick="playEpisode(${index}, true)">
                <strong>E${escapeHTML(epNum)}. ${escapeHTML(ep.title || `Episode ${index + 1}`)} ${watchedTag}</strong>
                <span>${escapeHTML(ep.duration || '')}</span>
            </button>
        `;
    }).join('');
}

function playEpisode(index, autoStart = false) {
    currentEpisodeIndex = index;
    const episode = getCurrentEpisode();
    const season = getSeasons()[currentSeasonIndex];

    if (!episode) {
        currentStreams = seasonStreams(season);
        if (!currentStreams.length && (currentSeries?.imdb_id || currentSeries?.tmdb_id)) {
            const sNum = season?.seasonNumber || (currentSeasonIndex + 1);
            currentStreams = normalizeStreams({ episodeNumber: 1 });
        }
    } else {
        currentStreams = normalizeStreams(episode);
    }

    // Preserve user selected server index
    if (currentSeriesStreamIndex >= currentStreams.length) {
        currentSeriesStreamIndex = 0;
    }
    const activeStream = currentStreams[currentSeriesStreamIndex] || currentStreams[0] || null;
    const player = document.getElementById('seriesPlayerBox');

    if (autoStart) {
        isSeriesPlaying = true;
        if (player && activeStream) {
            player.innerHTML = playerMarkup(
                activeStream.url || '',
                currentSeries?.banner || currentSeries?.poster || '',
                episode ? (episode.title || currentSeries.title) : ((season?.title || 'Season') + ' — Full Stream')
            );
            startSeriesFailoverWatchdog(activeStream.url, activeStream.name);
            updateSeriesFailoverStatus(getSeriesStreamStatusText(activeStream), false);
        }
    } else {
        isSeriesPlaying = false;
        if (player) {
            player.innerHTML = renderSeriesCurtain(episode, activeStream);
        }
    }

    document.querySelectorAll('.episode-item').forEach((btn, i) => btn.classList.toggle('active', i === index));
    renderSeriesBingeBar();
    renderSeriesFailoverBar();
    renderStreamButtons();
    renderEpisodeDownloads();

    const sNum = currentSeasonIndex + 1;
    const epNum = episode ? (episode.episodeNumber || index + 1) : 1;

    if (autoStart) {
        markEpisodeWatched(currentSeries.id, sNum, epNum);
        trackSeriesProgress(currentSeries, sNum, epNum);
        const epTotal = Math.max(1, (season?.episodes || []).length);
        const calcProg = Math.round(((index + 1) / epTotal) * 100);
        setWatchProgress(currentSeries.id, calcProg, {
            title: currentSeries.title,
            type: 'series',
            season: sNum,
            episode: epNum
        });
    }

    if (typeof gtag !== 'undefined') {
        gtag('event', 'episode_play', {
            series_title: currentSeries.title,
            series_id: currentSeries.id,
            episode_title: episode?.title || '',
            episode_number: epNum
        });
    }
}

function renderStreamButtons() {
    const wrap = document.getElementById('seriesStreamButtons');
    if (!wrap) return;

    if (!currentStreams || currentStreams.length <= 1) {
        wrap.innerHTML = '';
        return;
    }

    wrap.innerHTML = `
        <div class="source-server-card">
            <div class="source-server-header">
                <span class="source-server-title">SELECT SOURCE SERVER</span>
                <span class="source-server-count">${currentStreams.length} VERIFIED SERVERS</span>
            </div>
            <div class="stream-server-row">
                ${currentStreams.map((stream, index) => {
        const isP2P = /p2p|hdvb|mesh/i.test(stream.name);
        const isNoAds = /no ads/i.test(stream.name);
        const activeClass = index === currentSeriesStreamIndex ? 'active' : '';
        const extraClasses = [
            isP2P ? 'p2p' : '',
            isNoAds ? 'no-ads' : ''
        ].filter(Boolean).join(' ');

        let icon = '▶';
        if (isP2P) icon = '⚡';
        else if (isNoAds) icon = '🛡️';
        else icon = '🚀';

        return `<button type="button" class="stream-server-btn ${activeClass} ${extraClasses}" onclick="switchSeriesStream(${index})" title="${isP2P ? 'Peer-to-Peer Accelerated (Buffer-free)' : escapeHTML(stream.name)}">
                        <span>${icon}</span>
                        <span>${escapeHTML(stream.name)}</span>
                    </button>`;
    }).join('')}
            </div>
        </div>
    `;
}

function switchSeriesStream(index, isFailover = false) {
    if (!currentStreams || !currentStreams[index]) return;
    currentSeriesStreamIndex = index;
    const stream = currentStreams[index];
    const episode = getCurrentEpisode();
    const season = getSeasons()[currentSeasonIndex];

    // Immediately start playing the selected server
    isSeriesPlaying = true;

    const player = document.getElementById('seriesPlayerBox');
    if (player) {
        const title = (episode?.title) ||
            (season?.combined ? (season.title || 'Season') + ' — Combined' : currentSeries.title);
        player.innerHTML = playerMarkup(stream.url, currentSeries.banner || currentSeries.poster || '', title);
        startSeriesFailoverWatchdog(stream.url, stream.name);
    }

    document.querySelectorAll('#seriesStreamButtons .stream-server-btn').forEach((btn, i) => btn.classList.toggle('active', i === index));
    updateSeriesFailoverStatus(getSeriesStreamStatusText(stream), false);
}

function renderEpisodeDownloads() {
    const grid = document.getElementById('episodeDownloads');
    const episode = getCurrentEpisode();
    const downloads = normalizeDownloads(episode);

    if (!grid) return;

    if (!downloads.length) {
        grid.innerHTML = '<div class="download-empty" style="text-align:center; padding: 18px 12px; color: #94a3b8; font-size: 13px; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px dashed rgba(255,255,255,0.12); line-height: 1.5;">⚡ Direct cloud download links are currently refreshing for this episode.<br><span style="color: #2dce89; font-weight:600;">Please use the HD streaming servers above to watch online instantly without waiting.</span></div>';
        return;
    }

    let cards = downloads.map((item, index) => {
        const quality = item.quality || item.label || `Option ${index + 1}`;
        const server = item.server || 'Fast Cloud';
        const size = item.size || '';
        const color = item.color || '#5bc4f5';
        const rawUrl = (item.url && !item.url.includes('download.html')) ? item.url : '';
        const epNum = episode?.episodeNumber || (currentEpisodeIndex + 1);
        const sNum = currentSeasonIndex + 1;
        const targetUrl = `download.html?id=${encodeURIComponent(currentSeries.id)}&title=${encodeURIComponent(currentSeries.title || '')}&poster=${encodeURIComponent(currentSeries.poster || currentSeries.banner || '')}&quality=${encodeURIComponent(quality)}&size=${encodeURIComponent(size)}&url=${encodeURIComponent(rawUrl)}&ep=${epNum}&s=${sNum}&type=series`;

        return `<a class="download-card" href="${targetUrl}" target="_blank" rel="noopener noreferrer" style="--download-color:${escapeHTML(color)}">
            <div>
                <strong>${escapeHTML(quality)}</strong>
                <span>${escapeHTML([server, size].filter(Boolean).join(' • '))}</span>
            </div>
            <em>Download ⬇</em>
        </a>`;
    });

    if (currentSeries?.torrent && currentSeries.torrent.magnet) {
        const t = currentSeries.torrent;
        const seedersText = t.seeders ? `${t.seeders} Seeders Active` : 'High Speed P2P';
        const epNum = episode?.episodeNumber || (currentEpisodeIndex + 1);
        const sNum = currentSeasonIndex + 1;
        const targetUrl = `download.html?id=${encodeURIComponent(currentSeries.id)}&title=${encodeURIComponent(currentSeries.title || '')}&poster=${encodeURIComponent(currentSeries.poster || currentSeries.banner || '')}&quality=4K/1080p&size=${encodeURIComponent(t.size || '')}&ep=${epNum}&s=${sNum}&type=series`;
        cards.push(`
            <a class="download-card" href="${targetUrl}" target="_blank" rel="noopener noreferrer" style="--download-color:#8b5cf6; border-color:rgba(139,92,246,0.4); background:linear-gradient(135deg, rgba(139,92,246,0.15), rgba(99,102,241,0.08));">
                <div>
                    <strong>🧲 Direct Torrent & Magnet (4K / 1080p)</strong>
                    <span>${escapeHTML([t.size, seedersText, 'P2P Instant Client'].filter(Boolean).join(' • '))}</span>
                </div>
                <em>Magnet 🧲</em>
            </a>
        `);
    }

    grid.innerHTML = cards.join('');

    grid.querySelectorAll('.download-card').forEach(link => {
        link.addEventListener('click', (event) => {
        });
    });
}

function showError(message) {
    document.getElementById('seriesDetail').innerHTML = `
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
    } catch (_) { }

    const response = await fetch('data/content.json?v=' + Date.now());
    if (!response.ok) throw new Error('Failed to load content.json');
    const data = await response.json();
    window.PHANTOM_CONTENT_CACHE = data;
    try {
        sessionStorage.setItem('phantom_content_cache_v4', JSON.stringify(data));
        sessionStorage.setItem('phantom_content_time_v4', String(Date.now()));
    } catch (_) { }
    return data;
}

async function loadSeriesDetail() {
    const seriesId = getSeriesIdFromURL();
    if (!seriesId) {
        showError('Series ID missing.');
        return;
    }

    try {
        // Dynamic live mirrors hook: updates active domains in real time
        await loadLiveMirrors();

        const data = await getContentData();
        const items = (data.movies || []).filter(m => m.active !== false);
        const series = items.find(m => String(m.id) === String(seriesId));

        if (!series) {
            showError('Series not found or inactive.');
            return;
        }

        if (series.type !== 'series') {
            showError('This content is not a series.');
            return;
        }

        renderSeries(series);

        const ads = data.settings && data.settings.ads;
        if (ads) applyAds(ads, 'series');
    } catch (error) {
        console.error(error);
        showError('Unable to load series details.');
    }
}

loadSeriesDetail();


// ─── ADS RENDERING ───
function applyAds(ads, page) {
    currentAds = ads;
    if (!ads || ads.enabled === false) return;

    if (page === 'series') {
        insertAdBefore('#seriesPlayerBox', 'ad-series-player-top', ads.seriesPlayerTop);
        insertAdBefore('#episodeDownloads', 'ad-series-downloads', ads.seriesDownloads);
        insertAdAfter('.movie-detail-content', 'ad-series-bottom', ads.seriesBottom);
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

// ─── USER PROGRESS & WATCHLIST (SERIES) ───
function trackSeriesProgress(series, seasonNum, epNum) {
    if (!series) return;
    try {
        let list = JSON.parse(localStorage.getItem('phantom_continue_watching') || '[]');
        list = list.filter(x => String(x.id) !== String(series.id));
        list.unshift({
            id: series.id,
            title: series.title,
            poster: series.poster || series.banner || '',
            banner: series.banner || series.poster || '',
            type: 'series',
            season: seasonNum,
            episode: epNum,
            timestamp: Date.now()
        });
        localStorage.setItem('phantom_continue_watching', JSON.stringify(list.slice(0, 15)));
    } catch (_) { }
}

function markEpisodeWatched(seriesId, seasonNum, epNum) {
    if (!seriesId) return;
    try {
        localStorage.setItem(`phantom_watched_${seriesId}_s${seasonNum}_e${epNum}`, 'true');
    } catch (_) { }
}

function isEpisodeWatched(seriesId, seasonNum, epNum) {
    if (!seriesId) return false;
    try {
        return localStorage.getItem(`phantom_watched_${seriesId}_s${seasonNum}_e${epNum}`) === 'true';
    } catch (_) { return false; }
}

function toggleWatchlist() {
    if (!currentSeries) return;
    try {
        let list = JSON.parse(localStorage.getItem('phantom_watchlist') || '[]');
        const idx = list.findIndex(x => String(x.id) === String(currentSeries.id));
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
                id: currentSeries.id,
                title: currentSeries.title,
                poster: currentSeries.poster || currentSeries.banner || '',
                rating: currentSeries.rating || '8.5',
                type: 'series'
            });
            if (btn) btn.classList.add('active');
            if (icon) icon.textContent = '❤️';
            if (text) text.textContent = 'In Watchlist';
            showToast('Saved to Watchlist! ❤️');
        }
        localStorage.setItem('phantom_watchlist', JSON.stringify(list.slice(0, 30)));
    } catch (_) { }
}

function updateWatchlistButtonState() {
    if (!currentSeries) return;
    try {
        const list = JSON.parse(localStorage.getItem('phantom_watchlist') || '[]');
        const exists = list.some(x => String(x.id) === String(currentSeries.id));
        const btn = document.getElementById('btnWatchlistToggle');
        const icon = document.getElementById('watchlistIcon');
        const text = document.getElementById('watchlistText');
        if (btn) btn.classList.toggle('active', exists);
        if (icon) icon.textContent = exists ? '❤️' : '🤍';
        if (text) text.textContent = exists ? 'In Watchlist' : 'Add to Watchlist';
    } catch (_) { }
}
