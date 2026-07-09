// Admin Panel Logic

// Check authentication on load
document.addEventListener('DOMContentLoaded', () => {
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
        // Initialize API
        githubAPI.init(username, repo, token);

        // Verify credentials
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

// Show content section
function showContentSection() {
    document.getElementById('authSection').classList.add('hidden');
    document.getElementById('contentSection').classList.remove('hidden');
}

// Show auth section
function showAuthSection() {
    document.getElementById('authSection').classList.remove('hidden');
    document.getElementById('contentSection').classList.add('hidden');
}

// Logout
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        githubAPI.clearCredentials();
        showAuthSection();
        document.getElementById('movieForm').reset();
        document.getElementById('movieListContainer').innerHTML = '';
    }
}

// Parse download options textarea
// Format per line: Quality | Size | URL
function parseDownloadOptions(text) {
    return (text || '')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
            const parts = line.split('|').map(part => part.trim());
            return {
                quality: parts[0] || 'Option',
                size: parts[1] || '',
                url: parts.slice(2).join('|').trim()
            };
        })
        .filter(item => item.url);
}

// Handle form submission
document.getElementById('movieForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const movieData = {
        title: document.getElementById('title').value.trim(),
        genre: document.getElementById('genre').value,
        year: parseInt(document.getElementById('year').value) || new Date().getFullYear(),
        duration: document.getElementById('duration').value.trim(),
        rating: parseFloat(document.getElementById('rating').value) || 0,
        badge: document.getElementById('badge').value,
        poster: document.getElementById('poster').value.trim(),
        banner: document.getElementById('banner').value.trim(),
        streamLink: document.getElementById('streamLink').value.trim(),
        downloads: parseDownloadOptions(document.getElementById('downloadOptions').value),
        trailerLink: document.getElementById('trailerLink').value.trim(),
        description: document.getElementById('description').value.trim(),
        featured: document.getElementById('featured').checked,
        active: document.getElementById('active').checked
    };

    if (!movieData.title || !movieData.genre || !movieData.streamLink) {
        showAlert('contentAlert', '❌ Please fill in all required fields', 'error');
        return;
    }

    const downloadText = document.getElementById('downloadOptions').value.trim();
    if (downloadText && movieData.downloads.length === 0) {
        showAlert('contentAlert', '❌ Download options format is wrong. Use: Quality | Size | URL', 'error');
        return;
    }

    showSpinner(true);

    try {
        await githubAPI.addMovie(movieData);
        
        showAlert('contentAlert', '🎬 Movie published successfully! Cloudflare Pages will auto-deploy.', 'success');
        
        // Reset form
        document.getElementById('movieForm').reset();
        document.getElementById('active').checked = true;

        // Reload movies
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
                    <p>${movie.genre} • ${movie.year} • ${movie.views} views • ${(movie.downloads || []).length} download options</p>
                </div>
                <div class="movie-actions">
                    <button class="btn-small btn-secondary" onclick="editMovie('${movie.id}')">
                        Edit
                    </button>
                    <button class="btn-small btn-danger" onclick="deleteMovieConfirm('${movie.id}', '${movie.title.replace(/'/g, "\\'")}')">
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

// Delete movie with confirmation
function deleteMovieConfirm(id, title) {
    if (confirm(`Delete "${title}"? This cannot be undone.`)) {
        deleteMovie(id);
    }
}

// Delete movie
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

// Show alert message
function showAlert(elementId, message, type) {
    const alert = document.getElementById(elementId);
    alert.className = `alert alert-${type} show`;
    alert.textContent = message;

    setTimeout(() => {
        alert.classList.remove('show');
    }, 5000);
}

// Show/hide spinner
function showSpinner(show) {
    const spinner = document.getElementById('spinner');
    if (show) {
        spinner.classList.add('show');
    } else {
        spinner.classList.remove('show');
    }
}

// Edit movie (you can expand this)
function editMovie(id) {
    alert('Edit functionality - expand this based on your needs');
    // You can implement an edit modal or populate the form with existing data
}
