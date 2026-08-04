// Admin Panel Logic

let seasonCounter = 0;
let episodeCounter = 0;

// Check authentication on load
document.addEventListener('DOMContentLoaded', () => {
    setupImagePreviews();
    addStreamLink();
    addDownloadOption();
    toggleContentType();

    if (githubAPI.loadCredentials()) {
        showContentSection();
        loadMovies();
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
        await githubAPI.addMovie(movieData);
        showAlert('contentAlert', '🎬 Content published successfully! Cloudflare Pages will auto-deploy.', 'success');
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
                    <h3>${movie.title} ${movie.featured ? '⭐' : ''}</h3>
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
