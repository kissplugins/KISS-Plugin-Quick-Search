(function($) {
    'use strict';

    // Cache configuration
    const CACHE_VERSION = '1.1';
    let CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds (will be overridden by settings)
    const CACHE_KEY = 'pqs_plugin_cache';
    const CACHE_META_KEY = 'pqs_cache_meta';

    let modalOpen = false;
    let selectedIndex = 0;
    let filteredPlugins = [];
    let allPlugins = [];
    let searchCache = new Map(); // Cache search results
    let debounceTimer = null;
    let cacheStatus = 'loading'; // 'loading', 'fresh', 'stale', 'error'

    // Phase 2: Incremental filtering variables
    let lastQuery = '';
    let lastResults = [];
    const DEBOUNCE_DELAY = 250; // milliseconds (Phase 1 optimization)
    const MAX_SCORING_ITEMS = 20; // Phase 1: Stop scoring after this many matches (reduced from 100)
    const MAX_DISPLAY_ITEMS = 20; // Maximum items to display

    // Default settings (will be overridden by PHP settings)
    let pluginSettings = {
        keyboard_shortcut: 'cmd_shift_p', // cmd_shift_p or cmd_k
        highlight_duration: 8000,  // 8 seconds
        fade_duration: 2000,       // 2 seconds
        highlight_color: '#ff0000', // Red
        highlight_opacity: 1.0     // Full opacity
    };

    // PQS Coordination System - Set up early to prevent conflicts with other plugins
    function setupPQSCoordinationSystem() {
        // Mark that PQS keyboard handler is active
        window.pqsKeyboardHandlerActive = true;

        // Expose public PQS API for other plugins to use
        window.PQS = {
            open: function() {
                // Open the PQS modal
                if (typeof toggleModal === 'function') {
                    if (!modalOpen) {
                        toggleModal();
                    }
                } else {
                    console.warn('PQS: Modal not yet initialized, deferring open request');
                    // Defer until modal is ready
                    $(document).ready(function() {
                        setTimeout(function() {
                            if (typeof toggleModal === 'function' && !modalOpen) {
                                toggleModal();
                            }
                        }, 100);
                    });
                }
            },

            close: function() {
                // Close the PQS modal
                if (typeof toggleModal === 'function' && modalOpen) {
                    toggleModal();
                }
            },

            isOpen: function() {
                return modalOpen;
            },

            getStatus: function() {
                return {
                    modalOpen: modalOpen,
                    cacheStatus: cacheStatus,
                    pluginCount: allPlugins.length,
                    keyboardShortcut: getShortcutDisplayText()
                };
            }
        };

        console.log('PQS: Coordination system initialized - keyboard handler active');
    }

    // Initialize on document ready
    $(document).ready(function() {
        // Set up PQS coordination system early
        setupPQSCoordinationSystem();

        // Check if we're on plugins page or cache status page
        const isPluginsPage = $('#the-list').length > 0;
        const isCacheStatusPage = $('#pqs-cache-status-indicator').length > 0;

        if (!isPluginsPage && !isCacheStatusPage) {
            console.log('Plugin Quick Search: Not on plugins or cache status page, skipping initialization');
            return;
        }

        // Load settings from PHP if available
        if (typeof pqs_ajax !== 'undefined') {
            if (pqs_ajax.version) {
                console.log('Plugin Quick Search Version:', pqs_ajax.version);
            }
            if (pqs_ajax.settings) {
                pluginSettings = { ...pluginSettings, ...pqs_ajax.settings };
                console.log('Plugin Quick Search: Loaded custom settings', pluginSettings);

                // Update cache duration from settings if available
                if (pluginSettings.cache_duration_ms) {
                    CACHE_DURATION = pluginSettings.cache_duration_ms;
                }
            }
        }

        // If we're on cache status page, only initialize cache API
        if (isCacheStatusPage && !isPluginsPage) {
            console.log('Plugin Quick Search: Cache status page detected, initializing cache API only');
            initializeCacheAPIOnly();
            return;
        }

        // Full initialization for plugins page
        console.log('Plugin Quick Search: Initializing with intelligent cache...');
        const startTime = performance.now();

        initializeWithCache().then(() => {
            createModal();
            bindKeyboardShortcut();

            // Create debug UI early so we can see live info
            try { createPqsDebugUI(); } catch(e) { console.warn('PQS: Debug UI init failed', e); }

            // Inject plugin folder names below action links on the Plugins page
            try {
                injectPluginFolderLabels();
                // Fallback: run once more shortly after to catch late DOM mutations
                setTimeout(() => { injectPluginFolderLabels(); updatePqsDebugPanel(); }, 400);
            } catch(e) { console.warn('PQS: Folder label injection failed', e); }

            // Update debug panel after initial pass
            try { updatePqsDebugPanel(); } catch(e) {}

            const loadTime = performance.now() - startTime;
            const shortcutText = getShortcutDisplayText();
            console.log(`Plugin Quick Search: Ready in ${loadTime.toFixed(2)}ms! Cache status: ${cacheStatus}`);
            console.log(`Found ${allPlugins.length} plugins`);
        });
    });

    // Inject plugin folder names under action links (Plugins page)
    function injectPluginFolderLabels() {
        const $rows = $('#the-list tr');
        if ($rows.length === 0) return;

        $rows.each(function() {
            const $row = $(this);

            // Skip non-primary rows like update notices and inline edit rows
            if ($row.hasClass('plugin-update-tr') || $row.hasClass('inline-edit-row')) return;

            // Avoid duplicates
            if ($row.find('.pqs-plugin-folder').length) return;

            const $titleCell = $row.find('td.plugin-title, .plugin-title');
            if (!$titleCell.length) return; // only inject on main plugin rows

            const folder = getPluginFolderFromRow($row);
            if (!folder) return;

            const $actions = $titleCell.find('.row-actions').first();
            const $label = $('<div class="pqs-plugin-folder" />').text('/' + folder + '/').attr('title','Plugin folder');

            if ($actions.length) {
                $actions.after($label);
            } else {
                $titleCell.append($label);
            }
        });
    }

    function getPluginFolderFromRow($row) {
        // Try common sources for the plugin file path (e.g., "akismet/akismet.php")
        let filePath = $row.attr('data-plugin') || '';


        if (!filePath) {
            const $cb = $row.find("th.check-column input[type='checkbox'][name='checked[]']").first();
            if ($cb.length) filePath = $cb.val() || '';
        }
        if (!filePath) {
            // Fallback: some rows may store slug; we only want the folder
            const slug = $row.attr('data-slug') || '';
            if (slug) return slug; // not perfect, but close
        }
        if (!filePath) return '';
        const idx = filePath.indexOf('/');
        return idx > -1 ? filePath.substring(0, idx) : filePath.replace(/\.php$/i, '');
    }

    // Initialize cache API only (for cache status page)
    function initializeCacheAPIOnly() {
        console.log('Plugin Quick Search: Cache API initialized for status page');

        // Set a basic cache status since we can't scan plugins
        cacheStatus = 'api_only';

        // Fire a basic cache status event
        document.dispatchEvent(new CustomEvent('pqs-cache-status-changed', {
            detail: { status: 'api_only', source: 'status_page' }
        }));
    }

    // Initialize with intelligent caching
    async function initializeWithCache() {
        try {
            const cachedData = getCachedData();

            if (cachedData && isCacheValid(cachedData.meta)) {
                // Use cached data
                allPlugins = cachedData.plugins;
                cacheStatus = 'fresh';
                console.log('Plugin Quick Search: Using cached data');

                // Fire cache status event
                document.dispatchEvent(new CustomEvent('pqs-cache-status-changed', {
                    detail: { status: 'fresh', source: 'cached' }
                }));

                // Re-associate DOM elements with cached data
                associateDOMElements();

                // Optionally verify cache integrity in background
                setTimeout(verifyCacheIntegrity, 100);
            } else {
                // Cache miss or expired - scan fresh
                cacheStatus = 'stale';
                console.log('Plugin Quick Search: Cache expired, scanning fresh data...');

                // Fire cache status event
                document.dispatchEvent(new CustomEvent('pqs-cache-status-changed', {
                    detail: { status: 'stale', source: 'expired' }
                }));

                await scanAndCachePlugins();
            }
        } catch (error) {
            console.error('Plugin Quick Search: Cache error, falling back to fresh scan:', error);
            cacheStatus = 'error';

            // Fire cache status event
            document.dispatchEvent(new CustomEvent('pqs-cache-status-changed', {
                detail: { status: 'error', source: 'exception', error: error.message }
            }));

            await scanAndCachePlugins();
        }
    }

    // Get cached data from localStorage
    function getCachedData() {
        try {
            const cacheData = localStorage.getItem(CACHE_KEY);
            const metaData = localStorage.getItem(CACHE_META_KEY);

            if (!cacheData || !metaData) return null;

            return {


                plugins: JSON.parse(cacheData),
                meta: JSON.parse(metaData)
            };
        } catch (error) {
            console.warn('Plugin Quick Search: Failed to read cache:', error);
            return null;
        }
    }

    // Check if cache is still valid
    function isCacheValid(meta) {
        if (!meta || meta.version !== CACHE_VERSION) {
            return false;
        }

        const now = Date.now();
        const cacheDuration = pluginSettings.cache_duration_ms || CACHE_DURATION;
        const isExpired = (now - meta.timestamp) > cacheDuration;

        // Also check if plugin count matches (quick integrity check)
        // Only do this check if we're on the plugins page
        const $pluginList = $('#the-list tr');
        if ($pluginList.length > 0) {
            const currentPluginCount = $pluginList.length;
            const cachedPluginCount = meta.pluginCount;
            return !isExpired && (currentPluginCount === cachedPluginCount);
        }

        // If not on plugins page, just check expiration
        return !isExpired;
    }

    // Scan plugins and update cache
    async function scanAndCachePlugins() {
        const scanStartTime = performance.now();

        // Clear existing data
        allPlugins = [];

        // Check if we're on the plugins page
        const $pluginRows = $('#the-list tr');
        if ($pluginRows.length === 0) {
            console.log('Plugin Quick Search: No plugin list found, cannot scan plugins');
            cacheStatus = 'error';
            throw new Error('No plugin list available for scanning');
        }

        // Scan all plugins (enhanced version of collectPluginData)
        $pluginRows.each(function() {
            const $row = $(this);
            const $pluginTitle = $row.find('.plugin-title strong');
            const pluginName = $pluginTitle.text().trim();
            const pluginDesc = $row.find('.plugin-description').text().trim();

            if (!pluginName) return;

            // Extract version
            let version = '';
            const $versionSpan = $row.find('.plugin-version-author-uri');
            if ($versionSpan.length) {
                const versionText = $versionSpan.text();
                const versionMatch = versionText.match(/Version\s+([\d.]+)/i);
                if (versionMatch) {
                    version = versionMatch[1];
                }
            }

            // Determine activation status and settings
            let isActive = false;
            let settingsUrl = null;

            const $actionLinks = $row.find('.row-actions a');
            $actionLinks.each(function() {
                const $link = $(this);
                const linkText = $link.text().toLowerCase().trim();


                if (linkText.includes('deactivate')) {
                    isActive = true;
                }

                if (linkText === 'settings' || linkText.includes('setting') ||
                    linkText === 'configure' || linkText.includes('configur')) {
                    settingsUrl = $link.attr('href');
                }
            });

            if ($row.hasClass('active')) {
                isActive = true;
            }

            // Extract folder for caching/injection
            const folder = getPluginFolderFromRow($row) || '';

            // Create plugin object (without DOM element for caching)
            const pluginData = {
                name: pluginName,
                nameLower: pluginName.toLowerCase(),
                description: pluginDesc,
                descriptionLower: pluginDesc.toLowerCase(),
                version: version,
                isActive: isActive,
                settingsUrl: settingsUrl,
                folder: folder,
                rowIndex: $row.index(), // Store index to find element later
                element: $row[0], // Add DOM element for immediate use
                wordCount: pluginName.split(/\s+/).length,
                hasForIn: pluginName.includes(' for ') || pluginName.includes(' - ')
            };

            allPlugins.push(pluginData);
        });

        // Cache the data
        try {
            const meta = {
                timestamp: Date.now(),
                version: CACHE_VERSION,
                pluginCount: allPlugins.length,
                scanTime: performance.now() - scanStartTime
            };

            // Create cache-friendly version (without DOM elements)
            const cacheablePlugins = allPlugins.map(plugin => {
                const { element, ...cacheablePlugin } = plugin;
                return cacheablePlugin;
            });

            localStorage.setItem(CACHE_KEY, JSON.stringify(cacheablePlugins));
            localStorage.setItem(CACHE_META_KEY, JSON.stringify(meta));

            cacheStatus = 'fresh';
            console.log(`Plugin Quick Search: Cached ${allPlugins.length} plugins in ${meta.scanTime.toFixed(2)}ms`);

            // Fire cache rebuilt event for other plugins
            document.dispatchEvent(new CustomEvent('pqs-cache-rebuilt', {
                detail: {
                    pluginCount: allPlugins.length,
                    scanTime: meta.scanTime,
                    timestamp: meta.timestamp
                }
            }));
        } catch (error) {
            console.warn('Plugin Quick Search: Failed to cache data:', error);
            // Continue without caching
        }
    }

    // Re-associate DOM elements with cached data
    function associateDOMElements() {
        allPlugins.forEach((plugin, index) => {
            // Find the corresponding DOM element by index
            const $row = $('#the-list tr').eq(plugin.rowIndex || index);
            if ($row.length) {
                plugin.element = $row[0];
                // Backfill folder if missing in cache
                if (!plugin.folder) {
                    const f = getPluginFolderFromRow($row);
                    if (f) plugin.folder = f;
                }
            }
        });
    }

    // Collect plugin data from the page with pre-cached lowercase strings (legacy function)
    function collectPluginData() {
        // If using cached data, we need to re-associate DOM elements
        if (cacheStatus === 'fresh' && allPlugins.length > 0) {
            associateDOMElements();
            return;
        }

        // If cache is stale/error, data is already fresh from scanAndCachePlugins()
        // This function is now mainly for backward compatibility
        $('#the-list tr').each(function() {
            const $row = $(this);
            const $pluginTitle = $row.find('.plugin-title strong');
            const pluginName = $pluginTitle.text().trim();
            const pluginDesc = $row.find('.plugin-description').text().trim();

            if (!pluginName) return; // Early exit if no name

            // Extract version number from the plugin row
            let version = '';
            const $versionSpan = $row.find('.plugin-version-author-uri');
            if ($versionSpan.length) {
                const versionText = $versionSpan.text();
                const versionMatch = versionText.match(/Version\s+([\d.]+)/i);
                if (versionMatch) {
                    version = versionMatch[1];
                }
            }

            // Determine activation status and settings link efficiently (upfront collection)
            let isActive = false;
            let settingsUrl = null;

            // Scan row actions for both activation status and settings link
            const $actionLinks = $row.find('.row-actions a');
            $actionLinks.each(function() {
                const $link = $(this);
                const linkText = $link.text().toLowerCase().trim();

                // Check for activation status
                if (linkText.includes('deactivate')) {
                    isActive = true;
                }

                // Check for settings/configure link (broader compatibility)
                if (linkText === 'settings' || linkText.includes('setting') ||
                    linkText === 'configure' || linkText.includes('configur')) {
                    settingsUrl = $link.attr('href');
                }
            });

            // WordPress uses CSS class 'active' as primary indicator
            if ($row.hasClass('active')) {
                isActive = true;
            }

            // Extract folder for caching/injection
            const folder = getPluginFolderFromRow($row) || '';

            // Pre-cache lowercase strings for faster searching
            allPlugins.push({
                name: pluginName,
                nameLower: pluginName.toLowerCase(), // Pre-cached
                description: pluginDesc,
                descriptionLower: pluginDesc.toLowerCase(), // Pre-cached
                version: version,
                isActive: isActive, // Activation status
                settingsUrl: settingsUrl, // Settings page URL (null if no settings)
                folder: folder,
                element: $row[0],
                // Pre-calculate some properties for scoring
                wordCount: pluginName.split(/\s+/).length,
                hasForIn: pluginName.includes(' for ') || pluginName.includes(' - ')
            });
        });
    }

    // Verify cache integrity in background
    function verifyCacheIntegrity() {
        const currentPluginCount = $('#the-list tr').length;

        if (currentPluginCount !== allPlugins.length) {
            console.log('Plugin Quick Search: Cache integrity check failed, refreshing...');
            scanAndCachePlugins();
            return;
        }

        // Quick spot check - verify first few plugins still match
        let integrityOk = true;
        $('#the-list tr').slice(0, 3).each(function(index) {
            const $row = $(this);
            const pluginName = $row.find('.plugin-title strong').text().trim();

            if (allPlugins[index] && allPlugins[index].name !== pluginName) {
                integrityOk = false;
                return false; // Break jQuery each
            }
        });

        if (!integrityOk) {
            console.log('Plugin Quick Search: Cache integrity spot check failed, refreshing...');
            scanAndCachePlugins();
        }
    }

    // Public method to force cache refresh
    function rebuildCache() {
        console.log('Plugin Quick Search: Force rebuilding cache...');
        localStorage.removeItem(CACHE_KEY);
        localStorage.removeItem(CACHE_META_KEY);

        // Check if we can actually rebuild the cache
        if ($('#the-list tr').length === 0) {
            const error = new Error('Cannot rebuild cache: not on plugins page. Please visit the Plugins page first.');
            console.warn('Plugin Quick Search:', error.message);
            return Promise.reject(error);
        }

        return scanAndCachePlugins();
    }

    // Get cache status text for UI
    function getCacheStatusText() {
        try {
            const meta = JSON.parse(localStorage.getItem(CACHE_META_KEY) || '{}');
            const age = meta.timestamp ? Math.round((Date.now() - meta.timestamp) / 1000 / 60) : 0;

            switch (cacheStatus) {
                case 'fresh':
                    return `Cache: Fresh (${age}m old)`;
                case 'stale':
                    return 'Cache: Refreshed';
                case 'error':
                    return 'Cache: Error (using fresh data)';
                default:
                    return 'Cache: Loading...';
            }
        } catch (error) {
            return 'Cache: Error';
        }
    }

    // Create the modal HTML
    function createModal() {
        const cacheStatusText = getCacheStatusText();

        const modalHTML = `
            <div class="pqs-overlay" id="pqs-overlay">
                <div class="pqs-modal">
                    <div class="pqs-search-wrapper">
                        <input type="text"
                               id="pqs-search-input"
                               class="pqs-search-input"
                               placeholder="Type to search ${allPlugins.length} plugins..."
                               autocomplete="off"
                               spellcheck="false">
                    </div>
                    <div class="pqs-results" id="pqs-results"></div>
                    <div class="pqs-help">
                        <span class="pqs-help-item">
                            <span class="pqs-kbd">↑↓</span> Navigate
                        </span>
                        <span class="pqs-help-item">
                            <span class="pqs-kbd">Enter</span> Filter
                        </span>
                        <span class="pqs-help-item">
                            <span class="pqs-kbd">Shift</span>+<span class="pqs-kbd">Enter</span> Settings
                        </span>
                        <span class="pqs-help-item">
                            <span class="pqs-kbd">Esc</span> Close
                        </span>
                        <span class="pqs-help-item">
                            <span class="pqs-kbd">${getShortcutDisplayText()}</span> Toggle
                        </span>
                        <span class="pqs-help-item">
                            <span class="pqs-kbd">Ctrl+Shift+R</span> Rebuild Cache
                        </span>
                        <span class="pqs-cache-status">${cacheStatusText}</span>
                    </div>
                </div>
            </div>
        `;

        $('body').append(modalHTML);
    }

    // Get shortcut display text for UI
    function getShortcutDisplayText() {
        if (pluginSettings.keyboard_shortcut === 'cmd_k') {
            return 'Cmd/Ctrl+K';
        }
        return 'Cmd/Ctrl+Shift+P';
    }

    // Check if current key combination matches the configured shortcut
    function isShortcutPressed(e) {
        if (pluginSettings.keyboard_shortcut === 'cmd_k') {
            // Cmd/Ctrl + K
            return (e.metaKey || e.ctrlKey) && !e.shiftKey &&
                   (e.key === 'k' || e.key === 'K' || e.keyCode === 75 || e.which === 75);
        } else {
            // Cmd/Ctrl + Shift + P (default)
            return (e.metaKey || e.ctrlKey) && e.shiftKey &&
                   (e.key === 'P' || e.keyCode === 80 || e.which === 80);
        }
    }

    // Bind keyboard shortcut
    function bindKeyboardShortcut() {
        $(document).on('keydown', function(e) {
            // Check for configured keyboard shortcut
            if (isShortcutPressed(e)) {
                e.preventDefault();
                toggleModal();
            }

            // Add cache rebuild shortcut (Ctrl+Shift+R)
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'R') {
                e.preventDefault();
                rebuildCache().then(() => {
                    console.log('Plugin Quick Search: Cache rebuilt successfully');
                    // Show notification if modal is open
                    if (modalOpen) {
                        showCacheNotification('Cache rebuilt successfully!', 'success');
                        // Update cache status in modal
                        $('.pqs-cache-status').text(getCacheStatusText());
                        // Update placeholder with new count
                        $('#pqs-search-input').attr('placeholder', `Type to search ${allPlugins.length} plugins...`);
                    }
                });
            }

            // Handle Escape key
            if (e.key === 'Escape' && modalOpen) {
                closeModal();
            }
        });

        // Handle search input with debouncing
        $('#pqs-search-input').on('input', function() {
            const query = sanitizeInput($(this).val());

            // Clear existing timer
            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }

            // Add loading state
            $('#pqs-results').addClass('pqs-loading');

            // Set new timer for debounced search
            debounceTimer = setTimeout(function() {
                filterPlugins(query);
                $('#pqs-results').removeClass('pqs-loading');
            }, DEBOUNCE_DELAY);
        });

        // Handle keyboard navigation in search (no debounce needed)
        $('#pqs-search-input').on('keydown', function(e) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                navigateResults(1);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                navigateResults(-1);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                // Cancel any pending search
                if (debounceTimer) {
                    clearTimeout(debounceTimer);
                    debounceTimer = null;
                }

                // Check for Shift+Enter (Settings navigation)
                if (e.shiftKey) {
                    navigateToSettings();
                } else {
                    selectCurrentResult();
                }
            }
        });

        // Click outside to close
        $('#pqs-overlay').on('click', function(e) {
            if (e.target === this) {
                closeModal();
            }
        });

        // Click on result
        $(document).on('click', '.pqs-result-item', function() {
            const index = $(this).data('index');
            selectedIndex = index;
            selectCurrentResult();
        });
    }

    // Toggle modal visibility
    function toggleModal() {
        if (modalOpen) {
            closeModal();
        } else {
            openModal();
        }
    }

    // Open the modal
    function openModal() {
        modalOpen = true;
        $('#pqs-overlay').addClass('active');
        $('#pqs-search-input').val('').focus();

        // Clear cache when opening modal (optional - remove if you want persistent cache)
        searchCache.clear();

        // Phase 2: Reset incremental search state
        lastQuery = '';
        lastResults = [];

        // Show all plugins initially
        filterPlugins('');
    }

    // Close the modal
    function closeModal() {
        modalOpen = false;
        $('#pqs-overlay').removeClass('active');

        // Cancel any pending search
        if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
        }

        // Phase 2: Reset incremental search state
        lastQuery = '';
        lastResults = [];

        // Reset the plugin list to show all
        $('#the-list tr').show();

        // Remove any existing highlight boxes
        removeHighlightBoxes();
    }

    // Basic Levenshtein distance implementation
    function levenshteinDistance(a, b) {
        const matrix = Array.from({ length: a.length + 1 }, () =>
            new Array(b.length + 1).fill(0)
        );

        for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
        for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

        for (let i = 1; i <= a.length; i++) {
            for (let j = 1; j <= b.length; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + cost
                );
            }
        }

        return matrix[a.length][b.length];
    }

    // Optimized relevance scoring with early exits
    function calculateRelevanceScore(plugin, lowerQuery) {
        // Use pre-cached lowercase strings
        const lowerName = plugin.nameLower;
        const distance = levenshteinDistance(lowerName, lowerQuery);
        const threshold = Math.ceil(Math.min(lowerName.length, lowerQuery.length) * 0.4);

        let score = 0;

        // Exact match of full name (highest priority)
        if (lowerName === lowerQuery) {
            return 1000; // Early exit for exact match
        }

        // Name starts with query (very high priority)
        if (lowerName.startsWith(lowerQuery)) {
            score = 500;
        }
        // Query is the first word in the name
        else if (lowerName.split(/\s+/)[0] === lowerQuery) {
            score = 400;
        }
        // Name contains query as a whole word
        else if (new RegExp('\\b' + lowerQuery + '\\b', 'i').test(plugin.name)) {
            score = 300;
        }
        // Multi-word query: check if all words are present
        else if (lowerQuery.includes(' ')) {
            const queryWords = lowerQuery.split(/\s+/).filter(word => word.length > 0);
            const allWordsInName = queryWords.every(word => lowerName.includes(word));

            if (allWordsInName) {
                score = 250; // High score for multi-word matches
                // Bonus for word order preservation
                let lastIndex = -1;
                let orderPreserved = true;
                for (const word of queryWords) {
                    const wordIndex = lowerName.indexOf(word, lastIndex + 1);
                    if (wordIndex === -1 || wordIndex <= lastIndex) {
                        orderPreserved = false;
                        break;
                    }
                    lastIndex = wordIndex;
                }
                if (orderPreserved) {
                    score += 50;
                }
            }
        }
        // Name contains query (partial match)
        else if (lowerName.includes(lowerQuery)) {
            score = 100;
            // Bonus for earlier position
            const position = lowerName.indexOf(lowerQuery);
            score += Math.max(50 - position, 0);
        }
        // Fuzzy match using Levenshtein distance
        else if (distance <= threshold) {
            score = 120 - distance * 20;
        }

        // Only check description if we have some score or no name match
        if (score < 100) {
            if (plugin.descriptionLower.includes(lowerQuery)) {
                score += 10;
            } else if (lowerQuery.includes(' ')) {
                // Multi-word query in description
                const queryWords = lowerQuery.split(/\s+/).filter(word => word.length > 0);
                const allWordsInDesc = queryWords.every(word => plugin.descriptionLower.includes(word));
                if (allWordsInDesc) {
                    score += 15; // Slightly higher for multi-word description matches
                }
            }
        }

        // Use pre-calculated properties
        if (plugin.wordCount > 3) {
            score -= (plugin.wordCount - 3) * 5;
        }

        if (!plugin.hasForIn) {
            score += 20;
        }

        // Bias towards the main WooCommerce plugin
        if (lowerName === 'woocommerce' && (lowerQuery.includes('woo') || distance <= threshold)) {
            score += 500;
        }

        return score;
    }

    // Filter plugins with Phase 2 optimizations: Incremental filtering + Tiered search
    function filterPlugins(query) {
        selectedIndex = 0;

        // Early exit for empty query
        if (query === '') {
            filteredPlugins = allPlugins.slice(0, MAX_DISPLAY_ITEMS);
            lastQuery = '';
            lastResults = [];
            renderResults();
            return;
        }

        const lowerQuery = query.toLowerCase();

        // Check cache first
        if (searchCache.has(lowerQuery)) {
            filteredPlugins = searchCache.get(lowerQuery);
            lastQuery = lowerQuery;
            lastResults = [...filteredPlugins];
            renderResults();
            return;
        }

        // Phase 2: Incremental filtering - if query is extension of previous query
        let searchPool = allPlugins;
        const isIncrementalSearch = lastQuery && lowerQuery.startsWith(lastQuery) && lastResults.length > 0;

        if (isIncrementalSearch) {
            // Search only within previous results for better performance
            searchPool = lastResults;
        }

        // Phase 2: Tiered search strategy
        const exactMatches = [];
        const prefixMatches = [];
        const containsMatches = [];
        const fuzzyMatches = [];

        // First pass: Exact matches
        for (let i = 0; i < searchPool.length; i++) {
            const plugin = searchPool[i];
            if (plugin.nameLower === lowerQuery) {
                exactMatches.push(plugin);
            }
        }

        // Second pass: Prefix matches (if we need more results)
        if (exactMatches.length < MAX_DISPLAY_ITEMS) {
            for (let i = 0; i < searchPool.length; i++) {
                const plugin = searchPool[i];
                if (plugin.nameLower.startsWith(lowerQuery) && !exactMatches.includes(plugin)) {
                    prefixMatches.push(plugin);
                    if (exactMatches.length + prefixMatches.length >= MAX_DISPLAY_ITEMS) break;
                }
            }
        }

        // Third pass: Contains matches (if we need more results)
        if (exactMatches.length + prefixMatches.length < MAX_DISPLAY_ITEMS) {
            // Split query into words for multi-word matching
            const queryWords = lowerQuery.split(/\s+/).filter(word => word.length > 0);

            for (let i = 0; i < searchPool.length; i++) {
                const plugin = searchPool[i];

                // Check for exact substring match first
                const nameIncludes = plugin.nameLower.includes(lowerQuery);
                const descIncludes = plugin.descriptionLower.includes(lowerQuery);

                // Check for multi-word match (all words present)
                let allWordsInName = false;
                let allWordsInDesc = false;

                if (queryWords.length > 1) {
                    allWordsInName = queryWords.every(word => plugin.nameLower.includes(word));
                    allWordsInDesc = queryWords.every(word => plugin.descriptionLower.includes(word));
                }

                if ((nameIncludes || descIncludes || allWordsInName || allWordsInDesc) &&
                    !exactMatches.includes(plugin) &&
                    !prefixMatches.includes(plugin)) {
                    containsMatches.push(plugin);
                    if (exactMatches.length + prefixMatches.length + containsMatches.length >= MAX_DISPLAY_ITEMS) break;
                }
            }
        }

        let matchingPlugins = [...exactMatches, ...prefixMatches, ...containsMatches];

        // Final pass: Fuzzy matching (only if we have fewer than 5 results)
        if (matchingPlugins.length < 5) {
            for (let i = 0; i < searchPool.length && fuzzyMatches.length < (MAX_DISPLAY_ITEMS - matchingPlugins.length); i++) {
                const plugin = searchPool[i];

                // Skip if already in other matches
                if (matchingPlugins.includes(plugin)) continue;

                const distance = levenshteinDistance(plugin.nameLower, lowerQuery);
                const threshold = Math.ceil(Math.min(plugin.nameLower.length, lowerQuery.length) * 0.4);
                if (distance <= threshold) {
                    fuzzyMatches.push(plugin);
                }
            }

            matchingPlugins = [...matchingPlugins, ...fuzzyMatches];
        }

        // If no matches found, update and exit early
        if (matchingPlugins.length === 0) {
            filteredPlugins = [];
            lastQuery = lowerQuery;
            lastResults = [];
            searchCache.set(lowerQuery, filteredPlugins);
            renderResults();
            return;
        }

        // Calculate relevance scores
        const scoredPlugins = matchingPlugins.map(plugin => ({
            ...plugin,
            score: calculateRelevanceScore(plugin, lowerQuery)
        }));

        // Sort by relevance score (highest first)
        scoredPlugins.sort((a, b) => b.score - a.score);

        // Limit results for display
        const limitedResults = scoredPlugins.slice(0, MAX_DISPLAY_ITEMS);

        // Remove score property and assign to filteredPlugins
        filteredPlugins = limitedResults.map(({ score, ...plugin }) => plugin);

        // Update incremental search state
        lastQuery = lowerQuery;
        lastResults = [...filteredPlugins];

        // Cache the results
        searchCache.set(lowerQuery, filteredPlugins);

        renderResults();
    }

    // Optimized render function
    function renderResults() {
        const $results = $('#pqs-results');

        if (filteredPlugins.length === 0) {
            $results.html('<div class="pqs-no-results">No plugins found</div>');
            return;
        }

        // Build HTML in memory first (faster than multiple DOM operations)
        let html = '';
        let addedSeparator = false;
        const query = $('#pqs-search-input').val().toLowerCase();

        filteredPlugins.forEach((plugin, index) => {
            // Check if this is likely a primary/exact match
            const isExactMatch = plugin.nameLower === query;
            const isStrongMatch = plugin.nameLower.startsWith(query);

            // Add separator after first result if it's a strong match and there are more results
            if (index === 1 && !addedSeparator &&
                filteredPlugins.length > 1 &&
                (filteredPlugins[0].nameLower === query ||
                 filteredPlugins[0].nameLower.startsWith(query))) {
                html += '<div class="pqs-separator">Other matches</div>';
                addedSeparator = true;
            }

            // Show version for the first result
            const showVersion = index === 0 && plugin.version;

            const classes = ['pqs-result-item'];
            if (index === selectedIndex) classes.push('selected');
            if (isExactMatch) classes.push('exact-match');
            else if (isStrongMatch) classes.push('strong-match');
            if (plugin.isActive) classes.push('active-plugin');

            // Determine status display
            const statusText = plugin.isActive ? 'Active' : 'Inactive';
            const statusClass = plugin.isActive ? 'pqs-status-active' : 'pqs-status-inactive';

            html += `
                <div class="${classes.join(' ')}" data-index="${index}">
                    <div class="pqs-plugin-name">
                        ${isExactMatch ? '⭐ ' : ''}${escapeHtml(plugin.name)}
                        ${showVersion ? `<span class="pqs-version">v${escapeHtml(plugin.version)}</span>` : ''}
                        <span class="pqs-status ${statusClass}">${statusText}</span>
                    </div>
                    ${plugin.description ? `<div class="pqs-plugin-desc">${escapeHtml(plugin.description)}</div>` : ''}
                </div>
            `;
        });

        // Single DOM update
        $results.html(html);

        // Add custom styles for match types if not present
        if (!$('#pqs-match-styles').length) {
            const styles = `
                <style id="pqs-match-styles">
                    .pqs-result-item.exact-match {
                        background: #ffffff !important;
                        border-left: 4px solid #2271b1;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                    }
                    .pqs-result-item.exact-match:hover {
                        background: #f0f6fc !important;
                    }
                    .pqs-result-item.exact-match.selected {
                        background: #2271b1 !important;
                        color: #fff !important;
                        border-left-color: #1a5490;
                    }
                    .pqs-result-item.strong-match {
                        background: #ffffff !important;
                        border-left: 2px solid #72aee6;
                    }
                    .pqs-result-item.strong-match:hover {
                        background: #f8f9fa !important;
                    }
                    .pqs-result-item.strong-match.selected {
                        background: #2271b1 !important;
                        color: #fff !important;
                    }
                    .pqs-separator {
                        padding: 5px 15px;
                        font-size: 11px;
                        text-transform: uppercase;
                        color: #666;
                        border-top: 1px solid #e0e0e0;
                        margin-top: 5px;
                        background: #fafafa;
                    }
                    .pqs-version {
                        display: inline-block;
                        margin-left: 8px;
                        padding: 2px 6px;
                        background: rgba(0, 0, 0, 0.07);
                        border-radius: 3px;
                        font-size: 12px;
                        font-weight: normal;
                        color: #555;
                    }
                    .pqs-result-item.selected .pqs-version {
                        background: rgba(255, 255, 255, 0.2);
                        color: #fff;
                    }
                    .pqs-status {
                        display: inline-block;
                        margin-left: 8px;
                        padding: 2px 8px;
                        border-radius: 12px;
                        font-size: 11px;
                        font-weight: 600;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }
                    .pqs-status-active {
                        background: #d4edda;
                        color: #155724;
                        border: 1px solid #c3e6cb;
                    }
                    .pqs-status-inactive {
                        background: #f8d7da;
                        color: #721c24;
                        border: 1px solid #f5c6cb;
                    }
                    .pqs-result-item.selected .pqs-status {
                        background: rgba(255, 255, 255, 0.9);
                        color: #333;
                        border-color: rgba(255, 255, 255, 0.5);
                    }
                    .pqs-result-item.exact-match .pqs-plugin-name {
                        color: #0a4b78;
                        font-weight: 700;
                    }
                    .pqs-result-item.exact-match.selected .pqs-plugin-name {
                        color: #fff;
                    }
                    .pqs-loading {
                        opacity: 0.5;
                    }
                    .pqs-notification {
                        position: absolute;
                        bottom: 20px;
                        left: 50%;
                        transform: translateX(-50%);
                        padding: 10px 20px;
                        border-radius: 6px;
                        font-size: 14px;
                        font-weight: 500;
                        z-index: 10001;
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                        animation: pqs-slide-up 0.3s ease-out;
                    }
                    .pqs-notification-success {
                        background: #d4edda;
                        color: #155724;
                        border: 1px solid #c3e6cb;
                    }
                    .pqs-notification-warning {
                        background: #fff3cd;
                        color: #856404;
                        border: 1px solid #ffeaa7;
                    }
                    @keyframes pqs-slide-up {
                        from {
                            opacity: 0;
                            transform: translateX(-50%) translateY(20px);
                        }
                        to {
                            opacity: 1;
                            transform: translateX(-50%) translateY(0);
                        }
                    }
                </style>
            `;
            $('head').append(styles);
        }
    }

    // Navigate through results
    function navigateResults(direction) {
        if (filteredPlugins.length === 0) return;

        selectedIndex += direction;

        if (selectedIndex < 0) {
            selectedIndex = filteredPlugins.length - 1;
        } else if (selectedIndex >= filteredPlugins.length) {
            selectedIndex = 0;
        }

        $('.pqs-result-item').removeClass('selected');
        $('.pqs-result-item').eq(selectedIndex).addClass('selected');

        // Scroll to selected item if needed
        const $selected = $('.pqs-result-item.selected');
        const $results = $('#pqs-results');
        if ($selected.length) {
            const itemTop = $selected.position().top;
            const itemBottom = itemTop + $selected.outerHeight();
            const scrollTop = $results.scrollTop();
            const viewHeight = $results.height();

            if (itemTop < 0) {
                $results.scrollTop(scrollTop + itemTop);
            } else if (itemBottom > viewHeight) {
                $results.scrollTop(scrollTop + itemBottom - viewHeight);
            }
        }
    }

    // Navigate to plugin settings page (Shift+Enter functionality)
    function navigateToSettings() {
        if (filteredPlugins.length === 0) return;

        const selectedPlugin = filteredPlugins[selectedIndex];

        if (selectedPlugin.settingsUrl) {
            // Plugin has a settings page - navigate to it
            console.log(`Plugin Quick Search: Navigating to settings for ${selectedPlugin.name}`);
            window.location.href = selectedPlugin.settingsUrl;
        } else {
            // Plugin doesn't have a settings page - show notification
            showSettingsNotification(selectedPlugin.name, false);
        }
    }

    // Show notification for settings navigation
    function showSettingsNotification(pluginName, hasSettings) {
        // Remove any existing notifications
        $('.pqs-notification').remove();

        const message = hasSettings
            ? `Opening settings for ${pluginName}...`
            : `${pluginName} doesn't have a settings page`;

        const notificationClass = hasSettings ? 'pqs-notification-success' : 'pqs-notification-warning';

        const notification = $(`
            <div class="pqs-notification ${notificationClass}">
                ${escapeHtml(message)}
            </div>
        `);

        // Add to modal
        $('#pqs-overlay .pqs-modal').append(notification);

        // Auto-remove after 3 seconds
        setTimeout(() => {
            notification.fadeOut(300, () => notification.remove());
        }, 3000);
    }

    // Show cache-related notifications
    function showCacheNotification(message, type = 'info') {
        $('.pqs-cache-notification').remove();

        const notification = $(`
            <div class="pqs-cache-notification pqs-notification-${type}">
                ${escapeHtml(message)}
            </div>
        `);

        $('#pqs-overlay .pqs-modal').append(notification);

        setTimeout(() => {
            notification.fadeOut(300, () => notification.remove());
        }, 3000);
    }

    // Expose rebuild function globally for manual use
    window.pqsRebuildCache = rebuildCache;
    window.pqsCacheStatus = () => cacheStatus;
    window.pqsClearCache = () => {
        localStorage.removeItem(CACHE_KEY);
        localStorage.removeItem(CACHE_META_KEY);
        console.log('Plugin Quick Search: Cache cleared');
    };

    // Debug function to test multi-word search
    window.pqsTestSearch = (query) => {
        const lowerQuery = query.toLowerCase();
        const queryWords = lowerQuery.split(/\s+/).filter(word => word.length > 0);

        console.log('Testing search for:', query);
        console.log('Query words:', queryWords);

        const testPlugin = {
            name: 'WP Mail SMTP',
            nameLower: 'wp mail smtp',
            description: 'The most popular WordPress SMTP plugin',
            descriptionLower: 'the most popular wordpress smtp plugin'
        };

        // Test exact match
        const exactMatch = testPlugin.nameLower === lowerQuery;
        console.log('Exact match:', exactMatch);

        // Test contains match
        const containsMatch = testPlugin.nameLower.includes(lowerQuery);
        console.log('Contains match:', containsMatch);

        // Test multi-word match
        const multiWordMatch = queryWords.length > 1 ?
            queryWords.every(word => testPlugin.nameLower.includes(word)) : false;
        console.log('Multi-word match:', multiWordMatch);

        return { exactMatch, containsMatch, multiWordMatch };
    };

    // Comprehensive search test function
    window.pqsRunSearchTests = () => {
        console.log('=== Running Search Algorithm Tests ===');

        const testCases = [
            {
                name: 'Anti-regression: WP SMTP → WP Mail SMTP',
                query: 'wp smtp',
                expectedPlugin: 'WP Mail SMTP',
                shouldMatch: true
            },
            {
                name: 'Exact match: woocommerce',
                query: 'woocommerce',
                expectedPlugin: 'WooCommerce',
                shouldMatch: true
            },
            {
                name: 'Multi-word: contact form',
                query: 'contact form',
                expectedPlugin: 'Contact Form 7',
                shouldMatch: true
            },
            {
                name: 'Fuzzy match: woocomerce (missing m)',
                query: 'woocomerce',
                expectedPlugin: 'WooCommerce',
                shouldMatch: true
            }
        ];

        testCases.forEach(testCase => {
            console.log(`\n--- ${testCase.name} ---`);
            const result = window.pqsTestSearch(testCase.query);
            console.log('Expected to match:', testCase.shouldMatch);
            console.log('Result:', result);
        });

        console.log('\n=== Search Tests Complete ===');
    };

    // Additional diagnostic functions for cache testing
    window.pqsGetCacheInfo = () => {
        try {
            const cacheData = localStorage.getItem(CACHE_KEY);
            const metaData = localStorage.getItem(CACHE_META_KEY);

            if (!cacheData || !metaData) {
                return { exists: false, error: 'Cache data not found' };
            }

            const plugins = JSON.parse(cacheData);
            const meta = JSON.parse(metaData);

            return {
                exists: true,
                pluginCount: plugins.length,
                cacheSize: new Blob([cacheData]).size,
                metaSize: new Blob([metaData]).size,
                timestamp: meta.timestamp,
                version: meta.version,
                age: Date.now() - meta.timestamp,
                isValid: isCacheValid(meta),
                status: cacheStatus
            };
        } catch (error) {
            return { exists: false, error: error.message };
        }
    };

    window.pqsTestCacheIntegrity = () => {
        try {
            const cacheData = localStorage.getItem(CACHE_KEY);
            const metaData = localStorage.getItem(CACHE_META_KEY);

            if (!cacheData || !metaData) {
                return { valid: false, error: 'Cache data not found' };
            }

            const plugins = JSON.parse(cacheData);
            const meta = JSON.parse(metaData);

            // Check if all required fields are present
            const requiredFields = ['name', 'description', 'status', 'file'];
            const missingFields = [];

            plugins.forEach((plugin, index) => {
                requiredFields.forEach(field => {
                    if (!plugin.hasOwnProperty(field)) {
                        missingFields.push(`Plugin ${index}: missing ${field}`);
                    }
                });
            });

            return {
                valid: missingFields.length === 0,
                pluginCount: plugins.length,
                metaPluginCount: meta.pluginCount,
                countMatch: plugins.length === meta.pluginCount,
                missingFields: missingFields,
                version: meta.version,
                expectedVersion: CACHE_VERSION,
                versionMatch: meta.version === CACHE_VERSION
            };
        } catch (error) {
            return { valid: false, error: error.message };
        }
    };

    // Create a red highlight box around an element
    function createHighlightBox($element) {
        // Remove any existing highlight boxes first
        removeHighlightBoxes();

        // Get the position and dimensions of the target element
        const offset = $element.offset();
        const width = $element.outerWidth();
        const height = $element.outerHeight();

        // Create the highlight box
        const $highlightBox = $('<div class="pqs-highlight-box"></div>');

        // Style the highlight box with user settings
        $highlightBox.css({
            position: 'absolute',
            top: offset.top - 10,
            left: offset.left - 10,
            width: width + 20,
            height: height + 20,
            border: `10px solid ${pluginSettings.highlight_color}`,
            borderRadius: '4px',
            pointerEvents: 'none',
            zIndex: 9999,
            boxSizing: 'border-box',
            opacity: pluginSettings.highlight_opacity,
            animation: 'pqsPulse 2s ease-in-out infinite'
        });

        // Add the highlight box to the body
        $('body').append($highlightBox);

        // Add pulse animation styles if not already present
        if (!$('#pqs-highlight-styles').length) {
            // Convert hex color to RGB for box-shadow
            const hexToRgb = (hex) => {
                const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                return result ? {
                    r: parseInt(result[1], 16),
                    g: parseInt(result[2], 16),
                    b: parseInt(result[3], 16)
                } : {r: 255, g: 0, b: 0}; // fallback to red
            };

            const rgb = hexToRgb(highlightSettings.highlight_color);
            const baseOpacity = highlightSettings.highlight_opacity;

            const styles = `
                <style id="pqs-highlight-styles">
                    @keyframes pqsPulse {
                        0%, 100% {
                            opacity: ${baseOpacity};
                            box-shadow: 0 0 20px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${baseOpacity * 0.5});
                        }
                        50% {
                            opacity: ${baseOpacity * 0.8};
                            box-shadow: 0 0 40px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${baseOpacity * 0.8});
                        }
                    }
                    .pqs-highlight-box {
                        transition: all 0.3s ease;
                    }
                </style>
            `;
            $('head').append(styles);
        }
    }

    // Remove all highlight boxes
    function removeHighlightBoxes() {
        $('.pqs-highlight-box').remove();
    }

    // Select the current result and filter the page
    function selectCurrentResult() {
        if (filteredPlugins.length === 0) return;

        const selectedPlugin = filteredPlugins[selectedIndex];

        // Hide all plugins first
        $('#the-list tr').hide();

        // Show only matching plugins
        filteredPlugins.forEach(plugin => {
            $(plugin.element).show();
        });

        // Close modal
        closeModal();

        // Create highlight box around the selected plugin
        if (selectedPlugin && selectedPlugin.element) {
            const $selectedElement = $(selectedPlugin.element);

            // Scroll to the selected plugin
            $('html, body').animate({
                scrollTop: $selectedElement.offset().top - 150
            }, 300, function() {
                // Create the highlight box after scrolling is complete
                createHighlightBox($selectedElement);

                // Remove the highlight after user-configured duration
                setTimeout(function() {
                    $('.pqs-highlight-box').fadeOut(pluginSettings.fade_duration, function() {
                        $(this).remove();
                    });
                }, pluginSettings.highlight_duration);
            });
        }
    }

    // Escape HTML to prevent XSS
    function escapeHtml(text) {
        if (typeof text !== 'string') {
            return '';
        }
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    // Sanitize search input
    function sanitizeInput(input) {
        if (typeof input !== 'string') {
            return '';
        }
        // Remove potentially dangerous characters and limit length
        return input.replace(/[<>]/g, '').substring(0, 100);
    }

    // Handle window resize to update highlight box position
    $(window).on('resize scroll', function() {
        const $highlightBox = $('.pqs-highlight-box');
        if ($highlightBox.length) {
            // Find the highlighted element
            const $highlightedRow = $('#the-list tr:visible').eq(selectedIndex);
            if ($highlightedRow.length) {
                const offset = $highlightedRow.offset();
                const width = $highlightedRow.outerWidth();
                const height = $highlightedRow.outerHeight();

                $highlightBox.css({
                    top: offset.top - 10,
                    left: offset.left - 10,
                    width: width + 20,
                    height: height + 20
                });
            }
        }
    });

})(jQuery);