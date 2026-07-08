// Dynamic Content Loader for Phantom Movies

// Load movies from content.json
async function loadMoviesFromJSON() {
    try {
        const response = await fetch('data/content.json');
        
        if (!response.ok) {
            throw new Error('Failed to load content');
        }

        const data = await response.json();
        allMovies = data.movies || [];
        
        // Update your existing functions
        afterMoviesLoaded();
        
    } catch (error) {
        console.error('Error loading movies:', error);
        // Fallback to demo movies if JSON fails
        loadDemoMovies();
    }
}

// Replace the existing loadMovies() function call
// Old: loadMovies(); (Firebase)
// New: loadMoviesFromJSON(); (JSON)

// Update your initialization
window.addEventListener('load', function() {
    setTimeout(function() {
        document.getElementById('loadingScreen').classList.add('hide');
    }, 1500);
    
    loadMoviesFromJSON(); // Load from JSON instead of Firebase
    renderPage();
});
// Track movie views
function trackMovieView(movieTitle, movieId) {
    gtag('event', 'movie_view', {
        'movie_title': movieTitle,
        'movie_id': movieId,
        'content_type': 'movie'
    });
}

// Track search
function trackSearch(searchTerm) {
    gtag('event', 'search', {
        'search_term': searchTerm
    });
}

// Track movie play
function trackMoviePlay(movieTitle) {
    gtag('event', 'movie_play', {
        'movie_title': movieTitle,
        'engagement_type': 'play'
    });
}

// Track genre filter
function trackGenreFilter(genre) {
    gtag('event', 'genre_filter', {
        'genre': genre
    });
}

// Add these to your existing functions
// Example in openPlayer():
function openPlayer(movie) {
    // ... existing code ...
    trackMovieView(movie.title, movie.id);
    // ... rest of code ...
}
