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
            // Debug: Log all key combinations for testing
            if ((e.metaKey || e.ctrlKey) && e.shiftKey) {
                console.log('Key combination detected:', {
                    key: e.key,
                    metaKey: e.metaKey,
                    ctrlKey: e.ctrlKey,
                    shiftKey: e.shiftKey,
                    keyCode: e.keyCode,
                    which: e.which
                });
            }

            // Check for Cmd/Ctrl + Shift + P (multiple detection methods)
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
    }
    
    // Filter plugins based on search query
    function filterPlugins(query) {
        selectedIndex = 0;
        filteredPlugins = [];
        
        if (query === '') {
            filteredPlugins = [...allPlugins];
        } else {
            const lowerQuery = query.toLowerCase();
            filteredPlugins = allPlugins.filter(plugin => {
                return plugin.name.toLowerCase().includes(lowerQuery) ||
                       plugin.description.toLowerCase().includes(lowerQuery);
            });
        }
        
        renderResults();
    }
    
    // Render the search results
    function renderResults() {
        const $results = $('#pqs-results');
        $results.empty();
        
        if (filteredPlugins.length === 0) {
            $results.html('<div class="pqs-no-results">No plugins found</div>');
            return;
        }
        
        filteredPlugins.forEach((plugin, index) => {
            const $item = $(`
                <div class="pqs-result-item ${index === selectedIndex ? 'selected' : ''}" data-index="${index}">
                    <div class="pqs-plugin-name">${escapeHtml(plugin.name)}</div>
                    ${plugin.description ? `<div class="pqs-plugin-desc">${escapeHtml(plugin.description)}</div>` : ''}
                </div>
            `);
            $results.append($item);
        });
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
        
        // Scroll to the first result
        if (selectedPlugin && selectedPlugin.element) {
            $('html, body').animate({
                scrollTop: $(selectedPlugin.element).offset().top - 100
            }, 300);
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
    
})(jQuery);