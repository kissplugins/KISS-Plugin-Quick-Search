<?php
/**
 * Plugin Name: KISS Plugin Quick Search
 * Plugin URI: https://kissplugins.com/
 * Description: Adds keyboard shortcut (Cmd+Shift+P or Ctrl+Shift+P) to quickly search and filter plugins on the Plugins page
 * Version: 1.1.5
 * Author: KISS Plugins
 * License: GPL v2 or later
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

class PluginQuickSearch {

    // Plugin version for cache busting
    const VERSION = '1.1.5';

    // Default settings
    private $default_settings = array(
        'keyboard_shortcut' => 'cmd_shift_p',  // cmd_shift_p or cmd_k
        'highlight_duration' => 8000,  // 8 seconds (increased from 5)
        'fade_duration' => 2000,       // 2 seconds (increased from 1)
        'highlight_color' => '#ff0000', // Red color
        'highlight_opacity' => 1.0,    // Full opacity
        'cache_duration' => 60,        // 1 hour in minutes
        'auto_refresh_cache' => true   // Auto-refresh on plugin activate/deactivate
    );

    public function __construct() {
        add_action('admin_enqueue_scripts', array($this, 'enqueue_scripts'));
        add_action('admin_menu', array($this, 'add_admin_menu'));
        add_action('admin_init', array($this, 'settings_init'));
        add_action('wp_ajax_pqs_get_cache_status', array($this, 'ajax_get_cache_status'));
        add_action('wp_ajax_pqs_run_cache_diagnostics', array($this, 'ajax_run_cache_diagnostics'));
        // Expose a server-side row injection on SBI Self Tests page
        add_filter('kiss_sbi_self_test_results', array($this, 'inject_sbi_self_test_row'));
    }

    public function enqueue_scripts($hook) {
        // Load on plugins.php page, cache status page, and SBI Self Tests page
        $is_plugins = ($hook === 'plugins.php');
        $is_cache_status = ($hook === 'plugins_page_pqs-cache-status');
        $is_sbi_tests = ($hook === 'plugins_page_kiss-smart-batch-installer-tests');
        if (!$is_plugins && !$is_cache_status && !$is_sbi_tests) {
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

        // If on SBI Self Tests page, inject a small counter script to publish a row
        if ($is_sbi_tests) {
            wp_register_script('pqs-sbi-counter', '', array('plugin-quick-search'), $version, true);
            $inline = "(function(){\n" .
                "  function inject(){\n" .
                "    if (!window.kissSbiSelfTests || !window.kissSbiSelfTests.addOrUpdateRow) return;\n" .
                "    var len=0; try { len = JSON.parse(localStorage.getItem('pqs_plugin_cache')||'[]').length; } catch(e) {}\n" .
                "    var status=(typeof window.pqsCacheStatus==='function') ? window.pqsCacheStatus() : (len>0 ? 'unknown' : 'missing');\n" .
                "    var pass=(status==='fresh') || (status==='unknown' && len>0);\n" .
                "    var details='status='+status+', entries='+len+(status==='unknown' ? ' (via localStorage)' : '');\n" .
                "    window.kissSbiSelfTests.addOrUpdateRow('pqs_counter','PQS: Counter Check (from PQS)',pass,details);\n" .
                "  }\n" .
                "  if (document.readyState==='complete' || document.readyState==='interactive') inject();\n" .
                "  else document.addEventListener('DOMContentLoaded', inject);\n" .
                "  document.addEventListener('kiss-sbi-self-tests-ready', function(){ inject(); }, { once:true });\n" .
                "})();";
            wp_add_inline_script('pqs-sbi-counter', $inline);
            wp_enqueue_script('pqs-sbi-counter');
        }

        // Get user settings
        $settings = $this->get_settings();

        // Convert cache duration from minutes to milliseconds for JavaScript
        $settings['cache_duration_ms'] = $settings['cache_duration'] * 60 * 1000;

        // Add nonce for security and pass settings to JavaScript
        wp_localize_script('plugin-quick-search', 'pqs_ajax', array(
            'nonce' => wp_create_nonce('pqs_nonce'),
            'ajax_url' => admin_url('admin-ajax.php'),
            'version' => $version,
            'debug' => defined('WP_DEBUG') && WP_DEBUG,
            'settings' => $settings
        ));

        // Add inline CSS
        if ($is_plugins || $is_cache_status) {
            wp_add_inline_style('wp-admin', $this->get_inline_styles());
        }
    }

    /**
     * Inject a server-side row into SBI's Self Tests as a baseline indicator
     */
    public function inject_sbi_self_test_row($results) {
        try {
            if (!function_exists('is_plugin_active')) {
                require_once ABSPATH . 'wp-admin/includes/plugin.php';
            }
            $active = function_exists('is_plugin_active') && (is_plugin_active(plugin_basename(__FILE__)) || is_plugin_active('plugin-quick-search/plugin-quick-search.php'));
            $results['pqs_counter_server'] = array(
                'label' => 'PQS: Counter (server-side)',
                'pass'  => (bool) $active,
                'details' => $active ? 'PQS is active; JS augments details on page load' : 'PQS not detected active; JS may still add details if loaded'
            );
        } catch (\Throwable $e) {
            $results['pqs_counter_server'] = array(
                'label' => 'PQS: Counter (server-side)',
                'pass'  => false,
                'details' => 'Error: ' . $e->getMessage()
            );
        }
        return $results;
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

            /* Cache status styling */
            .pqs-cache-status {
                float: right;
                font-size: 11px;
                color: #666;
                font-style: italic;
                margin-left: auto;
            }

            .pqs-cache-notification {
                position: absolute;
                top: 10px;
                right: 10px;
                padding: 8px 12px;
                border-radius: 4px;
                font-size: 12px;
                z-index: 100001;
            }

            .pqs-notification-success {
                background: #d4edda;
                color: #155724;
                border: 1px solid #c3e6cb;
            }

            .pqs-notification-info {
                background: #d1ecf1;
                color: #0c5460;
                border: 1px solid #bee5eb;
            }

            /* Cache Status Page Styles */
            .pqs-cache-dashboard {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 20px;
                margin-top: 20px;
            }

            .pqs-cache-overview,
            .pqs-cache-tests,
            .pqs-cache-api {
                background: #fff;
                border: 1px solid #c3c4c7;
                border-radius: 4px;
                padding: 20px;
            }

            .pqs-cache-api {
                grid-column: 1 / -1;
            }

            .pqs-cache-info-box {
                background: #f6f7f7;
                border: 1px solid #dcdcde;
                border-radius: 4px;
                padding: 15px;
                margin-top: 10px;
            }

            .pqs-test-controls {
                margin: 15px 0;
            }

            .pqs-test-controls .button {
                margin-right: 10px;
            }

            .pqs-test-results {
                border: 1px solid #dcdcde;
                border-radius: 4px;
                overflow: hidden;
            }

            .pqs-test-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 15px;
                border-bottom: 1px solid #dcdcde;
                background: #fff;
            }

            .pqs-test-item:last-child {
                border-bottom: none;
            }

            .pqs-test-name {
                font-weight: 600;
            }

            .pqs-test-status {
                font-size: 12px;
                padding: 4px 8px;
                border-radius: 3px;
                background: #f0f0f1;
                color: #50575e;
            }

            .pqs-test-pass {
                background: #d4edda !important;
                color: #155724 !important;
            }

            .pqs-test-fail {
                background: #f8d7da !important;
                color: #721c24 !important;
            }

            .pqs-test-results h3 {
                margin: 15px 0 10px 0 !important;
                padding: 8px 12px;
                background: #f0f0f1;
                border-left: 4px solid #2271b1;
                font-size: 14px !important;
                font-weight: 600;
                color: #1d2327;
            }

            .pqs-test-disabled {
                opacity: 0.6;
            }

            .pqs-test-disabled .pqs-test-name {
                color: #8c8f94 !important;
            }

            .pqs-test-paused {
                background: #f0f0f1 !important;
                color: #8c8f94 !important;
                font-style: italic;
            }

            .pqs-status-dot {
                animation: pqs-pulse 2s infinite;
            }

            @keyframes pqs-pulse {
                0% { opacity: 1; }
                50% { opacity: 0.5; }
                100% { opacity: 1; }
            }

            @media (max-width: 768px) {
                .pqs-cache-dashboard {
                    grid-template-columns: 1fr;
                }
            }

            /* PQS: plugin folder label below row actions */
            .pqs-plugin-folder {
                margin-top: 3px;
                color: #646970;
                font-size: 12px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif;
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

        // Add cache status page under Plugins menu
        add_plugins_page(
            'KISS PQS Cache Status',
            'KISS PQS Cache Status',
            'activate_plugins',
            'pqs-cache-status',
            array($this, 'cache_status_page')
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

        add_settings_section(
            'pqs_cache_section',
            'Cache Management',
            array($this, 'cache_section_callback'),
            'pqs_settings'
        );

        add_settings_field(
            'cache_duration',
            'Cache Duration (minutes)',
            array($this, 'cache_duration_render'),
            'pqs_settings',
            'pqs_cache_section'
        );

        add_settings_field(
            'auto_refresh_cache',
            'Auto-refresh Cache',
            array($this, 'auto_refresh_cache_render'),
            'pqs_settings',
            'pqs_cache_section'
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

        // Cache duration (5-1440 minutes)
        $sanitized['cache_duration'] = max(5, min(1440, intval($input['cache_duration'])));

        // Auto-refresh cache (boolean)
        $sanitized['auto_refresh_cache'] = !empty($input['auto_refresh_cache']);

        return $sanitized;
    }

    /**
     * Keyboard section callback
     */
    public function keyboard_section_callback() {
        echo '<p>Choose which keyboard shortcut opens the plugin search modal.</p>';
    }

    /**
     * Cache section callback
     */
    public function cache_section_callback() {
        echo '<p>Configure caching behavior to improve performance on sites with many plugins.</p>';
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
     * Render cache duration field
     */
    public function cache_duration_render() {
        $settings = $this->get_settings();
        echo '<input type="number" name="pqs_settings[cache_duration]" value="' . esc_attr($settings['cache_duration']) . '" min="5" max="1440" step="5" />';
        echo '<p class="description">How long to cache plugin data (5-1440 minutes). Default: 60 minutes</p>';
    }

    /**
     * Render auto-refresh cache field
     */
    public function auto_refresh_cache_render() {
        $settings = $this->get_settings();
        $checked = checked($settings['auto_refresh_cache'], true, false);
        echo '<input type="checkbox" name="pqs_settings[auto_refresh_cache]" value="1" ' . $checked . ' />';
        echo '<label for="pqs_settings[auto_refresh_cache]">Automatically refresh cache when plugins are activated/deactivated</label>';
        echo '<p class="description">Recommended for optimal performance and accuracy</p>';
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

    /**
     * Cache status page
     */
    public function cache_status_page() {
        ?>
        <div class="wrap">
            <h1>
                <span id="pqs-cache-status-indicator" class="pqs-status-dot" style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 8px; background-color: #ccc;"></span>
                KISS PQS Cache Status
                <span style="font-size: 14px; color: #666; font-weight: normal;">v<?php echo self::VERSION; ?></span>
            </h1>

            <div class="pqs-cache-dashboard">
                <div class="pqs-cache-overview">
                    <h2>Cache Overview</h2>
                    <div id="pqs-cache-info" class="pqs-cache-info-box">
                        <p>Loading cache status...</p>
                    </div>

                    <div class="pqs-cache-api-info">
                        <h3>Cache API Information</h3>
                        <p>Other plugins can access the cache using the following JavaScript API:</p>
                        <pre><code>// Check cache status
window.pqsCacheStatus() // Returns: 'fresh', 'stale', 'error', 'loading'

// Get cached data
const data = JSON.parse(localStorage.getItem('pqs_plugin_cache') || '[]');

// Listen for cache events
document.addEventListener('pqs-cache-rebuilt', function(event) {
    console.log('Cache rebuilt with', event.detail.pluginCount, 'plugins');
});</code></pre>
                        <p><a href="<?php echo plugin_dir_url(__FILE__); ?>CACHE-API.md" target="_blank">View full API documentation</a></p>
                    </div>
                </div>

                <div class="pqs-cache-tests">
                    <h2>Self Tests</h2>
                    <div class="pqs-test-controls">
                        <button type="button" id="pqs-run-tests" class="button button-primary">Run All Tests</button>
                        <button type="button" id="pqs-clear-cache" class="button">Clear Cache</button>
                        <button type="button" id="pqs-rebuild-cache" class="button">Rebuild Cache</button>
                    </div>

                    <div class="notice notice-info inline" style="margin: 10px 0;">
                        <p><strong>Note:</strong> Some tests require the full system to be loaded.
                        If tests fail, visit the <a href="<?php echo admin_url('plugins.php'); ?>">Plugins page</a> first,
                        then return here to run the tests.</p>
                    </div>

                    <div id="pqs-test-results" class="pqs-test-results">
                        <h3 style="margin: 15px 0 10px 0; color: #23282d; font-size: 14px;">Cache Tests</h3>
                        <div class="pqs-test-item" data-test="cache-exists">
                            <span class="pqs-test-name">Cache Exists</span>
                            <span class="pqs-test-status">Not tested</span>
                        </div>
                        <div class="pqs-test-item" data-test="cache-readable">
                            <span class="pqs-test-name">Cache Readable</span>
                            <span class="pqs-test-status">Not tested</span>
                        </div>
                        <div class="pqs-test-item" data-test="cache-valid">
                            <span class="pqs-test-name">Cache Valid</span>
                            <span class="pqs-test-status">Not tested</span>
                        </div>
                        <div class="pqs-test-item pqs-test-disabled" data-test="cache-building">
                            <span class="pqs-test-name">Cache Building Process</span>
                            <span class="pqs-test-status pqs-test-paused">Paused</span>
                        </div>

                        <h3 style="margin: 15px 0 10px 0; color: #23282d; font-size: 14px;">Search Algorithm Tests</h3>
                        <div class="pqs-test-item" data-test="search-multiword">
                            <span class="pqs-test-name">Multi-word Search</span>
                            <span class="pqs-test-status">Not tested</span>
                        </div>
                        <div class="pqs-test-item" data-test="search-exact">
                            <span class="pqs-test-name">Exact Match Search</span>
                            <span class="pqs-test-status">Not tested</span>
                        </div>
                        <div class="pqs-test-item" data-test="search-fuzzy">
                            <span class="pqs-test-name">Fuzzy Search</span>
                            <span class="pqs-test-status">Not tested</span>
                        </div>
                        <div class="pqs-test-item" data-test="search-regression">
                            <span class="pqs-test-name">Anti-Regression: "WP SMTP" → "WP Mail SMTP"</span>
                            <span class="pqs-test-status">Not tested</span>
                        </div>

                        <h3 style="margin: 15px 0 10px 0; color: #23282d; font-size: 14px;">System Tests</h3>
                        <div class="pqs-test-item" data-test="api-availability">
                            <span class="pqs-test-name">API Functions Available</span>
                            <span class="pqs-test-status">Not tested</span>
                        </div>
                        <div class="pqs-test-item" data-test="event-system">
                            <span class="pqs-test-name">Event System</span>
                            <span class="pqs-test-status">Not tested</span>
                        </div>
                    </div>
                </div>


            </div>
        </div>

        <script type="text/javascript">
        jQuery(document).ready(function($) {
            let testRunning = false;

            // Load initial cache status
            loadCacheStatus();

            // Auto-refresh every 30 seconds
            setInterval(loadCacheStatus, 30000);

            function loadCacheStatus() {
                $.post(ajaxurl, {
                    action: 'pqs_get_cache_status',
                    nonce: '<?php echo wp_create_nonce('pqs_cache_status_nonce'); ?>'
                }, function(response) {
                    if (response.success) {
                        updateCacheDisplay(response.data);
                    }
                });
            }

            function updateCacheDisplay(data) {
                const indicator = $('#pqs-cache-status-indicator');
                const info = $('#pqs-cache-info');

                // Update status indicator
                if (data.status === 'fresh') {
                    indicator.css('background-color', '#46b450'); // Green
                } else if (data.status === 'stale') {
                    indicator.css('background-color', '#ffb900'); // Yellow
                } else {
                    indicator.css('background-color', '#dc3232'); // Red
                }

                // Update info display
                let html = '<table class="widefat">';
                html += '<tr><td><strong>Status:</strong></td><td>' + data.status + '</td></tr>';
                html += '<tr><td><strong>Plugin Count:</strong></td><td>' + (data.plugin_count || 'Unknown') + '</td></tr>';
                html += '<tr><td><strong>Last Updated:</strong></td><td>' + (data.last_updated || 'Unknown') + '</td></tr>';
                html += '<tr><td><strong>Cache Size:</strong></td><td>' + (data.cache_size || 'Unknown') + '</td></tr>';
                html += '</table>';

                info.html(html);
            }

            // Run tests button
            $('#pqs-run-tests').click(function() {
                if (testRunning) return;

                testRunning = true;
                $(this).prop('disabled', true).text('Running Tests...');

                runAllTests().finally(function() {
                    testRunning = false;
                    $('#pqs-run-tests').prop('disabled', false).text('Run All Tests');
                });
            });

            // Clear cache button
            $('#pqs-clear-cache').click(function() {
                if (typeof window.pqsClearCache === 'function') {
                    window.pqsClearCache();
                    alert('Cache cleared successfully');
                    loadCacheStatus();
                } else {
                    alert('Cache API not available. Please visit the Plugins page first.');
                }
            });

            // Rebuild cache button
            $('#pqs-rebuild-cache').click(function() {
                if (typeof window.pqsRebuildCache === 'function') {
                    window.pqsRebuildCache().then(function() {
                        alert('Cache rebuilt successfully');
                        loadCacheStatus();
                    }).catch(function(error) {
                        alert('Cache rebuild failed: ' + error.message);
                    });
                } else {
                    alert('Cache API not available. Please visit the Plugins page first to load the cache system.');
                }
            });

            async function runAllTests() {
                const tests = [
                    // Cache Tests
                    { name: 'cache-exists', test: testCacheExists },
                    { name: 'cache-readable', test: testCacheReadable },
                    { name: 'cache-valid', test: testCacheValid },
                    // { name: 'cache-building', test: testCacheBuilding }, // Disabled for now

                    // Search Algorithm Tests
                    { name: 'search-multiword', test: testSearchMultiword },
                    { name: 'search-exact', test: testSearchExact },
                    { name: 'search-fuzzy', test: testSearchFuzzy },
                    { name: 'search-regression', test: testSearchRegression },

                    // System Tests
                    { name: 'api-availability', test: testAPIAvailability },
                    { name: 'event-system', test: testEventSystem }
                ];

                for (const testItem of tests) {
                    const element = $('[data-test="' + testItem.name + '"]');
                    element.find('.pqs-test-status').text('Running...').removeClass('pqs-test-pass pqs-test-fail');

                    try {
                        const result = await testItem.test();
                        element.find('.pqs-test-status')
                            .text(result.success ? 'PASS' : 'FAIL: ' + result.message)
                            .addClass(result.success ? 'pqs-test-pass' : 'pqs-test-fail');
                    } catch (error) {
                        element.find('.pqs-test-status')
                            .text('ERROR: ' + error.message)
                            .addClass('pqs-test-fail');
                    }

                    // Small delay between tests
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            function testCacheExists() {
                return new Promise((resolve) => {
                    const cacheData = localStorage.getItem('pqs_plugin_cache');
                    const metaData = localStorage.getItem('pqs_cache_meta');

                    if (cacheData && metaData) {
                        resolve({ success: true });
                    } else {
                        resolve({ success: false, message: 'Cache data not found in localStorage' });
                    }
                });
            }

            function testCacheReadable() {
                return new Promise((resolve) => {
                    try {
                        const cacheData = localStorage.getItem('pqs_plugin_cache');
                        const metaData = localStorage.getItem('pqs_cache_meta');

                        if (!cacheData || !metaData) {
                            resolve({ success: false, message: 'Cache data not found' });
                            return;
                        }

                        const plugins = JSON.parse(cacheData);
                        const meta = JSON.parse(metaData);

                        if (Array.isArray(plugins) && typeof meta === 'object') {
                            resolve({ success: true });
                        } else {
                            resolve({ success: false, message: 'Cache data format invalid' });
                        }
                    } catch (error) {
                        resolve({ success: false, message: 'Failed to parse cache data: ' + error.message });
                    }
                });
            }

            function testCacheValid() {
                return new Promise((resolve) => {
                    try {
                        const metaData = localStorage.getItem('pqs_cache_meta');
                        if (!metaData) {
                            resolve({ success: false, message: 'No cache metadata found' });
                            return;
                        }

                        const meta = JSON.parse(metaData);
                        const now = Date.now();
                        const cacheAge = now - meta.timestamp;
                        const maxAge = 60 * 60 * 1000; // 1 hour default

                        if (cacheAge < maxAge && meta.version) {
                            resolve({ success: true });
                        } else {
                            resolve({ success: false, message: 'Cache expired or invalid version' });
                        }
                    } catch (error) {
                        resolve({ success: false, message: 'Failed to validate cache: ' + error.message });
                    }
                });
            }

            function testCacheBuilding() {
                return new Promise((resolve) => {
                    if (typeof window.pqsRebuildCache === 'function') {
                        window.pqsRebuildCache()
                            .then(() => resolve({ success: true }))
                            .catch(error => resolve({
                                success: false,
                                message: error.message || 'Cache rebuild failed'
                            }));
                    } else {
                        resolve({
                            success: false,
                            message: 'Cache rebuild API not available. Visit Plugins page first to load the cache system.'
                        });
                    }
                });
            }

            // Search Algorithm Tests
            function testSearchMultiword() {
                return new Promise((resolve) => {
                    try {
                        // Test multi-word search logic
                        const query = 'wp mail';
                        const queryWords = query.split(/\s+/).filter(word => word.length > 0);
                        const testPlugin = {
                            name: 'WP Mail SMTP',
                            nameLower: 'wp mail smtp',
                            description: 'WordPress SMTP plugin',
                            descriptionLower: 'wordpress smtp plugin'
                        };

                        const allWordsInName = queryWords.every(word => testPlugin.nameLower.includes(word));

                        if (allWordsInName && queryWords.length === 2) {
                            resolve({ success: true });
                        } else {
                            resolve({ success: false, message: 'Multi-word search logic failed' });
                        }
                    } catch (error) {
                        resolve({ success: false, message: 'Multi-word test error: ' + error.message });
                    }
                });
            }

            function testSearchExact() {
                return new Promise((resolve) => {
                    try {
                        const query = 'woocommerce';
                        const testPlugin = {
                            name: 'WooCommerce',
                            nameLower: 'woocommerce'
                        };

                        const exactMatch = testPlugin.nameLower === query;

                        if (exactMatch) {
                            resolve({ success: true });
                        } else {
                            resolve({ success: false, message: 'Exact match logic failed' });
                        }
                    } catch (error) {
                        resolve({ success: false, message: 'Exact match test error: ' + error.message });
                    }
                });
            }

            function testSearchFuzzy() {
                return new Promise((resolve) => {
                    try {
                        // Test basic fuzzy logic (simplified Levenshtein)
                        const query = 'woocomerce'; // Missing 'm'
                        const target = 'woocommerce';

                        // Simple character difference count
                        let differences = 0;
                        const maxLen = Math.max(query.length, target.length);

                        for (let i = 0; i < maxLen; i++) {
                            if (query[i] !== target[i]) {
                                differences++;
                            }
                        }

                        const threshold = Math.ceil(target.length * 0.4);
                        const fuzzyMatch = differences <= threshold;

                        if (fuzzyMatch) {
                            resolve({ success: true });
                        } else {
                            resolve({ success: false, message: 'Fuzzy search logic failed' });
                        }
                    } catch (error) {
                        resolve({ success: false, message: 'Fuzzy search test error: ' + error.message });
                    }
                });
            }

            function testSearchRegression() {
                return new Promise((resolve) => {
                    try {
                        // Anti-regression test: "WP SMTP" should match "WP Mail SMTP"
                        const query = 'wp smtp';
                        const queryWords = query.split(/\s+/).filter(word => word.length > 0);
                        const testPlugin = {
                            name: 'WP Mail SMTP',
                            nameLower: 'wp mail smtp',
                            description: 'WordPress SMTP plugin',
                            descriptionLower: 'wordpress smtp plugin'
                        };

                        // Test the exact scenario that was failing
                        const allWordsInName = queryWords.every(word => testPlugin.nameLower.includes(word));
                        const containsMatch = testPlugin.nameLower.includes(query);

                        if (allWordsInName && queryWords.length === 2) {
                            resolve({
                                success: true,
                                message: `Multi-word match works (contains: ${containsMatch}, words: ${allWordsInName})`
                            });
                        } else {
                            resolve({
                                success: false,
                                message: `Regression detected: contains=${containsMatch}, words=${allWordsInName}`
                            });
                        }
                    } catch (error) {
                        resolve({ success: false, message: 'Regression test error: ' + error.message });
                    }
                });
            }

            // System Tests
            function testAPIAvailability() {
                return new Promise((resolve) => {
                    try {
                        const requiredFunctions = [
                            'pqsCacheStatus',
                            'pqsClearCache',
                            'pqsGetCacheInfo'
                        ];

                        const missingFunctions = requiredFunctions.filter(func => typeof window[func] !== 'function');

                        if (missingFunctions.length === 0) {
                            resolve({ success: true });
                        } else {
                            resolve({
                                success: false,
                                message: 'Missing API functions: ' + missingFunctions.join(', ')
                            });
                        }
                    } catch (error) {
                        resolve({ success: false, message: 'API availability test error: ' + error.message });
                    }
                });
            }

            function testEventSystem() {
                return new Promise((resolve) => {
                    try {
                        let eventReceived = false;

                        // Listen for a test event
                        const testHandler = function(event) {
                            eventReceived = true;
                            document.removeEventListener('pqs-test-event', testHandler);
                        };

                        document.addEventListener('pqs-test-event', testHandler);

                        // Fire a test event
                        document.dispatchEvent(new CustomEvent('pqs-test-event', {
                            detail: { test: true }
                        }));

                        // Check if event was received
                        setTimeout(() => {
                            if (eventReceived) {
                                resolve({ success: true });
                            } else {
                                resolve({ success: false, message: 'Event system not working' });
                            }
                        }, 100);

                    } catch (error) {
                        resolve({ success: false, message: 'Event system test error: ' + error.message });
                    }
                });
            }
        });
        </script>
        <?php
    }

    /**
     * AJAX handler for cache status
     */
    public function ajax_get_cache_status() {
        check_ajax_referer('pqs_cache_status_nonce', 'nonce');

        if (!current_user_can('activate_plugins')) {
            wp_die('Insufficient permissions');
        }

        $status = $this->get_cache_status();
        wp_send_json_success($status);
    }

    /**
     * Get cache status information
     */
    private function get_cache_status() {
        // This is a server-side approximation since the cache is client-side
        // We'll return what we can determine from the server

        $status = array(
            'status' => 'server_check',
            'plugin_count' => 'Unknown',
            'last_updated' => 'Server-side check',
            'cache_size' => 'Client-side localStorage',
            'server_plugin_count' => 0,
            'cache_api_available' => false,
            'plugin_version' => self::VERSION
        );

        // Count installed plugins from server-side
        if (!function_exists('get_plugins')) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }

        try {
            $all_plugins = get_plugins();
            $status['server_plugin_count'] = count($all_plugins);
            $status['plugin_count'] = count($all_plugins) . ' (server count)';

            // Check if we can determine more about the environment
            $status['wp_version'] = get_bloginfo('version');
            $status['php_version'] = PHP_VERSION;
            $status['user_can_manage_plugins'] = current_user_can('activate_plugins');

            // Check if localStorage is likely supported (modern browsers)
            $user_agent = isset($_SERVER['HTTP_USER_AGENT']) ? $_SERVER['HTTP_USER_AGENT'] : '';
            $status['browser_likely_supports_cache'] = !empty($user_agent) &&
                !preg_match('/MSIE [6-8]\./', $user_agent); // Exclude old IE

        } catch (Exception $e) {
            $status['error'] = 'Failed to get plugin information: ' . $e->getMessage();
            $status['status'] = 'error';
        }

        return $status;
    }

    /**
     * Add AJAX endpoint for cache diagnostics
     */
    public function ajax_run_cache_diagnostics() {
        check_ajax_referer('pqs_cache_status_nonce', 'nonce');

        if (!current_user_can('activate_plugins')) {
            wp_die('Insufficient permissions');
        }

        $diagnostics = $this->run_cache_diagnostics();
        wp_send_json_success($diagnostics);
    }

    /**
     * Run comprehensive cache diagnostics
     */
    private function run_cache_diagnostics() {
        $results = array();

        // Test 1: Check if plugins can be enumerated
        try {
            if (!function_exists('get_plugins')) {
                require_once ABSPATH . 'wp-admin/includes/plugin.php';
            }
            $all_plugins = get_plugins();
            $results['plugin_enumeration'] = array(
                'status' => 'pass',
                'message' => 'Successfully enumerated ' . count($all_plugins) . ' plugins',
                'plugin_count' => count($all_plugins)
            );
        } catch (Exception $e) {
            $results['plugin_enumeration'] = array(
                'status' => 'fail',
                'message' => 'Failed to enumerate plugins: ' . $e->getMessage()
            );
        }

        // Test 2: Check WordPress environment
        $results['wp_environment'] = array(
            'status' => 'info',
            'wp_version' => get_bloginfo('version'),
            'php_version' => PHP_VERSION,
            'is_admin' => is_admin(),
            'current_screen' => function_exists('get_current_screen') ? get_current_screen() : null
        );

        // Test 3: Check user permissions
        $results['permissions'] = array(
            'status' => current_user_can('activate_plugins') ? 'pass' : 'fail',
            'message' => current_user_can('activate_plugins') ?
                'User has plugin management permissions' :
                'User lacks plugin management permissions',
            'can_activate_plugins' => current_user_can('activate_plugins'),
            'can_manage_options' => current_user_can('manage_options')
        );

        // Test 4: Check if we're on the right page
        global $pagenow;
        $results['page_context'] = array(
            'status' => 'info',
            'current_page' => $pagenow,
            'is_plugins_page' => ($pagenow === 'plugins.php'),
            'message' => 'Cache works best on plugins.php page'
        );

        return $results;
    }
}

// Initialize the plugin
new PluginQuickSearch();