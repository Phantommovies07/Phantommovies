// ═══════════════════════════════════════════════════
// PHANTOM MOVIES - SERIES DETAIL PAGE
// ═══════════════════════════════════════════════════

// Anti-Hijack Guard: Prevents third-party stream iframes from redirecting the main website
window.addEventListener('beforeunload', (e) => {
    if (document.activeElement && document.activeElement.tagName === 'IFRAME') {
        e.preventDefault();
        return (e.returnValue = '');
    }
});

let currentSeries = null;
let currentSeasonIndex = 0;
let currentEpisodeIndex = 0;
let currentStreams = [];

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
        // Anti-Sandbox fix: allow-popups, allow-pointer-lock, allow-orientation-lock satisfy provider checks,
        // while omitting allow-top-navigation permanently prevents rogue iframes from hijacking or redirecting the main window.
        return `<iframe class="stream-frame" src="${escapeHTML(url)}" title="${escapeHTML(title)}" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media; accelerometer; gyroscope" referrerpolicy="origin" sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-pointer-lock allow-orientation-lock allow-popups allow-popups-to-escape-sandbox"></iframe>`;
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
    "Server 2 (CineSrc - No Ads)",
    "Server 3 (MoviesAPI - No Ads)",
    "Server 4 (Mapple - No Ads)",
    "Server 5 (AutoEmbed)",
    "Server 6 (VidEasy)",
    "Server 7 (VidLink)",
    "Server 8 (VixSrc)",
    "Server 9 (MultiEmbed)",
    "Server 10 (2Embed)",
    "Server 11 (VidSrc Embed)",
    "Server 12 (111Movies)",
    "Server 13 (PrimeSrc)"
];

function cleanServerLabel(name, index) {
    if (!name || /vidsrc|superembed|autoembed|embedsu|smashy|multiembed|azonahub|netmirror|net27|cinesrc|moviesapi|mapple|videasy/i.test(name)) {
        return SERVER_LABELS[index] || `Server ${index + 1}`;
    }
    return name;
}

function seasonStreams(season) {
    return (Array.isArray(season?.streams) ? season.streams : [])
        .filter(s => s && s.url).map((s, i) => ({ name: cleanServerLabel(s.name, i), url: s.url }));
}

function normalizeStreams(episode) {
    const season = getSeasons()[currentSeasonIndex];
    let raw = [];
    if (season?.combined) raw = seasonStreams(season);
    else if (currentSeries?.combined) raw = seasonStreams(currentSeries);
    else if (Array.isArray(episode?.streams) && episode.streams.length) {
        raw = episode.streams.filter(s => s && s.url).map((s, i) => ({ name: s.name || `Server ${i + 1}`, url: s.url }));
    }

    // Dynamic TV embed fallbacks if tmdb or imdb is available
    const imdb = currentSeries?.imdb_id || '';
    const tmdb = currentSeries?.tmdb_id || '';
    const sNum = season?.seasonNumber || (currentSeasonIndex + 1);
    const eNum = episode?.episodeNumber || (currentEpisodeIndex + 1);

    const dynamicStreams = [];
    if ((imdb || tmdb) && !season?.combined && !currentSeries?.combined) {
        const tvProviders = [];
        if (tmdb) {
            tvProviders.push({ name: "Server 1 (VIP Ultra HD)", url: `https://net27.cc/watch-tmdb/${tmdb}?type=tv&se=${sNum}&ep=${eNum}` });
            tvProviders.push({ name: "Server 2 (CineSrc - No Ads)", url: `https://cinesrc.st/embed/tv/${tmdb}?s=${sNum}&e=${eNum}` });
            tvProviders.push({ name: "Server 3 (MoviesAPI - No Ads)", url: `https://moviesapi.club/tv/${tmdb}-${sNum}-${eNum}` });
            tvProviders.push({ name: "Server 4 (Mapple - No Ads)", url: `https://mapple.tv/embed/tv/${tmdb}/${sNum}/${eNum}` });
            tvProviders.push({ name: "Server 5 (AutoEmbed)", url: `https://player.autoembed.cc/embed/tv/${tmdb}/${sNum}/${eNum}` });
            tvProviders.push({ name: "Server 6 (VidEasy)", url: `https://player.videasy.net/tv/${tmdb}/${sNum}/${eNum}` });
        }
        if (imdb) {
            tvProviders.push({ name: "Server 7 (VidLink)", url: `https://vidlink.pro/tv/${imdb}/${sNum}/${eNum}` });
        }
        if (tmdb) {
            tvProviders.push({ name: "Server 8 (VixSrc)", url: `https://vixsrc.to/embed/tv/${tmdb}/${sNum}/${eNum}` });
        }
        tvProviders.push(
            { name: "Server 9 (MultiEmbed)", url: `https://multiembed.mov/?video_id=${imdb || tmdb}&s=${sNum}&e=${eNum}` },
            { name: "Server 10 (2Embed)", url: `https://www.2embed.cc/embedtv/${imdb || tmdb}&s=${sNum}&e=${eNum}` },
            { name: "Server 11 (VidSrc Embed)", url: `https://vidsrc.me/embed/tv?imdb=${imdb || tmdb}&season=${sNum}&episode=${eNum}` }
        );
        if (tmdb) {
            tvProviders.push({ name: "Server 12 (111Movies)", url: `https://111movies.com/tv/${tmdb}/${sNum}/${eNum}` });
            tvProviders.push({ name: "Server 13 (PrimeSrc)", url: `https://primesrc.net/embed/tv/${tmdb}/${sNum}/${eNum}` });
        }

        tvProviders.forEach(p => {
            if (!raw.some(r => r.url === p.url)) {
                dynamicStreams.push(p);
            }
        });
    }

    // Separate direct NetMirror native stream if present
    const netmirrorStream = raw.find(s => s.url.includes('net27.cc') || s.url.includes('netmirror'));
    const otherRaw = raw.filter(s => s !== netmirrorStream);

    const orderedRaw = [];
    if (netmirrorStream) {
        orderedRaw.push({ name: "Server 1 (VIP Ultra HD)", url: netmirrorStream.url });
    }
    otherRaw.forEach((s, idx) => {
        orderedRaw.push({ name: cleanServerLabel(s.name, orderedRaw.length), url: s.url });
    });

    const merged = orderedRaw.length ? [...orderedRaw, ...dynamicStreams] : dynamicStreams;
    return merged.map((s, i) => ({
        name: cleanServerLabel(s.name, i),
        url: s.url
    }));
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
    if (clean.includes('kmmovies.') || clean.includes('rogmovies.') || clean.includes('vegamovies.')) return false;
    if (clean.includes('magiclinks.lol/download/')) return false;
    if (clean.includes('magiclinks.lol/series/') && clean.includes('?id=')) return false;
    if (isStreamingUrl(clean)) return false;
    return true;
}

function generateEpisodeFallbackDownloads(series, seasonNum = 1, epNum = 1) {
    return [];
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
    return [];
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
                <span id="seriesFailoverText">⚡ Active: ${escapeHTML(activeStream ? activeStream.name : 'Server 1 (HD)')} (Auto-Failover On)</span>
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

    // Timeout Watchdog: If embed is unresponsive or blank after 6.5s, auto-switch to next server
    seriesFailoverWatchdogTimer = setTimeout(() => {
        const iframe = document.querySelector('#seriesPlayerBox .stream-frame');
        if (iframe && iframe.tagName.toLowerCase() === 'iframe') {
            if (currentStreams.length > 1 && currentSeriesStreamIndex === 0) {
                console.log(`[Series Auto-Failover] Server 1 watchdog expired, switching to fast fallback...`);
                autoFailoverSeriesNext('timeout');
            }
        }
    }, 6500);
}

function autoFailoverSeriesNext(reason = 'auto') {
    if (!currentStreams || currentStreams.length <= 1) return;
    if (seriesFailoverWatchdogTimer) clearTimeout(seriesFailoverWatchdogTimer);

    currentSeriesStreamIndex = (currentSeriesStreamIndex + 1) % currentStreams.length;
    const nextStream = currentStreams[currentSeriesStreamIndex];

    const reasonText = reason === 'manual' ? 'Switched to' : 'Auto-switched to';
    updateSeriesFailoverStatus(`⚠️ ${reasonText} ${nextStream.name} (Live)...`, true);

    switchSeriesStream(currentSeriesStreamIndex, true);

    setTimeout(() => {
        updateSeriesFailoverStatus(`⚡ Connected: ${nextStream.name} (Auto-Failover Active)`, false);
    }, 1500);
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

    if (currentStreams.length <= 1) {
        wrap.innerHTML = '';
        return;
    }

    wrap.innerHTML = `<div class="stream-server-row">${currentStreams.map((stream, index) => `
        <button class="stream-server-btn ${index === currentSeriesStreamIndex ? 'active' : ''}" onclick="switchSeriesStream(${index})">${escapeHTML(stream.name)}</button>
    `).join('')}</div>`;
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

    grid.innerHTML = downloads.map((item, index) => {
        const quality = item.quality || item.label || `Option ${index + 1}`;
        const server = item.server || 'Fast Cloud';
        const size = item.size || '';
        const color = item.color || '#5bc4f5';
        const rawUrl = (item.url && !item.url.includes('download.html')) ? item.url : '';
        const epNum = episode?.episodeNumber || (currentEpisodeIndex + 1);
        const sNum = currentSeasonIndex + 1;
        const targetUrl = `download.html?id=${encodeURIComponent(currentSeries.id)}&quality=${encodeURIComponent(quality)}&size=${encodeURIComponent(size)}&url=${encodeURIComponent(rawUrl)}&ep=${epNum}&s=${sNum}&type=series`;

        return `<a class="download-card" href="${targetUrl}" target="_blank" rel="noopener noreferrer" style="--download-color:${escapeHTML(color)}">
            <div>
                <strong>${escapeHTML(quality)}</strong>
                <span>${escapeHTML([server, size].filter(Boolean).join(' • '))}</span>
            </div>
            <em>Download ⬇</em>
        </a>`;
    }).join('');

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
        const cached = sessionStorage.getItem('phantom_content_cache_v3');
        const cacheTime = sessionStorage.getItem('phantom_content_time_v3');
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
        sessionStorage.setItem('phantom_content_cache_v3', JSON.stringify(data));
        sessionStorage.setItem('phantom_content_time_v3', String(Date.now()));
    } catch (_) {}
    return data;
}

async function loadSeriesDetail() {
    const seriesId = getSeriesIdFromURL();
    if (!seriesId) {
        showError('Series ID missing.');
        return;
    }

    try {
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
    } catch (_) {}
}

function markEpisodeWatched(seriesId, seasonNum, epNum) {
    if (!seriesId) return;
    try {
        localStorage.setItem(`phantom_watched_${seriesId}_s${seasonNum}_e${epNum}`, 'true');
    } catch (_) {}
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
    } catch (_) {}
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
    } catch (_) {}
}
