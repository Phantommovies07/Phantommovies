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
        let id = '';
        if (u.hostname.includes('youtu.be')) id = u.pathname.slice(1);
        if (u.hostname.includes('youtube.com')) id = u.searchParams.get('v') || u.pathname.split('/embed/')[1] || '';
        return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : '';
    } catch (_) {
        return '';
    }
}

function playerMarkup(movie) {
    const streamLink = movie.streamLink || '';
    const trailerEmbed = getYouTubeEmbed(movie.trailerLink || '');

    if (isDirectVideo(streamLink)) {
        return `<video class="stream-frame" controls playsinline poster="${escapeHTML(movie.banner || movie.poster || '')}">
            <source src="${escapeHTML(streamLink)}">
            Your browser does not support the video tag.
        </video>`;
    }

    if (streamLink) {
        return `<iframe class="stream-frame" src="${escapeHTML(streamLink)}" title="${escapeHTML(movie.title)}" allowfullscreen loading="lazy"></iframe>`;
    }

    if (trailerEmbed) {
        return `<iframe class="stream-frame" src="${escapeHTML(trailerEmbed)}" title="${escapeHTML(movie.title)} trailer" allowfullscreen loading="lazy"></iframe>`;
    }

    return `<div class="stream-placeholder">
        <div>▶</div>
        <p>Streaming link is not available yet.</p>
    </div>`;
}

function normalizeDownloads(movie) {
    if (Array.isArray(movie.downloads) && movie.downloads.length) {
        return movie.downloads.filter(item => item && item.url);
    }

    // Backward compatibility for old content.json entries.
    if (movie.streamLink) {
        return [{ quality: 'Default', size: '', server: 'Main Server', url: movie.streamLink }];
    }

    return [];
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
        return `<a class="download-card" href="${escapeHTML(item.url)}" target="_blank" rel="noopener noreferrer" data-quality="${escapeHTML(quality)}">
            <div>
                <strong>${escapeHTML(quality)}</strong>
                <span>${escapeHTML([server, size].filter(Boolean).join(' • '))}</span>
            </div>
            <em>Download</em>
        </a>`;
    }).join('');
}

function renderMovie(movie) {
    const detail = document.getElementById('movieDetail');
    const banner = movie.banner || movie.poster || '';
    const meta = [movie.genre, movie.year, movie.duration, movie.rating ? `⭐ ${movie.rating}` : ''].filter(Boolean).join(' • ');

    document.title = `${movie.title} - Phantom Movies`;

    detail.innerHTML = `
        <section class="watch-section">
            <div class="detail-hero-bg" style="background-image:url('${escapeHTML(banner)}')"></div>
            <div class="watch-wrap">
                <div class="player-box">
                    ${playerMarkup(movie)}
                </div>
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
        link.addEventListener('click', () => {
            if (typeof gtag !== 'undefined') {
                gtag('event', 'download_option_click', {
                    movie_title: movie.title,
                    movie_id: movie.id,
                    quality: link.dataset.quality || ''
                });
            }
        });
    });

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

async function loadMovieDetail() {
    const movieId = getMovieIdFromURL();
    if (!movieId) {
        showError('Movie ID missing.');
        return;
    }

    try {
        const response = await fetch('data/content.json');
        if (!response.ok) throw new Error('Failed to load content.json');
        const data = await response.json();
        const movies = (data.movies || []).filter(m => m.active !== false);
        const movie = movies.find(m => String(m.id) === String(movieId));

        if (!movie) {
            showError('Movie not found or inactive.');
            return;
        }

        renderMovie(movie);
    } catch (error) {
        console.error(error);
        showError('Unable to load movie details.');
    }
}

loadMovieDetail();
