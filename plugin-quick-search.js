(function($) {
    'use strict';
    
    let modalOpen = false;
    let selectedIndex = 0;
    let filteredPlugins = [];
    let allPlugins = [];
    
    // Initialize on document ready
    $(document).ready(function() {
        console.log('Plugin Quick Search: Initializing...');
        collectPluginData();
        console.log('Plugin Quick Search: Found', allPlugins.length, 'plugins');
        createModal();
        bindKeyboardShortcut();
        console.log('Plugin Quick Search: Ready! Press Cmd/Ctrl+Shift+P to search');
    });
    
    // Collect plugin data from the page
    function collectPluginData() {
        $('#the-list tr').each(function() {
            const $row = $(this);
            const $pluginTitle = $row.find('.plugin-title strong');
            const pluginName = $pluginTitle.text().trim();
            const pluginDesc = $row.find('.plugin-description').text().trim();
            
            if (pluginName) {
                allPlugins.push({
                    name: pluginName,
                    description: pluginDesc,
                    element: $row[0]
                });
            }
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
                               autocomplete="off">
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
                console.log('Plugin Quick Search shortcut triggered!');
                e.preventDefault();
                toggleModal();
            }
            
            // Handle Escape key
            if (e.key === 'Escape' && modalOpen) {
                closeModal();
            }
        });
        
        // Handle search input
        $('#pqs-search-input').on('input', function() {
            const query = sanitizeInput($(this).val());
            filterPlugins(query);
        });
        
        // Handle keyboard navigation in search
        $('#pqs-search-input').on('keydown', function(e) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                navigateResults(1);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                navigateResults(-1);
            } else if (e.key === 'Enter') {
                e.preventDefault();
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
        
        // Show all plugins initially
        filterPlugins('');
    }
    
    // Close the modal
    function closeModal() {
        modalOpen = false;
        $('#pqs-overlay').removeClass('active');
        
        // Reset the plugin list to show all
        $('#the-list tr').show();
        
        // Remove any existing highlight boxes
        removeHighlightBoxes();
    }
    
    // Calculate relevance score for search ranking
    function calculateRelevanceScore(plugin, query) {
        const lowerName = plugin.name.toLowerCase();
        const lowerDesc = plugin.description.toLowerCase();
        const lowerQuery = query.toLowerCase();
        
        let score = 0;
        
        // Exact match of full name (highest priority)
        if (lowerName === lowerQuery) {
            score += 1000;
        }
        
        // Name starts with query (very high priority)
        else if (lowerName.startsWith(lowerQuery)) {
            score += 500;
        }
        
        // Query is the first word in the name
        else if (lowerName.split(/\s+/)[0] === lowerQuery) {
            score += 400;
        }
        
        // Name contains query as a whole word
        else if (new RegExp('\\b' + lowerQuery + '\\b', 'i').test(plugin.name)) {
            score += 300;
        }
        
        // Name contains query (partial match)
        else if (lowerName.includes(lowerQuery)) {
            score += 100;
            // Bonus for earlier position
            const position = lowerName.indexOf(lowerQuery);
            score += Math.max(50 - position, 0);
        }
        
        // Description contains query
        if (lowerDesc.includes(lowerQuery)) {
            score += 10;
        }
        
        // Penalize plugins with very long names (likely extensions/add-ons)
        const wordCount = plugin.name.split(/\s+/).length;
        if (wordCount > 3) {
            score -= (wordCount - 3) * 5;
        }
        
        // Boost official/core plugins (usually have simpler names)
        if (!plugin.name.includes(' for ') && !plugin.name.includes(' - ')) {
            score += 20;
        }
        
        return score;
    }
    
    // Filter plugins based on search query with smart ranking
    function filterPlugins(query) {
        selectedIndex = 0;
        filteredPlugins = [];
        
        if (query === '') {
            filteredPlugins = [...allPlugins];
        } else {
            const lowerQuery = query.toLowerCase();
            
            // First, find all matching plugins
            const matchingPlugins = allPlugins.filter(plugin => {
                return plugin.name.toLowerCase().includes(lowerQuery) ||
                       plugin.description.toLowerCase().includes(lowerQuery);
            });
            
            // Calculate relevance scores
            const scoredPlugins = matchingPlugins.map(plugin => ({
                ...plugin,
                score: calculateRelevanceScore(plugin, query)
            }));
            
            // Sort by relevance score (highest first)
            scoredPlugins.sort((a, b) => b.score - a.score);
            
            // Remove score property and assign to filteredPlugins
            filteredPlugins = scoredPlugins.map(({ score, ...plugin }) => plugin);
            
            // Limit results for very common terms
            if (filteredPlugins.length > 20 && query.length < 5) {
                // For short queries with many results, show only top matches
                filteredPlugins = filteredPlugins.slice(0, 15);
            }
        }
        
        renderResults();
    }
    
    // Render the search results with visual hierarchy
    function renderResults() {
        const $results = $('#pqs-results');
        $results.empty();
        
        if (filteredPlugins.length === 0) {
            $results.html('<div class="pqs-no-results">No plugins found</div>');
            return;
        }
        
        // Add a separator after the first result if it's a strong match
        let addedSeparator = false;
        
        filteredPlugins.forEach((plugin, index) => {
            // Check if this is likely a primary/exact match
            const query = $('#pqs-search-input').val().toLowerCase();
            const isExactMatch = plugin.name.toLowerCase() === query;
            const isStrongMatch = plugin.name.toLowerCase().startsWith(query);
            
            // Add separator after first result if it's a strong match and there are more results
            if (index === 1 && !addedSeparator && 
                (filteredPlugins[0].name.toLowerCase() === query || 
                 filteredPlugins[0].name.toLowerCase().startsWith(query))) {
                $results.append('<div class="pqs-separator">Other matches</div>');
                addedSeparator = true;
            }
            
            const $item = $(`
                <div class="pqs-result-item ${index === selectedIndex ? 'selected' : ''} ${isExactMatch ? 'exact-match' : ''} ${isStrongMatch && !isExactMatch ? 'strong-match' : ''}" data-index="${index}">
                    <div class="pqs-plugin-name">
                        ${isExactMatch ? '⭐ ' : ''}${escapeHtml(plugin.name)}
                    </div>
                    ${plugin.description ? `<div class="pqs-plugin-desc">${escapeHtml(plugin.description)}</div>` : ''}
                </div>
            `);
            $results.append($item);
        });
        
        // Add custom styles for match types if not present
        if (!$('#pqs-match-styles').length) {
            const styles = `
                <style id="pqs-match-styles">
                    .pqs-result-item.exact-match {
                        background: #e7f3ff;
                        border-left: 4px solid #2271b1;
                    }
                    .pqs-result-item.exact-match.selected {
                        background: #2271b1;
                        color: #fff;
                    }
                    .pqs-result-item.strong-match {
                        background: #f0f8ff;
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
        
        // Style the highlight box
        $highlightBox.css({
            position: 'absolute',
            top: offset.top - 10,
            left: offset.left - 10,
            width: width + 20,
            height: height + 20,
            border: '10px solid red',
            borderRadius: '4px',
            pointerEvents: 'none',
            zIndex: 9999,
            boxSizing: 'border-box',
            animation: 'pqsPulse 2s ease-in-out infinite'
        });
        
        // Add the highlight box to the body
        $('body').append($highlightBox);
        
        // Add pulse animation styles if not already present
        if (!$('#pqs-highlight-styles').length) {
            const styles = `
                <style id="pqs-highlight-styles">
                    @keyframes pqsPulse {
                        0%, 100% {
                            opacity: 1;
                            box-shadow: 0 0 20px rgba(255, 0, 0, 0.5);
                        }
                        50% {
                            opacity: 0.8;
                            box-shadow: 0 0 40px rgba(255, 0, 0, 0.8);
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
                
                // Optionally remove the highlight after a few seconds
                setTimeout(function() {
                    $('.pqs-highlight-box').fadeOut(1000, function() {
                        $(this).remove();
                    });
                }, 5000); // Remove after 5 seconds
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