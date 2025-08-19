<?php
/**
 * Plugin Name: KISS Plugin Quick Search
 * Plugin URI: https://kissplugins.com/
 * Description: Adds keyboard shortcut (Cmd+Shift+P or Ctrl+Shift+P) to quickly search and filter plugins on the Plugins page
 * Version: 1.0.13
 * Author: KISS Plugins
 * License: GPL v2 or later
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

class PluginQuickSearch {

    // Plugin version for cache busting
    const VERSION = '1.0.13';

    // Default settings
    private $default_settings = array(
        'highlight_duration' => 8000,  // 8 seconds
        'fade_duration' => 2000,       // 2 seconds
        'highlight_color' => '#ff0000', // Red
        'highlight_opacity' => 1.0     // Full opacity
    );

    public function __construct() {
        add_action('admin_enqueue_scripts', array($this, 'enqueue_scripts'));
        add_action('admin_menu', array($this, 'add_settings_page'));
        add_action('admin_init', array($this, 'register_settings'));
    }
    
    public function enqueue_scripts($hook) {
        // Only load on plugins.php page
        if ($hook !== 'plugins.php') {
            return;
        }

        // Security: Check if user has permission to manage plugins
        if (!current_user_can('activate_plugins')) {
            return;
        }

        // Get file modification time for cache busting
        $js_file_path = plugin_dir_path(__FILE__) . 'plugin-quick-search.js';
        $version = self::VERSION;
        
        // Use file modification time for development, version for production
        if (defined('WP_DEBUG') && WP_DEBUG) {
            $version = file_exists($js_file_path) ? filemtime($js_file_path) : self::VERSION;
        }

        // Enqueue the JavaScript with cache busting
        wp_enqueue_script(
            'plugin-quick-search',
            plugin_dir_url(__FILE__) . 'plugin-quick-search.js',
            array('jquery'),
            $version,
            true
        );

        // Get user settings
        $settings = $this->get_settings();

        // Add nonce for security and pass settings to JavaScript
        wp_localize_script('plugin-quick-search', 'pqs_ajax', array(
            'nonce' => wp_create_nonce('pqs_nonce'),
            'ajax_url' => admin_url('admin-ajax.php'),
            'version' => $version,
            'debug' => defined('WP_DEBUG') && WP_DEBUG,
            'settings' => $settings
        ));

        // Add inline CSS
        wp_add_inline_style('wp-admin', $this->get_inline_styles());
    }

    private function get_inline_styles() {
        return '
            .pqs-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                z-index: 10000;
                display: none;
                align-items: center;
                justify-content: center;
            }
            
            .pqs-overlay.active {
                display: flex;
            }
            
            .pqs-modal {
                background: #fff;
                border-radius: 8px;
                width: 90%;
                max-width: 600px;
                max-height: 80vh;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
                position: relative;
                overflow: hidden;
            }
            
            .pqs-search-wrapper {
                padding: 20px 20px 10px;
                border-bottom: 1px solid #e0e0e0;
            }
            
            .pqs-search-input {
                width: 100%;
                padding: 12px 16px;
                border: 2px solid #ddd;
                border-radius: 6px;
                font-size: 16px;
                outline: none;
                transition: border-color 0.2s;
            }
            
            .pqs-search-input:focus {
                border-color: #2271b1;
                box-shadow: 0 0 0 1px #2271b1;
            }
            
            .pqs-results {
                max-height: 400px;
                overflow-y: auto;
                padding: 10px;
            }
            
            .pqs-result-item {
                padding: 10px 15px;
                margin: 5px 0;
                background: #f8f8f8;
                border-radius: 4px;
                cursor: pointer;
                transition: background-color 0.2s;
            }
            
            .pqs-result-item:hover {
                background: #e8e8e8;
            }
            
            .pqs-result-item.selected {
                background: #2271b1;
                color: #fff;
            }
            
            .pqs-plugin-name {
                font-weight: 600;
                margin-bottom: 4px;
            }
            
            .pqs-plugin-desc {
                font-size: 12px;
                opacity: 0.8;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            .pqs-no-results {
                padding: 20px;
                text-align: center;
                color: #666;
            }
            
            .pqs-help {
                padding: 10px 20px;
                background: #f8f8f8;
                border-top: 1px solid #e0e0e0;
                font-size: 12px;
                color: #666;
                display: flex;
                flex-wrap: wrap;
                gap: 15px;
            }
            
            .pqs-help-item {
                display: flex;
                align-items: center;
                gap: 5px;
            }
            
            .pqs-kbd {
                background: #fff;
                border: 1px solid #ccc;
                border-radius: 3px;
                padding: 2px 6px;
                font-family: monospace;
                font-size: 11px;
                color: #333;
            }
        ';
    }

    // Settings page functionality
    public function add_settings_page() {
        add_options_page(
            'Plugin Quick Search Settings',
            'Plugin Quick Search',
            'manage_options',
            'plugin-quick-search',
            array($this, 'settings_page')
        );
    }

    public function register_settings() {
        register_setting('pqs_settings', 'pqs_highlight_duration', array(
            'type' => 'integer',
            'default' => 8000,
            'sanitize_callback' => array($this, 'sanitize_duration')
        ));
        
        register_setting('pqs_settings', 'pqs_fade_duration', array(
            'type' => 'integer', 
            'default' => 2000,
            'sanitize_callback' => array($this, 'sanitize_fade_duration')
        ));
        
        register_setting('pqs_settings', 'pqs_highlight_color', array(
            'type' => 'string',
            'default' => '#ff0000',
            'sanitize_callback' => 'sanitize_hex_color'
        ));
        
        register_setting('pqs_settings', 'pqs_highlight_opacity', array(
            'type' => 'number',
            'default' => 1.0,
            'sanitize_callback' => array($this, 'sanitize_opacity')
        ));
    }

    public function sanitize_duration($value) {
        $value = intval($value);
        return max(1000, min(30000, $value)); // 1-30 seconds
    }

    public function sanitize_fade_duration($value) {
        $value = intval($value);
        return max(500, min(5000, $value)); // 0.5-5 seconds
    }

    public function sanitize_opacity($value) {
        $value = floatval($value);
        return max(0.1, min(1.0, $value)); // 0.1-1.0
    }

    public function get_settings() {
        return array(
            'highlight_duration' => get_option('pqs_highlight_duration', $this->default_settings['highlight_duration']),
            'fade_duration' => get_option('pqs_fade_duration', $this->default_settings['fade_duration']),
            'highlight_color' => get_option('pqs_highlight_color', $this->default_settings['highlight_color']),
            'highlight_opacity' => get_option('pqs_highlight_opacity', $this->default_settings['highlight_opacity'])
        );
    }

    public function settings_page() {
        if (isset($_POST['submit'])) {
            update_option('pqs_highlight_duration', $this->sanitize_duration($_POST['pqs_highlight_duration']));
            update_option('pqs_fade_duration', $this->sanitize_fade_duration($_POST['pqs_fade_duration']));
            update_option('pqs_highlight_color', sanitize_hex_color($_POST['pqs_highlight_color']));
            update_option('pqs_highlight_opacity', $this->sanitize_opacity($_POST['pqs_highlight_opacity']));
            echo '<div class="notice notice-success"><p>Settings saved!</p></div>';
        }

        $settings = $this->get_settings();
        ?>
        <div class="wrap">
            <h1>Plugin Quick Search Settings</h1>
            <form method="post" action="">
                <table class="form-table">
                    <tr>
                        <th scope="row">Highlight Duration</th>
                        <td>
                            <input type="range" name="pqs_highlight_duration" min="1000" max="30000" step="1000" 
                                   value="<?php echo esc_attr($settings['highlight_duration']); ?>" 
                                   oninput="this.nextElementSibling.value = (this.value/1000) + ' seconds'">
                            <output><?php echo ($settings['highlight_duration']/1000); ?> seconds</output>
                            <p class="description">How long the highlight box stays visible (1-30 seconds)</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">Fade Duration</th>
                        <td>
                            <input type="range" name="pqs_fade_duration" min="500" max="5000" step="250"
                                   value="<?php echo esc_attr($settings['fade_duration']); ?>"
                                   oninput="this.nextElementSibling.value = (this.value/1000) + ' seconds'">
                            <output><?php echo ($settings['fade_duration']/1000); ?> seconds</output>
                            <p class="description">How long the fade-out animation takes (0.5-5 seconds)</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">Highlight Color</th>
                        <td>
                            <input type="color" name="pqs_highlight_color" value="<?php echo esc_attr($settings['highlight_color']); ?>">
                            <p class="description">Color of the highlight box border</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">Highlight Opacity</th>
                        <td>
                            <input type="range" name="pqs_highlight_opacity" min="0.1" max="1.0" step="0.1"
                                   value="<?php echo esc_attr($settings['highlight_opacity']); ?>"
                                   oninput="this.nextElementSibling.value = Math.round(this.value * 100) + '%'">
                            <output><?php echo round($settings['highlight_opacity'] * 100); ?>%</output>
                            <p class="description">Transparency of the highlight box (10-100%)</p>
                        </td>
                    </tr>
                </table>
                <?php submit_button(); ?>
            </form>

            <div class="pqs-settings-info" style="margin-top: 30px; padding: 15px; background: #f1f1f1; border-radius: 5px;">
                <h3>How to Use</h3>
                <ol>
                    <li>Go to <strong>Plugins → Installed Plugins</strong></li>
                    <li>Press <strong>Cmd+Shift+P</strong> (Mac) or <strong>Ctrl+Shift+P</strong> (Windows/Linux)</li>
                    <li>Type to search for plugins</li>
                    <li>Use arrow keys to navigate and press <strong>Enter</strong> to select</li>
                    <li>Press <strong>Shift+Enter</strong> to go to plugin settings</li>
                    <li>The selected plugin will be highlighted with your custom settings</li>
                </ol>
            </div>
        </div>
        <?php
    }
}

// Initialize the plugin
new PluginQuickSearch();
