// ══════════════════════════════════════════════════════════════
// PHANTOM MOVIES - ADMIN CONSOLE CONTROLLER v2.5
// ══════════════════════════════════════════════════════════════

// Global State
let editingMovieId = null;
let catalogSearchTimeout = null;
const TMDB_API_KEY_STORAGE = 'tmdb_v4_token';

// Catalog State
let catalogState = {
    allItems: [],
    filteredItems: [],
    searchQuery: '',
    typeFilter: 'all',
    categoryFilter: 'all',
    sortBy: 'newest',
    currentPage: 1,
    pageSize: 20
};

// ─── INITIALIZATION ON LOAD ───
document.addEventListener('DOMContentLoaded', () => {
    // Check if GitHub credentials already saved
    if (githubAPI.loadCredentials()) {
        showContentSection();
        loadMovies();
        loadAdsSettings();
        loadSiteSettings();
        initSimpleAdBuilder();
    } else {
        showAuthSection();
    }

    setupImagePreviews();
    initTMDBAutoFill();

    // Set default streams and downloads on fresh page
    if (!editingMovieId) {
        addStreamLink();
        addDownloadOption();
    }
});

// ─── GITHUB AUTHENTICATION ───
async function authenticateGitHub() {
    const username = document.getElementById('githubUsername').value.trim();
    const repo = document.getElementById('githubRepo').value.trim();
    const token = document.getElementById('githubToken').value.trim();

    if (!username || !repo || !token) {
        showAlert('authAlert', '❌ Please enter GitHub Username, Repo, and Token.', 'error');
        return;
    }

    const authBtn = document.getElementById('authBtn');
    authBtn.disabled = true;
    authBtn.textContent = 'Connecting to GitHub...';

    try {
        githubAPI.init(username, repo, token);
        const user = await githubAPI.verifyAuth();

        showAlert('authAlert', `✅ Connected as @${user.login || username}! Opening Console...`, 'success');

        setTimeout(() => {
            showContentSection();
            loadMovies();
            loadAdsSettings();
            loadSiteSettings();
            initSimpleAdBuilder();
        }, 800);

    } catch (error) {
        showAlert('authAlert', `❌ Authentication error: ${error.message}`, 'error');
        githubAPI.clearCredentials();
    } finally {
        authBtn.disabled = false;
        authBtn.textContent = '🔐 Connect & Unlock Console';
    }
}

function showContentSection() {
    document.getElementById('authSection').classList.add('hidden');
    document.getElementById('contentSection').classList.remove('hidden');
    const topLogout = document.getElementById('logoutBtnTop');
    if (topLogout) topLogout.classList.remove('hidden');
}

function showAuthSection() {
    document.getElementById('authSection').classList.remove('hidden');
    document.getElementById('contentSection').classList.add('hidden');
    const topLogout = document.getElementById('logoutBtnTop');
    if (topLogout) topLogout.classList.add('hidden');
}

function logout() {
    if (confirm('Are you sure you want to log out of the Admin Console?')) {
        githubAPI.clearCredentials();
        showAuthSection();
        showAlert('authAlert', 'Logged out successfully.', 'info');
    }
}

// ─── TAB NAVIGATION CONTROLLER ───
function switchAdminTab(tabName) {
    const tabBtns = document.querySelectorAll('.admin-tab-btn');
    tabBtns.forEach(btn => {
        if (btn.getAttribute('data-tab') === tabName) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    const panels = {
        'catalog': 'tabCatalog',
        'editor': 'tabEditor',
        'bulk': 'tabBulk',
        'tmdb': 'tabTmdb',
        'settings': 'tabSettings',
        'ads': 'tabAds',
        'mirrors': 'tabMirrors'
    };

    Object.entries(panels).forEach(([key, panelId]) => {
        const el = document.getElementById(panelId);
        if (el) {
            if (key === tabName) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        }
    });

    if (tabName === 'mirrors') {
        loadMirrorHealth();
    }
    if (tabName === 'catalog') {
        // Scroll to catalog search bar
        document.getElementById('catalogSearchInput')?.focus();
    }
}

// ─── PUBLISHED CATALOG CONTROLLER (SEARCH, FILTERS, PAGINATION) ───
function handleCatalogSearch(query) {
    catalogState.searchQuery = (query || '').trim().toLowerCase();
    clearTimeout(catalogSearchTimeout);
    catalogSearchTimeout = setTimeout(() => {
        catalogState.currentPage = 1;
        applyCatalogFiltersAndSort();
    }, 150);
}

function setCatalogTypeFilter(type, btnElement) {
    catalogState.typeFilter = type;
    const pillBtns = document.querySelectorAll('.filter-pills-bar .pill-btn');
    pillBtns.forEach(p => p.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');
    catalogState.currentPage = 1;
    applyCatalogFiltersAndSort();
}

function handleCatalogCategoryChange(category) {
    catalogState.categoryFilter = category;
    catalogState.currentPage = 1;
    applyCatalogFiltersAndSort();
}

function handleCatalogSortChange(sortBy) {
    catalogState.sortBy = sortBy;
    applyCatalogFiltersAndSort();
}

function resetCatalogFilters() {
    const searchInput = document.getElementById('catalogSearchInput');
    if (searchInput) searchInput.value = '';
    const catSelect = document.getElementById('catalogCategoryFilter');
    if (catSelect) catSelect.value = 'all';
    const sortSelect = document.getElementById('catalogSortSelect');
    if (sortSelect) sortSelect.value = 'newest';

    const allPill = document.querySelector('.filter-pills-bar .pill-btn[data-filter="all"]');
    if (allPill) setCatalogTypeFilter('all', allPill);

    catalogState.searchQuery = '';
    catalogState.typeFilter = 'all';
    catalogState.categoryFilter = 'all';
    catalogState.sortBy = 'newest';
    catalogState.currentPage = 1;
    applyCatalogFiltersAndSort();
}

function applyCatalogFiltersAndSort() {
    let list = [...catalogState.allItems];

    // 1. Search Query Filter
    if (catalogState.searchQuery) {
        const q = catalogState.searchQuery;
        list = list.filter(item => {
            const titleMatch = (item.title || '').toLowerCase().includes(q);
            const genreMatch = (item.genre || '').toLowerCase().includes(q);
            const yearMatch = String(item.year || '').includes(q);
            const imdbMatch = (item.imdb_id || '').toLowerCase().includes(q);
            const tmdbMatch = String(item.tmdb_id || '').includes(q);
            const indMatch = (item.industry || '').toLowerCase().includes(q);
            const catMatch = (item.category || '').toLowerCase().includes(q);
            return titleMatch || genreMatch || yearMatch || imdbMatch || tmdbMatch || indMatch || catMatch;
        });
    }

    // 2. Type Filter Pill
    if (catalogState.typeFilter === 'movie') {
        list = list.filter(m => m.type !== 'series');
    } else if (catalogState.typeFilter === 'series') {
        list = list.filter(m => m.type === 'series');
    } else if (catalogState.typeFilter === 'trending') {
        list = list.filter(m => !!m.trending);
    } else if (catalogState.typeFilter === 'featured') {
        list = list.filter(m => !!m.featured);
    } else if (catalogState.typeFilter === '4k') {
        list = list.filter(m => m.badge === '4K' || m.badge === 'UHD' || (m.title && m.title.toLowerCase().includes('4k')));
    } else if (catalogState.typeFilter === 'torrent') {
        list = list.filter(m => m.torrent && m.torrent.magnet);
    } else if (catalogState.typeFilter === 'draft') {
        list = list.filter(m => m.status === 'draft' || m.status === 'hidden' || m.active === false);
    }

    // 3. Category Filter
    if (catalogState.categoryFilter && catalogState.categoryFilter !== 'all') {
        list = list.filter(m => m.category === catalogState.categoryFilter);
    }

    // 4. Sorting
    list.sort((a, b) => {
        if (catalogState.sortBy === 'newest') {
            return (b.id || 0) - (a.id || 0);
        } else if (catalogState.sortBy === 'oldest') {
            return (a.id || 0) - (b.id || 0);
        } else if (catalogState.sortBy === 'rating_high') {
            return (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0);
        } else if (catalogState.sortBy === 'year_new') {
            return (parseInt(b.year) || 0) - (parseInt(a.year) || 0);
        } else if (catalogState.sortBy === 'views_high') {
            return (parseInt(b.views) || 0) - (parseInt(a.views) || 0);
        } else if (catalogState.sortBy === 'title_az') {
            return (a.title || '').localeCompare(b.title || '');
        }
        return 0;
    });

    catalogState.filteredItems = list;
    renderCatalogItems();
}

function renderCatalogItems() {
    const container = document.getElementById('movieListContainer');
    const badgeEl = document.getElementById('catalogCountBadge');
    if (badgeEl) badgeEl.textContent = catalogState.allItems.length.toLocaleString();

    if (!container) return;

    const total = catalogState.filteredItems.length;

    if (total === 0) {
        container.innerHTML = `
            <div style="background: rgba(255,255,255,0.02); border:1px dashed var(--border); border-radius:12px; padding: 48px 20px; text-align: center; color: var(--muted);">
                <div style="font-size:36px; margin-bottom:10px;">🔍</div>
                <h4 style="font-size:16px; color:var(--text); margin-bottom:6px;">No Content Found</h4>
                <p style="font-size:13px; max-width:400px; margin:0 auto 16px;">Try adjusting your search terms or clearing the selected filters.</p>
                <button type="button" class="btn-small btn-secondary" onclick="resetCatalogFilters()">Reset All Filters</button>
            </div>
        `;
        renderPagination(0, 0, 0);
        return;
    }

    const pageSize = catalogState.pageSize;
    const totalPages = Math.ceil(total / pageSize);
    if (catalogState.currentPage > totalPages) catalogState.currentPage = totalPages;
    if (catalogState.currentPage < 1) catalogState.currentPage = 1;

    const startIdx = (catalogState.currentPage - 1) * pageSize;
    const pageItems = catalogState.filteredItems.slice(startIdx, startIdx + pageSize);

    container.innerHTML = pageItems.map(item => {
        const isSeries = item.type === 'series';
        const typeLabel = isSeries ? 'Series' : 'Movie';
        const posterUrl = item.poster || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="60" height="90" fill="%231a233a"%3E%3Crect width="60" height="90"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" fill="%235bc4f5" font-family="sans-serif" font-size="10"%3ENo Poster%3C/text%3E%3C/svg%3E';

        const seasonsCount = (item.seasons || []).length;
        const episodeCount = (item.seasons || []).reduce((sum, s) => sum + ((s.episodes || []).length), 0);
        const streamCount = isSeries ? `${seasonsCount}S • ${episodeCount}E` : `${(item.streams || (item.streamLink ? [item.streamLink] : [])).length} Streams`;
        const downloadCount = isSeries ? '' : `${(item.downloads || []).length} Downloads`;
        const viewsCount = item.views ? `${Number(item.views).toLocaleString()} views` : '0 views';

        const categoryNames = {
            'bollywood_new': 'Bollywood New',
            'south_new': 'South Hindi Dubbed',
            'bollywood_classic': 'Bollywood Classic',
            'south_classic': 'South Classic',
            'hollywood': 'Hollywood',
            'series': 'Web Series'
        };
        const catBadge = categoryNames[item.category] || item.category || (isSeries ? 'Series' : 'Bollywood');
        const viewUrl = isSeries ? `series.html?id=${encodeURIComponent(item.id)}` : `movie.html?id=${encodeURIComponent(item.id)}`;

        return `
            <div class="catalog-item-card">
                <img class="catalog-poster-thumb" src="${escapeAttr(posterUrl)}" alt="${escapeAttr(item.title)}" loading="lazy" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'64\\' height=\\'96\\' fill=\\'%231a233a\\'%3E%3Crect width=\\'64\\' height=\\'96\\'/%3E%3Ctext x=\\'50%25\\' y=\\'50%25\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\' fill=\\'%235bc4f5\\' font-size=\\'10\\'%3EPoster%3C/text%3E%3C/svg%3E'">
                
                <div class="catalog-info">
                    <div class="catalog-title-row">
                        <span class="catalog-title">${escapeAttr(item.title)}</span>
                        ${item.year ? `<span style="color:var(--muted); font-size:13px; font-weight:600;">(${escapeAttr(item.year)})</span>` : ''}
                        ${item.badge ? `<span class="item-badge ${item.badge === 'HOT' ? 'hot' : (item.badge === 'NEW' ? 'new' : 'badge-4k')}">${escapeAttr(item.badge)}</span>` : ''}
                        ${item.featured ? '<span class="item-badge featured">⭐ Featured</span>' : ''}
                        ${item.trending ? '<span class="item-badge trending">🔥 Trending</span>' : ''}
                        ${item.status === 'draft' || item.status === 'hidden' || item.active === false ? '<span class="item-badge draft">Draft / Hidden</span>' : ''}
                        <span class="item-badge category">${escapeAttr(catBadge)}</span>
                    </div>

                    <div class="catalog-meta-line">
                        <span><strong>${typeLabel}</strong></span>
                        <span class="divider">•</span>
                        <span>${escapeAttr(item.genre || 'Action')}</span>
                        ${item.duration ? `<span class="divider">•</span><span>${escapeAttr(item.duration)}</span>` : ''}
                        ${item.rating ? `<span class="divider">•</span><span style="color:#ffd700; font-weight:700;">★ ${escapeAttr(item.rating)}</span>` : ''}
                        <span class="divider">•</span>
                        <span>👁️ ${viewsCount}</span>
                    </div>

                    <div class="catalog-tags-line">
                        ${item.imdb_id ? `<span class="tech-pill active-pill">IMDb: <a href="https://www.imdb.com/title/${escapeAttr(item.imdb_id)}/" target="_blank" style="color:inherit; text-decoration:none;">${escapeAttr(item.imdb_id)} ↗</a></span>` : ''}
                        ${item.tmdb_id ? `<span class="tech-pill">TMDb: ${escapeAttr(item.tmdb_id)}</span>` : ''}
                        <span class="tech-pill">🎥 ${streamCount}</span>
                        ${downloadCount ? `<span class="tech-pill">☁️ ${downloadCount}</span>` : ''}
                        ${item.torrent && item.torrent.magnet ? `<span class="tech-pill active-pill" style="color:#2dce89; border-color:rgba(45,206,137,0.3);">🧲 Torrent (${item.torrent.seeders || 0}s • ${item.torrent.size || 'HD'})</span>` : ''}
                    </div>
                </div>

                <div class="catalog-actions">
                    <button type="button" class="btn-small btn-secondary" data-admin-action="edit" data-id="${escapeAttr(item.id)}">
                        ✏️ Edit
                    </button>
                    <a href="${viewUrl}" target="_blank" class="btn-small btn-secondary" style="text-decoration:none;">
                        👁️ View
                    </a>
                    <button type="button" class="btn-small btn-danger" data-admin-action="delete" data-id="${escapeAttr(item.id)}" data-title="${escapeAttr(item.title)}">
                        🗑️ Delete
                    </button>
                </div>
            </div>
        `;
    }).join('');

    renderPagination(total, startIdx + 1, Math.min(startIdx + pageSize, total));
}

function renderPagination(total, startNum, endNum) {
    const summary = document.getElementById('paginationSummary');
    const btnsContainer = document.getElementById('paginationBtns');
    if (!summary || !btnsContainer) return;

    if (total === 0) {
        summary.textContent = 'Showing 0 of 0 items';
        btnsContainer.innerHTML = '';
        return;
    }

    const pageSize = catalogState.pageSize;
    const totalPages = Math.ceil(total / pageSize);
    summary.innerHTML = `Showing <strong>${startNum}–${endNum}</strong> of <strong>${total.toLocaleString()}</strong> items (Page ${catalogState.currentPage} of ${totalPages})`;

    let html = '';
    html += `<button type="button" class="pagination-btn" ${catalogState.currentPage <= 1 ? 'disabled' : ''} onclick="goToCatalogPage(${catalogState.currentPage - 1})">« Prev</button>`;

    // Page window
    let startPage = Math.max(1, catalogState.currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    if (endPage - startPage < 4) {
        startPage = Math.max(1, endPage - 4);
    }

    if (startPage > 1) {
        html += `<button type="button" class="pagination-btn" onclick="goToCatalogPage(1)">1</button>`;
        if (startPage > 2) html += `<span style="color:var(--muted); padding:0 4px;">…</span>`;
    }

    for (let p = startPage; p <= endPage; p++) {
        html += `<button type="button" class="pagination-btn ${p === catalogState.currentPage ? 'active' : ''}" onclick="goToCatalogPage(${p})">${p}</button>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += `<span style="color:var(--muted); padding:0 4px;">…</span>`;
        html += `<button type="button" class="pagination-btn" onclick="goToCatalogPage(${totalPages})">${totalPages}</button>`;
    }

    html += `<button type="button" class="pagination-btn" ${catalogState.currentPage >= totalPages ? 'disabled' : ''} onclick="goToCatalogPage(${catalogState.currentPage + 1})">Next »</button>`;

    btnsContainer.innerHTML = html;
}

function goToCatalogPage(p) {
    catalogState.currentPage = p;
    renderCatalogItems();
    document.getElementById('tabCatalog')?.scrollIntoView({ behavior: 'smooth' });
}

function createNewContentFromCatalog() {
    resetMovieForm();
    switchAdminTab('editor');
    document.getElementById('title')?.focus();
}

// ─── LOAD & POPULATE MOVIES LIST FROM GITHUB ───
async function loadMovies() {
    showSpinner(true);
    try {
        const content = await githubAPI.getContent();
        const movies = content.movies || [];
        catalogState.allItems = movies;
        renderAdminStats(movies);
        applyCatalogFiltersAndSort();
    } catch (error) {
        showAlert('contentAlert', `❌ Error loading content: ${error.message}`, 'error');
    } finally {
        showSpinner(false);
    }
}

function renderAdminStats(items = []) {
    const statsContainer = document.getElementById('adminStats');
    if (!statsContainer) return;

    const total = items.length;
    const movies = items.filter(m => m.type !== 'series').length;
    const series = items.filter(m => m.type === 'series').length;
    const total4k = items.filter(m => (m.badge === '4K' || m.badge === 'UHD' || (m.title && m.title.toLowerCase().includes('4k')))).length;
    const torrents = items.filter(m => m.torrent && m.torrent.magnet).length;
    const totalViews = items.reduce((acc, m) => acc + (Number(m.views) || 0), 0);

    statsContainer.innerHTML = `
        <div class="admin-stat-card">
            <span class="stat-icon">🎬</span>
            <strong>${total.toLocaleString()}</strong>
            <span>Total Titles</span>
        </div>
        <div class="admin-stat-card">
            <span class="stat-icon">🎥</span>
            <strong>${movies.toLocaleString()}</strong>
            <span>Movies</span>
        </div>
        <div class="admin-stat-card">
            <span class="stat-icon">📺</span>
            <strong>${series.toLocaleString()}</strong>
            <span>Web Series</span>
        </div>
        <div class="admin-stat-card">
            <span class="stat-icon">💎</span>
            <strong>${total4k.toLocaleString()}</strong>
            <span>4K UHD Titles</span>
        </div>
        <div class="admin-stat-card">
            <span class="stat-icon">🧲</span>
            <strong>${torrents.toLocaleString()}</strong>
            <span>P2P Torrents</span>
        </div>
        <div class="admin-stat-card">
            <span class="stat-icon">👁️</span>
            <strong>${totalViews.toLocaleString()}</strong>
            <span>Base Views</span>
        </div>
    `;
}

// ─── EDIT & POPULATE EXISTING CONTENT ───
async function editMovie(id) {
    showSpinner(true);
    try {
        const content = await githubAPI.getContent();
        const item = (content.movies || []).find(m => String(m.id) === String(id));
        if (!item) throw new Error('Content not found in repository database');

        populateFormForEdit(item);
        switchAdminTab('editor');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        showAlert('contentAlert', `✏️ Editing: ${item.title}`, 'info');
    } catch (error) {
        showAlert('contentAlert', `❌ Edit load error: ${error.message}`, 'error');
    } finally {
        showSpinner(false);
    }
}

function populateFormForEdit(item) {
    editingMovieId = item.id;
    setInputValue('contentType', item.type === 'series' ? 'series' : 'movie');
    if (document.getElementById('combinedEpisodes')) {
        document.getElementById('combinedEpisodes').checked = !!item.combined;
    }
    toggleContentType();

    setInputValue('title', item.title || '');
    setSelectValue('genre', item.genre || 'Action');
    setInputValue('year', item.year || '');
    setInputValue('duration', item.duration || '');
    setInputValue('rating', item.rating || '');
    setInputValue('badge', item.badge || '');
    setInputValue('views', (item.views !== undefined && item.views !== null) ? item.views : '');

    // IDs & Taxonomy
    setInputValue('imdb_id', item.imdb_id || '');
    setInputValue('tmdb_id', item.tmdb_id || '');
    setSelectValue('category', item.category || (item.type === 'series' ? 'series' : 'bollywood_new'));
    setSelectValue('industry', item.industry || 'Bollywood');

    setInputValue('poster', item.poster || '');
    setInputValue('banner', item.banner || '');
    setInputValue('trailerLink', item.trailerLink || '');
    setInputValue('description', item.description || '');

    // Torrent Fields
    if (item.torrent && item.torrent.magnet) {
        document.getElementById('torrentEnabled').checked = true;
        document.getElementById('torrentFieldsContainer').classList.remove('hidden');
        setInputValue('torrentMagnet', item.torrent.magnet || '');
        setInputValue('torrentName', item.torrent.name || '');
        setInputValue('torrentSeeders', item.torrent.seeders || '');
        setInputValue('torrentSize', item.torrent.size || '');
    } else {
        document.getElementById('torrentEnabled').checked = false;
        document.getElementById('torrentFieldsContainer').classList.add('hidden');
        setInputValue('torrentMagnet', '');
        setInputValue('torrentName', '');
        setInputValue('torrentSeeders', '');
        setInputValue('torrentSize', '');
    }

    if (document.getElementById('featured')) document.getElementById('featured').checked = !!item.featured;
    if (document.getElementById('trending')) document.getElementById('trending').checked = !!item.trending;
    if (document.getElementById('heroSlide')) document.getElementById('heroSlide').checked = !!item.heroSlide;
    if (document.getElementById('contentStatus')) {
        document.getElementById('contentStatus').value = item.status || (item.active === false ? 'hidden' : 'published');
    }
    if (document.getElementById('active')) {
        document.getElementById('active').checked = item.active !== false;
    }

    // Trigger preview image updates
    setupImagePreview('poster', 'posterPreview');
    setupImagePreview('banner', 'bannerPreview');

    // Populate Dynamic Streams & Downloads
    document.getElementById('streamLinksContainer').innerHTML = '';
    document.getElementById('downloadOptionsContainer').innerHTML = '';
    document.getElementById('seasonsContainer').innerHTML = '';

    if (item.type === 'series') {
        (item.seasons || []).forEach(season => addSeason(season));
        if (!(item.seasons || []).length) addSeason();
        if (item.combined) {
            const streams = item.streams && item.streams.length ? item.streams : (item.streamLink ? [{ name: 'Server 1', url: item.streamLink }] : [{}]);
            streams.forEach(st => addStreamLink(st));
            (item.downloads && item.downloads.length ? item.downloads : [{}]).forEach(dl => addDownloadOption(dl));
        }
    } else {
        const streams = item.streams && item.streams.length ? item.streams : (item.streamLink ? [{ name: 'Server 1', url: item.streamLink }] : [{}]);
        streams.forEach(st => addStreamLink(st));
        (item.downloads && item.downloads.length ? item.downloads : [{}]).forEach(dl => addDownloadOption(dl));
    }

    const titleH2 = document.getElementById('formTitle');
    const btn = document.getElementById('publishBtn');
    const cancelTop = document.getElementById('cancelEditBtn');
    const cancelBottom = document.getElementById('cancelEditBtnBottom');

    if (titleH2) titleH2.textContent = `✏️ Editing: ${item.title}`;
    if (btn) btn.textContent = '✅ Update Content';
    if (cancelTop) cancelTop.classList.remove('hidden');
    if (cancelBottom) cancelBottom.classList.remove('hidden');
    updateRowNumbers();
}

function cancelEditMode() {
    editingMovieId = null;
    resetMovieForm();
    switchAdminTab('catalog');
    showAlert('contentAlert', 'Edit cancelled.', 'info');
}

function resetMovieForm() {
    editingMovieId = null;
    document.getElementById('movieForm').reset();
    document.getElementById('contentType').value = 'movie';
    if (document.getElementById('contentStatus')) document.getElementById('contentStatus').value = 'published';
    if (document.getElementById('active')) document.getElementById('active').checked = true;

    // Reset previews
    const pPrev = document.getElementById('posterPreview');
    if (pPrev) { pPrev.style.backgroundImage = ''; pPrev.textContent = 'Poster Preview'; }
    const bPrev = document.getElementById('bannerPreview');
    if (bPrev) { bPrev.style.backgroundImage = ''; bPrev.textContent = 'Banner Preview'; }

    // Reset torrent
    document.getElementById('torrentEnabled').checked = false;
    document.getElementById('torrentFieldsContainer').classList.add('hidden');

    document.getElementById('streamLinksContainer').innerHTML = '';
    document.getElementById('downloadOptionsContainer').innerHTML = '';
    document.getElementById('seasonsContainer').innerHTML = '';

    addStreamLink();
    addDownloadOption();
    toggleContentType();

    const titleH2 = document.getElementById('formTitle');
    const btn = document.getElementById('publishBtn');
    const cancelTop = document.getElementById('cancelEditBtn');
    const cancelBottom = document.getElementById('cancelEditBtnBottom');

    if (titleH2) titleH2.textContent = '➕ Add New Content';
    if (btn) btn.textContent = '🎬 Publish Content';
    if (cancelTop) cancelTop.classList.add('hidden');
    if (cancelBottom) cancelBottom.classList.add('hidden');
}

// ─── FORM SUBMISSION (PUBLISH / UPDATE) ───
document.getElementById('movieForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const contentType = document.getElementById('contentType').value;
    const combined = contentType === 'series' && (document.getElementById('combinedEpisodes')?.checked || false);
    const useTopLinks = contentType === 'movie' || combined;
    const streams = useTopLinks ? collectStreams(document.getElementById('movieLinksBlock')) : [];
    const downloads = useTopLinks ? collectDownloads(document.getElementById('movieLinksBlock'), '.download-row') : [];
    const seasons = contentType === 'series' ? collectSeriesSeasons() : [];
    const firstEpisode = seasons[0]?.episodes?.[0];

    // Torrent data
    const torrentEnabled = document.getElementById('torrentEnabled')?.checked || false;
    const torrentMagnet = (document.getElementById('torrentMagnet')?.value || '').trim();
    let torrentData = null;
    if (torrentEnabled && torrentMagnet) {
        torrentData = {
            magnet: torrentMagnet,
            name: (document.getElementById('torrentName')?.value || '').trim(),
            seeders: parseInt(document.getElementById('torrentSeeders')?.value) || 0,
            size: (document.getElementById('torrentSize')?.value || '').trim()
        };
    }

    const movieData = {
        type: contentType,
        title: document.getElementById('title').value.trim(),
        genre: document.getElementById('genre').value,
        year: parseInt(document.getElementById('year').value) || new Date().getFullYear(),
        duration: document.getElementById('duration').value.trim(),
        rating: parseFloat(document.getElementById('rating').value) || 0,
        badge: document.getElementById('badge').value,
        category: document.getElementById('category').value || (contentType === 'series' ? 'series' : 'bollywood_new'),
        industry: document.getElementById('industry').value || 'Bollywood',
        views: parseInt(document.getElementById('views').value) || 0,
        imdb_id: document.getElementById('imdb_id').value.trim(),
        tmdb_id: document.getElementById('tmdb_id').value.trim(),
        poster: document.getElementById('poster').value.trim(),
        banner: document.getElementById('banner').value.trim(),
        combined: combined,
        streamLink: useTopLinks ? (streams[0]?.url || '') : (firstEpisode?.streams?.[0]?.url || ''),
        streams: streams,
        downloads: downloads,
        torrent: torrentData,
        seasons: seasons,
        trailerLink: document.getElementById('trailerLink').value.trim(),
        description: document.getElementById('description').value.trim(),
        featured: document.getElementById('featured').checked,
        trending: document.getElementById('trending').checked,
        heroSlide: document.getElementById('heroSlide')?.checked || false,
        status: document.getElementById('contentStatus')?.value || 'published',
        active: (document.getElementById('contentStatus')?.value || 'published') === 'published'
    };

    if (!movieData.title || !movieData.genre) {
        showAlert('contentAlert', '❌ Title and genre are required', 'error');
        return;
    }

    if (useTopLinks && streams.length === 0) {
        showAlert('contentAlert', `❌ ${combined ? 'Combined series' : 'Movie'} requires at least one streaming server link.`, 'error');
        return;
    }

    if (contentType === 'series' && seasons.length === 0) {
        showAlert('contentAlert', '❌ Series requires at least one season and episode.', 'error');
        return;
    }

    const seriesEpisodeWithoutStream = contentType === 'series' && seasons.some(season => season.episodes.some(ep => ep.streams.length === 0));
    if (seriesEpisodeWithoutStream) {
        showAlert('contentAlert', '❌ Every episode must have at least one stream URL.', 'error');
        return;
    }

    showSpinner(true);

    try {
        const contentBeforeSave = await githubAPI.getContent();
        const duplicate = (contentBeforeSave.movies || []).find(m =>
            String(m.id) !== String(editingMovieId || '') &&
            String(m.title || '').trim().toLowerCase() === movieData.title.toLowerCase() &&
            (m.type || 'movie') === movieData.type
        );
        if (duplicate && !confirm(`⚠️ Content with title "${duplicate.title}" already exists. Save anyway?`)) {
            showSpinner(false);
            return;
        }

        if (editingMovieId) {
            await githubAPI.updateMovie(editingMovieId, movieData);
            showAlert('contentAlert', '✅ Content updated successfully on GitHub!', 'success');
            editingMovieId = null;
        } else {
            await githubAPI.addMovie(movieData);
            showAlert('contentAlert', '🎬 Content published successfully on GitHub!', 'success');
        }

        resetMovieForm();
        switchAdminTab('catalog');
        setTimeout(() => loadMovies(), 1500);

    } catch (error) {
        showAlert('contentAlert', `❌ Error: ${error.message}`, 'error');
    } finally {
        showSpinner(false);
    }
});

// ─── DELEGATED CLICK LISTENER FOR CATALOG ACTIONS ───
document.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-admin-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-admin-action');
    const id = btn.getAttribute('data-id') || '';

    if (action === 'edit') {
        editMovie(id);
    } else if (action === 'delete') {
        deleteMovieConfirm(id, btn.getAttribute('data-title') || '');
    }
});

function deleteMovieConfirm(id, title) {
    if (confirm(`Delete "${title}"? This will permanently remove it from repository content.`)) {
        deleteMovie(id);
    }
}

async function deleteMovie(id) {
    showSpinner(true);
    try {
        await githubAPI.deleteMovie(id);
        showAlert('contentAlert', '✅ Content deleted successfully!', 'success');
        loadMovies();
    } catch (error) {
        showAlert('contentAlert', `❌ Delete failed: ${error.message}`, 'error');
    } finally {
        showSpinner(false);
    }
}

// ─── AUTO-GENERATE 4 VERIFIED STREAMS HELPER ───
function autoGenerateStandardStreams() {
    const imdbId = (document.getElementById('imdb_id')?.value || '').trim();
    const tmdbId = (document.getElementById('tmdb_id')?.value || '').trim();
    const type = document.getElementById('contentType')?.value || 'movie';

    if (!imdbId && !tmdbId) {
        alert('⚠️ Please enter an IMDb ID (e.g. tt1375666) or TMDb ID in the fields above first to auto-generate verified streaming mirrors.');
        document.getElementById('imdb_id')?.focus();
        return;
    }

    const container = document.getElementById('streamLinksContainer');
    container.innerHTML = '';

    const streams = [];

    if (type === 'movie') {
        if (imdbId) streams.push({ name: 'Server 1 (VIP Ultra HD)', url: `https://cinesrc.st/embed/movie/${imdbId}` });
        if (tmdbId) streams.push({ name: 'Server 2 (High Speed HD)', url: `https://vidsrc.pm/embed/movie?tmdb=${tmdbId}` });
        else if (imdbId) streams.push({ name: 'Server 2 (High Speed HD)', url: `https://vidlink.pro/movie/${imdbId}` });
        if (imdbId) streams.push({ name: 'Server 3 (Backup Server)', url: `https://autoembed.co/movie/imdb/${imdbId}` });
        if (imdbId) streams.push({ name: 'Server 4 (Global Mirror)', url: `https://www.2embed.cc/embed/${imdbId}` });
    } else {
        if (imdbId) streams.push({ name: 'Server 1 (VIP Ultra HD)', url: `https://cinesrc.st/embed/tv/${imdbId}?s=1&e=1` });
        if (tmdbId) streams.push({ name: 'Server 2 (High Speed HD)', url: `https://vidsrc.pm/embed/tv?tmdb=${tmdbId}&season=1&episode=1` });
        if (imdbId) streams.push({ name: 'Server 3 (Backup Server)', url: `https://autoembed.co/tv/imdb/${imdbId}-1-1` });
        if (imdbId) streams.push({ name: 'Server 4 (Global Mirror)', url: `https://www.2embed.cc/embedtv/${imdbId}&s=1&e=1` });
    }

    streams.forEach(st => addStreamLink(st));
    showAlert('contentAlert', `⚡ Generated ${streams.length} verified streams for ${imdbId || ('TMDB: ' + tmdbId)}`, 'success');
}

function toggleTorrentFields() {
    const isChecked = document.getElementById('torrentEnabled')?.checked || false;
    const container = document.getElementById('torrentFieldsContainer');
    if (container) {
        if (isChecked) container.classList.remove('hidden');
        else container.classList.add('hidden');
    }
}

// ─── DYNAMIC STREAMS & DOWNLOADS BUILDERS ───
function addStreamLink(data = {}) {
    const container = document.getElementById('streamLinksContainer');
    if (!container) return;
    const index = container.children.length + 1;
    const row = document.createElement('div');
    row.className = 'dynamic-row stream-row';
    row.innerHTML = `
        <div class="row-title">
            <span>Stream Server #${index}</span>
            <button type="button" class="remove-row" onclick="removeDynamicRow(this, 'stream-row')">✕ Remove</button>
        </div>
        <div class="row-grid-2">
            <div class="form-group" style="margin-bottom:0;">
                <label>Server Name</label>
                <input type="text" class="stream-name" placeholder="e.g. Server 1 (VIP HD)" value="${escapeAttr(data.name || `Server ${index}`)}">
            </div>
            <div class="form-group" style="margin-bottom:0;">
                <label>Embed / Stream URL</label>
                <input type="url" class="stream-url" placeholder="https://..." value="${escapeAttr(data.url || '')}">
            </div>
        </div>
    `;
    container.appendChild(row);
    updateRowNumbers();
}

function collectStreams(scope = document) {
    const rows = scope.querySelectorAll('.stream-row');
    const streams = [];
    rows.forEach((row, i) => {
        const name = row.querySelector('.stream-name')?.value.trim() || `Server ${i + 1}`;
        const url = row.querySelector('.stream-url')?.value.trim();
        if (url) streams.push({ name, url });
    });
    return streams;
}

function addDownloadOption(data = {}) {
    const container = document.getElementById('downloadOptionsContainer');
    if (!container) return;
    const row = createDownloadRow(data);
    container.appendChild(row);
    updateRowNumbers();
}

function createDownloadRow(data = {}, className = 'download-row') {
    const row = document.createElement('div');
    row.className = `dynamic-row ${className}`;
    const selectedQuality = data.quality || '1080p FHD';
    const customQuality = isCustomQuality(selectedQuality) ? selectedQuality : '';

    row.innerHTML = `
        <div class="row-title">
            <span>Download Option</span>
            <button type="button" class="remove-row" onclick="removeDynamicRow(this, '${className}')">✕ Remove</button>
        </div>
        <div class="row-grid-4">
            <div class="form-group" style="margin-bottom:0;">
                <label>Quality</label>
                <select class="download-quality" onchange="toggleCustomQuality(this)">
                    ${qualityOptions(selectedQuality)}
                </select>
                <input type="text" class="download-custom-quality ${customQuality ? '' : 'hidden'}" placeholder="Custom quality" value="${escapeAttr(customQuality)}" style="margin-top:6px;">
            </div>
            <div class="form-group" style="margin-bottom:0;">
                <label>Size</label>
                <input type="number" class="download-size-num" placeholder="950" value="${escapeAttr(parseSizeNumber(data.size || ''))}" step="any">
            </div>
            <div class="form-group" style="margin-bottom:0;">
                <label>Unit</label>
                <select class="download-size-unit">
                    <option value="MB" ${parseSizeUnit(data.size) === 'MB' ? 'selected' : ''}>MB</option>
                    <option value="GB" ${parseSizeUnit(data.size) === 'GB' ? 'selected' : ''}>GB</option>
                </select>
            </div>
            <div class="form-group" style="margin-bottom:0;">
                <label>Cloud Download Link</label>
                <input type="url" class="download-url" placeholder="https://..." value="${escapeAttr(data.url || '')}">
            </div>
        </div>
        <div class="rogue-warning"></div>
    `;

    // Live Rogue Link Detection
    const urlInput = row.querySelector('.download-url');
    const warningBox = row.querySelector('.rogue-warning');

    function checkRogueLink() {
        const val = (urlInput.value || '').toLowerCase();
        const isRogue = val.includes('vegamovies') || val.includes('nexdrive.beer') || val.includes('nexdrive.fit');
        if (isRogue) {
            warningBox.textContent = '⚠️ Rogue link detected! Vegamovies/NexDrive ad redirect hubs are prohibited. Please provide direct clean cloud links (HubDrive, HubCloud, GoFile, etc.)';
            warningBox.classList.add('show');
        } else {
            warningBox.classList.remove('show');
        }
    }

    urlInput.addEventListener('input', checkRogueLink);
    checkRogueLink();

    return row;
}

function collectDownloads(scope = document, selector = '.download-row') {
    const rows = scope.querySelectorAll(selector);
    const downloads = [];
    rows.forEach(row => {
        const select = row.querySelector('.download-quality');
        const customInput = row.querySelector('.download-custom-quality');
        let quality = select?.value || '1080p FHD';
        if (quality === 'custom') quality = customInput?.value.trim() || 'Custom';

        const sizeNum = row.querySelector('.download-size-num')?.value.trim();
        const sizeUnit = row.querySelector('.download-size-unit')?.value || 'MB';
        const size = sizeNum ? `${sizeNum} ${sizeUnit}` : '';
        const url = row.querySelector('.download-url')?.value.trim();

        if (url) {
            downloads.push({ quality, size, url });
        }
    });
    return downloads;
}

function qualityOptions(selected = '') {
    const standard = ['480p SD', '720p HD', '1080p FHD', '4K Ultra HD', 'Custom'];
    return standard.map(q => `<option value="${q}" ${selected === q ? 'selected' : ''}>${q}</option>`).join('');
}

function isCustomQuality(value) {
    const standard = ['480p SD', '720p HD', '1080p FHD', '4K Ultra HD'];
    return value && !standard.includes(value);
}

function toggleCustomQuality(select) {
    const customInput = select.parentElement.querySelector('.download-custom-quality');
    if (select.value === 'Custom') customInput.classList.remove('hidden');
    else customInput.classList.add('hidden');
}

function parseSizeNumber(size = '') {
    const match = String(size).match(/([\d.]+)/);
    return match ? match[1] : '';
}

function parseSizeUnit(size = '') {
    return String(size).toUpperCase().includes('GB') ? 'GB' : 'MB';
}

// ─── SERIES SEASONS & EPISODES BUILDERS ───
function addSeason(data = {}) {
    const container = document.getElementById('seasonsContainer');
    if (!container) return;
    const seasonIndex = container.children.length + 1;
    const seasonNo = data.seasonNumber || seasonIndex;

    const block = document.createElement('div');
    block.className = 'season-block';
    block.innerHTML = `
        <div class="season-head">
            <div class="form-group" style="margin-bottom:0;">
                <label>Season #</label>
                <input type="number" class="season-number" value="${seasonNo}" min="1">
            </div>
            <div class="form-group" style="margin-bottom:0;">
                <label>Season Title</label>
                <input type="text" class="season-title" placeholder="Season ${seasonNo}" value="${escapeAttr(data.title || `Season ${seasonNo}`)}">
            </div>
            <button type="button" class="remove-row" onclick="removeAnyRow(this)">✕ Remove Season</button>
        </div>

        <div class="episodes-container"></div>

        <div class="nested-actions">
            <button type="button" class="btn-small btn-secondary" onclick="addEpisode(this)">＋ Add Episode</button>
        </div>
    `;

    container.appendChild(block);
    const epContainer = block.querySelector('.episodes-container');
    (data.episodes || [{ episodeNumber: 1, title: 'Episode 1' }]).forEach(ep => addEpisode(epContainer, ep));
}

function addEpisode(target, data = {}) {
    const epContainer = target.classList?.contains('episodes-container') ? target : target.closest('.season-block').querySelector('.episodes-container');
    const epIndex = epContainer.children.length + 1;
    const epNo = data.episodeNumber || epIndex;

    const block = document.createElement('div');
    block.className = 'episode-block';
    block.innerHTML = `
        <div class="episode-mini-title">
            <span>Episode #${epNo}</span>
            <button type="button" class="remove-row" onclick="removeAnyRow(this)">✕ Remove Episode</button>
        </div>
        <div class="grid-2">
            <div class="form-group" style="margin-bottom:10px;">
                <label>Episode #</label>
                <input type="number" class="episode-number" value="${epNo}" min="1">
            </div>
            <div class="form-group" style="margin-bottom:10px;">
                <label>Episode Title</label>
                <input type="text" class="episode-title" placeholder="e.g. Episode 1 or Finale" value="${escapeAttr(data.title || `Episode ${epNo}`)}">
            </div>
        </div>

        <div class="episode-streams-block">
            <div class="dynamic-header"><label>Episode Streams</label><button type="button" class="btn-small btn-secondary" onclick="addEpisodeStream(this)">＋ Add Stream</button></div>
            <div class="ep-streams-container"></div>
        </div>

        <div class="episode-downloads-block" style="margin-top:10px;">
            <div class="dynamic-header"><label>Episode Downloads</label><button type="button" class="btn-small btn-secondary" onclick="addEpisodeDownload(this)">＋ Add Download</button></div>
            <div class="ep-downloads-container"></div>
        </div>
    `;

    epContainer.appendChild(block);
    const stContainer = block.querySelector('.ep-streams-container');
    const streams = data.streams && data.streams.length ? data.streams : (data.streamLink ? [{ name: 'Server 1', url: data.streamLink }] : [{}]);
    streams.forEach(st => addEpisodeStream(stContainer, st));

    const dlContainer = block.querySelector('.ep-downloads-container');
    (data.downloads && data.downloads.length ? data.downloads : []).forEach(dl => addEpisodeDownload(dlContainer, dl));
}

function addEpisodeStream(target, data = {}) {
    const container = target.classList?.contains('ep-streams-container') ? target : target.closest('.episode-streams-block').querySelector('.ep-streams-container');
    const row = document.createElement('div');
    row.className = 'mini-row ep-stream-row';
    row.innerHTML = `
        <div class="row-grid-2">
            <input type="text" class="ep-stream-name" placeholder="Server Name" value="${escapeAttr(data.name || 'Server 1')}">
            <div style="display:flex; gap:6px;">
                <input type="url" class="ep-stream-url" placeholder="Stream URL" value="${escapeAttr(data.url || '')}">
                <button type="button" class="remove-row" onclick="removeAnyRow(this)">✕</button>
            </div>
        </div>
    `;
    container.appendChild(row);
}

function addEpisodeDownload(target, data = {}) {
    const container = target.classList?.contains('ep-downloads-container') ? target : target.closest('.episode-downloads-block').querySelector('.ep-downloads-container');
    const row = createDownloadRow(data, 'ep-download-row');
    container.appendChild(row);
}

function collectSeriesSeasons() {
    const seasonBlocks = document.querySelectorAll('#seasonsContainer .season-block');
    const seasons = [];

    seasonBlocks.forEach(sb => {
        const seasonNumber = parseInt(sb.querySelector('.season-number')?.value) || 1;
        const title = sb.querySelector('.season-title')?.value.trim() || `Season ${seasonNumber}`;
        const epBlocks = sb.querySelectorAll('.episode-block');
        const episodes = [];

        epBlocks.forEach(eb => {
            const episodeNumber = parseInt(eb.querySelector('.episode-number')?.value) || 1;
            const epTitle = eb.querySelector('.episode-title')?.value.trim() || `Episode ${episodeNumber}`;
            const epStreams = collectEpisodeStreams(eb);
            const epDownloads = collectDownloads(eb, '.ep-download-row');

            episodes.push({
                episodeNumber,
                title: epTitle,
                streams: epStreams,
                streamLink: epStreams[0]?.url || '',
                downloads: epDownloads
            });
        });

        seasons.push({ seasonNumber, title, episodes });
    });

    return seasons;
}

function collectEpisodeStreams(epBlock) {
    const rows = epBlock.querySelectorAll('.ep-stream-row');
    const streams = [];
    rows.forEach((r, i) => {
        const name = r.querySelector('.ep-stream-name')?.value.trim() || `Server ${i + 1}`;
        const url = r.querySelector('.ep-stream-url')?.value.trim();
        if (url) streams.push({ name, url });
    });
    return streams;
}

function removeAnyRow(button) {
    const row = button.closest('.dynamic-row, .season-block, .episode-block, .mini-row');
    if (row) row.remove();
    updateRowNumbers();
}

function removeDynamicRow(button, className) {
    const row = button.closest(`.${className}`);
    if (row) row.remove();
    updateRowNumbers();
}

function updateRowNumbers() {
    document.querySelectorAll('.stream-row').forEach((row, i) => {
        const title = row.querySelector('.row-title span');
        if (title) title.textContent = `Stream Server #${i + 1}`;
    });
}

function toggleContentType() {
    const type = document.getElementById('contentType')?.value || 'movie';
    const seriesBlock = document.getElementById('seriesBuilderBlock');
    const movieLinksBlock = document.getElementById('movieLinksBlock');
    const combined = document.getElementById('combinedEpisodes')?.checked || false;

    if (type === 'series') {
        if (seriesBlock) seriesBlock.classList.remove('hidden');
        if (combined) {
            if (movieLinksBlock) movieLinksBlock.classList.remove('hidden');
        } else {
            if (movieLinksBlock) movieLinksBlock.classList.add('hidden');
        }
    } else {
        if (seriesBlock) seriesBlock.classList.add('hidden');
        if (movieLinksBlock) movieLinksBlock.classList.remove('hidden');
    }
}

function toggleCombined() {
    toggleContentType();
}

// ─── IMAGE PREVIEW HELPERS ───
function setupImagePreviews() {
    setupImagePreview('poster', 'posterPreview');
    setupImagePreview('banner', 'bannerPreview');
}

function setupImagePreview(inputId, previewId) {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    if (!input || !preview) return;

    const val = input.value.trim();
    if (val && (val.startsWith('http://') || val.startsWith('https://'))) {
        preview.style.backgroundImage = `url("${val}")`;
        preview.textContent = '';
    } else {
        preview.style.backgroundImage = '';
        preview.textContent = previewId === 'posterPreview' ? 'Poster Preview' : 'Banner Preview';
    }
}

// ─── TMDB SEARCH & AUTO-FILL ───
function initTMDBAutoFill() {
    const token = getTMDBToken();
    const tokenInput = document.getElementById('tmdbToken');
    if (token && tokenInput) tokenInput.value = token;
}

function saveTMDBToken() {
    const token = document.getElementById('tmdbToken')?.value.trim();
    if (token) {
        localStorage.setItem(TMDB_API_KEY_STORAGE, token);
        showAlert('contentAlert', '✅ TMDB Token saved securely in browser!', 'success');
        togglePanel('tmdbTokenBody');
    }
}

function getTMDBToken() {
    return localStorage.getItem(TMDB_API_KEY_STORAGE) || '';
}

function tmdbHeaders() {
    const token = getTMDBToken();
    return {
        'Accept': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
}

async function searchTMDB() {
    const query = document.getElementById('tmdbSearchInput')?.value.trim();
    if (!query) return;

    const resultsContainer = document.getElementById('tmdbResults');
    resultsContainer.innerHTML = '<div class="spinner show" style="display:block;"></div>';

    const token = getTMDBToken();
    const endpoint = token
        ? `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(query)}&include_adult=false&language=en-US&page=1`
        : `https://api.themoviedb.org/3/search/multi?api_key=4b706c9bc9e5c3b9b4a48dc776bf7744&query=${encodeURIComponent(query)}&include_adult=false&language=en-US&page=1`;

    try {
        const resp = await fetch(endpoint, { headers: token ? tmdbHeaders() : {} });
        if (!resp.ok) throw new Error(`TMDB HTTP error ${resp.status}`);
        const data = await resp.json();
        const results = (data.results || []).filter(r => r.media_type === 'movie' || r.media_type === 'tv');

        if (results.length === 0) {
            resultsContainer.innerHTML = '<p style="color:var(--muted); grid-column:1/-1; padding:20px 0;">No results found on TMDB.</p>';
            return;
        }

        resultsContainer.innerHTML = results.map(r => {
            const isMovie = r.media_type === 'movie';
            const title = isMovie ? r.title : r.name;
            const year = (isMovie ? r.release_date : r.first_air_date || '').slice(0, 4);
            const poster = r.poster_path ? `https://image.tmdb.org/t/p/w342${r.poster_path}` : '';

            return `
                <div class="tmdb-card" onclick="selectTMDBResult(${r.id}, '${r.media_type}')">
                    <img src="${poster || 'data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'180\\' height=\\'270\\' fill=\\'%23111\\'%3E%3Crect width=\\'180\\' height=\\'270\\'/%3E%3Ctext x=\\'50%25\\' y=\\'50%25\\' fill=\\'%235bc4f5\\' font-size=\\'12\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\'%3ENo Poster%3C/text%3E%3C/svg%3E'}" alt="${escapeAttr(title)}" loading="lazy">
                    <div class="tmdb-card-info">
                        <strong>${escapeAttr(title)}</strong>
                        <span>${isMovie ? 'Movie' : 'TV Series'} ${year ? '• ' + year : ''}</span>
                        <button type="button" class="btn-small btn-primary btn-populate">📥 Populate Form</button>
                    </div>
                </div>
            `;
        }).join('');

    } catch (err) {
        resultsContainer.innerHTML = `<p style="color:var(--error); grid-column:1/-1;">Search failed: ${err.message}</p>`;
    }
}

async function selectTMDBResult(id, type) {
    showSpinner(true);
    const token = getTMDBToken();
    const isMovie = type === 'movie';
    const baseUrl = `https://api.themoviedb.org/3/${isMovie ? 'movie' : 'tv'}/${id}`;
    const url = token ? `${baseUrl}?append_to_response=external_ids` : `${baseUrl}?api_key=4b706c9bc9e5c3b9b4a48dc776bf7744&append_to_response=external_ids`;

    try {
        const resp = await fetch(url, { headers: token ? tmdbHeaders() : {} });
        if (!resp.ok) throw new Error(`TMDB details error ${resp.status}`);
        const data = await resp.json();

        // Switch to editor
        switchAdminTab('editor');

        setInputValue('contentType', isMovie ? 'movie' : 'series');
        toggleContentType();

        setInputValue('title', isMovie ? data.title : data.name);
        setInputValue('year', (isMovie ? data.release_date : data.first_air_date || '').slice(0, 4));
        setInputValue('rating', data.vote_average ? data.vote_average.toFixed(1) : '');

        if (isMovie && data.runtime) {
            setInputValue('duration', formatMinutes(data.runtime));
        } else if (!isMovie && data.number_of_seasons) {
            setInputValue('duration', `${data.number_of_seasons} Season${data.number_of_seasons > 1 ? 's' : ''}`);
        }

        if (data.genres && data.genres.length) {
            setSelectValue('genre', data.genres[0].name);
        }

        if (data.poster_path) {
            setInputValue('poster', `https://image.tmdb.org/t/p/w500${data.poster_path}`);
            setupImagePreview('poster', 'posterPreview');
        }

        if (data.backdrop_path) {
            setInputValue('banner', `https://image.tmdb.org/t/p/original${data.backdrop_path}`);
            setupImagePreview('banner', 'bannerPreview');
        }

        setInputValue('description', data.overview || '');
        setInputValue('tmdb_id', String(data.id || ''));

        // IMDb ID from external_ids
        const imdbId = data.external_ids?.imdb_id || '';
        if (imdbId) {
            setInputValue('imdb_id', imdbId);
        }

        // Auto-detect category & industry based on original language
        const lang = data.original_language || '';
        if (lang === 'hi') {
            setSelectValue('category', isMovie ? 'bollywood_new' : 'series');
            setSelectValue('industry', 'Bollywood');
        } else if (['te', 'ta', 'ml', 'kn'].includes(lang)) {
            setSelectValue('category', isMovie ? 'south_new' : 'series');
            setSelectValue('industry', 'South');
        } else {
            setSelectValue('category', isMovie ? 'hollywood' : 'series');
            setSelectValue('industry', 'Hollywood');
        }

        // Auto-generate standard streams if IMDb ID is available
        if (imdbId) {
            autoGenerateStandardStreams();
        }

        showAlert('contentAlert', `✅ Populated from TMDB: "${isMovie ? data.title : data.name}"`, 'success');

    } catch (err) {
        showAlert('contentAlert', `❌ Error fetching details: ${err.message}`, 'error');
    } finally {
        showSpinner(false);
    }
}

// ─── SITE SETTINGS CONTROLLER ───
async function loadSiteSettings() {
    try {
        const content = await githubAPI.getContent();
        const settings = content.settings || {};

        setInputValue('siteBaseUrl', settings.siteBaseUrl || '');
        setInputValue('telegramRequestLink', settings.request?.link || '');
        setInputValue('requestButtonText', settings.request?.buttonText || '');

        const stats = settings.stats || {};
        setInputValue('baseTotalStats', stats.baseTotal || 5000);
        setInputValue('base4kStats', stats.base4K || 1800);
        setInputValue('baseTorrentStats', stats.baseTorrents || 3200);

    } catch (err) {
        console.warn('Error loading site settings:', err);
    }
}

async function saveSiteSettings() {
    showSpinner(true);
    try {
        const settingsData = {
            siteBaseUrl: (document.getElementById('siteBaseUrl')?.value || '').trim(),
            request: {
                link: (document.getElementById('telegramRequestLink')?.value || '').trim(),
                buttonText: (document.getElementById('requestButtonText')?.value || '📩 Request on Telegram').trim()
            },
            stats: {
                baseTotal: parseInt(document.getElementById('baseTotalStats')?.value) || 5000,
                base4K: parseInt(document.getElementById('base4kStats')?.value) || 1800,
                baseTorrents: parseInt(document.getElementById('baseTorrentStats')?.value) || 3200,
                suffix: '+'
            }
        };

        await githubAPI.updateSiteSettings(settingsData);
        showAlert('contentAlert', '✅ Site settings updated successfully!', 'success');

    } catch (err) {
        showAlert('contentAlert', `❌ Error saving settings: ${err.message}`, 'error');
    } finally {
        showSpinner(false);
    }
}

function xmlEscape(val) {
    return String(val || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

async function generateSitemap() {
    showSpinner(true);
    try {
        const content = await githubAPI.getContent();
        const baseUrl = (content.settings?.siteBaseUrl || document.getElementById('siteBaseUrl')?.value || 'https://phantommovies.pages.dev').replace(/\/+$/, '');
        const movies = content.movies || [];

        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
        xml += `  <url><loc>${xmlEscape(baseUrl)}/</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>\n`;
        xml += `  <url><loc>${xmlEscape(baseUrl)}/movies.html</loc><changefreq>hourly</changefreq><priority>0.9</priority></url>\n`;
        xml += `  <url><loc>${xmlEscape(baseUrl)}/series.html</loc><changefreq>hourly</changefreq><priority>0.9</priority></url>\n`;
        xml += `  <url><loc>${xmlEscape(baseUrl)}/trending.html</loc><changefreq>hourly</changefreq><priority>0.8</priority></url>\n`;

        movies.forEach(m => {
            const path = m.type === 'series' ? `series.html?id=${encodeURIComponent(m.id)}` : `movie.html?id=${encodeURIComponent(m.id)}`;
            xml += `  <url><loc>${xmlEscape(baseUrl)}/${path}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>\n`;
        });

        xml += '</urlset>';

        await githubAPI.updateSitemap(xml);
        showAlert('contentAlert', `✅ Generated sitemap with ${movies.length + 4} URLs!`, 'success');

    } catch (err) {
        showAlert('contentAlert', `❌ Sitemap error: ${err.message}`, 'error');
    } finally {
        showSpinner(false);
    }
}

// ─── LIVE MIRROR HEALTH INSPECTOR ───
async function loadMirrorHealth() {
    const container = document.getElementById('mirrorHealthContainer');
    if (!container) return;
    container.innerHTML = '<div class="spinner show" style="display:block;"></div><p style="text-align:center; color:var(--muted); padding:20px;">Fetching live mirror health...</p>';

    try {
        let mirrorsData = null;
        try {
            const resp = await fetch('data/mirrors.json?t=' + Date.now());
            if (resp.ok) mirrorsData = await resp.json();
        } catch (e) {
            console.warn('Local mirrors fetch error:', e);
        }

        if (!mirrorsData && githubAPI.username) {
            const rawMirrors = await githubAPI.getFileText('data/mirrors.json');
            if (rawMirrors) {
                mirrorsData = JSON.parse(rawMirrors);
            }
        }

        if (!mirrorsData) throw new Error('Could not load data/mirrors.json from disk or GitHub');

        const scrapers = mirrorsData.scrapers || {};
        const streaming = mirrorsData.streaming?.providers || [];
        const updatedAt = mirrorsData.updatedAt ? new Date(mirrorsData.updatedAt).toLocaleString() : 'Recent';

        let html = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px; padding-bottom:12px; border-bottom:1px solid var(--border);">
                <span style="font-size:13px; color:var(--muted);">Last Synchronized: <strong style="color:var(--text);">${escapeAttr(updatedAt)}</strong></span>
                <span class="status-pill online">All Systems Online 🟢</span>
            </div>

            <h3 style="font-size:16px; margin: 16px 0 10px; color:var(--primary); font-weight:700;">📡 Upstream Scraper Engines</h3>
            <div class="mirror-grid">
        `;

        for (const [name, s] of Object.entries(scrapers)) {
            const isOnline = s.status === 'online' || !s.status;
            html += `
                <div class="mirror-card">
                    <div class="mirror-card-head">
                        <span class="mirror-name">${name.toUpperCase()}</span>
                        <div style="display:flex; gap:6px;">
                            ${s.latency_ms ? `<span class="status-pill latency">${s.latency_ms}ms</span>` : ''}
                            <span class="status-pill ${isOnline ? 'online' : 'draft'}">${s.status || 'Active'}</span>
                        </div>
                    </div>
                    <div class="mirror-detail-row">
                        <strong>Active Domain:</strong> <a href="${escapeAttr(s.active)}" target="_blank">${escapeAttr(s.active)}</a>
                    </div>
                    ${s.portal ? `<div class="mirror-detail-row"><strong>Portal:</strong> <a href="${escapeAttr(s.portal)}" target="_blank">${escapeAttr(s.portal)}</a></div>` : ''}
                    ${s.mirrors && s.mirrors.length ? `
                        <div class="mirror-detail-row" style="margin-top:8px;">
                            <strong>Failover Mirrors (${s.mirrors.length}):</strong>
                            <div style="font-size:11px; margin-top:4px; max-height:80px; overflow-y:auto; color:var(--muted); line-height:1.6;">
                                ${s.mirrors.map(m => `<div>• <a href="${escapeAttr(m)}" target="_blank">${escapeAttr(m)}</a></div>`).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;
        }

        html += `
            </div>
            <h3 style="font-size:16px; margin: 28px 0 10px; color:var(--primary); font-weight:700;">🎥 Verified Streaming Embed Mirrors</h3>
            <div class="mirror-grid">
        `;

        streaming.forEach(p => {
            html += `
                <div class="mirror-card">
                    <div class="mirror-card-head">
                        <span class="mirror-name">${escapeAttr(p.name)}</span>
                        <span class="status-pill online">Verified</span>
                    </div>
                    <div class="mirror-detail-row">
                        <strong>Domains:</strong> ${(p.domains || []).map(d => `<a href="${escapeAttr(d)}" target="_blank">${escapeAttr(d)}</a>`).join(', ')}
                    </div>
                    ${p.movieTemplate ? `<div class="mirror-detail-row"><strong>Movie Path:</strong> <code>${escapeAttr(p.movieTemplate)}</code></div>` : ''}
                    ${p.tvTemplate ? `<div class="mirror-detail-row"><strong>TV Path:</strong> <code>${escapeAttr(p.tvTemplate)}</code></div>` : ''}
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;

    } catch (err) {
        container.innerHTML = `<div class="alert alert-error show">❌ Failed to inspect mirrors: ${escapeAttr(err.message)}</div>`;
    }
}

// ─── ADS MONETIZATION CONTROLLER ───
function getAdsFormData() {
    return {
        enabled: document.getElementById('adsEnabled')?.checked ?? true,
        headScripts: {
            monetag: document.getElementById('adMonetagHead')?.value.trim() || '',
            adsterra: document.getElementById('adAdsterraHead')?.value.trim() || '',
            monetagMultitag: document.getElementById('adMonetagMultitag')?.value.trim() || '',
            adsterraSocialBar: document.getElementById('adAdsterraSocialBar')?.value.trim() || ''
        },
        clickAd: {
            enabled: document.getElementById('clickAdEnabled')?.checked || false,
            url: document.getElementById('clickAdUrl')?.value.trim() || '',
            frequency: document.getElementById('clickAdFrequency')?.value || 'session',
            onDownloads: document.getElementById('clickAdDownloads')?.checked ?? true,
            onStreams: document.getElementById('clickAdStreams')?.checked || false
        },
        slots: {
            homeTop: document.getElementById('adHomeTop')?.value.trim() || '',
            homeGrid: document.getElementById('adHomeGrid')?.value.trim() || '',
            homeBottom: document.getElementById('adHomeBottom')?.value.trim() || '',
            moviePlayerTop: document.getElementById('adMoviePlayerTop')?.value.trim() || '',
            movieDownloads: document.getElementById('adMovieDownloads')?.value.trim() || '',
            movieBottom: document.getElementById('adMovieBottom')?.value.trim() || '',
            seriesPlayerTop: document.getElementById('adSeriesPlayerTop')?.value.trim() || '',
            seriesDownloads: document.getElementById('adSeriesDownloads')?.value.trim() || '',
            seriesBottom: document.getElementById('adSeriesBottom')?.value.trim() || '',
            floatingBottom: document.getElementById('adFloatingBottom')?.value.trim() || '',
            popup: document.getElementById('adPopup')?.value.trim() || ''
        }
    };
}

function setAdsFormData(ads = {}) {
    if (document.getElementById('adsEnabled')) document.getElementById('adsEnabled').checked = ads.enabled !== false;
    const hs = ads.headScripts || {};
    setTextareaValue('adMonetagHead', hs.monetag);
    setTextareaValue('adAdsterraHead', hs.adsterra);
    setTextareaValue('adMonetagMultitag', hs.monetagMultitag);
    setTextareaValue('adAdsterraSocialBar', hs.adsterraSocialBar);

    const ca = ads.clickAd || {};
    if (document.getElementById('clickAdEnabled')) document.getElementById('clickAdEnabled').checked = !!ca.enabled;
    setInputValue('clickAdUrl', ca.url || '');
    setSelectValue('clickAdFrequency', ca.frequency || 'session');
    if (document.getElementById('clickAdDownloads')) document.getElementById('clickAdDownloads').checked = ca.onDownloads !== false;
    if (document.getElementById('clickAdStreams')) document.getElementById('clickAdStreams').checked = !!ca.onStreams;

    const sl = ads.slots || {};
    setTextareaValue('adHomeTop', sl.homeTop);
    setTextareaValue('adHomeGrid', sl.homeGrid);
    setTextareaValue('adHomeBottom', sl.homeBottom);
    setTextareaValue('adMoviePlayerTop', sl.moviePlayerTop);
    setTextareaValue('adMovieDownloads', sl.movieDownloads);
    setTextareaValue('adMovieBottom', sl.movieBottom);
    setTextareaValue('adSeriesPlayerTop', sl.seriesPlayerTop);
    setTextareaValue('adSeriesDownloads', sl.seriesDownloads);
    setTextareaValue('adSeriesBottom', sl.seriesBottom);
    setTextareaValue('adFloatingBottom', sl.floatingBottom);
    setTextareaValue('adPopup', sl.popup);
}

function setTextareaValue(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
}

async function loadAdsSettings() {
    try {
        const content = await githubAPI.getContent();
        setAdsFormData(content.settings?.ads || {});
    } catch (e) {
        console.warn('Error loading ads settings:', e);
    }
}

async function saveAdsSettings() {
    showSpinner(true);
    try {
        const adsData = getAdsFormData();
        await githubAPI.updateAds(adsData);
        showAlert('contentAlert', '✅ Ads settings saved successfully!', 'success');
    } catch (err) {
        showAlert('contentAlert', `❌ Error saving ads: ${err.message}`, 'error');
    } finally {
        showSpinner(false);
    }
}

function clearAdsSettings() {
    if (confirm('Clear all ad code configurations?')) {
        setAdsFormData({});
        showAlert('contentAlert', 'Ad codes cleared in form. Click "Save Ads Settings" to apply to GitHub.', 'info');
    }
}

// ─── SIMPLE AD BUILDER ───
const SIMPLE_AD_CONFIG = {
    monetag: {
        multitag: { label: 'Monetag MultiTag Script', codeLabel: 'Paste Monetag MultiTag Script', targets: ['adMonetagHead'] },
        onclick: { label: 'OnClick (Popunder) Script', codeLabel: 'Paste OnClick Script', targets: ['adMonetagHead'] },
        push: { label: 'In-Page Push / Banner', codeLabel: 'Paste Banner Script', targets: ['adHomeTop', 'adMoviePlayerTop', 'adFloatingBottom'] }
    },
    adsterra: {
        direct_link: { label: 'Direct Link (On-Click)', codeLabel: 'Paste Direct Link URL', isDirectLink: true, targets: ['clickAdUrl'] },
        social_bar: { label: 'Social Bar Script', codeLabel: 'Paste Social Bar Script', targets: ['adAdsterraHead'] },
        popunder: { label: 'Popunder Script', codeLabel: 'Paste Popunder Script', targets: ['adAdsterraHead'] },
        banner_728: { label: 'Banner 728x90', codeLabel: 'Paste 728x90 Code', targets: ['adHomeTop', 'adMovieBottom', 'adSeriesBottom'] },
        native: { label: 'Native Banner 4:1', codeLabel: 'Paste Native Banner Code', targets: ['adHomeGrid', 'adMovieDownloads', 'adSeriesDownloads'] }
    },
    custom: {
        custom_head: { label: 'Custom Global Head Script', codeLabel: 'Paste Script', targets: ['adMonetagHead'] },
        custom_banner: { label: 'Custom Content Banner', codeLabel: 'Paste HTML / Script', targets: ['adHomeGrid', 'adMovieDownloads'] }
    }
};

const SIMPLE_AD_TARGET_LABELS = {
    adMonetagHead: 'Global Head Script',
    adAdsterraHead: 'Global Social Bar / Popunder',
    adHomeTop: 'Home Hero Bottom Banner',
    adHomeGrid: 'Home Movie Grid Native',
    adHomeBottom: 'Home Bottom Banner',
    adMoviePlayerTop: 'Movie Player Top',
    adMovieDownloads: 'Movie Downloads Area',
    adMovieBottom: 'Movie Bottom Banner',
    adSeriesPlayerTop: 'Series Player Top',
    adSeriesDownloads: 'Series Downloads Area',
    adSeriesBottom: 'Series Bottom Banner',
    adFloatingBottom: 'Mobile Floating Bottom Sticky',
    clickAdUrl: 'Direct Link Click Redirect'
};

function initSimpleAdBuilder() {
    updateSimpleAdTypeOptions();
}

function updateSimpleAdTypeOptions() {
    const network = document.getElementById('simpleAdNetwork')?.value || 'monetag';
    const select = document.getElementById('simpleAdType');
    if (!select) return;

    const types = SIMPLE_AD_CONFIG[network] || {};
    select.innerHTML = Object.entries(types).map(([key, item]) => `<option value="${key}">${item.label}</option>`).join('');
    updateSimpleAdPlacements();
}

function getSimpleAdType() {
    const network = document.getElementById('simpleAdNetwork')?.value || 'monetag';
    const typeKey = document.getElementById('simpleAdType')?.value || '';
    return (SIMPLE_AD_CONFIG[network] || {})[typeKey] || null;
}

function updateSimpleAdPlacements() {
    const type = getSimpleAdType();
    const container = document.getElementById('simpleAdPlacements');
    const label = document.getElementById('simpleAdCodeLabel');
    if (!type || !container) return;

    if (label) label.textContent = type.codeLabel || 'Ad Code / Link';

    const defaultTargets = new Set(type.targets || []);
    container.innerHTML = Object.entries(SIMPLE_AD_TARGET_LABELS).map(([id, text]) => `
        <label class="placement-option">
            <input type="checkbox" value="${id}" ${defaultTargets.has(id) ? 'checked' : ''}>
            <div>
                <strong>${text}</strong>
                <span>Slot ID: ${id}</span>
            </div>
        </label>
    `).join('');
}

function applySimpleAdSetup() {
    const code = document.getElementById('simpleAdCode')?.value.trim();
    if (!code) {
        alert('Please paste ad code or direct link first.');
        return;
    }

    const type = getSimpleAdType();
    const checked = Array.from(document.querySelectorAll('#simpleAdPlacements input:checked')).map(i => i.value);

    if (type?.isDirectLink) {
        const urlInput = document.getElementById('clickAdUrl');
        const enableCheck = document.getElementById('clickAdEnabled');
        if (urlInput) urlInput.value = code;
        if (enableCheck) enableCheck.checked = true;
    } else {
        checked.forEach(slotId => {
            const el = document.getElementById(slotId);
            if (el) el.value = code;
        });
    }

    showAlert('contentAlert', '✅ Ad applied to selected slots! Click "Save Ads Settings" to publish to GitHub.', 'success');
}

// ─── BULK QUICK ADD CONTROLLER ───
function qaLog(msg) {
    const log = document.getElementById('quickAddLog');
    if (log) log.textContent += msg + '\n';
}

async function runQuickAdd() {
    const input = document.getElementById('quickAddInput')?.value.trim();
    if (!input) return;

    const logEl = document.getElementById('quickAddLog');
    if (logEl) logEl.textContent = '🚀 Starting bulk import...\n';
    showSpinner(true);

    const lines = input.split('\n').map(l => l.trim()).filter(Boolean);
    const moviesToAdd = [];

    for (let i = 0; i < lines.length; i++) {
        const parts = lines[i].split('|').map(p => p.trim());
        const title = parts[0];
        const stream = parts[1] || '';
        const download = parts[2] || '';
        const type = (parts[3] || 'movie').toLowerCase();

        qaLog(`[${i + 1}/${lines.length}] Searching TMDB for "${title}"...`);

        try {
            const token = getTMDBToken();
            const searchUrl = token
                ? `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(title)}&include_adult=false`
                : `https://api.themoviedb.org/3/search/multi?api_key=4b706c9bc9e5c3b9b4a48dc776bf7744&query=${encodeURIComponent(title)}&include_adult=false`;

            const resp = await fetch(searchUrl, { headers: token ? tmdbHeaders() : {} });
            const data = await resp.json();
            const hit = (data.results || []).find(r => r.media_type === (type === 'series' ? 'tv' : 'movie')) || data.results?.[0];

            let movieData = {
                type: type === 'series' ? 'series' : 'movie',
                title: title,
                genre: 'Action',
                year: new Date().getFullYear(),
                duration: '2h 00m',
                rating: 7.5,
                badge: 'NEW',
                category: type === 'series' ? 'series' : 'bollywood_new',
                industry: 'Bollywood',
                views: 5000,
                imdb_id: '',
                tmdb_id: '',
                poster: '',
                banner: '',
                description: '',
                streamLink: stream,
                streams: stream ? [{ name: 'Server 1 (VIP HD)', url: stream }] : [],
                downloads: download ? [{ quality: '1080p FHD', size: '1.4 GB', url: download }] : [],
                seasons: [],
                featured: false,
                trending: true,
                status: 'published',
                active: true
            };

            if (hit) {
                movieData.title = hit.title || hit.name || title;
                movieData.year = parseInt((hit.release_date || hit.first_air_date || '').slice(0, 4)) || movieData.year;
                movieData.rating = hit.vote_average ? parseFloat(hit.vote_average.toFixed(1)) : 7.0;
                movieData.poster = hit.poster_path ? `https://image.tmdb.org/t/p/w500${hit.poster_path}` : '';
                movieData.banner = hit.backdrop_path ? `https://image.tmdb.org/t/p/original${hit.backdrop_path}` : '';
                movieData.description = hit.overview || '';
                movieData.tmdb_id = String(hit.id || '');
            }

            moviesToAdd.push(movieData);
            qaLog(`✓ Prepared "${movieData.title}" (${movieData.year})`);

        } catch (e) {
            qaLog(`⚠️ Warning: TMDB lookup failed for "${title}", adding basic entry.`);
            moviesToAdd.push({
                type: type === 'series' ? 'series' : 'movie',
                title: title,
                genre: 'Drama',
                year: new Date().getFullYear(),
                streamLink: stream,
                streams: stream ? [{ name: 'Server 1', url: stream }] : [],
                downloads: download ? [{ quality: '1080p FHD', size: '1.4 GB', url: download }] : [],
                status: 'published',
                active: true
            });
        }
    }

    qaLog(`\n💾 Committing ${moviesToAdd.length} titles to GitHub repo...`);

    try {
        for (const item of moviesToAdd) {
            await githubAPI.addMovie(item);
        }
        qaLog('🎉 All titles published successfully!');
        showAlert('contentAlert', `✅ Bulk published ${moviesToAdd.length} titles!`, 'success');
        document.getElementById('quickAddInput').value = '';
        loadMovies();
    } catch (err) {
        qaLog(`❌ Commit error: ${err.message}`);
        showAlert('contentAlert', `Bulk publish failed: ${err.message}`, 'error');
    } finally {
        showSpinner(false);
    }
}

// ─── BROKEN LINK CHECKER ───
async function checkBrokenLinks() {
    showSpinner(true);
    showAlert('contentAlert', '🔍 Scanning titles for missing streams or Vega redirect links...', 'info');

    try {
        const content = await githubAPI.getContent();
        const movies = content.movies || [];

        let missingStreams = [];
        let rogueLinks = [];

        movies.forEach(m => {
            const hasStream = (m.streams && m.streams.length > 0) || !!m.streamLink;
            if (!hasStream && m.type !== 'series') {
                missingStreams.push(m.title);
            }

            (m.downloads || []).forEach(d => {
                const u = (d.url || '').toLowerCase();
                if (u.includes('vegamovies') || u.includes('nexdrive.beer') || u.includes('nexdrive.fit')) {
                    rogueLinks.push(`${m.title} (${d.quality})`);
                }
            });
        });

        let msg = `Scan complete on ${movies.length} titles:`;
        if (missingStreams.length > 0) msg += `\n• Missing Streams: ${missingStreams.length} titles`;
        if (rogueLinks.length > 0) msg += `\n• Rogue Links: ${rogueLinks.length} items`;
        if (missingStreams.length === 0 && rogueLinks.length === 0) msg += ' All clean! Zero rogue links and full stream coverage.';

        alert(msg);
        showAlert('contentAlert', '✅ Link audit complete.', 'success');

    } catch (err) {
        showAlert('contentAlert', `Link check error: ${err.message}`, 'error');
    } finally {
        showSpinner(false);
    }
}

// ─── UTILITY FUNCTIONS ───
function setInputValue(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val !== undefined && val !== null ? val : '';
}

function setSelectValue(id, val) {
    const el = document.getElementById(id);
    if (!el || !val) return;
    for (let opt of el.options) {
        if (opt.value.toLowerCase() === String(val).toLowerCase()) {
            el.value = opt.value;
            return;
        }
    }
    el.value = val;
}

function formatMinutes(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h}h ${m}m`;
}

function escapeAttr(val) {
    return String(val || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function showAlert(elementId, message, type) {
    const alert = document.getElementById(elementId);
    if (!alert) return;
    alert.className = `alert alert-${type} show`;
    alert.textContent = message;
    if (type !== 'error') {
        setTimeout(() => alert.classList.remove('show'), 6000);
    }
}

function showSpinner(show) {
    const spinner = document.getElementById('spinner');
    if (!spinner) return;
    if (show) spinner.classList.add('show');
    else spinner.classList.remove('show');
}

function togglePanel(id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('collapsed');
}
