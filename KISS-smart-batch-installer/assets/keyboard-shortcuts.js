/**
 * KISS Smart Batch Installer - Keyboard Shortcuts
 * 
 * Adds Cmd/Ctrl+Shift+P keyboard shortcut to navigate to the Smart Batch Installer page
 * This integrates with the PQS cache system for a unified experience
 */

jQuery(document).ready(function($) {
    'use strict';

    // Keyboard shortcut handler for Cmd/Ctrl+Shift+P with PQS coordination
    function initKeyboardShortcuts() {
        // Check if PQS coordination system is active
        if (window.pqsKeyboardHandlerActive) {
            console.log('KISS SBI: PQS keyboard handler detected, using coordination system');

            // Register with PQS ecosystem instead of competing
            document.addEventListener('keydown', function(e) {
                // Check for Cmd/Ctrl+Shift+P
                if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'P') {
                    e.preventDefault();

                    // Use PQS coordination system
                    if (window.PQS && typeof window.PQS.open === 'function') {
                        // Check current context to determine best action
                        const currentUrl = window.location.href;

                        if (currentUrl.includes('page=kiss-smart-batch-installer')) {
                            // Already on SBI page, open PQS modal for search
                            console.log('KISS SBI: On SBI page, opening PQS modal for search');
                            window.PQS.open();
                        } else if (currentUrl.includes('plugins.php') && !currentUrl.includes('page=')) {
                            // On main plugins page, open PQS modal
                            console.log('KISS SBI: On plugins page, opening PQS modal');
                            window.PQS.open();
                        } else {
                            // On other admin pages, navigate to SBI
                            console.log('KISS SBI: On other page, navigating to Smart Batch Installer');
                            navigateToSBI();
                        }
                    } else {
                        // Fallback if PQS API not available
                        console.log('KISS SBI: PQS API not available, using fallback navigation');
                        navigateToSBI();
                    }
                }
            });
        } else {
            // PQS not active, use standalone keyboard shortcut
            console.log('KISS SBI: PQS not detected, using standalone keyboard shortcut');

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

                    navigateToSBI();
                }
            });
        }

        console.log('KISS SBI: Keyboard shortcuts initialized with PQS coordination');
    }

    // Helper function to navigate to Smart Batch Installer
    function navigateToSBI() {
        const installerUrl = typeof kissSbiShortcuts !== 'undefined' && kissSbiShortcuts && kissSbiShortcuts.installerUrl
            ? kissSbiShortcuts.installerUrl
            : '/wp-admin/plugins.php?page=kiss-smart-batch-installer';

        window.location.href = installerUrl;
        console.log('KISS SBI: Navigating to Smart Batch Installer');
    }

    // Initialize keyboard shortcuts
    initKeyboardShortcuts();
    
    // Expose globally for debugging and coordination
    window.KissSbiKeyboardShortcuts = {
        init: initKeyboardShortcuts,
        navigateToSBI: navigateToSBI,
        hasPQSCoordination: function() {
            return window.pqsKeyboardHandlerActive && window.PQS;
        }
    };
});
