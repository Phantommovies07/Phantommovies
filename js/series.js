// ═══════════════════════════════════════════════════
// PHANTOM MOVIES - SERIES DETAIL PAGE
// ═══════════════════════════════════════════════════

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
        return `<iframe class="stream-frame" src="${escapeHTML(url)}" title="${escapeHTML(title)}" allowfullscreen loading="lazy"></iframe>`;
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

function normalizeStreams(episode) {
    if (Array.isArray(episode?.streams) && episode.streams.length) {
        return episode.streams.filter(s => s && s.url).map((s, i) => ({ name: s.name || `Server ${i + 1}`, url: s.url }));
    }
    return [];
}

function normalizeDownloads(episode) {
    return Array.isArray(episode?.downloads) ? episode.downloads.filter(d => d && d.url) : [];
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

    detail.innerHTML = `
        <section class="watch-section">
            <div class="detail-hero-bg" style="background-image:url('${escapeHTML(banner)}')"></div>
            <div class="watch-wrap">
                <div class="player-box" id="seriesPlayerBox"></div>
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
                <p class="detail-desc">${escapeHTML(series.description || 'No description available.')}</p>

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
    loadAndRenderAds('series');

    if (typeof gtag !== 'undefined') {
        gtag('event', 'series_detail_view', {
            movie_title: series.title,
            movie_id: series.id,
            genre: series.genre || ''
        });
    }
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
        list.innerHTML = '<div class="download-empty">No episodes added in this season.</div>';
        return;
    }

    list.innerHTML = episodes.map((ep, index) => `
        <button class="episode-item ${index === currentEpisodeIndex ? 'active' : ''}" onclick="playEpisode(${index})">
            <strong>E${escapeHTML(ep.episodeNumber || index + 1)}. ${escapeHTML(ep.title || `Episode ${index + 1}`)}</strong>
            <span>${escapeHTML(ep.duration || '')}</span>
        </button>
    `).join('');
}

function playEpisode(index) {
    currentEpisodeIndex = index;
    const episode = getCurrentEpisode();
    if (!episode) return;

    currentStreams = normalizeStreams(episode);
    const player = document.getElementById('seriesPlayerBox');
    if (player) player.innerHTML = playerMarkup(currentStreams[0]?.url || '', currentSeries.banner || currentSeries.poster || '', episode.title || currentSeries.title);

    document.querySelectorAll('.episode-item').forEach((btn, i) => btn.classList.toggle('active', i === index));
    renderStreamButtons();
    renderEpisodeDownloads();

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
        <button class="stream-server-btn ${index === 0 ? 'active' : ''}" onclick="switchSeriesStream(${index})">${escapeHTML(stream.name)}</button>
    `).join('')}</div>`;
}

function switchSeriesStream(index) {
    const stream = currentStreams[index];
    const episode = getCurrentEpisode();
    if (!stream || !episode) return;

    const player = document.getElementById('seriesPlayerBox');
    if (player) player.innerHTML = playerMarkup(stream.url, currentSeries.banner || currentSeries.poster || '', episode.title || currentSeries.title);

    document.querySelectorAll('.stream-server-btn').forEach((btn, i) => btn.classList.toggle('active', i === index));
}

function renderEpisodeDownloads() {
    const grid = document.getElementById('episodeDownloads');
    const episode = getCurrentEpisode();
    const downloads = normalizeDownloads(episode);

    if (!grid) return;

    if (!downloads.length) {
        grid.innerHTML = '<div class="download-empty">No download options added for this episode.</div>';
        return;
    }

    grid.innerHTML = downloads.map((item, index) => {
        const quality = item.quality || item.label || `Option ${index + 1}`;
        const server = item.server || '';
        const size = item.size || '';
        const color = item.color || '#5bc4f5';
        return `<a class="download-card" href="${escapeHTML(item.url)}" target="_blank" rel="noopener noreferrer" style="--download-color:${escapeHTML(color)}">
            <div>
                <strong>${escapeHTML(quality)}</strong>
                <span>${escapeHTML([server, size].filter(Boolean).join(' • '))}</span>
            </div>
            <em>Download</em>
        </a>`;
    }).join('');
}

function showError(message) {
    document.getElementById('seriesDetail').innerHTML = `
        <section class="detail-error">
            <div class="empty-state">${escapeHTML(message)}</div>
            <a class="btn-primary" href="index.html">← Back to Home</a>
        </section>
    `;
}

async function loadSeriesDetail() {
    const seriesId = getSeriesIdFromURL();
    if (!seriesId) {
        showError('Series ID missing.');
        return;
    }

    try {
        const response = await fetch('data/content.json');
        if (!response.ok) throw new Error('Failed to load content.json');
        const data = await response.json();
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
    } catch (error) {
        console.error(error);
        showError('Unable to load series details.');
    }
}

loadSeriesDetail();


// ─── ADS RENDERING ───
async function loadAndRenderAds(page) {
    try {
        const response = await fetch('data/content.json');
        if (!response.ok) return;
        const data = await response.json();
        const ads = data.settings && data.settings.ads;
        if (!ads || ads.enabled === false) return;

        if (page === 'series') {
            insertAdBefore('#seriesPlayerBox', 'ad-series-player-top', ads.seriesPlayerTop);
            insertAdBefore('#episodeDownloads', 'ad-series-downloads', ads.seriesDownloads);
        }

        renderFloatingAd(ads.floatingBottom);
        renderPopupAd(ads.popup);
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
