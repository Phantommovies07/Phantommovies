// Admin Panel Logic

let seasonCounter = 0;
let episodeCounter = 0;
let editingMovieId = null;

// Check authentication on load
document.addEventListener('DOMContentLoaded', () => {
    setupImagePreviews();
    initTMDBAutoFill();
    addStreamLink();
    addDownloadOption();
    toggleContentType();
    restorePanelStates();

    if (githubAPI.loadCredentials()) {
        showContentSection();
        loadMovies();
        loadAdsSettings();
        loadSiteSettings();
    }
});

// Authenticate with GitHub
async function authenticateGitHub() {
    const username = document.getElementById('githubUsername').value.trim();
    const repo = document.getElementById('githubRepo').value.trim();
    const token = document.getElementById('githubToken').value.trim();

    if (!username || !repo || !token) {
        showAlert('authAlert', 'Please fill in all fields', 'error');
        return;
    }

    const btn = document.getElementById('authBtn');
    btn.disabled = true;
    btn.textContent = 'Connecting...';

    try {
        githubAPI.init(username, repo, token);
        const user = await githubAPI.verifyAuth();
        showAlert('authAlert', `✅ Connected as ${user.login}`, 'success');
        setTimeout(() => {
            showContentSection();
            loadMovies();
            loadAdsSettings();
            loadSiteSettings();
        }, 1000);
    } catch (error) {
        showAlert('authAlert', `❌ ${error.message}`, 'error');
        btn.disabled = false;
        btn.textContent = 'Connect to GitHub';
    }
}

function showContentSection() {
    document.getElementById('authSection').classList.add('hidden');
    document.getElementById('contentSection').classList.remove('hidden');
}

function showAuthSection() {
    document.getElementById('authSection').classList.remove('hidden');
    document.getElementById('contentSection').classList.add('hidden');
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        githubAPI.clearCredentials();
        showAuthSection();
        resetMovieForm();
        document.getElementById('movieListContainer').innerHTML = '';
    }
}

// ─── ADS MANAGEMENT ───
function getAdsFormData() {
    return {
        enabled: document.getElementById('adsEnabled')?.checked !== false,
        clickAd: {
            enabled: document.getElementById('clickAdEnabled')?.checked || false,
            url: document.getElementById('clickAdUrl')?.value.trim() || '',
            frequency: document.getElementById('clickAdFrequency')?.value || 'session',
            applyDownloads: document.getElementById('clickAdDownloads')?.checked !== false,
            applyStreams: document.getElementById('clickAdStreams')?.checked || false
        },
        homeTop: document.getElementById('adHomeTop')?.value || '',
        homeGrid: document.getElementById('adHomeGrid')?.value || '',
        moviePlayerTop: document.getElementById('adMoviePlayerTop')?.value || '',
        movieDownloads: document.getElementById('adMovieDownloads')?.value || '',
        seriesPlayerTop: document.getElementById('adSeriesPlayerTop')?.value || '',
        seriesDownloads: document.getElementById('adSeriesDownloads')?.value || '',
        floatingBottom: document.getElementById('adFloatingBottom')?.value || '',
        popup: document.getElementById('adPopup')?.value || '',
        updatedAt: new Date().toISOString()
    };
}

function setAdsFormData(ads = {}) {
    if (document.getElementById('adsEnabled')) document.getElementById('adsEnabled').checked = ads.enabled !== false;
    const clickAd = ads.clickAd || {};
    if (document.getElementById('clickAdEnabled')) document.getElementById('clickAdEnabled').checked = !!clickAd.enabled;
    if (document.getElementById('clickAdUrl')) document.getElementById('clickAdUrl').value = clickAd.url || '';
    if (document.getElementById('clickAdFrequency')) document.getElementById('clickAdFrequency').value = clickAd.frequency || 'session';
    if (document.getElementById('clickAdDownloads')) document.getElementById('clickAdDownloads').checked = clickAd.applyDownloads !== false;
    if (document.getElementById('clickAdStreams')) document.getElementById('clickAdStreams').checked = !!clickAd.applyStreams;
    setTextareaValue('adHomeTop', ads.homeTop || '');
    setTextareaValue('adHomeGrid', ads.homeGrid || '');
    setTextareaValue('adMoviePlayerTop', ads.moviePlayerTop || '');
    setTextareaValue('adMovieDownloads', ads.movieDownloads || '');
    setTextareaValue('adSeriesPlayerTop', ads.seriesPlayerTop || '');
    setTextareaValue('adSeriesDownloads', ads.seriesDownloads || '');
    setTextareaValue('adFloatingBottom', ads.floatingBottom || '');
    setTextareaValue('adPopup', ads.popup || '');
}

function setTextareaValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value;
}

async function loadAdsSettings() {
    try {
        const content = await githubAPI.getContent();
        setAdsFormData(content.settings?.ads || {});
    } catch (error) {
        console.warn('Ads settings load failed:', error);
    }
}

async function saveAdsSettings() {
    showSpinner(true);
    try {
        await githubAPI.updateAds(getAdsFormData());
        showAlert('contentAlert', '✅ Ads settings saved! Cloudflare Pages will auto-deploy.', 'success');
    } catch (error) {
        showAlert('contentAlert', `❌ Ads save error: ${error.message}`, 'error');
    } finally {
        showSpinner(false);
    }
}


function togglePanel(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('collapsed');
    localStorage.setItem('panel_' + id, el.classList.contains('collapsed') ? 'closed' : 'open');
}

function restorePanelStates() {
    ['siteSettingsBody', 'adsBody', 'tmdbPanelBody', 'tmdbTokenBody'].forEach(id => {
        const el = document.getElementById(id);
        const state = localStorage.getItem('panel_' + id);
        if (!el || !state) return;
        el.classList.toggle('collapsed', state === 'closed');
    });
}

function clearAdsSettings() {
    if (!confirm('All ad codes clear karne hain?')) return;
    setAdsFormData({ enabled: false, clickAd: { enabled: false, url: '', frequency: 'session', applyDownloads: true, applyStreams: false } });
    showAlert('contentAlert', '🧹 Ad fields cleared. Save Ads Settings dabao to GitHub me update hoga.', 'success');
}

// ─── SITE SETTINGS ───
async function loadSiteSettings() {
    try {
        const content = await githubAPI.getContent();
        const settings = content.settings || {};
        const request = settings.request || {};
        const baseUrl = document.getElementById('siteBaseUrl');
        const telegram = document.getElementById('telegramRequestLink');
        const text = document.getElementById('requestButtonText');
        if (baseUrl) baseUrl.value = settings.siteBaseUrl || '';
        if (telegram) telegram.value = request.telegramLink || settings.telegramLink || '';
        if (text) text.value = request.buttonText || '📩 Request on Telegram';
    } catch (error) {
        console.warn('Site settings load failed:', error);
    }
}

async function saveSiteSettings() {
    showSpinner(true);
    try {
        const request = {
            telegramLink: document.getElementById('telegramRequestLink')?.value.trim() || '',
            buttonText: document.getElementById('requestButtonText')?.value.trim() || '📩 Request on Telegram'
        };
        const siteBaseUrl = document.getElementById('siteBaseUrl')?.value.trim().replace(/\/$/, '') || '';
        await githubAPI.updateSiteSettings({ siteBaseUrl, request });
        showAlert('contentAlert', '✅ Site settings saved! Cloudflare Pages will auto-deploy.', 'success');
    } catch (error) {
        showAlert('contentAlert', `❌ Settings save error: ${error.message}`, 'error');
    } finally {
        showSpinner(false);
    }
}


function xmlEscape(value) {
    return String(value || '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&apos;','"':'&quot;'}[c]));
}

async function generateSitemap() {
    const base = document.getElementById('siteBaseUrl')?.value.trim().replace(/\/$/, '');
    if (!base) {
        showAlert('contentAlert', '❌ Pehle Website Base URL save/enter karo', 'error');
        return;
    }
    showSpinner(true);
    try {
        const content = await githubAPI.getContent();
        const items = (content.movies || []).filter(m => m.active !== false);
        const urls = [
            { loc: `${base}/`, priority: '1.0' },
            { loc: `${base}/index.html`, priority: '0.9' },
            { loc: `${base}/about.html`, priority: '0.4' },
            { loc: `${base}/contact.html`, priority: '0.4' },
            { loc: `${base}/privacy.html`, priority: '0.3' },
            { loc: `${base}/terms.html`, priority: '0.3' },
            ...items.map(m => ({
                loc: `${base}/${m.type === 'series' ? 'series.html' : 'movie.html'}?id=${encodeURIComponent(m.id)}`,
                priority: m.trending || m.featured ? '0.8' : '0.6',
                lastmod: m.updatedAt || m.createdAt || new Date().toISOString()
            }))
        ];
        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url>\n    <loc>${xmlEscape(u.loc)}</loc>\n    ${u.lastmod ? `<lastmod>${xmlEscape(String(u.lastmod).slice(0,10))}</lastmod>` : ''}\n    <priority>${u.priority}</priority>\n  </url>`).join('\n')}\n</urlset>\n`;
        await githubAPI.updateSitemap(xml);
        await githubAPI.updateSiteSettings({ siteBaseUrl: base });
        showAlert('contentAlert', '✅ sitemap.xml generated successfully!', 'success');
    } catch (error) {
        showAlert('contentAlert', `❌ Sitemap error: ${error.message}`, 'error');
    } finally {
        showSpinner(false);
    }
}

// ─── TMDB AUTO FILL ───
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/';

function initTMDBAutoFill() {
    const tokenInput = document.getElementById('tmdbToken');
    if (tokenInput) tokenInput.value = localStorage.getItem('tmdb_token') || '';
}

function saveTMDBToken() {
    const token = document.getElementById('tmdbToken').value.trim();
    if (!token) {
        showAlert('contentAlert', '❌ TMDB token paste karo', 'error');
        return;
    }
    localStorage.setItem('tmdb_token', token);
    showAlert('contentAlert', '✅ TMDB token saved in this browser', 'success');
}

function getTMDBToken() {
    return document.getElementById('tmdbToken')?.value.trim() || localStorage.getItem('tmdb_token') || '';
}

function tmdbHeaders() {
    return {
        'Authorization': `Bearer ${getTMDBToken()}`,
        'Content-Type': 'application/json;charset=utf-8'
    };
}

async function searchTMDB() {
    const token = getTMDBToken();
    const query = document.getElementById('tmdbSearchInput').value.trim();
    const type = document.getElementById('contentType')?.value === 'series' ? 'tv' : 'movie';
    const resultsBox = document.getElementById('tmdbResults');

    if (!token) {
        showAlert('contentAlert', '❌ Pehle TMDB Read Access Token save karo', 'error');
        return;
    }
    if (!query) {
        showAlert('contentAlert', '❌ Search name type karo', 'error');
        return;
    }

    resultsBox.innerHTML = '<div class="empty-state">Searching TMDB...</div>';

    try {
        const url = `https://api.themoviedb.org/3/search/${type}?query=${encodeURIComponent(query)}&include_adult=false&language=en-US&page=1`;
        const res = await fetch(url, { headers: tmdbHeaders() });
        if (!res.ok) throw new Error('TMDB search failed. Token check karo.');
        const data = await res.json();
        const results = (data.results || []).slice(0, 12);

        if (!results.length) {
            resultsBox.innerHTML = '<div class="empty-state">No TMDB results found.</div>';
            return;
        }

        resultsBox.innerHTML = results.map(item => {
            const title = type === 'tv' ? item.name : item.title;
            const date = type === 'tv' ? item.first_air_date : item.release_date;
            const year = date ? String(date).slice(0, 4) : 'N/A';
            const poster = item.poster_path ? `${TMDB_IMAGE_BASE}w342${item.poster_path}` : '';
            return `
                <div class="tmdb-card" onclick="selectTMDBResult(${item.id}, '${type}')">
                    ${poster ? `<img src="${poster}" alt="${escapeAttr(title)}">` : '<div class="image-preview">No poster</div>'}
                    <div class="tmdb-card-info">
                        <strong>${escapeAttr(title)}</strong>
                        <span>${year} • ⭐ ${Number(item.vote_average || 0).toFixed(1)}</span>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        resultsBox.innerHTML = '';
        showAlert('contentAlert', `❌ ${error.message}`, 'error');
    }
}

async function selectTMDBResult(tmdbId, type) {
    const token = getTMDBToken();
    if (!token) return;

    showSpinner(true);
    try {
        const endpoint = type === 'tv' ? `tv/${tmdbId}` : `movie/${tmdbId}`;
        const res = await fetch(`https://api.themoviedb.org/3/${endpoint}?language=en-US`, { headers: tmdbHeaders() });
        if (!res.ok) throw new Error('TMDB details load failed');
        const details = await res.json();

        document.getElementById('contentType').value = type === 'tv' ? 'series' : 'movie';
        toggleContentType();

        const title = type === 'tv' ? details.name : details.title;
        const date = type === 'tv' ? details.first_air_date : details.release_date;
        const runtime = type === 'tv' ? (details.episode_run_time?.[0] || '') : details.runtime;
        const duration = runtime ? formatMinutes(runtime) : '';
        const poster = details.poster_path ? `${TMDB_IMAGE_BASE}w500${details.poster_path}` : '';
        const banner = details.backdrop_path ? `${TMDB_IMAGE_BASE}w1280${details.backdrop_path}` : poster;
        const genre = details.genres?.[0]?.name || '';

        setInputValue('title', title || '');
        setSelectValue('genre', genre || 'Drama');
        setInputValue('year', date ? String(date).slice(0, 4) : '');
        setInputValue('duration', type === 'tv' && duration ? `${duration}/ep` : duration);
        setInputValue('rating', details.vote_average ? Number(details.vote_average).toFixed(1) : '');
        setInputValue('poster', poster);
        setInputValue('banner', banner);
        setInputValue('description', details.overview || '');

        // Trigger previews
        document.getElementById('poster').dispatchEvent(new Event('input'));
        document.getElementById('banner').dispatchEvent(new Event('input'));

        if (type === 'tv' && document.getElementById('tmdbImportEpisodes').checked) {
            await importTMDBSeasons(tmdbId, details.seasons || []);
        }

        document.getElementById('tmdbResults').innerHTML = '';
        showAlert('contentAlert', `✅ ${type === 'tv' ? 'Series' : 'Movie'} details auto-filled from TMDB`, 'success');
    } catch (error) {
        showAlert('contentAlert', `❌ ${error.message}`, 'error');
    } finally {
        showSpinner(false);
    }
}

async function importTMDBSeasons(tvId, seasons) {
    const container = document.getElementById('seasonsContainer');
    if (!container) return;
    container.innerHTML = '';

    const realSeasons = seasons.filter(s => s.season_number > 0 && s.episode_count > 0);
    for (const season of realSeasons) {
        try {
            const res = await fetch(`https://api.themoviedb.org/3/tv/${tvId}/season/${season.season_number}?language=en-US`, { headers: tmdbHeaders() });
            if (!res.ok) continue;
            const seasonDetails = await res.json();
            addSeason({
                seasonNumber: seasonDetails.season_number,
                title: seasonDetails.name || `Season ${seasonDetails.season_number}`,
                episodes: (seasonDetails.episodes || []).map(ep => ({
                    episodeNumber: ep.episode_number,
                    title: ep.name || `Episode ${ep.episode_number}`,
                    duration: ep.runtime ? formatMinutes(ep.runtime) : '',
                    streams: [{}],
                    downloads: []
                }))
            });
        } catch (error) {
            console.warn('Season import failed', season.season_number, error);
        }
    }
}

function setInputValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value || '';
}

function setSelectValue(id, value) {
    const select = document.getElementById(id);
    if (!select || !value) return;
    const existing = Array.from(select.options).find(opt => opt.value.toLowerCase() === value.toLowerCase());
    if (existing) {
        select.value = existing.value;
        return;
    }
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
    select.value = value;
}

function formatMinutes(minutes) {
    const m = parseInt(minutes, 10);
    if (!m) return '';
    const h = Math.floor(m / 60);
    const min = m % 60;
    return h ? `${h}h ${min}m` : `${min}m`;
}

function toggleContentType() {
    const type = document.getElementById('contentType')?.value || 'movie';
    const movieBlock = document.getElementById('movieLinksBlock');
    const seriesBlock = document.getElementById('seriesBuilderBlock');
    const formTitle = document.getElementById('formTitle');

    if (type === 'series') {
        movieBlock?.classList.add('hidden');
        seriesBlock?.classList.remove('hidden');
        if (formTitle) formTitle.textContent = 'Add New Series';
        if (!document.querySelector('.season-block')) addSeason();
    } else {
        movieBlock?.classList.remove('hidden');
        seriesBlock?.classList.add('hidden');
        if (formTitle) formTitle.textContent = 'Add New Movie';
    }
}

// ─── IMAGE PREVIEWS ───
function setupImagePreviews() {
    setupImagePreview('poster', 'posterPreview');
    setupImagePreview('banner', 'bannerPreview');
}

function setupImagePreview(inputId, previewId) {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    if (!input || !preview) return;

    input.addEventListener('input', () => {
        const url = input.value.trim();
        if (!url) {
            preview.style.backgroundImage = '';
            preview.textContent = previewId === 'posterPreview' ? 'Poster preview' : 'Banner preview';
            return;
        }
        preview.style.backgroundImage = `url('${url.replace(/'/g, "%27")}')`;
        preview.textContent = '';
    });
}

// ─── MOVIE STREAM LINKS ───
function addStreamLink(data = {}) {
    const container = document.getElementById('streamLinksContainer');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'dynamic-row stream-row';
    row.innerHTML = `
        <div class="row-title">
            <span>🎬 Streaming Option</span>
            <button type="button" class="remove-row" onclick="removeDynamicRow(this, 'stream-row')">Remove</button>
        </div>
        <div class="row-grid-2">
            <div class="form-group">
                <label>Server Name</label>
                <input type="text" class="stream-name" placeholder="Server 1 / Hindi / HD" value="${escapeAttr(data.name || '')}">
            </div>
            <div class="form-group">
                <label>Streaming URL *</label>
                <input type="url" class="stream-url" placeholder="https://streaming-platform.com/movie" value="${escapeAttr(data.url || '')}">
            </div>
        </div>
    `;
    container.appendChild(row);
    updateRowNumbers();
}

function collectStreams(scope = document) {
    return Array.from(scope.querySelectorAll('.stream-row')).map((row, index) => {
        const name = row.querySelector('.stream-name').value.trim() || `Server ${index + 1}`;
        const url = row.querySelector('.stream-url').value.trim();
        return { name, url };
    }).filter(item => item.url);
}

// ─── MOVIE DOWNLOAD OPTIONS ───
function addDownloadOption(data = {}) {
    const container = document.getElementById('downloadOptionsContainer');
    if (!container) return;
    container.appendChild(createDownloadRow(data, 'download-row'));
    updateRowNumbers();
}

function createDownloadRow(data = {}, className = 'download-row') {
    const row = document.createElement('div');
    row.className = `dynamic-row ${className}`;
    row.innerHTML = `
        <div class="row-title">
            <span>⬇️ Download Link</span>
            <button type="button" class="remove-row" onclick="removeAnyRow(this)">Remove</button>
        </div>
        <div class="row-grid-4">
            <div class="form-group">
                <label>Quality</label>
                <select class="download-quality" onchange="toggleCustomQuality(this)">${qualityOptions(data.quality)}</select>
                <input type="text" class="custom-quality" placeholder="Custom quality" value="${escapeAttr(isCustomQuality(data.quality) ? data.quality : '')}" style="display:${isCustomQuality(data.quality) ? 'block' : 'none'}; margin-top:8px;">
            </div>
            <div class="form-group">
                <label>Size</label>
                <input type="number" class="download-size-number" placeholder="900" step="0.01" min="0" value="${escapeAttr(parseSizeNumber(data.size))}">
            </div>
            <div class="form-group">
                <label>Unit</label>
                <select class="download-size-unit">
                    <option value="MB" ${parseSizeUnit(data.size) === 'MB' ? 'selected' : ''}>MB</option>
                    <option value="GB" ${parseSizeUnit(data.size) === 'GB' ? 'selected' : ''}>GB</option>
                    <option value="KB" ${parseSizeUnit(data.size) === 'KB' ? 'selected' : ''}>KB</option>
                </select>
            </div>
            <div class="form-group">
                <label>Button Color</label>
                <input type="color" class="download-color" value="${escapeAttr(data.color || '#5bc4f5')}">
            </div>
        </div>
        <div class="grid-2">
            <div class="form-group">
                <label>Server / Button Name</label>
                <input type="text" class="download-server" placeholder="GDrive / Direct / Fast Server" value="${escapeAttr(data.server || data.label || '')}">
            </div>
            <div class="form-group">
                <label>Download URL</label>
                <input type="url" class="download-url" placeholder="https://example.com/file" value="${escapeAttr(data.url || '')}">
            </div>
        </div>
    `;
    return row;
}

function collectDownloads(scope = document, selector = '.download-row') {
    return Array.from(scope.querySelectorAll(selector)).map(row => {
        const qualitySelect = row.querySelector('.download-quality').value;
        const customQuality = row.querySelector('.custom-quality').value.trim();
        const quality = qualitySelect === 'Custom' ? customQuality : qualitySelect;
        const sizeNumber = row.querySelector('.download-size-number').value.trim();
        const sizeUnit = row.querySelector('.download-size-unit').value;
        const size = sizeNumber ? `${sizeNumber}${sizeUnit}` : '';
        const server = row.querySelector('.download-server').value.trim();
        const url = row.querySelector('.download-url').value.trim();
        const color = row.querySelector('.download-color').value || '#5bc4f5';
        return { quality: quality || 'Download', size, server, url, color };
    }).filter(item => item.url);
}

function qualityOptions(selected = '') {
    const preset = ['360p', '480p', '720p', '1080p', '1440p', '2160p', '4K', 'HEVC', 'WEB-DL', 'BluRay', 'Custom'];
    const selectedValue = isCustomQuality(selected) ? 'Custom' : selected;
    return preset.map(q => `<option value="${q}" ${selectedValue === q ? 'selected' : ''}>${q}</option>`).join('');
}

function isCustomQuality(value) {
    if (!value) return false;
    return !['360p', '480p', '720p', '1080p', '1440p', '2160p', '4K', 'HEVC', 'WEB-DL', 'BluRay'].includes(value);
}

function toggleCustomQuality(select) {
    const input = select.closest('.form-group').querySelector('.custom-quality');
    input.style.display = select.value === 'Custom' ? 'block' : 'none';
    if (select.value === 'Custom') input.focus();
}

function parseSizeNumber(size = '') {
    const match = String(size).match(/[\d.]+/);
    return match ? match[0] : '';
}

function parseSizeUnit(size = '') {
    const upper = String(size).toUpperCase();
    if (upper.includes('GB')) return 'GB';
    if (upper.includes('KB')) return 'KB';
    return 'MB';
}

// ─── SERIES BUILDER ───
function addSeason(data = {}) {
    const container = document.getElementById('seasonsContainer');
    if (!container) return;

    const seasonId = ++seasonCounter;
    const seasonNumber = data.seasonNumber || document.querySelectorAll('.season-block').length + 1;
    const block = document.createElement('div');
    block.className = 'season-block';
    block.dataset.seasonId = seasonId;
    block.innerHTML = `
        <div class="season-head">
            <div class="form-group">
                <label>Season No.</label>
                <input type="number" class="season-number" min="0" value="${escapeAttr(seasonNumber)}">
            </div>
            <div class="form-group">
                <label>Season Name</label>
                <input type="text" class="season-title" placeholder="Season ${seasonNumber}" value="${escapeAttr(data.title || '')}">
            </div>
            <button type="button" class="btn-small btn-danger" onclick="removeAnyRow(this)">Remove Season</button>
        </div>
        <div class="nested-actions">
            <button type="button" class="btn-small btn-secondary" onclick="addEpisode(this)">＋ Add Episode</button>
        </div>
        <div class="episodes-container"></div>
    `;
    container.appendChild(block);

    if (Array.isArray(data.episodes) && data.episodes.length) {
        data.episodes.forEach(ep => addEpisode(block.querySelector('.nested-actions button'), ep));
    } else {
        addEpisode(block.querySelector('.nested-actions button'));
    }
}

function addEpisode(button, data = {}) {
    const seasonBlock = button.closest('.season-block');
    const container = seasonBlock.querySelector('.episodes-container');
    const epId = ++episodeCounter;
    const episodeNumber = data.episodeNumber || container.querySelectorAll('.episode-block').length + 1;

    const block = document.createElement('div');
    block.className = 'episode-block';
    block.dataset.episodeId = epId;
    block.innerHTML = `
        <div class="episode-mini-title">
            <span>Episode ${episodeNumber}</span>
            <button type="button" class="remove-row" onclick="removeAnyRow(this)">Remove Episode</button>
        </div>
        <div class="grid-2">
            <div class="form-group">
                <label>Episode No.</label>
                <input type="number" class="episode-number" min="0" value="${escapeAttr(episodeNumber)}">
            </div>
            <div class="form-group">
                <label>Episode Title</label>
                <input type="text" class="episode-title" placeholder="Episode title" value="${escapeAttr(data.title || '')}">
            </div>
        </div>
        <div class="form-group">
            <label>Episode Duration</label>
            <input type="text" class="episode-duration" placeholder="45m" value="${escapeAttr(data.duration || '')}">
        </div>
        <div class="nested-actions">
            <button type="button" class="btn-small btn-secondary" onclick="addEpisodeStream(this)">＋ Add Episode Stream</button>
            <button type="button" class="btn-small btn-secondary" onclick="addEpisodeDownload(this)">＋ Add Episode Download</button>
        </div>
        <div class="episode-streams"></div>
        <div class="episode-downloads"></div>
    `;
    container.appendChild(block);

    const streams = Array.isArray(data.streams) && data.streams.length ? data.streams : [{}];
    streams.forEach(st => addEpisodeStream(block.querySelector('.nested-actions button'), st));
    (Array.isArray(data.downloads) ? data.downloads : []).forEach(dl => addEpisodeDownload(block.querySelectorAll('.nested-actions button')[1], dl));
}

function addEpisodeStream(button, data = {}) {
    const epBlock = button.closest('.episode-block');
    const container = epBlock.querySelector('.episode-streams');
    const row = document.createElement('div');
    row.className = 'mini-row ep-stream-row';
    row.innerHTML = `
        <div class="row-title">
            <span>🎬 Episode Stream</span>
            <button type="button" class="remove-row" onclick="removeAnyRow(this)">Remove</button>
        </div>
        <div class="row-grid-2">
            <div class="form-group"><label>Server Name</label><input type="text" class="stream-name" placeholder="Server 1" value="${escapeAttr(data.name || '')}"></div>
            <div class="form-group"><label>Stream URL</label><input type="url" class="stream-url" placeholder="https://example.com/episode" value="${escapeAttr(data.url || '')}"></div>
        </div>
    `;
    container.appendChild(row);
}

function addEpisodeDownload(button, data = {}) {
    const epBlock = button.closest('.episode-block');
    const container = epBlock.querySelector('.episode-downloads');
    const row = createDownloadRow(data, 'ep-download-row');
    row.classList.remove('dynamic-row');
    row.classList.add('mini-row');
    container.appendChild(row);
}

function collectSeriesSeasons() {
    return Array.from(document.querySelectorAll('.season-block')).map(seasonBlock => {
        const seasonNumber = parseInt(seasonBlock.querySelector('.season-number').value) || 1;
        const title = seasonBlock.querySelector('.season-title').value.trim() || `Season ${seasonNumber}`;
        const episodes = Array.from(seasonBlock.querySelectorAll('.episode-block')).map(epBlock => {
            const episodeNumber = parseInt(epBlock.querySelector('.episode-number').value) || 1;
            const title = epBlock.querySelector('.episode-title').value.trim() || `Episode ${episodeNumber}`;
            const duration = epBlock.querySelector('.episode-duration').value.trim();
            const streams = collectEpisodeStreams(epBlock);
            const downloads = collectDownloads(epBlock, '.ep-download-row');
            return { episodeNumber, title, duration, streams, downloads };
        }).filter(ep => ep.streams.length > 0 || ep.downloads.length > 0 || ep.title);
        return { seasonNumber, title, episodes };
    }).filter(season => season.episodes.length > 0);
}

function collectEpisodeStreams(epBlock) {
    return Array.from(epBlock.querySelectorAll('.ep-stream-row')).map((row, index) => {
        const name = row.querySelector('.stream-name').value.trim() || `Server ${index + 1}`;
        const url = row.querySelector('.stream-url').value.trim();
        return { name, url };
    }).filter(item => item.url);
}

function removeAnyRow(button) {
    const target = button.closest('.dynamic-row, .mini-row, .episode-block, .season-block');
    if (target) target.remove();
    updateRowNumbers();
}

function removeDynamicRow(button, className) {
    const rows = document.querySelectorAll('.' + className);
    if (className === 'stream-row' && rows.length <= 1) {
        showAlert('contentAlert', '❌ At least one streaming option is required', 'error');
        return;
    }
    removeAnyRow(button);
}

function updateRowNumbers() {
    document.querySelectorAll('.stream-row .row-title span').forEach((el, i) => el.textContent = `🎬 Streaming Option ${i + 1}`);
    document.querySelectorAll('.download-row .row-title span').forEach((el, i) => el.textContent = `⬇️ Download Link ${i + 1}`);
}

function escapeAttr(value) {
    return String(value || '').replace(/[&<>'"]/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char]));
}

function resetMovieForm() {
    document.getElementById('movieForm').reset();
    document.getElementById('active').checked = true;
    if (document.getElementById('trending')) document.getElementById('trending').checked = false;
    document.getElementById('streamLinksContainer').innerHTML = '';
    document.getElementById('downloadOptionsContainer').innerHTML = '';
    document.getElementById('seasonsContainer').innerHTML = '';
    document.getElementById('posterPreview').style.backgroundImage = '';
    document.getElementById('posterPreview').textContent = 'Poster preview';
    document.getElementById('bannerPreview').style.backgroundImage = '';
    document.getElementById('bannerPreview').textContent = 'Banner preview';
    addStreamLink();
    addDownloadOption();
    toggleContentType();
    const btn = document.getElementById('publishBtn');
    const cancel = document.getElementById('cancelEditBtn');
    if (btn) btn.textContent = '🎬 Publish Content';
    if (cancel) cancel.classList.add('hidden');
}


// Handle form submission
document.getElementById('movieForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const contentType = document.getElementById('contentType').value;
    const streams = contentType === 'movie' ? collectStreams(document.getElementById('movieLinksBlock')) : [];
    const downloads = contentType === 'movie' ? collectDownloads(document.getElementById('movieLinksBlock'), '.download-row') : [];
    const seasons = contentType === 'series' ? collectSeriesSeasons() : [];
    const firstEpisode = seasons[0]?.episodes?.[0];

    const movieData = {
        type: contentType,
        title: document.getElementById('title').value.trim(),
        genre: document.getElementById('genre').value,
        year: parseInt(document.getElementById('year').value) || new Date().getFullYear(),
        duration: document.getElementById('duration').value.trim(),
        rating: parseFloat(document.getElementById('rating').value) || 0,
        badge: document.getElementById('badge').value,
        poster: document.getElementById('poster').value.trim(),
        banner: document.getElementById('banner').value.trim(),
        streamLink: contentType === 'movie' ? (streams[0]?.url || '') : (firstEpisode?.streams?.[0]?.url || ''),
        streams: streams,
        downloads: downloads,
        seasons: seasons,
        trailerLink: document.getElementById('trailerLink').value.trim(),
        description: document.getElementById('description').value.trim(),
        featured: document.getElementById('featured').checked,
        trending: document.getElementById('trending').checked,
        active: document.getElementById('active').checked
    };

    if (!movieData.title || !movieData.genre) {
        showAlert('contentAlert', '❌ Title and genre are required', 'error');
        return;
    }

    if (contentType === 'movie' && streams.length === 0) {
        showAlert('contentAlert', '❌ Movie ke liye at least one streaming link required hai', 'error');
        return;
    }

    if (contentType === 'series' && seasons.length === 0) {
        showAlert('contentAlert', '❌ Series ke liye at least one season/episode required hai', 'error');
        return;
    }

    const seriesEpisodeWithoutStream = contentType === 'series' && seasons.some(season => season.episodes.some(ep => ep.streams.length === 0));
    if (seriesEpisodeWithoutStream) {
        showAlert('contentAlert', '❌ Har episode me at least one stream URL daalo', 'error');
        return;
    }

    showSpinner(true);

    try {
        if (editingMovieId) {
            await githubAPI.updateMovie(editingMovieId, movieData);
            showAlert('contentAlert', '✅ Content updated successfully! Cloudflare Pages will auto-deploy.', 'success');
            editingMovieId = null;
        } else {
            await githubAPI.addMovie(movieData);
            showAlert('contentAlert', '🎬 Content published successfully! Cloudflare Pages will auto-deploy.', 'success');
        }
        resetMovieForm();
        setTimeout(() => loadMovies(), 2000);
    } catch (error) {
        showAlert('contentAlert', `❌ Error: ${error.message}`, 'error');
    } finally {
        showSpinner(false);
    }
});

// Load and display content
async function loadMovies() {
    showSpinner(true);

    try {
        const content = await githubAPI.getContent();
        const movies = content.movies || [];
        const container = document.getElementById('movieListContainer');

        if (movies.length === 0) {
            container.innerHTML = '<p style="color: var(--muted); text-align: center; padding: 40px;">No content published yet.</p>';
            showSpinner(false);
            return;
        }

        container.innerHTML = movies.map(movie => {
            const type = movie.type === 'series' ? 'Series' : 'Movie';
            const episodeCount = (movie.seasons || []).reduce((sum, s) => sum + ((s.episodes || []).length), 0);
            const streamCount = movie.type === 'series' ? episodeCount + ' episodes' : `${(movie.streams || (movie.streamLink ? [movie.streamLink] : [])).length} streams`;
            const downloadCount = movie.type === 'series' ? '' : ` • ${(movie.downloads || []).length} downloads`;
            return `
            <div class="movie-item">
                <div class="movie-info">
                    <h3>${movie.title} ${movie.featured ? '⭐' : ''} ${movie.trending ? '🔥' : ''}</h3>
                    <p>${type} • ${movie.genre} • ${movie.year} • ${movie.views || 0} views • ${streamCount}${downloadCount}</p>
                </div>
                <div class="movie-actions">
                    <button class="btn-small btn-secondary" onclick="editMovie('${movie.id}')">Edit</button>
                    <button class="btn-small btn-danger" onclick="deleteMovieConfirm('${movie.id}', '${String(movie.title).replace(/'/g, "\\'")}')">Delete</button>
                </div>
            </div>`;
        }).join('');

    } catch (error) {
        showAlert('contentAlert', `❌ Error loading content: ${error.message}`, 'error');
    } finally {
        showSpinner(false);
    }
}

function deleteMovieConfirm(id, title) {
    if (confirm(`Delete "${title}"? This cannot be undone.`)) deleteMovie(id);
}

async function deleteMovie(id) {
    showSpinner(true);
    try {
        await githubAPI.deleteMovie(id);
        showAlert('contentAlert', '✅ Content deleted successfully!', 'success');
        loadMovies();
    } catch (error) {
        showAlert('contentAlert', `❌ Error: ${error.message}`, 'error');
        showSpinner(false);
    }
}

function showAlert(elementId, message, type) {
    const alert = document.getElementById(elementId);
    alert.className = `alert alert-${type} show`;
    alert.textContent = message;
    setTimeout(() => alert.classList.remove('show'), 5000);
}

function showSpinner(show) {
    const spinner = document.getElementById('spinner');
    if (show) spinner.classList.add('show');
    else spinner.classList.remove('show');
}

function editMovie(id) {
    alert('Edit feature next step me add kar sakte hain. Abhi Add Movie/Series form upgraded hai.');
}

// ─── EDIT EXISTING CONTENT ───
async function editMovie(id) {
    showSpinner(true);
    try {
        const content = await githubAPI.getContent();
        const item = (content.movies || []).find(m => String(m.id) === String(id));
        if (!item) throw new Error('Content not found');
        populateFormForEdit(item);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        showAlert('contentAlert', `✏️ Editing: ${item.title}`, 'info');
    } catch (error) {
        showAlert('contentAlert', `❌ Edit load error: ${error.message}`, 'error');
    } finally {
        showSpinner(false);
    }
}

function populateFormForEdit(item) {
    editingMovieId = item.id;
    setInputValue('contentType', item.type === 'series' ? 'series' : 'movie');
    toggleContentType();
    setInputValue('title', item.title || '');
    setSelectValue('genre', item.genre || 'Drama');
    setInputValue('year', item.year || '');
    setInputValue('duration', item.duration || '');
    setInputValue('rating', item.rating || '');
    setInputValue('badge', item.badge || '');
    setInputValue('poster', item.poster || '');
    setInputValue('banner', item.banner || '');
    setInputValue('trailerLink', item.trailerLink || '');
    setInputValue('description', item.description || '');
    if (document.getElementById('featured')) document.getElementById('featured').checked = !!item.featured;
    if (document.getElementById('trending')) document.getElementById('trending').checked = !!item.trending;
    if (document.getElementById('active')) document.getElementById('active').checked = item.active !== false;

    document.getElementById('poster')?.dispatchEvent(new Event('input'));
    document.getElementById('banner')?.dispatchEvent(new Event('input'));

    document.getElementById('streamLinksContainer').innerHTML = '';
    document.getElementById('downloadOptionsContainer').innerHTML = '';
    document.getElementById('seasonsContainer').innerHTML = '';

    if (item.type === 'series') {
        (item.seasons || []).forEach(season => addSeason(season));
        if (!(item.seasons || []).length) addSeason();
    } else {
        const streams = item.streams && item.streams.length ? item.streams : (item.streamLink ? [{ name: 'Server 1', url: item.streamLink }] : [{}]);
        streams.forEach(st => addStreamLink(st));
        (item.downloads && item.downloads.length ? item.downloads : [{}]).forEach(dl => addDownloadOption(dl));
    }

    const btn = document.getElementById('publishBtn');
    const cancel = document.getElementById('cancelEditBtn');
    if (btn) btn.textContent = '✅ Update Content';
    if (cancel) cancel.classList.remove('hidden');
    updateRowNumbers();
}

function cancelEditMode() {
    editingMovieId = null;
    resetMovieForm();
    const btn = document.getElementById('publishBtn');
    const cancel = document.getElementById('cancelEditBtn');
    if (btn) btn.textContent = '🎬 Publish Content';
    if (cancel) cancel.classList.add('hidden');
    showAlert('contentAlert', 'Edit cancelled', 'info');
}
