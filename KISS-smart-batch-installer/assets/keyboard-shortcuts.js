/**
 * KISS Smart Batch Installer - Keyboard Shortcuts
 * 
 * Adds Cmd/Ctrl+Shift+P keyboard shortcut to navigate to the Smart Batch Installer page
 * This integrates with the PQS cache system for a unified experience
 */

jQuery(document).ready(function($) {
    'use strict';

    // Keyboard shortcut handler for Cmd/Ctrl+Shift+P
    function initKeyboardShortcuts() {
        document.addEventListener('keydown', function(e) {
            // Check for Cmd/Ctrl+Shift+P
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'P') {
                e.preventDefault();
                
                // Check if we're already on the Smart Batch Installer page
                const currentUrl = window.location.href;
                if (currentUrl.includes('page=kiss-smart-batch-installer')) {
                    console.log('KISS SBI: Already on Smart Batch Installer page');
                    return;
                }
                
                // Navigate to Smart Batch Installer page
                const installerUrl = typeof kissSbiShortcuts !== 'undefined' && kissSbiShortcuts && kissSbiShortcuts.installerUrl
                    ? kissSbiShortcuts.installerUrl
                    : '/wp-admin/plugins.php?page=kiss-smart-batch-installer';
                
                window.location.href = installerUrl;
                
                console.log('KISS SBI: Keyboard shortcut triggered - navigating to Smart Batch Installer');
            }
        });
        
        console.log('KISS SBI: Keyboard shortcuts initialized (Cmd/Ctrl+Shift+P)');
    }

    // Initialize keyboard shortcuts
    initKeyboardShortcuts();
    
    // Expose globally for debugging
    window.KissSbiKeyboardShortcuts = {
        init: initKeyboardShortcuts
    };
});
