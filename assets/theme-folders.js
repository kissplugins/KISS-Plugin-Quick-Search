/**
 * KISS Plugin Quick Search - Theme Folder Display
 * 
 * Displays folder names for themes on the Appearance > Themes page
 */

(function($) {
    'use strict';

    // Store processed themes to avoid duplicates
    const processedThemes = new Set();
    
    /**
     * Inject folder labels into theme cards
     */
    function injectThemeFolders() {
        // Process all theme cards
        $('.theme').each(function() {
            const $theme = $(this);
            
            // Get theme slug from various possible attributes
            let slug = $theme.attr('data-slug') || 
                      $theme.data('slug') || 
                      $theme.attr('aria-describedby');
            
            if (!slug) return;
            
            // Clean up the slug
            slug = slug.replace('-action', '').replace('-name', '').replace('-id', '');
            
            // Check if we've already processed this theme
            const themeId = $theme.attr('id') || slug;
            if (processedThemes.has(themeId)) {
                return;
            }
            
            // Mark as processed
            processedThemes.add(themeId);
            
            // Find the theme name element
            const $nameElement = $theme.find('.theme-name');
            if ($nameElement.length === 0) return;
            
            // Check if folder label already exists
            if ($nameElement.siblings('.pqs-theme-folder').length > 0) {
                return;
            }
            
            // Create and insert the folder label
            const folderHtml = '<div class="pqs-theme-folder">Folder: /themes/' + slug + '/</div>';
            $nameElement.after(folderHtml);
        });
    }
    
    /**
     * Inject folder label into theme overlay/modal
     */
    function injectThemeOverlayFolder() {
        const $overlay = $('.theme-overlay');
        if ($overlay.length === 0) return;
        
        // Check if already has folder label
        if ($overlay.find('.pqs-theme-folder').length > 0) return;
        
        // Get theme slug from overlay
        let slug = $overlay.find('.theme-name').attr('id');
        if (!slug) {
            // Try to get from current URL hash
            const hash = window.location.hash;
            if (hash && hash.includes('theme=')) {
                slug = hash.split('theme=')[1].split('&')[0];
            }
        }
        
        if (!slug) return;
        
        // Clean up the slug
        slug = slug.replace('-name', '').replace('-action', '');
        
        // Add folder info to the theme info section
        const $themeInfo = $overlay.find('.theme-info');
        if ($themeInfo.length > 0) {
            const folderHtml = '<div class="pqs-theme-folder">Theme Folder: /themes/' + slug + '/</div>';
            $themeInfo.find('.theme-header').after(folderHtml);
        }
    }
    
    /**
     * Initialize theme folder injection
     */
    function initialize() {
        // Initial injection for already loaded themes
        injectThemeFolders();
        
        // Set up observers for dynamic content
        setupObservers();
        
        // Handle theme overlay/modal
        $(document).on('theme:expand', function() {
            setTimeout(injectThemeOverlayFolder, 100);
        });
        
        // Handle hash changes (theme modal opening via URL)
        $(window).on('hashchange', function() {
            if (window.location.hash.includes('theme=')) {
                setTimeout(injectThemeOverlayFolder, 100);
            }
        });
        
        // Reinject on search/filter events
        $(document).on('theme:rendered themes:update', function() {
            processedThemes.clear(); // Clear the processed set
            injectThemeFolders();
        });
        
        // Handle WordPress theme search
        const $searchInput = $('#wp-filter-search-input');
        if ($searchInput.length > 0) {
            let searchTimeout;
            $searchInput.on('input', function() {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(function() {
                    processedThemes.clear();
                    injectThemeFolders();
                }, 300);
            });
        }
        
        // Fallback injection after delays
        setTimeout(injectThemeFolders, 500);
        setTimeout(injectThemeFolders, 1000);
        setTimeout(injectThemeFolders, 2000);
    }
    
    /**
     * Set up MutationObserver for dynamic content
     */
    function setupObservers() {
        // Observe the themes container for changes
        const themesContainer = document.querySelector('.themes');
        if (!themesContainer) return;
        
        const observer = new MutationObserver(function(mutations) {
            let shouldInject = false;
            
            mutations.forEach(function(mutation) {
                // Check if theme cards were added
                if (mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach(function(node) {
                        if (node.nodeType === 1 && (node.classList.contains('theme') || node.querySelector('.theme'))) {
                            shouldInject = true;
                        }
                    });
                }
            });
            
            if (shouldInject) {
                // Use a small delay to ensure DOM is ready
                setTimeout(function() {
                    processedThemes.clear();
                    injectThemeFolders();
                }, 50);
            }
        });
        
        observer.observe(themesContainer, {
            childList: true,
            subtree: true
        });
        
        // Also observe the theme overlay container if it exists
        const overlayContainer = document.querySelector('.theme-overlay');
        if (overlayContainer) {
            const overlayObserver = new MutationObserver(function() {
                setTimeout(injectThemeOverlayFolder, 50);
            });
            
            overlayObserver.observe(overlayContainer, {
                childList: true,
                subtree: true
            });
        }
    }
    
    /**
     * Wait for WordPress theme scripts to load
     */
    function waitForThemes() {
        // Check if WordPress themes are ready
        if (typeof wp !== 'undefined' && wp.themes) {
            // Hook into WordPress theme view events
            if (wp.themes.view && wp.themes.view.Themes) {
                const originalRender = wp.themes.view.Themes.prototype.render;
                wp.themes.view.Themes.prototype.render = function() {
                    const result = originalRender.apply(this, arguments);
                    setTimeout(function() {
                        processedThemes.clear();
                        injectThemeFolders();
                    }, 100);
                    return result;
                };
            }
            
            // Hook into theme details view
            if (wp.themes.view && wp.themes.view.Details) {
                const originalRender = wp.themes.view.Details.prototype.render;
                wp.themes.view.Details.prototype.render = function() {
                    const result = originalRender.apply(this, arguments);
                    setTimeout(injectThemeOverlayFolder, 100);
                    return result;
                };
            }
        }
    }
    
    // Initialize when document is ready
    $(document).ready(function() {
        initialize();
        waitForThemes();
    });
    
    // Also initialize when window loads (for slow-loading resources)
    $(window).on('load', function() {
        setTimeout(function() {
            processedThemes.clear();
            injectThemeFolders();
        }, 100);
    });
    
    // Expose functions for debugging
    window.pqsThemeFolders = {
        inject: injectThemeFolders,
        injectOverlay: injectThemeOverlayFolder,
        clearProcessed: function() {
            processedThemes.clear();
        },
        reprocess: function() {
            processedThemes.clear();
            injectThemeFolders();
            injectThemeOverlayFolder();
        }
    };
    
    console.log('PQS Theme Folders: Initialized');
    
})(jQuery);