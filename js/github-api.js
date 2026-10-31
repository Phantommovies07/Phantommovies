// GitHub API Configuration
class GitHubAPI {
    constructor() {
        this.username = '';
        this.repo = '';
        this.token = '';
        this.baseURL = 'https://api.github.com';
        this.contentPath = 'data/content.json';
    }

    // Initialize with credentials
    init(username, repo, token) {
        this.username = username;
        this.repo = repo;
        this.token = token;
        
        // Save only non-sensitive fields persistently.
        // Token is session-only for better security.
        localStorage.setItem('gh_username', username);
        localStorage.setItem('gh_repo', repo);
        sessionStorage.setItem('gh_token', token);
        localStorage.removeItem('gh_token');
    }

    // Load credentials from localStorage
    loadCredentials() {
        this.username = localStorage.getItem('gh_username') || '';
        this.repo = localStorage.getItem('gh_repo') || '';
        this.token = sessionStorage.getItem('gh_token') || '';
        // Remove legacy persistent token if an older version saved it.
        localStorage.removeItem('gh_token');
        
        return !!(this.username && this.repo && this.token);
    }

    // Clear credentials
    clearCredentials() {
        localStorage.removeItem('gh_username');
        localStorage.removeItem('gh_repo');
        localStorage.removeItem('gh_token');
        sessionStorage.removeItem('gh_token');
        this.username = '';
        this.repo = '';
        this.token = '';
    }

    // Get authorization headers
    // NOTE: 'Bearer' scheme is used (not 'token') on purpose.
    // GitHub docs: "In most cases, you can use Authorization: Bearer or
    // Authorization: token to pass a token."
    // Classic PATs accept BOTH schemes, but fine-grained PATs return 403 when
    // sent with the 'token' scheme. Using 'Bearer' makes both token types work.
    getHeaders() {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
        };
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        return headers;
    }

    // Verify authentication.
    // Works with BOTH classic PATs and fine-grained PATs:
    //   1. Try GET /user (classic PATs always allow this).
    //   2. Fine-grained PATs are scoped to specific repos and may not be able
    //      to read /user, so fall back to checking access to the repo itself.
    async verifyAuth() {
        let userResponse;
        try {
            userResponse = await fetch(`${this.baseURL}/user`, {
                headers: this.getHeaders()
            });
        } catch (networkError) {
            throw new Error('GitHub se connect nahi ho paya. Internet check karo.');
        }

        if (userResponse.ok) {
            return await userResponse.json();
        }

        // 401 = token galat / expired / revoke ho chuka hai. Koi fallback kaam nahi karega.
        if (userResponse.status === 401) {
            throw new Error('Token galat ya expire ho gaya hai. Naya token banao.');
        }

        // Fine-grained token ho sakta hai /user na padh paye — repo access se verify karo.
        try {
            const repoResponse = await fetch(
                `${this.baseURL}/repos/${this.username}/${this.repo}`,
                { headers: this.getHeaders() }
            );

            if (repoResponse.ok) {
                const repo = await repoResponse.json();
                return {
                    login: (repo.owner && repo.owner.login) || this.username,
                    name: repo.full_name || `${this.username}/${this.repo}`
                };
            }

            if (repoResponse.status === 404) {
                throw new Error(
                    `Repo "${this.username}/${this.repo}" nahi mila ya token ko uska access nahi hai. ` +
                    'Fine-grained token me "Only select repositories" me ye repo select karo ' +
                    'aur permission "Contents: Read and write" do.'
                );
            }

            throw new Error('Authentication failed (HTTP ' + repoResponse.status + ')');
        } catch (error) {
            if (error && error.message && error.message.indexOf('Repo "') === 0) throw error;
            throw new Error('Invalid GitHub credentials');
        }
    }

    // Helper: Safely encode UTF-8 to base64 (supports multibyte unicode and files > 1 MB)
    utf8ToBase64(str) {
        const bytes = new TextEncoder().encode(str);
        let binary = '';
        const len = bytes.byteLength;
        const chunkSize = 0x8000; // 32KB chunks
        for (let i = 0; i < len; i += chunkSize) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunkSize, len)));
        }
        return btoa(binary);
    }

    // Helper: Safely decode base64 to UTF-8 string (supports multibyte unicode and files > 1 MB)
    base64ToUtf8(base64Str) {
        const cleanB64 = (base64Str || '').replace(/\s/g, '');
        const binary = atob(cleanB64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return new TextDecoder().decode(bytes);
    }

    // Get file metadata and content (with auto-resolution for files > 1 MB)
    async getFile(path) {
        try {
            const url = `${this.baseURL}/repos/${this.username}/${this.repo}/contents/${path}`;
            const response = await fetch(url, {
                headers: this.getHeaders()
            });

            if (!response.ok) {
                if (response.status === 404) {
                    return null;
                }
                throw new Error(`Failed to get file: ${response.statusText}`);
            }

            const data = await response.json();

            // When a file is > 1MB, GitHub Contents API returns content="" and encoding="none".
            // Automatically fetch raw blob content via Git Blobs API (supports up to 100 MB!)
            if ((!data.content || data.encoding === 'none') && data.sha) {
                try {
                    const blobUrl = `${this.baseURL}/repos/${this.username}/${this.repo}/git/blobs/${data.sha}`;
                    const blobResp = await fetch(blobUrl, {
                        headers: {
                            ...this.getHeaders(),
                            'Accept': 'application/vnd.github.raw'
                        }
                    });
                    if (blobResp.ok) {
                        data.rawContent = await blobResp.text();
                    }
                } catch (blobErr) {
                    console.warn('Auto-fetching raw blob in getFile failed:', blobErr);
                }
            }

            return data;
        } catch (error) {
            console.error('Error getting file:', error);
            throw error;
        }
    }

    // Helper: Read raw file text from repository
    async getFileText(path) {
        const fileData = await this.getFile(path);
        if (!fileData) return null;
        if (fileData.rawContent) return fileData.rawContent;
        if (fileData.content && fileData.content.trim().length > 0) {
            try {
                return this.base64ToUtf8(fileData.content);
            } catch (e) {
                console.warn('base64ToUtf8 error in getFileText:', e);
            }
        }
        if (fileData.download_url) {
            try {
                const dlResp = await fetch(fileData.download_url + '?t=' + Date.now(), {
                    headers: this.token ? { 'Authorization': `Bearer ${this.token}` } : {}
                });
                if (dlResp.ok) return await dlResp.text();
            } catch (e) {
                console.warn('download_url error in getFileText:', e);
            }
        }
        return null;
    }

    // Update or create file
    async updateFile(path, content, message, sha = null) {
        try {
            const url = `${this.baseURL}/repos/${this.username}/${this.repo}/contents/${path}`;
            
            // If sha is not provided, fetch current sha
            let targetSha = sha;
            if (!targetSha) {
                const currentFile = await this.getFile(path);
                if (currentFile && currentFile.sha) {
                    targetSha = currentFile.sha;
                }
            }

            const body = {
                message: message,
                content: this.utf8ToBase64(content),
                branch: 'main'
            };

            if (targetSha) {
                body.sha = targetSha;
            }

            const response = await fetch(url, {
                method: 'PUT',
                headers: this.getHeaders(),
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to update file');
            }

            return await response.json();
        } catch (error) {
            console.error('Error updating file:', error);
            throw error;
        }
    }

    // Get current content.json (handles files > 1 MB cleanly)
    async getContent() {
        const fileData = await this.getFile(this.contentPath);
        
        if (!fileData) {
            return {
                movies: [],
                settings: {
                    siteName: "Phantom Movies",
                    siteDescription: "Stream unlimited movies & shows",
                    totalMovies: 0,
                    totalSeries: 0,
                    totalTitles: 0,
                    lastUpdated: new Date().toISOString()
                }
            };
        }

        let rawText = fileData.rawContent;

        // Case 1: Try decoding base64 if present (for files <= 1MB)
        if (!rawText && fileData.content && fileData.content.trim().length > 0) {
            try {
                rawText = this.base64ToUtf8(fileData.content);
            } catch (decodeErr) {
                console.warn('Direct base64 decode failed:', decodeErr);
            }
        }

        // Case 2: Fetch raw blob via Git Blobs API if file was > 1MB
        if (!rawText && fileData.sha) {
            try {
                const blobUrl = `${this.baseURL}/repos/${this.username}/${this.repo}/git/blobs/${fileData.sha}`;
                const blobResp = await fetch(blobUrl, {
                    headers: {
                        ...this.getHeaders(),
                        'Accept': 'application/vnd.github.raw'
                    }
                });
                if (blobResp.ok) {
                    rawText = await blobResp.text();
                }
            } catch (blobErr) {
                console.warn('Git blobs API fetch error:', blobErr);
            }
        }

        // Case 3: Fallback to download_url
        if (!rawText && fileData.download_url) {
            try {
                // Note: raw.githubusercontent.com is a public CDN; do not send Authorization Bearer header as it causes 404
                const dlResp = await fetch(fileData.download_url + '?t=' + Date.now());
                if (dlResp.ok) {
                    rawText = await dlResp.text();
                }
            } catch (dlErr) {
                console.warn('download_url fetch error:', dlErr);
            }
        }

        // Case 4: Final fallback to local static asset
        if (!rawText) {
            try {
                const localResp = await fetch('data/content.json?t=' + Date.now());
                if (localResp.ok) {
                    return await localResp.json();
                }
            } catch (localErr) {
                console.warn('Local data/content.json fetch error:', localErr);
            }
        }

        if (!rawText || !rawText.trim()) {
            throw new Error('Retrieved content is empty or unreadable.');
        }

        return JSON.parse(rawText);
    }

    // Add new movie
    async addMovie(movieData) {
        const fileData = await this.getFile(this.contentPath);
        const currentContent = await this.getContent();

        // Generate unique ID
        const id = Date.now().toString();
        
        // Create new movie object
        const newMovie = {
            id: id,
            ...movieData,
            views: (movieData.views !== undefined && movieData.views !== null && movieData.views !== '') ? Number(movieData.views) : 0,
            ratingCount: 0,
            ratingSum: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        // Add to movies array
        currentContent.movies.unshift(newMovie);
        
        // Update settings
        currentContent.settings.totalMovies = currentContent.movies.filter(m => m.type !== 'series').length;
        currentContent.settings.totalSeries = currentContent.movies.filter(m => m.type === 'series').length;
        currentContent.settings.totalTitles = currentContent.movies.length;
        currentContent.settings.lastUpdated = new Date().toISOString();

        // Convert to JSON string
        const updatedContent = JSON.stringify(currentContent, null, 2);

        // Update file on GitHub
        await this.updateFile(
            this.contentPath,
            updatedContent,
            `Add new movie: ${movieData.title}`,
            fileData ? fileData.sha : null
        );

        return newMovie;
    }

    // Update existing movie
    async updateMovie(movieId, movieData) {
        const fileData = await this.getFile(this.contentPath);
        const currentContent = await this.getContent();

        // Find and update movie
        const movieIndex = currentContent.movies.findIndex(m => m.id === movieId);
        
        if (movieIndex === -1) {
            throw new Error('Movie not found');
        }

        currentContent.movies[movieIndex] = {
            ...currentContent.movies[movieIndex],
            ...movieData,
            updatedAt: new Date().toISOString()
        };

        // Update settings
        currentContent.settings.lastUpdated = new Date().toISOString();

        // Convert to JSON string
        const updatedContent = JSON.stringify(currentContent, null, 2);

        // Update file on GitHub
        await this.updateFile(
            this.contentPath,
            updatedContent,
            `Update movie: ${movieData.title}`,
            fileData.sha
        );

        return currentContent.movies[movieIndex];
    }







    // Update sitemap.xml in repository root
    async updateSitemap(xmlContent) {
        const fileData = await this.getFile('sitemap.xml');
        await this.updateFile(
            'sitemap.xml',
            xmlContent,
            'Update sitemap.xml',
            fileData ? fileData.sha : null
        );
        return true;
    }

    // Update site settings in content.json
    async updateSiteSettings(settingsData) {
        const fileData = await this.getFile(this.contentPath);
        const currentContent = await this.getContent();

        currentContent.settings = {
            ...(currentContent.settings || {}),
            ...settingsData,
            lastUpdated: new Date().toISOString()
        };

        const updatedContent = JSON.stringify(currentContent, null, 2);

        await this.updateFile(
            this.contentPath,
            updatedContent,
            'Update site settings',
            fileData ? fileData.sha : null
        );

        return currentContent.settings;
    }

    // Update ads/settings in content.json
    async updateAds(adsData) {
        const fileData = await this.getFile(this.contentPath);
        const currentContent = await this.getContent();

        if (!currentContent.settings) {
            currentContent.settings = {};
        }

        currentContent.settings.ads = adsData;
        currentContent.settings.lastUpdated = new Date().toISOString();

        const updatedContent = JSON.stringify(currentContent, null, 2);

        await this.updateFile(
            this.contentPath,
            updatedContent,
            'Update ads settings',
            fileData ? fileData.sha : null
        );

        return currentContent.settings.ads;
    }

    // Delete movie
    async deleteMovie(movieId) {
        const fileData = await this.getFile(this.contentPath);
        const currentContent = await this.getContent();

        // Filter out the movie
        const movieToDelete = currentContent.movies.find(m => m.id === movieId);
        currentContent.movies = currentContent.movies.filter(m => m.id !== movieId);

        // Update settings
        currentContent.settings.totalMovies = currentContent.movies.filter(m => m.type !== 'series').length;
        currentContent.settings.totalSeries = currentContent.movies.filter(m => m.type === 'series').length;
        currentContent.settings.totalTitles = currentContent.movies.length;
        currentContent.settings.lastUpdated = new Date().toISOString();

        // Convert to JSON string
        const updatedContent = JSON.stringify(currentContent, null, 2);

        // Update file on GitHub
        await this.updateFile(
            this.contentPath,
            updatedContent,
            `Delete movie: ${movieToDelete.title}`,
            fileData.sha
        );

        return true;
    }
}

// Create global instance
const githubAPI = new GitHubAPI();
