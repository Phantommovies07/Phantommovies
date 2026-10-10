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
        const cached = sessionStorage.getItem('phantom_content_cache_v3');
        const cacheTime = sessionStorage.getItem('phantom_content_time_v3');
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
        sessionStorage.setItem('phantom_content_cache_v3', JSON.stringify(data));
        sessionStorage.setItem('phantom_content_time_v3', String(Date.now()));
    } catch (_) {}
    return data;
}

// ─── LOAD MOVIES FROM JSON ───
async function loadMoviesFromJSON() {
    try {
        const data = await getContentData();
        allMovies = (data.movies || []).filter(m => m.active !== false);
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
    // Update hero count
    const heroCountEl = document.getElementById('heroCount');
    if (heroCountEl) heroCountEl.textContent = allMovies.length + '+';
    
    // Set featured movie
    const feat = allMovies.find(m => m.featured) || allMovies[0];
    if (feat) setFeatured(feat);
    
    // Render home content
    renderCategoryFilters();
    renderTrending();
    renderHeroSlider();
    renderMovies(allMovies);
    setupRequestButton();
    initThemeToggle();
    initSearchToggle();
    
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

function renderTrending() {
    const grid = document.getElementById('trendingGrid');
    if (!grid) return;

    const trending = getTrendingMovies(8);
    if (!trending.length) {
        grid.innerHTML = '<div class="empty-state">🔥 No trending titles yet</div>';
        return;
    }

    grid.innerHTML = trending.map(m => movieCard(m, true)).join('');
    bindMovieCards(grid);
}

function renderHeroSlider() {
    const slider = document.getElementById('heroSlider');
    if (!slider) return;

    const manualSlides = allMovies.filter(m => m.heroSlide);
    const slides = (manualSlides.length ? manualSlides : getTrendingMovies(6)).slice(0, 6);
    if (!slides.length) {
        slider.innerHTML = '<div class="empty-state">No trending titles yet</div>';
        return;
    }

    slider.innerHTML = slides.map((m, index) => {
        const banner = m.banner || m.poster || '';
        return `<div class="hero-slide ${index === 0 ? 'active' : ''}" data-id="${m.id}" data-banner="${banner}" onclick="openMoviePageById('${m.id}')">
            ${banner ? `<img src="${banner}" alt="${m.title}">` : '<div class="slide-fallback">🎬</div>'}
            <div class="slide-overlay"><span>${m.type === 'series' ? 'Series' : 'Movie'}</span></div>
        </div>`;
    }).join('');


    if (heroSlideTimer) clearInterval(heroSlideTimer);
    heroSlideTimer = setInterval(() => moveHeroSlide(1), 4200);
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

function moveHeroSlide(direction) {
    const slides = document.querySelectorAll('.hero-slide');
    if (!slides.length) return;

    slides[heroSlideIndex]?.classList.remove('active');
    heroSlideIndex = (heroSlideIndex + direction + slides.length) % slides.length;
    slides[heroSlideIndex].classList.add('active');
}

function openMoviePageById(id) {
    const movie = allMovies.find(m => String(m.id) === String(id));
    if (movie) openMoviePage(movie);
}

function bindMovieCards(scope = document) {
    scope.querySelectorAll('.movie-card').forEach(card => {
        if (card.dataset.bound === '1') return;
        card.dataset.bound = '1';
        card.addEventListener('click', function() {
            const movieId = this.dataset.id;
            const movie = allMovies.find(x => x.id === movieId);
            if (movie) openMoviePage(movie);
        });
    });
}

function renderCategoryFilters() {
    const row = document.getElementById('genreRow');
    if (!row) return;
    const genres = [...new Set(allMovies.map(m => m.genre).filter(Boolean))].filter(g => !['Movie', 'Tv Series'].includes(g)).sort();
    const pills = [
        { label: 'All', filter: 'all' },
        { label: '🔥 Trending', filter: 'trending' },
        { label: '🎬 Bollywood (New)', filter: 'bollywood_new' },
        { label: '⚡ South (New)', filter: 'south_new' },
        { label: '📺 Web Series & TV', filter: 'series' },
        { label: '🏛️ Bollywood Classics', filter: 'bollywood_classic' },
        { label: '🏆 South Classics', filter: 'south_classic' },
        ...genres.map(g => ({ label: g, genre: g }))
    ];
    row.innerHTML = pills.map((p, i) => `<div class="genre-pill ${i === 0 ? 'active' : ''}" data-filter="${p.filter || ''}" data-genre="${p.genre || ''}">${p.label}</div>`).join('');
}

function filterContent(pill) {
    const filter = pill.dataset.filter;
    const genre = pill.dataset.genre;
    if (filter === 'movie') return allMovies.filter(m => m.type !== 'series');
    if (filter === 'series') return allMovies.filter(m => m.type === 'series');
    if (filter === 'trending') return getTrendingMovies(100);
    if (filter === 'bollywood_new') return allMovies.filter(m => m.category === 'bollywood_new' || (m.industry === 'Bollywood' && m.year >= 2022) || (m.tags && m.tags.includes('bollywood_new')));
    if (filter === 'south_new') return allMovies.filter(m => m.category === 'south_new' || (m.industry === 'South' && m.year >= 2022) || (m.tags && m.tags.includes('south_new')));
    if (filter === 'bollywood_classic') return allMovies.filter(m => m.category === 'bollywood_classic' || (m.industry === 'Bollywood' && m.year < 2022) || (m.tags && m.tags.includes('bollywood_classic')));
    if (filter === 'south_classic') return allMovies.filter(m => m.category === 'south_classic' || (m.industry === 'South' && m.year < 2022) || (m.tags && m.tags.includes('south_classic')));
    if (genre) return allMovies.filter(m => m.genre === genre);
    return allMovies;
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
function movieCard(m, forceTrendingBadge = false) {
    const badgeText = forceTrendingBadge ? 'TRENDING' : m.badge;
    const badge = badgeText ? `<div class="m-badge">${badgeText}</div>` : '';
    const img = m.poster && m.poster.trim() !== '' 
        ? `<img src="${m.poster}" alt="${m.title}" loading="lazy" decoding="async">` 
        : '';
    
    return `<div class="movie-card" data-id="${m.id}">
        <div class="movie-poster">
            <div class="poster-ph">${img}</div>
            ${badge}
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
    const genreRow = document.getElementById('genreRow');
    
    if (genreRow) {
        genreRow.addEventListener('click', function(e) {
            const pill = e.target.closest('.genre-pill');
            if (!pill) return;
            
            document.querySelectorAll('.genre-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');

            const filtered = filterContent(pill);
            renderMovies(filtered);

            if (typeof gtag !== 'undefined') {
                gtag('event', 'content_filter', {
                    'filter': pill.dataset.filter || pill.dataset.genre || 'all'
                });
            }
        });
    }
});

// ─── SEARCH FUNCTIONALITY ───
let searchTimeout;

document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.getElementById('searchInput');
    const searchResults = document.getElementById('searchResults');
    
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            clearTimeout(searchTimeout);
            
            const query = this.value.trim().toLowerCase();
            
            if (!query) {
                searchResults.classList.remove('show');
                return;
            }
            
            searchTimeout = setTimeout(() => {
                const matches = allMovies.filter(m => 
                    (m.title || '').toLowerCase().includes(query) ||
                    (m.genre || '').toLowerCase().includes(query)
                ).slice(0, 8);
                
                if (matches.length === 0) {
                    searchResults.classList.remove('show');
                    return;
                }
                
                searchResults.innerHTML = matches.map(m => `
                    <div class="search-item rich-search-item" data-id="${m.id}">
                        <div class="search-thumb">${m.poster ? `<img src="${m.poster}" alt="${m.title}">` : '🎬'}</div>
                        <div>
                            <div style="font-size:13px;font-weight:700">${m.title}</div>
                            <div style="font-size:11px;color:var(--muted)">${m.type === 'series' ? 'Series' : 'Movie'} • ${m.genre || 'Unknown'} • ${m.year || 'N/A'}</div>
                        </div>
                    </div>
                `).join('');
                
                // Add click listeners to search results
                searchResults.querySelectorAll('.search-item').forEach(item => {
                    item.addEventListener('click', function() {
                        const movieId = this.dataset.id;
                        const movie = allMovies.find(x => x.id === movieId);
                        if (movie) {
                            openMoviePage(movie);
                            searchResults.classList.remove('show');
                            searchInput.value = '';
                        }
                    });
                });
                
                searchResults.classList.add('show');
                
                // Track search with GA4
                if (typeof gtag !== 'undefined') {
                    gtag('event', 'search', {
                        'search_term': query
                    });
                }
            }, 300);
        });
    }
});

// Close search results when clicking outside
document.addEventListener('click', function(e) {
    if (!e.target.closest('.search-wrap')) {
        const searchResults = document.getElementById('searchResults');
        if (searchResults) {
            searchResults.classList.remove('show');
        }
    }
});

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
