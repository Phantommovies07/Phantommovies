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

let currentMovie = null;
let currentStreams = [];

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

function normalizeStreams(movie) {
    if (Array.isArray(movie.streams) && movie.streams.length) {
        return movie.streams.filter(item => item && item.url).map((item, index) => ({
            name: item.name || item.label || `Server ${index + 1}`,
            url: item.url
        }));
    }

    if (movie.streamLink) {
        return [{ name: 'Server 1', url: movie.streamLink }];
    }

    return [];
}

function renderStreamButtons() {
    if (!currentStreams.length || currentStreams.length === 1) return '';
    return `<div class="stream-server-row">${currentStreams.map((stream, index) => `
        <button class="stream-server-btn ${index === 0 ? 'active' : ''}" onclick="switchStream(${index})">${escapeHTML(stream.name)}</button>
    `).join('')}</div>`;
}

function switchStream(index) {
    if (!currentMovie || !currentStreams[index]) return;

    const player = document.getElementById('playerBox');
    if (player) {
        player.innerHTML = playerMarkup(currentMovie, currentStreams[index].url);
    }

    document.querySelectorAll('.stream-server-btn').forEach((btn, i) => {
        btn.classList.toggle('active', i === index);
    });

    if (typeof gtag !== 'undefined') {
        gtag('event', 'stream_server_switch', {
            movie_title: currentMovie.title,
            movie_id: currentMovie.id,
            server: currentStreams[index].name
        });
    }
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
        const color = item.color || '#5bc4f5';
        return `<a class="download-card" href="${escapeHTML(item.url)}" target="_blank" rel="noopener noreferrer" data-quality="${escapeHTML(quality)}" style="--download-color:${escapeHTML(color)}">
            <div>
                <strong>${escapeHTML(quality)}</strong>
                <span>${escapeHTML([server, size].filter(Boolean).join(' • '))}</span>
            </div>
            <em>Download</em>
        </a>`;
    }).join('');
}

function renderMovie(movie) {
    currentMovie = movie;
    currentStreams = normalizeStreams(movie);

    const detail = document.getElementById('movieDetail');
    const banner = movie.banner || movie.poster || '';
    const meta = [movie.genre, movie.year, movie.duration, movie.rating ? `⭐ ${movie.rating}` : ''].filter(Boolean).join(' • ');

    document.title = `${movie.title} - Phantom Movies`;

    detail.innerHTML = `
        <section class="watch-section">
            <div class="detail-hero-bg" style="background-image:url('${escapeHTML(banner)}')"></div>
            <div class="watch-wrap">
                <div class="player-box" id="playerBox">
                    ${playerMarkup(movie, currentStreams[0] ? currentStreams[0].url : '')}
                </div>
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
