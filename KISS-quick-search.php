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
        'keyboard_shortcut' => 'cmd_shift_p',  // cmd_shift_p or cmd_k
        'highlight_duration' => 8000,  // 8 seconds (increased from 5)
        'fade_duration' => 2000,       // 2 seconds (increased from 1)
        'highlight_color' => '#ff0000', // Red color
        'highlight_opacity' => 1.0     // Full opacity
    );

    public function __construct() {
        add_action('admin_enqueue_scripts', array($this, 'enqueue_scripts'));
        add_action('admin_menu', array($this, 'add_admin_menu'));
        add_action('admin_init', array($this, 'settings_init'));
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
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                z-index: 100000;
                animation: pqsFadeIn 0.2s ease-out;
            }
            
            .pqs-overlay.active {
                display: flex;
                align-items: flex-start;
                justify-content: center;
                padding-top: 100px;
            }
            
            .pqs-modal {
                background: #fff;
                border-radius: 8px;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
                width: 90%;
                max-width: 600px;
                animation: pqsSlideDown 0.2s ease-out;
            }
            
            .pqs-search-wrapper {
                padding: 20px;
                border-bottom: 1px solid #e0e0e0;
            }
            
            .pqs-search-input {
                width: 100%;
                padding: 12px 16px;
                font-size: 16px;
                border: 2px solid #ddd;
                border-radius: 4px;
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
                background: #f0f0f0;
                border-top: 1px solid #e0e0e0;
                font-size: 12px;
                color: #666;
                border-radius: 0 0 8px 8px;
            }
            
            .pqs-help-item {
                display: inline-block;
                margin-right: 20px;
            }
            
            .pqs-kbd {
                background: #fff;
                border: 1px solid #ccc;
                border-radius: 3px;
                padding: 2px 6px;
                font-family: monospace;
                font-size: 11px;
            }
            
            .pqs-loading {
                opacity: 0.6;
                pointer-events: none;
            }
            
            @keyframes pqsFadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            
            @keyframes pqsSlideDown {
                from {
                    opacity: 0;
                    transform: translateY(-20px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            /* iOS-style toggle switch for settings page */
            .pqs-toggle-container {
                display: flex;
                align-items: center;
                gap: 15px;
                margin: 10px 0;
            }

            .pqs-toggle-option {
                display: flex;
                flex-direction: column;
                align-items: center;
                min-width: 120px;
            }

            .pqs-toggle-label {
                font-weight: 600;
                font-size: 14px;
                color: #333;
                margin-bottom: 2px;
            }

            .pqs-toggle-description {
                font-size: 12px;
                color: #666;
                font-style: italic;
            }

            .pqs-toggle-switch {
                position: relative;
                display: inline-block;
                width: 60px;
                height: 34px;
                margin: 0;
            }

            .pqs-toggle-switch input {
                opacity: 0;
                width: 0;
                height: 0;
            }

            .pqs-toggle-slider {
                position: absolute;
                cursor: pointer;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: #ccc;
                transition: .4s;
                border-radius: 34px;
            }

            .pqs-toggle-slider:before {
                position: absolute;
                content: "";
                height: 26px;
                width: 26px;
                left: 4px;
                bottom: 4px;
                background-color: white;
                transition: .4s;
                border-radius: 50%;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            }

            .pqs-toggle-switch input:checked + .pqs-toggle-slider {
                background-color: #007cba;
            }

            .pqs-toggle-switch input:focus + .pqs-toggle-slider {
                box-shadow: 0 0 1px #007cba;
            }

            .pqs-toggle-switch input:checked + .pqs-toggle-slider:before {
                transform: translateX(26px);
            }

            .pqs-toggle-switch:hover .pqs-toggle-slider {
                background-color: #bbb;
            }

            .pqs-toggle-switch:hover input:checked + .pqs-toggle-slider {
                background-color: #005a87;
            }
        ';
    }

    /**
     * Get plugin settings with defaults
     */
    private function get_settings() {
        $settings = get_option('pqs_settings', array());
        return wp_parse_args($settings, $this->default_settings);
    }

    /**
     * Add admin menu for settings
     */
    public function add_admin_menu() {
        add_options_page(
            'Plugin Quick Search Settings',
            'Plugin Quick Search',
            'manage_options',
            'plugin-quick-search',
            array($this, 'settings_page')
        );
    }

    /**
     * Initialize settings
     */
    public function settings_init() {
        register_setting('pqs_settings', 'pqs_settings', array($this, 'sanitize_settings'));

        add_settings_section(
            'pqs_keyboard_section',
            'Keyboard Shortcut',
            array($this, 'keyboard_section_callback'),
            'pqs_settings'
        );

        add_settings_section(
            'pqs_highlight_section',
            'Highlight Box Settings',
            array($this, 'settings_section_callback'),
            'pqs_settings'
        );

        add_settings_field(
            'keyboard_shortcut',
            'Choose Keyboard Shortcut',
            array($this, 'keyboard_shortcut_render'),
            'pqs_settings',
            'pqs_keyboard_section'
        );

        add_settings_field(
            'highlight_duration',
            'Highlight Duration (milliseconds)',
            array($this, 'highlight_duration_render'),
            'pqs_settings',
            'pqs_highlight_section'
        );

        add_settings_field(
            'fade_duration',
            'Fade Duration (milliseconds)',
            array($this, 'fade_duration_render'),
            'pqs_settings',
            'pqs_highlight_section'
        );

        add_settings_field(
            'highlight_color',
            'Highlight Color',
            array($this, 'highlight_color_render'),
            'pqs_settings',
            'pqs_highlight_section'
        );

        add_settings_field(
            'highlight_opacity',
            'Highlight Opacity (0.1 - 1.0)',
            array($this, 'highlight_opacity_render'),
            'pqs_settings',
            'pqs_highlight_section'
        );
    }

    /**
     * Sanitize settings input
     */
    public function sanitize_settings($input) {
        $sanitized = array();

        // Highlight duration (1000-30000ms)
        $sanitized['highlight_duration'] = max(1000, min(30000, intval($input['highlight_duration'])));

        // Fade duration (500-5000ms)
        $sanitized['fade_duration'] = max(500, min(5000, intval($input['fade_duration'])));

        // Highlight color (hex color)
        $sanitized['highlight_color'] = sanitize_hex_color($input['highlight_color']);
        if (empty($sanitized['highlight_color'])) {
            $sanitized['highlight_color'] = '#ff0000';
        }

        // Highlight opacity (0.1-1.0)
        $sanitized['highlight_opacity'] = max(0.1, min(1.0, floatval($input['highlight_opacity'])));

        // Keyboard shortcut (cmd_shift_p or cmd_k)
        $sanitized['keyboard_shortcut'] = in_array($input['keyboard_shortcut'], array('cmd_shift_p', 'cmd_k'))
            ? $input['keyboard_shortcut']
            : 'cmd_shift_p';

        return $sanitized;
    }

    /**
     * Keyboard section callback
     */
    public function keyboard_section_callback() {
        echo '<p>Choose which keyboard shortcut opens the plugin search modal.</p>';
    }

    /**
     * Settings section callback
     */
    public function settings_section_callback() {
        echo '<p>Configure how the highlight box behaves when you select a plugin from search results.</p>';
    }

    /**
     * Render keyboard shortcut field
     */
    public function keyboard_shortcut_render() {
        $settings = $this->get_settings();
        $current_shortcut = $settings['keyboard_shortcut'];
        ?>
        <div class="pqs-toggle-container">
            <div class="pqs-toggle-option">
                <span class="pqs-toggle-label">Cmd/Ctrl + Shift + P</span>
                <span class="pqs-toggle-description">(Current default)</span>
            </div>
            <label class="pqs-toggle-switch">
                <input type="hidden" name="pqs_settings[keyboard_shortcut]" value="cmd_shift_p">
                <input type="checkbox" name="pqs_settings[keyboard_shortcut]" value="cmd_k" <?php checked($current_shortcut, 'cmd_k'); ?> onchange="this.previousElementSibling.disabled = this.checked;">
                <span class="pqs-toggle-slider"></span>
            </label>
            <div class="pqs-toggle-option">
                <span class="pqs-toggle-label">Cmd/Ctrl + K</span>
                <span class="pqs-toggle-description">(VS Code style)</span>
            </div>
        </div>
        <p class="description">Choose your preferred keyboard shortcut to open the plugin search modal.</p>
        <?php
    }

    /**
     * Render highlight duration field
     */
    public function highlight_duration_render() {
        $settings = $this->get_settings();
        echo '<input type="number" name="pqs_settings[highlight_duration]" value="' . esc_attr($settings['highlight_duration']) . '" min="1000" max="30000" step="500" />';
        echo '<p class="description">How long the highlight box stays visible (1000-30000ms). Default: 8000ms (8 seconds)</p>';
    }

    /**
     * Render fade duration field
     */
    public function fade_duration_render() {
        $settings = $this->get_settings();
        echo '<input type="number" name="pqs_settings[fade_duration]" value="' . esc_attr($settings['fade_duration']) . '" min="500" max="5000" step="250" />';
        echo '<p class="description">How long the fade-out animation takes (500-5000ms). Default: 2000ms (2 seconds)</p>';
    }

    /**
     * Render highlight color field
     */
    public function highlight_color_render() {
        $settings = $this->get_settings();
        echo '<input type="color" name="pqs_settings[highlight_color]" value="' . esc_attr($settings['highlight_color']) . '" />';
        echo '<p class="description">Color of the highlight box border. Default: #ff0000 (red)</p>';
    }

    /**
     * Render highlight opacity field
     */
    public function highlight_opacity_render() {
        $settings = $this->get_settings();
        echo '<input type="number" name="pqs_settings[highlight_opacity]" value="' . esc_attr($settings['highlight_opacity']) . '" min="0.1" max="1.0" step="0.1" />';
        echo '<p class="description">Opacity of the highlight box (0.1-1.0). Default: 1.0 (fully opaque)</p>';
    }

    /**
     * Settings page HTML
     */
    public function settings_page() {
        ?>
        <div class="wrap">
            <h1>Plugin Quick Search Settings</h1>
            <form action="options.php" method="post">
                <?php
                settings_fields('pqs_settings');
                do_settings_sections('pqs_settings');
                submit_button();
                ?>
            </form>

            <div class="pqs-settings-info" style="margin-top: 30px; padding: 15px; background: #f1f1f1; border-radius: 5px;">
                <h3>How to Use</h3>
                <ol>
                    <li>Go to <strong>Plugins → Installed Plugins</strong></li>
                    <li>Press your configured keyboard shortcut (see above setting)</li>
                    <li>Type to search for plugins</li>
                    <li>Use arrow keys to navigate and press <strong>Enter</strong> to select</li>
                    <li>The selected plugin will be highlighted with your custom settings</li>
                </ol>

                <h3>Tips</h3>
                <ul>
                    <li><strong>Highlight Duration:</strong> Longer durations help you locate the plugin, but may be distracting</li>
                    <li><strong>Fade Duration:</strong> Longer fades are smoother but take more time</li>
                    <li><strong>Color:</strong> Choose a color that contrasts well with your admin theme</li>
                    <li><strong>Opacity:</strong> Lower opacity is less intrusive but may be harder to see</li>
                </ul>
            </div>
        </div>
        <?php
    }
}

// Initialize the plugin
new PluginQuickSearch();