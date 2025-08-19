(function($) {
    'use strict';
    
    let modalOpen = false;
    let selectedIndex = 0;
    let filteredPlugins = [];
    let allPlugins = [];
    let searchCache = new Map(); // Cache search results
    let debounceTimer = null;
    // Phase 2: Incremental filtering variables
    let lastQuery = '';
    let lastResults = [];
    const DEBOUNCE_DELAY = 250; // milliseconds (Phase 1 optimization)
    const MAX_SCORING_ITEMS = 20; // Phase 1: Stop scoring after this many matches (reduced from 100)
    const MAX_DISPLAY_ITEMS = 20; // Maximum items to display

    // Default settings (will be overridden by PHP settings)
    let highlightSettings = {
        highlight_duration: 8000,  // 8 seconds
        fade_duration: 2000,       // 2 seconds
        highlight_color: '#ff0000', // Red
        highlight_opacity: 1.0     // Full opacity
    };
    
    // Initialize on document ready
    $(document).ready(function() {
        console.log('Plugin Quick Search: Initializing...');
        const startTime = performance.now();
        
        collectPluginData();
        console.log('Plugin Quick Search: Found', allPlugins.length, 'plugins');
        
        createModal();
        bindKeyboardShortcut();
        
        const loadTime = performance.now() - startTime;
        console.log(`Plugin Quick Search: Ready in ${loadTime.toFixed(2)}ms! Press Cmd/Ctrl+Shift+P to search`);

        // Load settings from PHP if available
        if (typeof pqs_ajax !== 'undefined') {
            if (pqs_ajax.version) {
                console.log('Plugin Quick Search Version:', pqs_ajax.version);
            }
            if (pqs_ajax.settings) {
                highlightSettings = { ...highlightSettings, ...pqs_ajax.settings };
                console.log('Plugin Quick Search: Loaded custom settings', highlightSettings);
            }
        }
    });
    
    // Collect plugin data from the page with pre-cached lowercase strings
    function collectPluginData() {
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
            
            // Pre-cache lowercase strings for faster searching
            allPlugins.push({
                name: pluginName,
                nameLower: pluginName.toLowerCase(), // Pre-cached
                description: pluginDesc,
                descriptionLower: pluginDesc.toLowerCase(), // Pre-cached
                version: version,
                isActive: isActive, // Activation status
                settingsUrl: settingsUrl, // Settings page URL (null if no settings)
                element: $row[0],
                // Pre-calculate some properties for scoring
                wordCount: pluginName.split(/\s+/).length,
                hasForIn: pluginName.includes(' for ') || pluginName.includes(' - '),
                // NEW: Pre-calculate words for word-based matching
                nameWords: pluginName.toLowerCase().split(/\s+/).filter(word => word.length > 0)
            });
        });
    }
    
    // Create the modal HTML
    function createModal() {
        const modalHTML = `
            <div class="pqs-overlay" id="pqs-overlay">
                <div class="pqs-modal">
                    <div class="pqs-search-wrapper">
                        <input type="text" 
                               id="pqs-search-input" 
                               class="pqs-search-input" 
                               placeholder="Type to search plugins..." 
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
                            <span class="pqs-kbd">Cmd/Ctrl</span>+<span class="pqs-kbd">Shift</span>+<span class="pqs-kbd">P</span> Toggle
                        </span>
                    </div>
                </div>
            </div>
        `;
        
        $('body').append(modalHTML);
        
        // Bind events
        bindModalEvents();
        
        // Add styles if not already added
        if (!$('#pqs-dynamic-styles').length) {
            addDynamicStyles();
        }
    }
    
    // Bind keyboard shortcut
    function bindKeyboardShortcut() {
        $(document).on('keydown', function(e) {
            // Check for Cmd/Ctrl + Shift + P
            if ((e.metaKey || e.ctrlKey) && e.shiftKey &&
                (e.key === 'P' || e.keyCode === 80 || e.which === 80)) {
                e.preventDefault();
                toggleModal();
            }
            
            // Close modal on Escape
            if (e.key === 'Escape' && modalOpen) {
                e.preventDefault();
                closeModal();
            }
        });
    }
    
    // Bind modal events
    function bindModalEvents() {
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

    // NEW: Word-based matching function for better search results
    function calculateWordBasedScore(plugin, queryWords) {
        const pluginWords = plugin.nameWords;
        let matchedWords = 0;
        let totalScore = 0;

        // Check how many query words match plugin words
        for (const queryWord of queryWords) {
            let bestWordScore = 0;

            for (const pluginWord of pluginWords) {
                let wordScore = 0;

                // Exact word match (highest score)
                if (pluginWord === queryWord) {
                    wordScore = 100;
                }
                // Word starts with query word (high score)
                else if (pluginWord.startsWith(queryWord)) {
                    wordScore = 80;
                }
                // Query word starts with plugin word (medium score)
                else if (queryWord.startsWith(pluginWord)) {
                    wordScore = 60;
                }
                // Word contains query word (lower score)
                else if (pluginWord.includes(queryWord)) {
                    wordScore = 40;
                }
                // Query word contains plugin word (lower score)
                else if (queryWord.includes(pluginWord)) {
                    wordScore = 30;
                }

                bestWordScore = Math.max(bestWordScore, wordScore);
            }

            if (bestWordScore > 0) {
                matchedWords++;
                totalScore += bestWordScore;
            }
        }

        // Bonus for matching all query words
        if (matchedWords === queryWords.length && queryWords.length > 1) {
            totalScore += 50;
        }

        // Penalty for unmatched words in long queries
        if (queryWords.length > 1) {
            const unmatchedPenalty = (queryWords.length - matchedWords) * 20;
            totalScore -= unmatchedPenalty;
        }

        return Math.max(0, totalScore);
    }

    // Enhanced relevance scoring with word-based matching
    function calculateRelevanceScore(plugin, lowerQuery) {
        // Use pre-cached lowercase strings
        const lowerName = plugin.nameLower;
        const queryWords = lowerQuery.split(/\s+/).filter(word => word.length > 0);

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
        else if (new RegExp('\\b' + lowerQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(plugin.name)) {
            score = 300;
        }
        // Name contains query (partial match)
        else if (lowerName.includes(lowerQuery)) {
            score = 100;
            // Bonus for earlier position
            const position = lowerName.indexOf(lowerQuery);
            score += Math.max(50 - position, 0);
        }
        // NEW: Word-based matching for non-sequential words (e.g., "WP SMTP" matches "WP Mail SMTP Pro")
        else if (queryWords.length > 1) {
            const wordScore = calculateWordBasedScore(plugin, queryWords);
            if (wordScore > 0) {
                score = 150 + wordScore; // Base score + word matching bonus
            }
        }

        // Fuzzy match using Levenshtein distance (only if no other matches)
        if (score === 0) {
            const distance = levenshteinDistance(lowerName, lowerQuery);
            const threshold = Math.ceil(Math.min(lowerName.length, lowerQuery.length) * 0.4);
            if (distance <= threshold) {
                score = 120 - distance * 20;
            }
        }

        // Only check description if we have some score or no name match
        if (score < 100 && plugin.descriptionLower.includes(lowerQuery)) {
            score += 10;
        }

        // Use pre-calculated properties
        if (plugin.wordCount > 3) {
            score -= (plugin.wordCount - 3) * 5;
        }

        if (!plugin.hasForIn) {
            score += 20;
        }

        // Bias towards the main WooCommerce plugin
        if (lowerName === 'woocommerce' && (lowerQuery.includes('woo') ||
            levenshteinDistance(lowerName, lowerQuery) <= Math.ceil(Math.min(lowerName.length, lowerQuery.length) * 0.4))) {
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
        const wordMatches = []; // NEW: For word-based matches
        const fuzzyMatches = [];

        const queryWords = lowerQuery.split(/\s+/).filter(word => word.length > 0);
        const isMultiWordQuery = queryWords.length > 1;

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
            for (let i = 0; i < searchPool.length; i++) {
                const plugin = searchPool[i];
                const nameIncludes = plugin.nameLower.includes(lowerQuery);
                const descIncludes = plugin.descriptionLower.includes(lowerQuery);

                if ((nameIncludes || descIncludes) &&
                    !exactMatches.includes(plugin) &&
                    !prefixMatches.includes(plugin)) {
                    containsMatches.push(plugin);
                    if (exactMatches.length + prefixMatches.length + containsMatches.length >= MAX_DISPLAY_ITEMS) break;
                }
            }
        }

        // NEW: Fourth pass: Word-based matches for multi-word queries
        if (isMultiWordQuery && exactMatches.length + prefixMatches.length + containsMatches.length < MAX_DISPLAY_ITEMS) {
            for (let i = 0; i < searchPool.length; i++) {
                const plugin = searchPool[i];

                // Skip if already in other matches
                if (exactMatches.includes(plugin) || prefixMatches.includes(plugin) || containsMatches.includes(plugin)) {
                    continue;
                }

                const wordScore = calculateWordBasedScore(plugin, queryWords);
                if (wordScore > 50) { // Only include good word matches
                    wordMatches.push(plugin);
                    if (exactMatches.length + prefixMatches.length + containsMatches.length + wordMatches.length >= MAX_DISPLAY_ITEMS) break;
                }
            }
        }

        let matchingPlugins = [...exactMatches, ...prefixMatches, ...containsMatches, ...wordMatches];

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

    // Utility functions
    function sanitizeInput(input) {
        return input.replace(/[<>&"']/g, '').substring(0, 100);
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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

        // Close the modal
        closeModal();

        // Create highlight box around the selected plugin
        const $selectedElement = $(selectedPlugin.element);
        if ($selectedElement.length) {
            createHighlightBox($selectedElement);

            // Scroll to the selected plugin with smooth animation
            $('html, body').animate({
                scrollTop: $selectedElement.offset().top - 100
            }, 300);
        }
    }

    // Create a red highlight box around an element
    function createHighlightBox($element) {
        // Remove any existing highlight boxes first
        removeHighlightBoxes();

        // Get the position and dimensions of the target element
        const offset = $element.offset();
        const width = $element.outerWidth();
        const height = $element.outerHeight();

        // Convert hex color to RGB for box-shadow
        const hexColor = highlightSettings.highlight_color;
        const r = parseInt(hexColor.substr(1, 2), 16);
        const g = parseInt(hexColor.substr(3, 2), 16);
        const b = parseInt(hexColor.substr(5, 2), 16);
        const rgbColor = `${r}, ${g}, ${b}`;
        const opacity = highlightSettings.highlight_opacity;

        // Create the highlight box
        const $highlightBox = $(`
            <div class="pqs-highlight-box" style="
                position: absolute;
                top: ${offset.top - 10}px;
                left: ${offset.left - 10}px;
                width: ${width + 20}px;
                height: ${height + 20}px;
                border: 3px solid ${hexColor};
                border-radius: 8px;
                pointer-events: none;
                z-index: 9999;
                box-shadow: 0 0 20px rgba(${rgbColor}, ${opacity * 0.6});
                animation: pqsPulse 2s infinite;
                opacity: ${opacity};
            "></div>
        `);

        // Add to body
        $('body').append($highlightBox);

        // Auto-remove after specified duration
        setTimeout(() => {
            $highlightBox.fadeOut(highlightSettings.fade_duration, () => {
                $highlightBox.remove();
            });
        }, highlightSettings.highlight_duration);
    }

    // Remove all highlight boxes
    function removeHighlightBoxes() {
        $('.pqs-highlight-box').remove();
    }

    // Add dynamic styles
    function addDynamicStyles() {
        const styles = `
            <style id="pqs-dynamic-styles">
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
                @keyframes pqsPulse {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.02); }
                    100% { transform: scale(1); }
                }
            </style>
        `;
        $('head').append(styles);
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
