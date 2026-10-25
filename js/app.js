// ═══════════════════════════════════════════════════
// PHANTOM MOVIES - MAIN APPLICATION (JSON-Based)
// ═══════════════════════════════════════════════════

let allMovies = [];
let featuredMovie = null;
let siteSettings = {};
let heroSlideIndex = 0;
let heroSlideTimer = null;

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
    } catch (_) {}

    const response = await fetch('data/content.json?v=' + Date.now());
    if (!response.ok) throw new Error('Failed to load content');
    const data = await response.json();
    window.PHANTOM_CONTENT_CACHE = data;
    try {
        sessionStorage.setItem('phantom_content_cache_v4', JSON.stringify(data));
        sessionStorage.setItem('phantom_content_time_v4', String(Date.now()));
    } catch (_) {}
    return data;
}

// ─── LOAD MOVIES FROM JSON ───
async function loadMoviesFromJSON() {
    try {
        const data = await getContentData();
        const rawList = (data.movies || []).filter(m => m.active !== false);
        
        // Strict deduplication guard to ensure zero repeating movies
        const seenIds = new Set();
        const seenImdb = new Set();
        const seenTitles = new Set();
        allMovies = [];

        rawList.forEach(m => {
            if (!m || !m.title) return;
            const normTitle = m.title.trim().toLowerCase();
            const imdb = (m.imdb_id || '').trim();
            const id = String(m.id || '').trim();

            if (id && seenIds.has(id)) return;
            if (imdb && seenImdb.has(imdb)) return;
            if (normTitle && seenTitles.has(normTitle)) return;

            if (id) seenIds.add(id);
            if (imdb) seenImdb.add(imdb);
            if (normTitle) seenTitles.add(normTitle);

            allMovies.push(m);
        });

        siteSettings = data.settings || {};
        
        // Track page view with GA4
        if (typeof gtag !== 'undefined') {
            gtag('event', 'page_view', {
                page_title: 'Home',
                page_location: window.location.href
            });
        }
        
        afterMoviesLoaded();
        
    } catch (error) {
        console.error('Error loading movies:', error);
        loadDemoMovies();
    }
}

// ─── DEMO MOVIES (Fallback if JSON fails) ───
function loadDemoMovies() {
    allMovies = [
        {
            id: '1',
            title: 'Neon Void',
            genre: 'Sci-Fi',
            year: 2025,
            rating: 8.7,
            duration: '2h 04m',
            poster: '',
            streamLink: '',
            badge: '4K',
            views: 9600,
            featured: true,
            description: 'A cyberpunk odyssey through the digital underworld where reality itself is questioned.'
        },
        {
            id: '2',
            title: 'Ghost Protocol',
            genre: 'Action',
            year: 2024,
            rating: 9.0,
            duration: '2h 32m',
            poster: '',
            streamLink: '',
            badge: 'HOT',
            views: 8800,
            description: 'A rogue agent goes off-grid to stop a nuclear threat with no support.'
        },
        {
            id: '3',
            title: 'Crimson Echo',
            genre: 'Horror',
            year: 2025,
            rating: 8.2,
            duration: '1h 54m',
            poster: '',
            streamLink: '',
            badge: '',
            views: 6000,
            description: 'A family discovers their dream home has a terrifying dark past.'
        },
        {
            id: '4',
            title: 'Solar Drift',
            genre: 'Sci-Fi',
            year: 2024,
            rating: 7.9,
            duration: '2h 12m',
            poster: '',
            streamLink: '',
            badge: 'NEW',
            views: 6700,
            description: "Humanity's last colony ship drifts off course into the unknown."
        },
        {
            id: '5',
            title: 'Silent Blade',
            genre: 'Thriller',
            year: 2025,
            rating: 8.5,
            duration: '2h 01m',
            poster: '',
            streamLink: '',
            badge: 'HOT',
            views: 8100,
            description: 'An assassin questions her next mission in this gripping thriller.'
        },
        {
            id: '6',
            title: 'Amber Skies',
            genre: 'Drama',
            year: 2024,
            rating: 8.9,
            duration: '1h 48m',
            poster: '',
            streamLink: '',
            badge: '',
            views: 7400,
            description: 'A powerful coming-of-age story set in a dying Midwestern town.'
        }
    ];
    
    afterMoviesLoaded();
}

function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
        loadingScreen.classList.add('hide');
        setTimeout(() => { loadingScreen.style.display = 'none'; }, 400);
    }
}

// ─── AFTER MOVIES LOADED ───
function afterMoviesLoaded() {
    // Update hero exact counts
    const movieCount = allMovies.filter(m => m.type !== 'series').length;
    const seriesCount = allMovies.filter(m => m.type === 'series').length;
    const heroMoviesCountEl = document.getElementById('heroMoviesCount');
    const heroSeriesCountEl = document.getElementById('heroSeriesCount');
    const heroCountEl = document.getElementById('heroCount');
    if (heroMoviesCountEl) heroMoviesCountEl.textContent = movieCount + '+';
    if (heroSeriesCountEl) heroSeriesCountEl.textContent = seriesCount + '+';
    if (heroCountEl) heroCountEl.textContent = allMovies.length + '+';
    
    // Set featured movie
    const feat = allMovies.find(m => m.featured) || allMovies[0];
    if (feat) setFeatured(feat);
    
    // Render home content
    renderCategoryFilters();
    renderContinueWatching();
    renderWatchlist();
    renderTrending();
    renderHeroSlider();
    renderMovies(allMovies);
    setupRequestButton();
    initThemeToggle();
    initSearchToggle();
    initRichSearch();
    initPWA();
    
    // Hide loading screen immediately - no artificial delay!
    hideLoadingScreen();

    // Direct ad injection without network refetch
    if (siteSettings.ads) applyAds(siteSettings.ads, 'home');
    
    // Track with GA4
    if (typeof gtag !== 'undefined') {
        gtag('event', 'movies_loaded', {
            'total_movies': allMovies.length
        });
    }
}

// ─── SET FEATURED MOVIE ───
function setFeatured(m) {
    featuredMovie = m;
    
    document.getElementById('featTitle').textContent = m.title.toUpperCase();
    document.getElementById('featDesc').textContent = m.description || '';
    
    if (m.poster && m.poster.trim() !== '') {
        const el = document.getElementById('featPosterEl');
        el.style.backgroundImage = 'url(' + m.poster + ')';
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
    }
}


// ─── TRENDING HELPERS ───
function getTrendingMovies(limit = 6) {
    const tagged = allMovies.filter(m => m.trending || m.featured || ['TRENDING', 'HOT', 'NEW', '4K'].includes(String(m.badge || '').toUpperCase()));
    const source = tagged.length ? tagged : allMovies;
    return [...source]
        .sort((a, b) => {
            const aTrendBonus = (a.trending || String(a.badge || '').toUpperCase() === 'TRENDING') ? 500000 : 0;
            const bTrendBonus = (b.trending || String(b.badge || '').toUpperCase() === 'TRENDING') ? 500000 : 0;
            const aScore = aTrendBonus + Number(a.views || 0) + Number(a.rating || 0) * 100;
            const bScore = bTrendBonus + Number(b.views || 0) + Number(b.rating || 0) * 100;
            return bScore - aScore;
        })
        .slice(0, limit);
}

let heroSlidesList = [];
let currentCategoryFilter = 'all';
let currentGenreFilter = 'All';
let currentSortMethod = 'popular';

function renderTrending() {
    const grid = document.getElementById('trendingGrid');
    if (!grid) return;

    const trending = getTrendingMovies(10);
    if (!trending.length) {
        grid.innerHTML = '<div class="empty-state">🔥 No trending titles yet</div>';
        return;
    }

    grid.innerHTML = trending.map((m, idx) => movieCard(m, true, idx + 1)).join('');
    bindMovieCards(grid);
}

function updateHeroSpotlight(index) {
    if (!heroSlidesList || !heroSlidesList.length) return;
    heroSlideIndex = ((index % heroSlidesList.length) + heroSlidesList.length) % heroSlidesList.length;
    const m = heroSlidesList[heroSlideIndex];
    if (!m) return;

    // 1. Backdrop
    const backdrop = document.getElementById('heroBackdrop');
    if (backdrop) {
        const bgImg = m.banner || m.poster || '';
        if (bgImg) {
            backdrop.style.backgroundImage = `url("${bgImg}")`;
            backdrop.classList.add('zoom');
        }
    }

    // 2. Title & Tag
    const titleEl = document.getElementById('heroTitle');
    if (titleEl) {
        titleEl.textContent = m.title;
    }

    const tagEl = document.getElementById('heroTag');
    if (tagEl) {
        if (m.type === 'series') {
            tagEl.textContent = '📺 Featured Series';
        } else if (m.badge) {
            tagEl.textContent = `🔥 ${m.badge}`;
        } else {
            tagEl.textContent = '🔥 Spotlight Blockbuster';
        }
    }

    // 3. Metadata row
    const metaRow = document.getElementById('heroMetaRow');
    if (metaRow) {
        metaRow.style.display = 'flex';
        const ratingEl = document.getElementById('heroRating');
        if (ratingEl) ratingEl.textContent = `⭐ ${m.rating || '8.5'}`;

        const yearEl = document.getElementById('heroYear');
        if (yearEl) yearEl.textContent = `${m.year || '2025'}`;

        const durEl = document.getElementById('heroDuration');
        if (durEl) durEl.textContent = `${m.duration || (m.type === 'series' ? 'Web Series' : '2h 15m')}`;

        const qualityEl = document.getElementById('heroQuality');
        if (qualityEl) qualityEl.textContent = `${m.quality || m.badge || '4K UHD'}`;

        const torrentEl = document.getElementById('heroTorrentBadge');
        if (torrentEl) {
            torrentEl.style.display = (m.torrent && m.torrent.magnet) ? 'inline-flex' : 'none';
        }
    }

    // 4. Description
    const descEl = document.getElementById('heroDesc');
    if (descEl) {
        descEl.textContent = m.description || `Stream or fast download ${m.title} in ultra-crisp 4K quality with multi-server and P2P torrent acceleration.`;
    }

    // 5. Watchlist Button Status
    const isSaved = getWatchlist().some(x => String(x.id) === String(m.id));
    const wlIcon = document.getElementById('heroWatchlistIcon');
    if (wlIcon) wlIcon.textContent = isSaved ? '❤️' : '🔖';
    const wlBtn = document.getElementById('heroWatchlistBtn');
    if (wlBtn) wlBtn.title = isSaved ? 'Remove from Watchlist' : 'Add to Watchlist';

    // 6. Dot Indicators
    const dots = document.querySelectorAll('.hero-dot');
    dots.forEach((dot, idx) => {
        dot.classList.toggle('active', idx === heroSlideIndex);
    });

    // 7. Right-side slider thumbnails
    const slides = document.querySelectorAll('.hero-slide');
    slides.forEach((s, idx) => {
        s.classList.toggle('active', idx === heroSlideIndex);
    });
}

function renderHeroSlider() {
    const slider = document.getElementById('heroSlider');
    const manualSlides = allMovies.filter(m => m.heroSlide);
    heroSlidesList = (manualSlides.length ? manualSlides : getTrendingMovies(7)).slice(0, 7);
    if (!heroSlidesList.length) {
        if (slider) slider.innerHTML = '<div class="empty-state">No trending titles yet</div>';
        return;
    }

    if (slider) {
        slider.innerHTML = heroSlidesList.map((m, index) => {
            const banner = m.banner || m.poster || '';
            return `<div class="hero-slide ${index === 0 ? 'active' : ''}" data-id="${m.id}" data-idx="${index}" onclick="goToHeroSlide(${index})">
                ${banner ? `<img src="${banner}" alt="${m.title}" loading="lazy">` : '<div class="slide-fallback">🎬</div>'}
                <div class="slide-overlay"><span>${m.type === 'series' ? 'Series' : 'Movie'}</span></div>
            </div>`;
        }).join('');
    }

    // Indicators
    const indContainer = document.getElementById('heroIndicators');
    if (indContainer) {
        indContainer.innerHTML = heroSlidesList.map((_, i) => `<div class="hero-dot ${i === 0 ? 'active' : ''}" onclick="goToHeroSlide(${i})"></div>`).join('');
    }

    updateHeroSpotlight(0);

    if (heroSlideTimer) clearInterval(heroSlideTimer);
    heroSlideTimer = setInterval(() => moveHeroSlide(1), 5500);
}

function goToHeroSlide(index) {
    if (heroSlideTimer) {
        clearInterval(heroSlideTimer);
        heroSlideTimer = setInterval(() => moveHeroSlide(1), 5500);
    }
    updateHeroSpotlight(index);
}

function moveHeroSlide(direction) {
    if (!heroSlidesList || !heroSlidesList.length) return;
    const nextIdx = (heroSlideIndex + direction + heroSlidesList.length) % heroSlidesList.length;
    goToHeroSlide(nextIdx);
}

function watchCurrentHeroSlide() {
    if (!heroSlidesList || !heroSlidesList[heroSlideIndex]) {
        smoothScroll('#movies');
        return;
    }
    openMoviePage(heroSlidesList[heroSlideIndex]);
}

function downloadCurrentHeroSlide() {
    if (!heroSlidesList || !heroSlidesList[heroSlideIndex]) {
        smoothScroll('#movies');
        return;
    }
    const m = heroSlidesList[heroSlideIndex];
    const targetUrl = (m.type === 'series' ? 'series.html?id=' : 'movie.html?id=') + encodeURIComponent(m.id) + '#downloads';
    window.location.href = targetUrl;
}

function toggleHeroWatchlist() {
    if (!heroSlidesList || !heroSlidesList[heroSlideIndex]) return;
    const m = heroSlidesList[heroSlideIndex];
    let list = getWatchlist();
    const existingIndex = list.findIndex(x => String(x.id) === String(m.id));
    if (existingIndex >= 0) {
        list.splice(existingIndex, 1);
        showToast('Removed from Watchlist');
    } else {
        list.unshift({
            id: m.id,
            title: m.title,
            type: m.type || 'movie',
            poster: m.poster || m.banner || '',
            rating: m.rating || '8.5'
        });
        showToast('Added to Watchlist ❤️');
    }
    localStorage.setItem('phantom_watchlist', JSON.stringify(list));
    renderWatchlist();
    updateHeroSpotlight(heroSlideIndex);
}

function renderMobileSpotlight(items) {
    const stack = document.getElementById('mobileSpotlightStack');
    if (!stack) return;
    const spotlight = (items || []).slice(0, 3);
    if (!spotlight.length) {
        stack.innerHTML = '';
        return;
    }
    stack.innerHTML = spotlight.map((m, index) => {
        const img = m.poster || m.banner || '';
        return `<button class="spotlight-card spotlight-${index + 1}" type="button" onclick="openMoviePageById('${m.id}')" aria-label="Open ${m.title}">
            ${img ? `<img src="${img}" alt="${m.title}">` : '<span>🎬</span>'}
        </button>`;
    }).join('') + '<div class="spotlight-glow"></div>';
}

function openMoviePageById(id) {
    const movie = allMovies.find(m => String(m.id) === String(id));
    if (movie) openMoviePage(movie);
}

function bindMovieCards(scope = document) {
    scope.querySelectorAll('.movie-card').forEach(card => {
        if (card.dataset.bound === '1') return;
        card.dataset.bound = '1';
        card.addEventListener('click', function(e) {
            const movieId = this.dataset.id;
            const movie = allMovies.find(x => String(x.id) === String(movieId));
            if (movie) openMoviePage(movie);
        });
    });
}

function initCategoryTabs() {
    const tabsBar = document.getElementById('categoryTabsBar');
    if (!tabsBar || tabsBar.dataset.ready === '1') return;
    tabsBar.dataset.ready = '1';

    tabsBar.addEventListener('click', (e) => {
        const tab = e.target.closest('.cat-tab');
        if (!tab) return;

        tabsBar.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        currentCategoryFilter = tab.dataset.filter || 'all';
        applyFiltersAndSort();

        if (typeof gtag !== 'undefined') {
            gtag('event', 'category_tab_click', { filter: currentCategoryFilter });
        }
    });
}

function renderCategoryFilters() {
    const row = document.getElementById('genreRow');
    if (!row) return;

    initCategoryTabs();

    const genres = [...new Set(allMovies.map(m => m.genre).filter(Boolean))]
        .filter(g => !['Movie', 'Tv Series'].includes(g))
        .sort();

    const pills = [
        { label: 'All Genres', genre: 'All' },
        ...genres.map(g => ({ label: g, genre: g }))
    ];

    row.innerHTML = pills.map((p, i) => `
        <div class="genre-pill ${i === 0 ? 'active' : ''}" data-genre="${p.genre}">${p.label}</div>
    `).join('');
}

function applyCatalogSort(sortType) {
    currentSortMethod = sortType || 'popular';
    applyFiltersAndSort();
    if (typeof gtag !== 'undefined') {
        gtag('event', 'catalog_sort', { sort_method: currentSortMethod });
    }
}

function applyFiltersAndSort() {
    let result = [...allMovies];

    // Primary Category Tab Filter
    if (currentCategoryFilter === 'movie') {
        result = result.filter(m => m.type !== 'series');
    } else if (currentCategoryFilter === 'series') {
        result = result.filter(m => m.type === 'series');
    } else if (currentCategoryFilter === 'bollywood_new') {
        result = result.filter(m => m.category === 'bollywood_new' || (m.industry === 'Bollywood' && (m.year >= 2022 || !m.year)) || (m.tags && m.tags.includes('bollywood_new')));
    } else if (currentCategoryFilter === 'south_new') {
        result = result.filter(m => m.category === 'south_new' || (m.industry === 'South' && (m.year >= 2022 || !m.year)) || (m.tags && m.tags.includes('south_new')));
    } else if (currentCategoryFilter === 'torrent') {
        result = result.filter(m => Boolean(m.torrent && m.torrent.magnet));
    } else if (currentCategoryFilter === 'trending') {
        result = getTrendingMovies(100);
    }

    // Secondary Genre Pill Filter
    if (currentGenreFilter && currentGenreFilter !== 'All' && currentGenreFilter !== 'All Genres') {
        result = result.filter(m => (m.genre || '').toLowerCase() === currentGenreFilter.toLowerCase());
    }

    // Sorting
    if (currentSortMethod === 'rating') {
        result.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));
    } else if (currentSortMethod === 'newest') {
        result.sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
    } else if (currentSortMethod === 'title') {
        result.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else {
        // 'popular' default: trend bonus + views + rating
        result.sort((a, b) => {
            const aTrend = (a.trending || String(a.badge || '').toUpperCase() === 'TRENDING') ? 500000 : 0;
            const bTrend = (b.trending || String(b.badge || '').toUpperCase() === 'TRENDING') ? 500000 : 0;
            const aScore = aTrend + Number(a.views || 0) + Number(a.rating || 0) * 100;
            const bScore = bTrend + Number(b.views || 0) + Number(b.rating || 0) * 100;
            return bScore - aScore;
        });
    }

    renderMovies(result, true);
}

function filterContent(pill) {
    applyFiltersAndSort();
    return currentFilteredMovies;
}

function setupRequestButton() {
    const btn = document.getElementById('requestBtn');
    if (!btn) return;
    const request = siteSettings.request || {};
    const link = request.telegramLink || siteSettings.telegramLink || '';
    if (link) {
        btn.href = link;
        btn.textContent = request.buttonText || '📩 Request on Telegram';
    } else {
        btn.href = 'admin.html';
        btn.textContent = '📩 Request Link Coming Soon';
        btn.removeAttribute('target');
    }
}


function initSearchToggle() {
    const wrap = document.querySelector('.search-wrap');
    const btn = document.getElementById('searchToggle');
    const input = document.getElementById('searchInput');
    if (!wrap || !btn || !input || btn.dataset.ready === '1') return;
    btn.dataset.ready = '1';
    btn.addEventListener('click', () => {
        wrap.classList.toggle('open');
        if (wrap.classList.contains('open')) setTimeout(() => input.focus(), 50);
    });
    input.addEventListener('focus', () => wrap.classList.add('open'));
}

// ─── THEME TOGGLE ───
function initThemeToggle() {
    const btn = document.getElementById('themeToggle');
    if (!btn || btn.dataset.ready === '1') return;
    btn.dataset.ready = '1';

    const saved = localStorage.getItem('site_theme') || 'dark';
    applyTheme(saved);

    btn.addEventListener('click', () => {
        const next = document.body.classList.contains('light-theme') ? 'dark' : 'light';
        localStorage.setItem('site_theme', next);
        applyTheme(next);
    });
}

function applyTheme(theme) {
    document.body.classList.toggle('light-theme', theme === 'light');
    const btn = document.getElementById('themeToggle');
    if (btn) btn.textContent = theme === 'light' ? '☀️' : '🌙';
}

// ─── RENDER MOVIES (PROGRESSIVE CHUNKED RENDERING) ───
const CHUNK_SIZE = 24;
let currentFilteredMovies = [];
let currentRenderedCount = 0;
let scrollObserver = null;

function renderMovies(movies, reset = true) {
    const grid = document.getElementById('movieGrid');
    if (!grid) return;

    if (reset) {
        currentFilteredMovies = movies || [];
        currentRenderedCount = 0;
        grid.innerHTML = '';
    }

    if (!currentFilteredMovies || currentFilteredMovies.length === 0) {
        grid.innerHTML = '<div class="empty-state">🎬 No movies found</div>';
        return;
    }

    const nextChunk = currentFilteredMovies.slice(currentRenderedCount, currentRenderedCount + CHUNK_SIZE);
    if (nextChunk.length) {
        const oldSentinel = document.getElementById('gridSentinel');
        if (oldSentinel) oldSentinel.remove();

        const chunkHtml = nextChunk.map(m => movieCard(m)).join('');
        grid.insertAdjacentHTML('beforeend', chunkHtml);
        currentRenderedCount += nextChunk.length;
        bindMovieCards(grid);

        if (currentRenderedCount < currentFilteredMovies.length) {
            const sentinel = document.createElement('div');
            sentinel.id = 'gridSentinel';
            sentinel.style.width = '100%';
            sentinel.style.height = '60px';
            sentinel.style.gridColumn = '1 / -1';
            sentinel.style.display = 'flex';
            sentinel.style.alignItems = 'center';
            sentinel.style.justifyContent = 'center';
            sentinel.innerHTML = '<span style="color:var(--muted);font-size:12px;letter-spacing:1px;opacity:0.8;">⚡ Scroll to reveal more titles</span>';
            grid.appendChild(sentinel);

            setupScrollObserver(sentinel);
        }
    }
}

function setupScrollObserver(sentinel) {
    if (scrollObserver) scrollObserver.disconnect();
    scrollObserver = new IntersectionObserver((entries) => {
        if (entries[0] && entries[0].isIntersecting) {
            scrollObserver.disconnect();
            renderMovies(null, false);
        }
    }, { rootMargin: '350px 0px' });
    scrollObserver.observe(sentinel);
}

// ─── MOVIE CARD TEMPLATE ───
function movieCard(m, forceTrendingBadge = false, rankNumber = null) {
    const badgeText = forceTrendingBadge ? 'TRENDING' : m.badge;
    const badge = badgeText ? `<div class="m-badge">${badgeText}</div>` : '';
    const img = m.poster && m.poster.trim() !== '' 
        ? `<img src="${m.poster}" alt="${m.title}" loading="lazy" decoding="async">` 
        : '';
    
    const isDual = (m.title && /dual|hindi/i.test(m.title)) || (m.tags && /dual|hindi/i.test(m.tags.join(' '))) || (m.industry === 'Bollywood' || m.industry === 'South');
    const is4K = (m.badge && /4k/i.test(m.badge)) || (m.title && /4k|2160p/i.test(m.title)) || (Array.isArray(m.downloads) && m.downloads.some(d => /4k|2160p/i.test(d.quality || '')));
    const hasTorrent = Boolean(m.torrent && m.torrent.magnet);
    const ratingTag = m.rating ? `<div class="card-pill-rating">⭐ ${m.rating}</div>` : '';

    const pills = [];
    if (is4K) pills.push('<span class="card-pill card-pill-4k">4K UHD</span>');
    if (hasTorrent) pills.push('<span class="card-pill card-pill-torrent">🧲 Torrent</span>');
    if (isDual) pills.push('<span class="card-pill card-pill-dual">Dual Audio</span>');

    const pillStack = pills.length ? `<div class="card-pill-stack">${pills.join('')}</div>` : '';
    const rankEl = rankNumber ? `<div class="trending-rank-number">${rankNumber}</div>` : '';

    return `<div class="movie-card" data-id="${m.id}">
        ${rankEl}
        <div class="movie-poster">
            <div class="poster-ph">${img}</div>
            <div class="card-hover-overlay">
                <div class="card-play-btn"><span class="play-ico"></span></div>
                <span class="card-quick-stream">${m.type === 'series' ? 'Watch Series' : 'Stream Now'}</span>
            </div>
            ${badge}
            ${ratingTag}
            ${pillStack}
        </div>
        <div class="movie-info">
            <div class="movie-name">${m.title}</div>
            <div style="font-size:10px;color:var(--muted)">${m.type === 'series' ? 'Series' : 'Movie'} • ${m.genre || 'Unknown'} • ${m.year || 'N/A'}</div>
        </div>
    </div>`;
}

// ─── GENRE FILTER ───
document.addEventListener('DOMContentLoaded', function() {
    initThemeToggle();
    initSearchToggle();
    initCategoryTabs();
    const genreRow = document.getElementById('genreRow');
    
    if (genreRow && genreRow.dataset.ready !== '1') {
        genreRow.dataset.ready = '1';
        genreRow.addEventListener('click', function(e) {
            const pill = e.target.closest('.genre-pill');
            if (!pill) return;
            
            genreRow.querySelectorAll('.genre-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');

            currentGenreFilter = pill.dataset.genre || 'All';
            applyFiltersAndSort();

            if (typeof gtag !== 'undefined') {
                gtag('event', 'genre_filter', {
                    'genre': currentGenreFilter
                });
            }
        });
    }
});

// ─── RICH SEARCH & KEYBOARD AUTOCOMPLETE ───
let searchTimeout;

function initRichSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchResults = document.getElementById('searchResults');
    const searchWrap = document.querySelector('.search-wrap');
    if (!searchInput || !searchResults || searchInput.dataset.ready === '1') return;
    searchInput.dataset.ready = '1';

    let selectedIndex = -1;

    searchInput.addEventListener('input', function() {
        clearTimeout(searchTimeout);
        const query = this.value.trim().toLowerCase();
        selectedIndex = -1;

        if (!query) {
            searchResults.classList.remove('show');
            searchResults.innerHTML = '';
            return;
        }

        searchTimeout = setTimeout(() => {
            const matches = allMovies.filter(m => 
                (m.title || '').toLowerCase().includes(query) ||
                (m.genre || '').toLowerCase().includes(query) ||
                (m.category || '').toLowerCase().includes(query)
            ).slice(0, 8);

            if (matches.length === 0) {
                searchResults.innerHTML = `<div style="padding:16px;text-align:center;color:var(--muted);font-size:12px;">No titles found for "<strong>${query}</strong>"</div>`;
                searchResults.classList.add('show');
                return;
            }

            searchResults.innerHTML = matches.map((m, idx) => `
                <div class="search-item" data-id="${m.id}" data-idx="${idx}">
                    <div class="search-thumb">
                        ${m.poster ? `<img src="${m.poster}" alt="${m.title}">` : '🎬'}
                    </div>
                    <div>
                        <div class="search-meta-title">${m.title}</div>
                        <div class="search-meta-sub">
                            <span>${m.type === 'series' ? '📺 Series' : '🎬 Movie'}</span>
                            <span>•</span>
                            <span>${m.year || 'N/A'}</span>
                            ${m.rating ? `<span>• ⭐ ${m.rating}</span>` : ''}
                        </div>
                    </div>
                </div>
            `).join('');

            searchResults.querySelectorAll('.search-item').forEach(item => {
                item.addEventListener('click', function() {
                    const mId = this.dataset.id;
                    const found = allMovies.find(x => String(x.id) === String(mId));
                    if (found) {
                        openMoviePage(found);
                        searchResults.classList.remove('show');
                        searchInput.value = '';
                    }
                });
            });

            searchResults.classList.add('show');
        }, 120);
    });

    searchInput.addEventListener('keydown', function(e) {
        const items = searchResults.querySelectorAll('.search-item');
        if (!items.length || !searchResults.classList.contains('show')) {
            if (e.key === 'Enter') {
                const q = this.value.trim();
                if (q) {
                    smoothScroll('#movies');
                    const filtered = allMovies.filter(m => (m.title || '').toLowerCase().includes(q.toLowerCase()));
                    renderMovies(filtered);
                    searchResults.classList.remove('show');
                }
            }
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = (selectedIndex + 1) % items.length;
            items.forEach((it, i) => it.classList.toggle('selected', i === selectedIndex));
            if (items[selectedIndex]) items[selectedIndex].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = (selectedIndex - 1 + items.length) % items.length;
            items.forEach((it, i) => it.classList.toggle('selected', i === selectedIndex));
            if (items[selectedIndex]) items[selectedIndex].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIndex >= 0 && items[selectedIndex]) {
                items[selectedIndex].click();
            } else {
                const q = this.value.trim();
                if (q) {
                    smoothScroll('#movies');
                    const filtered = allMovies.filter(m => (m.title || '').toLowerCase().includes(q.toLowerCase()));
                    renderMovies(filtered);
                    searchResults.classList.remove('show');
                }
            }
        } else if (e.key === 'Escape') {
            searchResults.classList.remove('show');
        }
    });

    document.addEventListener('click', function(e) {
        if (!searchWrap || !searchWrap.contains(e.target)) {
            searchResults.classList.remove('show');
        }
    });
}

// ─── CONTINUE WATCHING & WATCHLIST MANAGERS ───
function getContinueWatching() {
    try {
        return JSON.parse(localStorage.getItem('phantom_continue_watching') || '[]');
    } catch (_) { return []; }
}

function getWatchlist() {
    try {
        return JSON.parse(localStorage.getItem('phantom_watchlist') || '[]');
    } catch (_) { return []; }
}

function renderContinueWatching() {
    const section = document.getElementById('continueWatchingSection');
    const row = document.getElementById('continueWatchingRow');
    if (!section || !row) return;

    const list = getContinueWatching();
    if (!list || !list.length) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    row.innerHTML = list.map(item => {
        const subText = item.type === 'series' && item.episode 
            ? `S0${item.season || 1} EP ${item.episode}` 
            : 'Resume Movie';
        const targetUrl = item.type === 'series' 
            ? `series.html?id=${encodeURIComponent(item.id)}` 
            : `movie.html?id=${encodeURIComponent(item.id)}`;
        return `
            <div class="shelf-card" onclick="location.href='${targetUrl}'">
                <button class="shelf-remove-btn" onclick="removeContinueWatching(event, '${item.id}')" title="Remove">✕</button>
                <img class="shelf-poster" src="${item.poster || item.banner || ''}" alt="${item.title}" loading="lazy">
                <div class="shelf-info">
                    <div class="shelf-title">${item.title}</div>
                    <div class="shelf-sub"><span>▶ ${subText}</span></div>
                </div>
            </div>
        `;
    }).join('');
}

function removeContinueWatching(event, id) {
    event.stopPropagation();
    let list = getContinueWatching().filter(x => String(x.id) !== String(id));
    localStorage.setItem('phantom_continue_watching', JSON.stringify(list));
    renderContinueWatching();
}

function clearContinueWatching() {
    localStorage.removeItem('phantom_continue_watching');
    renderContinueWatching();
    showToast('Continue watching cleared');
}

function renderWatchlist() {
    const section = document.getElementById('watchlistSection');
    const row = document.getElementById('watchlistRow');
    if (!section || !row) return;

    const list = getWatchlist();
    if (!list || !list.length) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    row.innerHTML = list.map(item => {
        const targetUrl = item.type === 'series' 
            ? `series.html?id=${encodeURIComponent(item.id)}` 
            : `movie.html?id=${encodeURIComponent(item.id)}`;
        return `
            <div class="shelf-card" onclick="location.href='${targetUrl}'">
                <button class="shelf-remove-btn" onclick="removeWatchlist(event, '${item.id}')" title="Remove">✕</button>
                <img class="shelf-poster" src="${item.poster || item.banner || ''}" alt="${item.title}" loading="lazy">
                <div class="shelf-info">
                    <div class="shelf-title">${item.title}</div>
                    <div class="shelf-sub"><span style="color:#f87171;">❤️ Saved</span><span>⭐ ${item.rating || '8.5'}</span></div>
                </div>
            </div>
        `;
    }).join('');
}

function removeWatchlist(event, id) {
    event.stopPropagation();
    let list = getWatchlist().filter(x => String(x.id) !== String(id));
    localStorage.setItem('phantom_watchlist', JSON.stringify(list));
    renderWatchlist();
    showToast('Removed from Watchlist');
}

function clearWatchlist() {
    localStorage.removeItem('phantom_watchlist');
    renderWatchlist();
    showToast('Watchlist cleared');
}

// ─── PWA WEB APP MANAGER ───
function initPWA() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js').catch(() => {});
        });
    }

    let deferredPrompt;
    const pwaBtn = document.getElementById('pwaInstallBtn');
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        if (pwaBtn) pwaBtn.classList.add('visible');
    });

    if (pwaBtn) {
        pwaBtn.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === 'accepted' && pwaBtn) pwaBtn.classList.remove('visible');
                deferredPrompt = null;
            } else {
                showToast('To install, open browser options and choose "Add to Home Screen"');
            }
        });
    }
}

// ─── OPEN MOVIE DETAIL PAGE ───
function openMoviePage(movie) {
    if (!movie) {
        showToast('Movie not found', 'error');
        return;
    }

    const isSeries = movie.type === 'series';

    // Track content click with GA4
    if (typeof gtag !== 'undefined') {
        gtag('event', isSeries ? 'series_click' : 'movie_click', {
            'movie_title': movie.title,
            'movie_id': movie.id,
            'genre': movie.genre
        });
    }

    window.location.href = (isSeries ? 'series.html?id=' : 'movie.html?id=') + encodeURIComponent(movie.id);
}

// ─── WATCH FEATURED MOVIE ───
function watchFeatured() {
    if (featuredMovie) {
        openMoviePage(featuredMovie);
    } else {
        showToast('No featured movie available', 'error');
    }
}

// ─── TOAST NOTIFICATION ───
function showToast(message, type) {
    const toast = document.getElementById('toast');
    
    if (!toast) return;
    
    toast.textContent = message;
    toast.className = 'toast ' + (type || '') + ' show';
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ─── FADE-IN ANIMATION ON SCROLL ───
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const fadeObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
            setTimeout(() => {
                entry.target.classList.add('visible');
            }, index * 80);
        }
    });
}, observerOptions);

// Observe all fade-in elements
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.fade-in').forEach(el => {
        fadeObserver.observe(el);
    });
});

// ─── SMOOTH SCROLL HELPER ───
function smoothScroll(target) {
    if (typeof target === 'number') {
        window.scrollTo({
            top: target,
            behavior: 'smooth'
        });
    } else {
        const element = document.querySelector(target);
        if (element) {
            element.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    }
}

// ─── INITIALIZATION ───
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadMoviesFromJSON);
} else {
    loadMoviesFromJSON();
}

// ─── CONSOLE INFO ───
console.log('%c🎬 Phantom Movies', 'font-size:20px;color:#5bc4f5;font-weight:bold');
console.log('%cJSON-Based CMS System Active', 'color:#2dce89');
console.log('%cAdmin Panel: admin.html', 'color:#7a8fa8');


// ─── ADS RENDERING ───
function applyAds(ads, page) {
    if (!ads || ads.enabled === false) return;

    if (page === 'home') {
        insertAdAfter('.hero', 'ad-home-top', ads.homeTop);
        insertAdBefore('#movieGrid', 'ad-home-grid', ads.homeGrid);
        insertAdBefore('#requestSection', 'ad-home-bottom', ads.homeBottom);
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

function insertAdAfter(selector, id, code) {
    const target = document.querySelector(selector);
    const slot = createAdSlot(id, code);
    if (target && slot && !slot.parentElement) target.insertAdjacentElement('afterend', slot);
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
