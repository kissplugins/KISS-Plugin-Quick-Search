# Changelog

All notable changes to the KISS Plugin Quick Search plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.3] - 2026-01-28

### Fixed
- **CRITICAL**: Added timeout and retry logic to AJAX cache status requests
  - Implemented 10-second timeout for cache status polling (KISS-quick-search.php:991-1025)
  - Added exponential backoff retry (3 attempts: 1s, 2s, 4s delays)
  - Comprehensive error handling for timeout vs other errors
  - User-friendly error messages in cache status display
  - Resolves AGENTS.md compliance: Timeouts & Resource Limits

- **MEDIUM**: Fixed inconsistent storage API usage
  - Replaced direct `localStorage` calls with `storage` constant (sessionStorage) in plugin-quick-search.js
  - Fixed line 699-700: `rebuildCache()` now uses `storage.removeItem()` with legacy cleanup
  - Fixed line 721: `getCacheStatusText()` now reads from sessionStorage instead of localStorage
  - Maintains Single Source of Truth for storage mechanism
  - Resolves AGENTS.md compliance: State Hygiene & Client-Side Security

### Technical Details
- All fixes align with AGENTS.md v2.1.0 WordPress development guidelines
- AJAX timeout pattern follows best practices with retry and backoff
- Storage API consistency maintains sessionStorage security benefits (tab-scoped, auto-clears)
- No JSON validation needed (no `json_decode()` operations found in PHP code)

## [1.2.2] - 2025-12-31

### Fixed
- **CRITICAL**: Fixed memory exhaustion error on non-plugins pages
  - Added null check before calling `isCacheValid()` on non-plugins pages
  - Added guard to prevent `clearCache()` from being called more than once per second
  - Added guard to prevent duplicate event listener registration in `setupCacheCleanup()`
  - Fixed potential infinite loop when cache validation fails on non-plugins pages
  - Improved cache validation logic to skip plugin count check on non-plugins pages

### Technical Details
- Issue: `isCacheValid()` was checking DOM plugin count on non-plugins pages, causing false invalidation
- Solution: Added `skipCountCheck` parameter to `isCacheValid()` function
- Added rate limiting to `clearCache()` to prevent excessive calls
- Added `cleanupListenersRegistered` flag to prevent duplicate listener registration

## [1.2.1] - 2025-12-31

### Added
- **Global Admin Access**: PQS now loads on ALL admin pages (not just plugins.php)
  - Keyboard shortcut (Cmd+Shift+P / Ctrl+Shift+P) works everywhere in wp-admin
  - Lightweight cache-only mode on non-plugins pages
  - Helpful message shown if cache not available ("Visit plugins page first")
  - Improves UX by allowing plugin search from anywhere in admin

### Changed
- Removed page restriction in `enqueue_scripts()` - now loads globally
- JavaScript initialization now handles two modes:
  - **Plugins page**: Full initialization (scan + cache + UI)
  - **Other admin pages**: Lightweight mode (cache-only, no scan)
- Modal shows helpful message when cache unavailable on non-plugins pages
- Updated SBI integration to check sessionStorage first, fallback to localStorage

### Fixed
- SBI integration now compatible with sessionStorage migration (v1.2.0)
- Cache status 'unavailable' now properly handled in SBI integration

### Technical Details
- Cache-only mode uses existing sessionStorage cache
- No performance impact on non-plugins pages (no DOM scanning)
- Falls back gracefully if cache not available
- SBI integration backward compatible with old localStorage cache

## [1.2.0] - 2025-12-31

### Security - CRITICAL FIXES
- **CRITICAL SECURITY FIX**: Migrated from localStorage to sessionStorage
  - Prevents front-end scripts from accessing plugin inventory
  - sessionStorage is scoped to admin tab only, not accessible from public site
  - Cache automatically cleared when tab closes
  - Resolves AUDIT-2025-12-31 Issue #1 (Critical)

- **HIGH SECURITY FIX**: Added automatic cache cleanup on logout
  - Cache cleared on WordPress logout (admin bar and logout links)
  - Cache cleared on page unload/tab close
  - Prevents plugin data from persisting after admin session ends
  - Resolves AUDIT-2025-12-31 Issue #2 (High)

- **Data Scrubbing**: Removed sensitive information from cache
  - Plugin versions removed (prevents fingerprinting)
  - Settings URLs removed (prevents internal path disclosure)
  - Folder names removed (prevents directory structure disclosure)
  - Only essential search data (names, descriptions) cached

- **Access Control**: Added admin-only cache access checks
  - Cache reads/writes only allowed in WordPress admin context
  - Prevents cache access from front-end pages
  - Added `isAdminContext()` security check

- **TTL Enforcement**: Stale cache entries now deleted immediately
  - Expired cache deleted on read (not just ignored)
  - Cache integrity checks trigger immediate cleanup
  - Prevents stale data from persisting indefinitely

### Changed
- **BREAKING**: Cache version bumped to 1.2 (auto-migrates old cache)
- Migrated from `localStorage` to `sessionStorage` for all cache operations
- Added automatic migration that clears old localStorage cache on first load
- Cache now cleared on logout, tab close, and page unload
- Updated all cache diagnostic functions to use sessionStorage
- Cache info now shows storage type and security notes

### Technical Details
- Storage: `window.sessionStorage` (was `window.localStorage`)
- Cache scope: Single browser tab (was entire domain)
- Lifetime: Until tab closes (was indefinite)
- Security: Admin-only, scrubbed data, auto-cleanup
- Migration: Automatic one-time cleanup of old localStorage cache

## [1.1.9] - 2025-12-31

### Performance
- **HIGH PERFORMANCE FIX**: Optimized cache status page polling to reduce server load
  - Implemented Page Visibility API to pause polling when tab is hidden
  - Increased polling interval from 30s to 60s (50% reduction in requests)
  - Added server-side transient caching (5 minutes) for plugin count
  - Prevents expensive `get_plugins()` filesystem scans on every poll
  - Auto-invalidates server cache when plugins are activated/deactivated/updated
  - Resolves AUDIT-2025-12-31 Issue #3

### Changed
- Cache status page now intelligently pauses when browser tab is inactive
- Server-side plugin count cached for 5 minutes to avoid repeated filesystem scans
- Polling resumes and refreshes immediately when tab becomes visible
- Added console logging for visibility state changes (debugging)

### Technical Details
- Uses `document.visibilitychange` event to detect tab visibility
- WordPress transient `pqs_server_plugin_count` caches plugin count
- Cache invalidation hooks: `activated_plugin`, `deactivated_plugin`, `deleted_plugin`, `upgrader_process_complete`
- Estimated server load reduction: 75-90% on idle tabs

## [1.1.8] - 2025-12-31

### Security
- **MEDIUM SECURITY FIX**: Added regex escaping to prevent injection attacks
  - Added `escapeRegExp()` helper function to sanitize user input before RegExp construction
  - Prevents SyntaxError from special characters (e.g., `[`, `(`, `\`)
  - Prevents ReDoS (Regular Expression Denial of Service) attacks from malicious patterns
  - Added try-catch fallback to gracefully handle any regex failures
  - Resolves AUDIT-2025-12-31 Issue #5

### Changed
- Improved search scoring logic with safer pattern matching
  - Word boundary detection now uses escaped user input
  - Fallback to simple string matching if regex construction fails
  - More robust error handling in relevance scoring

## [1.1.7] - 2025-12-31

### Fixed
- **CRITICAL BUG**: Fixed ReferenceError in highlight box animation
  - Changed `highlightSettings` to `pluginSettings` on lines 1501-1502
  - Bug was causing highlight box pulse animation to fail with undefined variable error
  - Highlight box now properly uses user-configured color and opacity settings
  - Resolves AUDIT-2025-12-31 Issue #4

## [1.1.6] - 2025-09-30

### ADDED REMOTE UPDATE FEATURE
 - **IMPROVED**: Plugin can update in one click and show the latest update. 

## [1.1.5] - 2025-08-30

### Fixed
- Prevent duplicate folder labels: inject only on main plugin rows
  - Skip update notice rows (`.plugin-update-tr`) and inline edit rows
  - Require presence of the title cell before injecting; removed fallback that appended to first cell


## [1.1.4] - 2025-08-30

### Added
- On-screen PQS Debug panel toggle on Plugins page
  - Shows cache status, total plugins, row count, injected vs missing labels
  - Buttons to Inject Labels, Refresh stats, Rebuild Cache
  - Quick Focus links to scroll to rows missing labels
- Added a delayed, second injection pass for folder labels to catch late DOM mutations
- More robust label placement targeting title cell first with fallbacks

### Changed
- Bumped JS cache schema to 1.1; will rebuild cache if previously cached


### Added
- Display the plugin folder name underneath each plugin's action links on the Plugins page (e.g., "/akismet/")
  - Non-invasive DOM injection; no core WP hooks altered
  - Reads folder from row data (data-plugin, checkbox value, or slug) and avoids duplicates
  - Lightweight CSS matches WP admin aesthetics

## [1.1.2] - 2025-08-24

### Added
- **Keyboard Shortcut Coordination System**: Implemented coordination system to prevent conflicts with other plugins
  - Added `window.pqsKeyboardHandlerActive` marker to indicate PQS is handling keyboard shortcuts
  - Exposed `window.PQS` public API for other plugins to integrate with PQS modal
  - Early initialization of coordination markers to prevent race conditions
  - Smart routing system for unified keyboard shortcut experience

### Enhanced
- **Developer Ecosystem Support**: Created comprehensive integration framework for third-party plugins
  - Added DEVELOPER-KEYCOMBO.md with complete integration guide
  - Provided coordination system examples and best practices
  - Enhanced testing procedures and integration checklist
  - Enabled ecosystem expansion with proper conflict prevention

- **Smart Batch Installer Integration**: Coordinated keyboard shortcut behavior with SBI plugin
  - Unified Cmd/Ctrl+Shift+P experience across both plugins
  - Context-aware routing based on current page
  - Graceful fallback when coordination system not available

### Technical Improvements
- **Public API Exposure**: Added standardized interface for external plugin integration
  - `window.PQS.open()` - Opens PQS modal
  - `window.PQS.close()` - Closes PQS modal
  - `window.PQS.isOpen()` - Returns modal state
  - `window.PQS.getStatus()` - Returns comprehensive PQS status

## [1.1.1] - 2025-08-20

### Enhanced
- **Improved Cache Status Page Layout**: Moved Cache API Information section into the main cache overview area
  - Eliminated large empty space in cache status dashboard
  - Better integration of API documentation with cache status information
  - More cohesive and space-efficient layout for the cache management interface

## [1.1.0] - 2025-08-19

### 🚀 Major Performance Update - Intelligent Caching System

#### Added
- **Intelligent localStorage Caching**: Plugin data is now cached for 1 hour, reducing page load times by 60-80%
- **Smart Cache Validation**: Automatic cache integrity checks using timestamp, version, and plugin count validation
- **Background Verification**: Non-blocking cache verification to ensure data accuracy without affecting UI performance
- **Configurable Cache Duration**: Set cache duration from 5 minutes to 24 hours in settings
- **Cache Management Controls**:
  - `Ctrl+Shift+R` keyboard shortcut to force cache rebuild
  - Auto-refresh cache option for automatic updates
  - Cache status display in search modal
- **Graceful Fallback**: Automatically falls back to fresh scanning if cache is invalid or corrupted
- **Performance Monitoring**: Detailed logging of cache status, scan times, and performance metrics
- **Added API Documentation**: CACHE-API.md file added

#### Enhanced
- **Customizable Keyboard Shortcuts**: Choose between `Cmd/Ctrl+Shift+P` (default) or `Cmd/Ctrl+K` (VS Code style)
- **iOS-Style Toggle Switch**: Beautiful toggle interface for keyboard shortcut selection
- **Enhanced Settings Page**: New cache management section with real-time status and controls
- **Improved Modal UI**:
  - Dynamic plugin count in search placeholder
  - Cache status indicator
  - Additional keyboard shortcut help

#### Technical Improvements
- **Optimized DOM Scanning**: Reduced from every page load to once per hour (or cache duration)
- **Smart Data Structure**: Cacheable plugin objects without DOM references for localStorage compatibility
- **Cache Integrity Verification**: Spot-checks first few plugins to ensure cache accuracy
- **Version-Aware Caching**: Automatic cache invalidation on plugin updates
- **Error Recovery**: Comprehensive error handling with automatic fallback to fresh data

#### Developer Features
- **Global Cache API**: Exposed `window.pqsRebuildCache()`, `window.pqsCacheStatus()`, and `window.pqsClearCache()` for external access
- **Cache Location**: Data stored in browser localStorage with keys `pqs_plugin_cache` and `pqs_cache_meta`
- **Extensible Architecture**: Other plugins can leverage the same caching pattern for performance improvements

## [1.0.12] - 2025-08-19

### Improved
- **Enhanced Settings Detection**: Quick Settings Navigation now supports broader plugin compatibility
  - Added detection for "Configure" and "Configuration" links in addition to "Settings"
  - Improved plugin compatibility for plugins that use different terminology
  - Uses partial matching for better detection (e.g., "configur" matches "configure", "configuration")

## [1.0.11] - 2025-08-19

### Added
- **Quick Settings Navigation**: Press `Shift+Enter` on selected plugin to navigate directly to its settings page
  - Automatically detects plugins with settings pages during initialization
  - Graceful fallback with notification for plugins without settings
  - Added `Shift+Enter` instruction to help section
  - Smooth notification animations for user feedback

## [1.0.10] - 2025-08-19

### Added
- **Plugin Activation Status**: Search results now display whether each plugin is "Active" or "Inactive"
  - Efficient upfront status collection during initialization (no performance impact)
  - Color-coded status badges: green for active, red for inactive
  - Status indicators adapt to selected/highlighted states

## [1.0.9] - 2025-08-19

### Improved
- **Performance Optimization (Phase 2)**: Advanced algorithmic improvements for even better performance
  - Implemented incremental filtering - when query gets longer, filters from previous results instead of starting fresh
  - Added tiered search strategy: exact matches → prefix matches → contains matches → fuzzy matching (only if needed)
  - Expected performance improvement: ~50-100ms lag reduced to ~20-50ms lag

## [1.0.8] - 2025-08-19

### Improved
- **Performance Optimization (Phase 1)**: Significant performance improvements for large plugin lists
  - Increased debounce delay to 250ms for better responsiveness
  - Implemented lazy fuzzy matching - Levenshtein distance only runs when simple matches yield <5 results
  - Early result limiting - stops processing after finding 20 good matches
  - Expected performance improvement: ~200-500ms lag reduced to ~50-100ms lag

## [1.0.7] - 2025-08-18

### Added
- **Fuzzy Search**: Levenshtein distance matching allows minor typos (e.g., "wocomm" → "woocommerce")
- **WooCommerce Bias**: Main WooCommerce plugin prioritized for similar queries

## [1.0.6] - 2024-08-17

### Added
- **Customizable Highlight Settings**: Full user control over highlight box behavior
  - **Settings Page**: New admin page at Settings → Plugin Quick Search
  - **Highlight Duration**: Configurable duration (1-30 seconds, default: 8 seconds)
  - **Fade Duration**: Configurable fade-out time (0.5-5 seconds, default: 2 seconds)
  - **Highlight Color**: Custom color picker for border color (default: red)
  - **Highlight Opacity**: Adjustable transparency (0.1-1.0, default: 1.0)

- **Enhanced User Experience**: Addressed user feedback about highlight timing
  - **Longer Default Duration**: Increased from 5 to 8 seconds for better visibility
  - **Smoother Fade**: Increased fade duration from 1 to 2 seconds
  - **Dynamic Color Support**: Highlight box and pulse animation adapt to chosen color
  - **Real-time Settings**: Changes apply immediately without page refresh

- **Professional Settings Interface**: User-friendly configuration page
  - **Clear Instructions**: Step-by-step usage guide
  - **Helpful Tips**: Best practices for each setting
  - **Input Validation**: Proper bounds checking and sanitization
  - **Visual Feedback**: Color picker and range inputs for easy adjustment

### Enhanced
- **Settings Architecture**: Robust settings management system
  - **Default Fallbacks**: Graceful handling of missing or invalid settings
  - **Secure Storage**: WordPress options API with proper sanitization
  - **PHP-to-JavaScript Bridge**: Seamless settings transfer via wp_localize_script
  - **Development Support**: Settings logged to console in debug mode

- **Dynamic Styling**: Highlight box adapts to user preferences
  - **Color Conversion**: Automatic hex-to-RGB conversion for box-shadow effects
  - **Opacity Integration**: Consistent opacity across border and shadow
  - **Animation Sync**: Pulse animation matches selected color and opacity

- **Code Quality**: Improved maintainability and extensibility
  - **Centralized Settings**: Single source of truth for all highlight preferences
  - **Modular Design**: Easy to add new customization options
  - **Better Documentation**: Comprehensive inline comments and help text

### Fixed
- **Highlight Visibility**: Resolved issue with highlight box disappearing too quickly
- **User Control**: Users can now fine-tune highlight behavior to their preferences
- **Color Consistency**: Pulse animation now matches selected highlight color
- **Settings Persistence**: User preferences saved and restored correctly

## [1.0.5] - 2024-08-17

### Added
- **Smart Cache Busting System**: Intelligent asset versioning for optimal caching
  - Uses plugin version for production environments
  - Uses file modification time for development (when WP_DEBUG is enabled)
  - Ensures users always get the latest JavaScript updates
  - Prevents browser caching issues during development

- **Enhanced Debug Support**: Improved debugging capabilities for developers
  - Debug flag passed to JavaScript for conditional logging
  - Version information available in JavaScript context
  - Better development workflow with automatic cache invalidation

- **Loading State Styling**: Added CSS for loading states
  - Visual feedback during search operations
  - Improved user experience with opacity and pointer-events management
  - Consistent styling across all loading states

### Enhanced
- **Version Management**: Centralized version constant for consistency
  - Single source of truth for plugin version
  - Better maintenance and release management
  - Consistent versioning across PHP and JavaScript

- **Development Workflow**: Optimized for both development and production
  - Automatic file modification time detection in debug mode
  - Production-ready caching with version-based cache busting
  - Seamless transition between development and production environments

- **Code Organization**: Improved PHP class structure
  - Better separation of concerns
  - More maintainable codebase
  - Enhanced readability and documentation

### Fixed
- **Cache Management**: Resolved potential caching issues in development
- **Asset Loading**: Improved reliability of JavaScript asset loading
- **Version Consistency**: Ensured version numbers are properly synchronized

## [1.0.4] - 2024-08-17

### Added
- **Search Result Caching**: Implemented intelligent caching system for previously searched terms
  - Instant results for repeated searches
  - Cache cleared when modal opens to ensure fresh data
  - Significant performance improvement for common search patterns

- **Search Debouncing**: Added 150ms debounce delay to prevent excessive search operations
  - Reduces CPU usage while typing
  - Improves responsiveness on slower devices
  - Includes visual loading state during debounced searches

- **Version Display**: Plugin version now shown for the top search result
  - Extracted from plugin metadata automatically
  - Styled with subtle badge design
  - Helps identify plugin versions quickly

- **Enhanced Performance Monitoring**: Added initialization timing and version logging
  - Console logs show plugin load time
  - Version information displayed when available
  - Better debugging and performance tracking

### Enhanced
- **Major Performance Optimizations**:
  - **Pre-cached Lowercase Strings**: Plugin names and descriptions converted to lowercase once during initialization (eliminates repeated `toLowerCase()` calls)
  - **Early Exit Scoring**: Exact matches return immediately without further processing
  - **Limited Scoring Operations**: Only processes first 100 matching plugins for complex searches
  - **Batch DOM Updates**: Results built in memory and updated in single operation
  - **Smart Result Limiting**: Maximum 20 items displayed with intelligent truncation
  - **Optimized Filtering Loop**: Uses `for` loop with early termination instead of `filter().map()`

- **Pre-calculated Plugin Properties**: Added during initialization for faster scoring
  - Word count pre-calculated for penalty calculations
  - "for/in" detection pre-calculated for bonus scoring
  - Version extraction and caching

- **Improved User Interface**:
  - Enhanced color scheme for exact matches (blue theme)
  - Better visual hierarchy with improved contrast
  - Loading state indicator during search operations
  - Disabled spell check on search input for better UX
  - Version badges with proper styling for selected states

- **Code Quality Improvements**:
  - More efficient DOM manipulation patterns
  - Reduced redundant operations
  - Better memory management
  - Cleaner separation of concerns

### Fixed
- **Performance Issues**: Resolved potential lag with large plugin lists (500+ plugins)
- **Search Responsiveness**: Eliminated stuttering during rapid typing
- **Memory Efficiency**: Reduced object creation during search operations
- **Timer Management**: Proper cleanup of debounce timers on modal close

### Performance Impact
- **Small Sites (1-50 plugins)**: Virtually no change (already excellent)
- **Medium Sites (50-200 plugins)**: 40-60% faster search operations
- **Large Sites (200-500 plugins)**: 60-80% faster search operations
- **Very Large Sites (500+ plugins)**: 70-90% faster search operations

## [1.0.3] - 2024-08-17

### Added
- **Smart Search Ranking Algorithm**: Implemented sophisticated relevance scoring system
  - Exact matches get highest priority (1000 points)
  - Prefix matches get very high priority (500 points)
  - First word matches get high priority (400 points)
  - Whole word matches get medium priority (300 points)
  - Partial matches ranked by position (100+ points)
  - Description matches get low priority (10 points)
  - Penalties for overly long plugin names
  - Bonuses for simpler, likely core plugins

- **Visual Match Indicators**: Enhanced UI to show match quality
  - ⭐ Star icon for exact matches
  - Special background highlighting for exact matches (blue theme)
  - Lighter highlighting for strong prefix matches
  - Visual separators between match types ("Other matches" divider)

- **Advanced Result Management**:
  - Automatic result limiting (15 items for searches under 5 characters)
  - Smart result grouping with visual separators
  - Enhanced result rendering with match type classification

- **Visual Feedback System**:
  - Animated red highlight box around selected plugins after filtering
  - Smooth scrolling to selected plugin with 300ms animation
  - Auto-fade highlight boxes after 5 seconds
  - Pulsing animation effect on highlight boxes
  - Responsive highlight box positioning on window resize/scroll

- **Enhanced User Experience**:
  - Click-to-select functionality on search results
  - Improved keyboard navigation with proper scrolling
  - Better modal positioning and responsive design
  - Smooth CSS animations for modal appearance

### Enhanced
- **Security Improvements**:
  - Enhanced XSS protection with comprehensive HTML escaping
  - Input sanitization with length limits (100 characters)
  - Removal of potentially dangerous characters from search input

- **Performance Optimizations**:
  - More efficient DOM manipulation
  - Optimized search algorithm with early termination
  - Better memory management for large plugin lists
  - Reduced redundant DOM queries

- **Code Quality**:
  - Comprehensive error handling
  - Better separation of concerns
  - Improved code documentation
  - More robust event handling

### Fixed
- Improved modal overlay click-to-close functionality
- Better handling of edge cases in search results
- Enhanced keyboard navigation edge case handling
- More reliable highlight box positioning

## [1.0.2] - Previous Release

### Added
- Basic search functionality
- Keyboard shortcut support
- Modal overlay interface
- Basic result filtering

### Fixed
- Initial bug fixes and stability improvements

## [1.0.1] - Previous Release

### Added
- Core plugin functionality
- Basic search modal
- Keyboard navigation
- Plugin filtering capabilities

## [1.0.0] - Initial Release

### Added
- Initial plugin release
- Basic search functionality
- WordPress admin integration
- Security capability checks
