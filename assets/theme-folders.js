<?php
/**
 * Theme Folder Display Module for KISS Plugin Quick Search
 * 
 * Displays folder names for themes on the Appearance > Themes page
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

class PQS_Theme_Folders {
    
    public function __construct() {
        // Hook into admin_enqueue_scripts to add our JS at the right time
        add_action('admin_enqueue_scripts', array($this, 'enqueue_theme_folder_scripts'));
    }
    
    /**
     * Enqueue scripts specifically for the themes page
     */
    public function enqueue_theme_folder_scripts($hook) {
        // Only load on themes.php
        if ($hook !== 'themes.php') {
            return;
        }
        
        // Check permissions
        if (!current_user_can('switch_themes')) {
            return;
        }
        
        // Enqueue our dedicated theme folder script
        wp_enqueue_script(
            'pqs-theme-folders',
            plugin_dir_url(dirname(__FILE__)) . 'assets/theme-folders.js',
            array('jquery', 'theme'),  // 'theme' is WordPress's theme management script
            defined('WP_DEBUG') && WP_DEBUG ? time() : PluginQuickSearch::VERSION,
            true
        );
        
        // Add inline styles for theme folders
        wp_add_inline_style('wp-admin', $this->get_theme_folder_styles());
    }
    
    /**
     * Get CSS styles for theme folder labels
     */
    private function get_theme_folder_styles() {
        return '
            .pqs-theme-folder {
                font-size: 11px;
                color: #72777c;
                margin-top: 5px;
                font-style: italic;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif;
            }
            
            /* Ensure folder labels work in both grid and list views */
            .theme-browser .theme .theme-name + .pqs-theme-folder {
                padding: 0 15px;
                margin-top: -5px;
                margin-bottom: 10px;
            }
            
            /* Style for modal/overlay view */
            .theme-overlay .theme-info .pqs-theme-folder {
                margin-top: 10px;
                font-size: 13px;
            }
        ';
    }
}

// Initialize the theme folders module
new PQS_Theme_Folders();