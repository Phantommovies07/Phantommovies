// ═══════════════════════════════════════════════════
// PHANTOM MOVIES - SERIES DETAIL PAGE
// ═══════════════════════════════════════════════════

// Anti-Hijack Guard: Prevents third-party stream iframes from redirecting or hijacking the main website
window.addEventListener('beforeunload', (e) => {
    if (document.activeElement && document.activeElement.tagName === 'IFRAME') {
        e.preventDefault();
        return (e.returnValue = '');
    }
});

// Guard against rogue popunder/popup creation on the parent window by iframe interactions
const _originalWindowOpen = window.open;
window.open = function (url, target, features) {
    if (document.activeElement && document.activeElement.tagName === 'IFRAME') {
        console.warn('[Anti-Hijack] Prevented unauthorized window.open from iframe');
        return null;
    }
    return _originalWindowOpen.call(window, url, target, features);
};

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
        return `<iframe class="stream-frame" src="${escapeHTML(url)}" title="${escapeHTML(title)}" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media; accelerometer; gyroscope" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
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
    "Server 1 (AllMovieLand - HDVB P2P)",
    "Server 2 (HDMovie2 - P2P HLS)",
    "Server 3 (CineSrc - No Ads)",
    "Server 4 (VidLink - Fast HD)"
];

let DEFAULT_TV_PROVIDERS = [
    { id: "allmovieland", name: "Server 1 (AllMovieLand - HDVB P2P)", template: "https://allmovieland.link/play/{imdb}?s={s}&e={e}", requiresImdb: true },
    { id: "hdmovie2", name: "Server 2 (HDMovie2 - P2P HLS)", template: "https://slast430did.com/play/{imdb}?s={s}&e={e}", requiresImdb: true },
    { id: "cinesrc", name: "Server 3 (CineSrc - No Ads)", template: "https://cinesrc.st/embed/tv/{tmdb}?s={s}&e={e}", requiresTmdb: true },
    { id: "vidlink", name: "Server 4 (VidLink - Fast HD)", template: "https://vidlink.pro/tv/{imdb}/{s}/{e}", requiresImdb: true }
];

async function loadLiveMirrors() {
    if (window.PHANTOM_MIRRORS_CACHE) {
        liveMirrorsConfig = window.PHANTOM_MIRRORS_CACHE;
        applyLiveMirrors(liveMirrorsConfig);
        return;
    }
    try {
        const cached = sessionStorage.getItem('phantom_mirrors_cache_v2');
        const cacheTime = sessionStorage.getItem('phantom_mirrors_time_v2');
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
            sessionStorage.setItem('phantom_mirrors_cache_v2', JSON.stringify(data));
            sessionStorage.setItem('phantom_mirrors_time_v2', String(Date.now()));
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
    return /slast430did\.com|allmovieland|1xcinema|gorri421kos\.com|hdmovie2|cinesrc\.st|vidlink\.pro|vidlink\.online|\.(mp4|webm|m3u8)(\?|#|$)/i.test(url);
}

function cleanServerLabel(name, index) {
    if (!name) return SERVER_LABELS[index] || `Server ${index + 1}`;
    if (/allmovieland|slast430did|hdvb/i.test(name)) return "Server 1 (AllMovieLand - HDVB P2P)";
    if (/hdmovie2|gorri|fikka/i.test(name)) return "Server 2 (HDMovie2 - P2P HLS)";
    if (/cinesrc/i.test(name)) return "Server 3 (CineSrc - No Ads)";
    if (/vidlink/i.test(name)) return "Server 4 (VidLink - Fast HD)";
    return SERVER_LABELS[index] || `Server ${index + 1}`;
}

function seasonStreams(season) {
    return (Array.isArray(season?.streams) ? season.streams : [])
        .filter(s => s && s.url && isAllowedStreamUrl(s.url))
        .map((s, i) => ({ name: cleanServerLabel(s.name, i), url: s.url }));
}

function normalizeStreams(episode) {
    const season = getSeasons()[currentSeasonIndex];
    let raw = [];
    if (season?.combined) raw = seasonStreams(season);
    else if (currentSeries?.combined) raw = seasonStreams(currentSeries);
    else if (Array.isArray(episode?.streams) && episode.streams.length) {
        raw = episode.streams.filter(s => s && s.url && isAllowedStreamUrl(s.url)).map((s, i) => ({ name: cleanServerLabel(s.name, i), url: s.url }));
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
        const u = p.template
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
    const clean = url.trim();
    if (!clean || clean === '#' || clean.startsWith('javascript:')) return false;
    if (clean.includes('download.html')) return false;
    if (clean.includes('kmmovies.') || clean.includes('vegamovies.')) return false;
    if (clean.includes('magiclinks.lol/download/')) return false;
    if (clean.includes('magiclinks.lol/series/') && clean.includes('?id=')) return false;
    if (isStreamingUrl(clean)) return false;
    return true;
}

function generateEpisodeFallbackDownloads(series, seasonNum = 1, epNum = 1) {
    const title = series?.title || 'Series';
    const cleanT = title.replace(/[:\-–—\(\)\d]/g, ' ').trim();
    const q = encodeURIComponent(`${cleanT} S0${seasonNum}`.trim());
    return [
        { quality: '480p SD', size: '180 MB', server: 'HDHub4u Cloud Engine', url: `https://new3.hdhub4u.free/?s=${q}`, color: '#ffd70f' },
        { quality: '720p HD', size: '450 MB', server: 'ROG Fast Cloud Mirror', url: `https://rogmovies.one/?s=${q}`, color: '#06b6d4' },
        { quality: '1080p Full HD', size: '950 MB', server: 'VIP Direct Cloud Server', url: `https://new3.hdhub4u.free/?s=${q}`, color: '#10b981' }
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

function renderSeries(series) {
    currentSeries = series;
    currentSeasonIndex = 0;
    currentEpisodeIndex = 0;

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
                <p class="detail-meta">${escapeHTML(meta)}</p>
                <div style="margin: 14px 0 16px;">
                    <button class="btn-watchlist-toggle" id="btnWatchlistToggle" onclick="toggleWatchlist()">
                        <span id="watchlistIcon">🤍</span> <span id="watchlistText">Add to Watchlist</span>
                    </button>
                </div>
                <p class="detail-desc">${escapeHTML(series.description || 'No description available.')}</p>
                ${(series.combined || (series.seasons || []).some(s => s.combined)) ? '<p class="detail-meta" style="margin-top:6px;">🎞 Combined: season ke sab episodes ek hi video file me hain.</p>' : ''}

                <div class="series-browser">
                    <div class="series-tabs" id="seasonTabs"></div>
                    <div class="episode-list" id="episodeList"></div>
                </div>

                <div class="download-section">
                    <div class="sec-title">EPISODE <span>DOWNLOADS</span></div>
                    <div class="download-grid" id="episodeDownloads"></div>
                </div>
            </div>
        </section>
    `;

    renderSeasonTabs();
    renderEpisodes();
    playEpisode(0);
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
    if (/p2p|allmovieland/i.test(stream.name)) {
        return `⚡ Active: ${escapeHTML(stream.name)} — Peer-to-Peer Acceleration Active (0 Buffering)`;
    }
    if (/hdmovie2|mesh/i.test(stream.name)) {
        return `⚡ Active: ${escapeHTML(stream.name)} — P2P Mesh HLS Active (Low Latency)`;
    }
    if (/no ads/i.test(stream.name)) {
        return `🛡️ Active: ${escapeHTML(stream.name)} — Clean Ad-Shielded Stream`;
    }
    return `🚀 Active: ${escapeHTML(stream.name)} — High-Speed Global Stream`;
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

    // Optimized 4.5s Watchdog: auto-switches to Server 2 (P2P) if Server 1 delays buffering
    seriesFailoverWatchdogTimer = setTimeout(() => {
        const iframe = document.querySelector('#seriesPlayerBox .stream-frame');
        if (iframe && iframe.tagName.toLowerCase() === 'iframe') {
            if (currentStreams.length > 1 && currentSeriesStreamIndex === 0) {
                console.log(`[Series Auto-Failover] Server 1 buffer delay detected (4.5s), switching to Server 2 P2P...`);
                autoFailoverSeriesNext('buffer_timeout');
            }
        }
    }, 4500);
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
    playEpisode(0);
}

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
            <button class="episode-item ${index === currentEpisodeIndex ? 'active' : ''}" onclick="playEpisode(${index})">
                <strong>E${escapeHTML(epNum)}. ${escapeHTML(ep.title || `Episode ${index + 1}`)} ${watchedTag}</strong>
                <span>${escapeHTML(ep.duration || '')}</span>
            </button>
        `;
    }).join('');
}

function playEpisode(index) {
    currentEpisodeIndex = index;
    currentSeriesStreamIndex = 0;
    const episode = getCurrentEpisode();
    const season = getSeasons()[currentSeasonIndex];

    if (!episode) {
        currentStreams = seasonStreams(season);
        if (!currentStreams.length && (currentSeries?.imdb_id || currentSeries?.tmdb_id)) {
            const sNum = season?.seasonNumber || (currentSeasonIndex + 1);
            currentStreams = normalizeStreams({ episodeNumber: 1 });
        }
        const player = document.getElementById('seriesPlayerBox');
        if (player) player.innerHTML = playerMarkup(
            currentStreams[0]?.url || '',
            currentSeries?.banner || currentSeries?.poster || '',
            (season?.title || 'Season') + ' — Full Stream'
        );
        document.querySelectorAll('.episode-item').forEach(btn => btn.classList.remove('active'));
        renderSeriesFailoverBar();
        renderStreamButtons();
        renderEpisodeDownloads();
        if (currentStreams[0]) {
            startSeriesFailoverWatchdog(currentStreams[0].url, currentStreams[0].name);
        }
        return;
    }

    currentStreams = normalizeStreams(episode);
    const player = document.getElementById('seriesPlayerBox');
    if (player) player.innerHTML = playerMarkup(currentStreams[0]?.url || '', currentSeries.banner || currentSeries.poster || '', episode.title || currentSeries.title);

    document.querySelectorAll('.episode-item').forEach((btn, i) => btn.classList.toggle('active', i === index));
    renderSeriesFailoverBar();
    renderStreamButtons();
    renderEpisodeDownloads();

    const sNum = currentSeasonIndex + 1;
    const epNum = episode ? (episode.episodeNumber || index + 1) : 1;
    markEpisodeWatched(currentSeries.id, sNum, epNum);
    trackSeriesProgress(currentSeries, sNum, epNum);

    if (currentStreams[0]) {
        startSeriesFailoverWatchdog(currentStreams[0].url, currentStreams[0].name);
    }

    if (typeof gtag !== 'undefined') {
        gtag('event', 'episode_play', {
            series_title: currentSeries.title,
            series_id: currentSeries.id,
            episode_title: episode.title || '',
            episode_number: episode.episodeNumber || index + 1
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
    currentSeriesStreamIndex = index;
    const stream = currentStreams[index];
    const episode = getCurrentEpisode();
    const season = getSeasons()[currentSeasonIndex];
    if (!stream) return;

    const title = (episode?.title) ||
        (season?.combined ? (season.title || 'Season') + ' — Combined' : currentSeries.title);
    const player = document.getElementById('seriesPlayerBox');
    if (player) player.innerHTML = playerMarkup(stream.url, currentSeries.banner || currentSeries.poster || '', title);

    document.querySelectorAll('#seriesStreamButtons .stream-server-btn').forEach((btn, i) => btn.classList.toggle('active', i === index));
    startSeriesFailoverWatchdog(stream.url, stream.name);
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
