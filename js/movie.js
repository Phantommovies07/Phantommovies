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
    handleClickAd('stream');
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
    updateSEOMeta(movie.title, movie.description || '', movie.poster || movie.banner || '');

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

    loadAndRenderAds('movie');

    document.querySelectorAll('.download-card').forEach(link => {
        link.addEventListener('click', (event) => {
            if (handleClickAd('download', link.href)) event.preventDefault();
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


// ─── ADS RENDERING ───
async function loadAndRenderAds(page) {
    try {
        const response = await fetch('data/content.json');
        if (!response.ok) return;
        const data = await response.json();
        const ads = data.settings && data.settings.ads;
        currentAds = ads;
        if (!ads || ads.enabled === false) return;

        if (page === 'movie') {
            insertAdBefore('#playerBox', 'ad-movie-player-top', ads.moviePlayerTop);
            insertAdBefore('.download-grid', 'ad-movie-downloads', ads.movieDownloads);
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
    if (!currentAds || currentAds.enabled === false) return false;
    const clickAd = currentAds.clickAd;
    if (!clickAd || !clickAd.enabled || !clickAd.url) return false;
    if (type === 'download' && clickAd.applyDownloads === false) return false;
    if (type === 'stream' && !clickAd.applyStreams) return false;
    if (!shouldShowClickAd(clickAd.frequency || 'session')) return false;

    window.open(clickAd.url, '_blank', 'noopener,noreferrer');
    if (targetUrl) setTimeout(() => window.open(targetUrl, '_blank', 'noopener,noreferrer'), 650);
    return !!targetUrl;
}
