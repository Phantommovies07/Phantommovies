// ═══════════════════════════════════════════════════
// PHANTOM MOVIES - MAIN APPLICATION (JSON-Based)
// ═══════════════════════════════════════════════════

let allMovies = [];
let featuredMovie = null;

// ─── LOAD MOVIES FROM JSON ───
async function loadMoviesFromJSON() {
    try {
        const response = await fetch('data/content.json');
        
        if (!response.ok) {
            throw new Error('Failed to load content');
        }

        const data = await response.json();
        allMovies = (data.movies || []).filter(m => m.active !== false);
        
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

// ─── AFTER MOVIES LOADED ───
function afterMoviesLoaded() {
    // Update hero count
    document.getElementById('heroCount').textContent = allMovies.length + '+';
    
    // Set featured movie
    const feat = allMovies.find(m => m.featured) || allMovies[0];
    if (feat) setFeatured(feat);
    
    // Render all movies
    renderMovies(allMovies);
    
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

// ─── RENDER MOVIES ───
function renderMovies(movies) {
    const grid = document.getElementById('movieGrid');
    
    if (!movies || movies.length === 0) {
        grid.innerHTML = '<div class="empty-state">🎬 No movies found</div>';
        return;
    }
    
    grid.innerHTML = movies.map(m => movieCard(m)).join('');
    
    // Add click event listeners
    document.querySelectorAll('.movie-card').forEach(card => {
        card.addEventListener('click', function() {
            const movieId = this.dataset.id;
            const movie = allMovies.find(x => x.id === movieId);
            if (movie) openMoviePage(movie);
        });
    });
}

// ─── MOVIE CARD TEMPLATE ───
function movieCard(m) {
    const badge = m.badge ? `<div class="m-badge">${m.badge}</div>` : '';
    const img = m.poster && m.poster.trim() !== '' 
        ? `<img src="${m.poster}" alt="${m.title}">` 
        : '';
    
    return `<div class="movie-card" data-id="${m.id}">
        <div class="movie-poster">
            <div class="poster-ph">${img}</div>
            ${badge}
        </div>
        <div class="movie-info">
            <div class="movie-name">${m.title}</div>
            <div style="font-size:10px;color:var(--muted)">${m.genre || 'Unknown'} • ${m.year || 'N/A'}</div>
        </div>
    </div>`;
}

// ─── GENRE FILTER ───
document.addEventListener('DOMContentLoaded', function() {
    const genreRow = document.getElementById('genreRow');
    
    if (genreRow) {
        genreRow.addEventListener('click', function(e) {
            const pill = e.target.closest('.genre-pill');
            if (!pill) return;
            
            const genre = pill.dataset.genre;
            
            // Update active state
            document.querySelectorAll('.genre-pill').forEach(p => {
                p.classList.toggle('active', p.dataset.genre === genre);
            });
            
            // Filter movies
            const filtered = genre === 'All' 
                ? allMovies 
                : allMovies.filter(m => m.genre === genre);
            
            renderMovies(filtered);
            
            // Track with GA4
            if (typeof gtag !== 'undefined') {
                gtag('event', 'genre_filter', {
                    'genre': genre
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
                    m.title.toLowerCase().includes(query)
                ).slice(0, 6);
                
                if (matches.length === 0) {
                    searchResults.classList.remove('show');
                    return;
                }
                
                searchResults.innerHTML = matches.map(m => `
                    <div class="search-item" data-id="${m.id}">
                        <div style="font-size:13px;font-weight:600">${m.title}</div>
                        <div style="font-size:11px;color:var(--muted)">${m.genre} • ${m.year}</div>
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

    // Track movie click with GA4
    if (typeof gtag !== 'undefined') {
        gtag('event', 'movie_click', {
            'movie_title': movie.title,
            'movie_id': movie.id,
            'genre': movie.genre
        });
    }

    window.location.href = 'movie.html?id=' + encodeURIComponent(movie.id);
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
window.addEventListener('load', function() {
    // Hide loading screen
    setTimeout(() => {
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) {
            loadingScreen.classList.add('hide');
        }
    }, 1500);
    
    // Load movies from JSON
    loadMoviesFromJSON();
});

// ─── CONSOLE INFO ───
console.log('%c🎬 Phantom Movies', 'font-size:20px;color:#5bc4f5;font-weight:bold');
console.log('%cJSON-Based CMS System Active', 'color:#2dce89');
console.log('%cAdmin Panel: admin.html', 'color:#7a8fa8');
