(function($) {
    'use strict';
    
    let modalOpen = false;
    let selectedIndex = 0;
    let filteredPlugins = [];
    let allPlugins = [];
    let searchCache = new Map(); // Cache search results
    let debounceTimer = null;
    const DEBOUNCE_DELAY = 150; // milliseconds
    const MAX_SCORING_ITEMS = 100; // Stop scoring after this many matches
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
            
            // Pre-cache lowercase strings for faster searching
            allPlugins.push({
                name: pluginName,
                nameLower: pluginName.toLowerCase(), // Pre-cached
                description: pluginDesc,
                descriptionLower: pluginDesc.toLowerCase(), // Pre-cached
                version: version,
                element: $row[0],
                // Pre-calculate some properties for scoring
                wordCount: pluginName.split(/\s+/).length,
                hasForIn: pluginName.includes(' for ') || pluginName.includes(' - ')
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
                selectCurrentResult();
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
        
        // Reset the plugin list to show all
        $('#the-list tr').show();
        
        // Remove any existing highlight boxes
        removeHighlightBoxes();
    }
    
    // Optimized relevance scoring with early exits
    function calculateRelevanceScore(plugin, lowerQuery) {
        // Use pre-cached lowercase strings
        const lowerName = plugin.nameLower;
        
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
        // Name contains query (partial match)
        else if (lowerName.includes(lowerQuery)) {
            score = 100;
            // Bonus for earlier position
            const position = lowerName.indexOf(lowerQuery);
            score += Math.max(50 - position, 0);
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
        
        return score;
    }
    
    // Filter plugins with caching and optimizations
    function filterPlugins(query) {
        selectedIndex = 0;
        
        // Early exit for empty query
        if (query === '') {
            filteredPlugins = allPlugins.slice(0, MAX_DISPLAY_ITEMS);
            renderResults();
            return;
        }
        
        const lowerQuery = query.toLowerCase();
        
        // Check cache first
        if (searchCache.has(lowerQuery)) {
            filteredPlugins = searchCache.get(lowerQuery);
            renderResults();
            return;
        }
        
        // First pass: Find matching plugins (limit to MAX_SCORING_ITEMS for performance)
        const matchingPlugins = [];
        let matchCount = 0;
        
        for (let i = 0; i < allPlugins.length && matchCount < MAX_SCORING_ITEMS; i++) {
            const plugin = allPlugins[i];
            // Use pre-cached lowercase strings
            if (plugin.nameLower.includes(lowerQuery) || 
                plugin.descriptionLower.includes(lowerQuery)) {
                matchingPlugins.push(plugin);
                matchCount++;
            }
        }
        
        // If no matches found, update and exit early
        if (matchingPlugins.length === 0) {
            filteredPlugins = [];
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
            
            html += `
                <div class="${classes.join(' ')}" data-index="${index}">
                    <div class="pqs-plugin-name">
                        ${isExactMatch ? '⭐ ' : ''}${escapeHtml(plugin.name)}
                        ${showVersion ? `<span class="pqs-version">v${escapeHtml(plugin.version)}</span>` : ''}
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
            border: `10px solid ${highlightSettings.highlight_color}`,
            borderRadius: '4px',
            pointerEvents: 'none',
            zIndex: 9999,
            boxSizing: 'border-box',
            opacity: highlightSettings.highlight_opacity,
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
                    $('.pqs-highlight-box').fadeOut(highlightSettings.fade_duration, function() {
                        $(this).remove();
                    });
                }, highlightSettings.highlight_duration);
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