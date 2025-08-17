<?php
/**
 * Plugin Name: KISS Plugin Quick Search
 * Plugin URI: https://kissplugins.com/
 * Description: Adds keyboard shortcut (Cmd+Shift+P or Ctrl+Shift+P) to quickly search and filter plugins on the Plugins page
 * Version: 1.0.2
 * Author: KISS Plugins
 * License: GPL v2 or later
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

class PluginQuickSearch {
    
    public function __construct() {
        add_action('admin_enqueue_scripts', array($this, 'enqueue_scripts'));
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

        // Enqueue the JavaScript
        wp_enqueue_script(
            'plugin-quick-search',
            plugin_dir_url(__FILE__) . 'plugin-quick-search.js',
            array('jquery'),
            '1.0.0',
            true
        );

        // Add nonce for security (future use)
        wp_localize_script('plugin-quick-search', 'pqs_ajax', array(
            'nonce' => wp_create_nonce('pqs_nonce'),
            'ajax_url' => admin_url('admin-ajax.php')
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
        ';
    }
}

// Initialize the plugin
new PluginQuickSearch();