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
