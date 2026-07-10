// Admin Panel Logic

// Check authentication on load

document.addEventListener('DOMContentLoaded', () => {
    setupImagePreviews();
    addStreamLink();
    addDownloadOption();

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

// ─── DYNAMIC STREAM LINKS ───
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

function collectStreams() {
    return Array.from(document.querySelectorAll('.stream-row')).map((row, index) => {
        const name = row.querySelector('.stream-name').value.trim() || `Server ${index + 1}`;
        const url = row.querySelector('.stream-url').value.trim();
        return { name, url };
    }).filter(item => item.url);
}

// ─── DYNAMIC DOWNLOAD OPTIONS ───
function addDownloadOption(data = {}) {
    const container = document.getElementById('downloadOptionsContainer');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'dynamic-row download-row';
    row.innerHTML = `
        <div class="row-title">
            <span>⬇️ Download Link</span>
            <button type="button" class="remove-row" onclick="removeDynamicRow(this, 'download-row')">Remove</button>
        </div>
        <div class="row-grid-4">
            <div class="form-group">
                <label>Quality</label>
                <select class="download-quality" onchange="toggleCustomQuality(this)">
                    ${qualityOptions(data.quality)}
                </select>
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
    container.appendChild(row);
    updateRowNumbers();
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

function collectDownloads() {
    return Array.from(document.querySelectorAll('.download-row')).map(row => {
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

function removeDynamicRow(button, className) {
    const rows = document.querySelectorAll('.' + className);
    if (className === 'stream-row' && rows.length <= 1) {
        showAlert('contentAlert', '❌ At least one streaming option is required', 'error');
        return;
    }
    button.closest('.dynamic-row').remove();
    updateRowNumbers();
}

function updateRowNumbers() {
    document.querySelectorAll('.stream-row .row-title span').forEach((el, i) => {
        el.textContent = `🎬 Streaming Option ${i + 1}`;
    });
    document.querySelectorAll('.download-row .row-title span').forEach((el, i) => {
        el.textContent = `⬇️ Download Link ${i + 1}`;
    });
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
    document.getElementById('posterPreview').style.backgroundImage = '';
    document.getElementById('posterPreview').textContent = 'Poster preview';
    document.getElementById('bannerPreview').style.backgroundImage = '';
    document.getElementById('bannerPreview').textContent = 'Banner preview';
    addStreamLink();
    addDownloadOption();
}

// Handle form submission
document.getElementById('movieForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const streams = collectStreams();
    const downloads = collectDownloads();

    const movieData = {
        title: document.getElementById('title').value.trim(),
        genre: document.getElementById('genre').value,
        year: parseInt(document.getElementById('year').value) || new Date().getFullYear(),
        duration: document.getElementById('duration').value.trim(),
        rating: parseFloat(document.getElementById('rating').value) || 0,
        badge: document.getElementById('badge').value,
        poster: document.getElementById('poster').value.trim(),
        banner: document.getElementById('banner').value.trim(),
        streamLink: streams[0] ? streams[0].url : '', // backward compatibility
        streams: streams,
        downloads: downloads,
        trailerLink: document.getElementById('trailerLink').value.trim(),
        description: document.getElementById('description').value.trim(),
        featured: document.getElementById('featured').checked,
        active: document.getElementById('active').checked
    };

    if (!movieData.title || !movieData.genre || streams.length === 0) {
        showAlert('contentAlert', '❌ Title, genre and at least one streaming link are required', 'error');
        return;
    }

    const emptyDownloadRows = Array.from(document.querySelectorAll('.download-row')).filter(row => {
        const url = row.querySelector('.download-url').value.trim();
        const size = row.querySelector('.download-size-number').value.trim();
        const server = row.querySelector('.download-server').value.trim();
        const customQuality = row.querySelector('.custom-quality').value.trim();
        const touched = !!(size || server || customQuality || url);
        return touched && !url;
    });

    if (emptyDownloadRows.length) {
        showAlert('contentAlert', '❌ Download row me URL missing hai. Ya URL daalo ya row remove karo.', 'error');
        return;
    }

    showSpinner(true);

    try {
        await githubAPI.addMovie(movieData);
        showAlert('contentAlert', '🎬 Movie published successfully! Cloudflare Pages will auto-deploy.', 'success');
        resetMovieForm();

        setTimeout(() => {
            loadMovies();
        }, 2000);

    } catch (error) {
        showAlert('contentAlert', `❌ Error: ${error.message}`, 'error');
    } finally {
        showSpinner(false);
    }
});

// Load and display movies
async function loadMovies() {
    showSpinner(true);

    try {
        const content = await githubAPI.getContent();
        const movies = content.movies || [];
        const container = document.getElementById('movieListContainer');

        if (movies.length === 0) {
            container.innerHTML = '<p style="color: var(--muted); text-align: center; padding: 40px;">No movies published yet.</p>';
            showSpinner(false);
            return;
        }

        container.innerHTML = movies.map(movie => `
            <div class="movie-item">
                <div class="movie-info">
                    <h3>${movie.title} ${movie.featured ? '⭐' : ''}</h3>
                    <p>${movie.genre} • ${movie.year} • ${movie.views || 0} views • ${(movie.streams || (movie.streamLink ? [movie.streamLink] : [])).length} streams • ${(movie.downloads || []).length} downloads</p>
                </div>
                <div class="movie-actions">
                    <button class="btn-small btn-secondary" onclick="editMovie('${movie.id}')">
                        Edit
                    </button>
                    <button class="btn-small btn-danger" onclick="deleteMovieConfirm('${movie.id}', '${String(movie.title).replace(/'/g, "\\'")}')">
                        Delete
                    </button>
                </div>
            </div>
        `).join('');

    } catch (error) {
        showAlert('contentAlert', `❌ Error loading movies: ${error.message}`, 'error');
    } finally {
        showSpinner(false);
    }
}

function deleteMovieConfirm(id, title) {
    if (confirm(`Delete "${title}"? This cannot be undone.`)) {
        deleteMovie(id);
    }
}

async function deleteMovie(id) {
    showSpinner(true);

    try {
        await githubAPI.deleteMovie(id);
        showAlert('contentAlert', '✅ Movie deleted successfully!', 'success');
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

    setTimeout(() => {
        alert.classList.remove('show');
    }, 5000);
}

function showSpinner(show) {
    const spinner = document.getElementById('spinner');
    if (show) {
        spinner.classList.add('show');
    } else {
        spinner.classList.remove('show');
    }
}

function editMovie(id) {
    alert('Edit feature next step me add kar sakte hain. Abhi Add Movie form upgraded hai.');
}
