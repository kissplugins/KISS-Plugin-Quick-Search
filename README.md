# KISS Plugin Quick Search

A powerful yet lightweight WordPress plugin that adds intelligent search capabilities to the WordPress admin plugins page. Quickly find and filter plugins using keyboard shortcuts and smart search algorithms.

## Features

### 🚀 Performance & Caching
- **Intelligent Caching**: 60-80% faster page loads with smart localStorage caching (1-hour default)
- **Background Verification**: Non-blocking cache integrity checks ensure data accuracy
- **Configurable Cache Duration**: Set cache from 5 minutes to 24 hours in settings
- **Auto-refresh Cache**: Automatically updates when plugins change
- **Cache Management**: `Ctrl+Shift+R` to force rebuild, real-time status display

### Core Functionality
- **Customizable Keyboard Shortcuts**: Choose `Cmd/Ctrl+Shift+P` (default) or `Cmd/Ctrl+K` (VS Code style)
- **Instant Search**: Filter plugins by name or description in real-time
- **Keyboard Navigation**: Use arrow keys to navigate results, Enter to filter
- **Clean UI**: Minimal, non-intrusive modal overlay with smooth animations

### Advanced Search Features
- **Smart Ranking Algorithm**: Results are intelligently ranked by relevance
  - Exact matches get highest priority
  - Name prefix matches get very high priority
  - Whole word matches in names get high priority
  - Partial matches are ranked by position and context
- **Fuzzy Matching**: Levenshtein distance allows small typos (e.g., `wocomm` → `woocommerce`)
- **Visual Match Indicators**:
  - ⭐ Star icon for exact matches
  - Special highlighting for strong matches
  - Visual separators between match types
- **Result Limiting**: Automatically limits results for broad searches to show most relevant matches

### User Experience
- **Customizable Visual Feedback**: Selected plugins are highlighted with configurable animated border
- **Smooth Scrolling**: Auto-scroll to selected plugin with smooth animation
- **Responsive Design**: Modal adapts to different screen sizes
- **Configurable Highlights**: Customizable duration, fade time, color, and opacity
- **Loading States**: Visual feedback during search operations
- **Version Display**: Shows plugin version for the top search result
- **Enhanced Styling**: Improved visual hierarchy with better color schemes
- **Spell Check Disabled**: Search input optimized for plugin names
- **Settings Page**: Easy-to-use admin interface for customization

### Security & Performance
- **Capability Checks**: Only loads for users with plugin management permissions
- **XSS Protection**: All user input is properly sanitized and escaped
- **Input Validation**: Search queries are sanitized and length-limited
- **Efficient Loading**: Only loads on the plugins.php admin page
- **Intelligent Caching**: localStorage-based caching reduces load times by 60-80%
- **Smart Cache Invalidation**: Automatic cache updates when plugins change
- **Debug Mode Support**: Enhanced debugging features when WP_DEBUG is enabled

## Installation

1. Upload the plugin folder to `/wp-content/plugins/`
2. Activate the plugin through the 'Plugins' menu in WordPress
3. (Optional) Go to **Settings → Plugin Quick Search** to customize keyboard shortcuts, caching, and highlight behavior
4. Navigate to the Plugins page and press your configured keyboard shortcut to start searching

## Usage

### Basic Search
1. Go to **Plugins** → **Installed Plugins** in your WordPress admin
2. Press your configured keyboard shortcut (default: `Cmd/Ctrl+Shift+P`) to open the search modal
3. Type to search plugin names or descriptions
4. Use `↑↓` arrow keys to navigate results
5. Press `Enter` to filter the plugins list and highlight the selected plugin
6. Press `Shift+Enter` to go directly to the selected plugin's settings page
7. Press `Esc` to close the modal and return to full plugin list

### Cache Management
- **Auto-caching**: Plugin data is automatically cached for faster subsequent loads
- **Force rebuild**: Press `Ctrl+Shift+R` to manually rebuild the cache
- **Cache status**: View cache age and status in the search modal
- **Settings control**: Configure cache duration and auto-refresh behavior in settings

### Search Tips
- **Exact matches** are marked with ⭐ and appear first
- **Prefix matches** (plugins starting with your search) appear near the top
- Use **short, specific terms** for best results
- The search covers both plugin names and descriptions
- Results are automatically limited for very broad searches

### Keyboard Shortcuts
- `Cmd+Shift+P` / `Ctrl+Shift+P`: Toggle search modal
- `↑` / `↓`: Navigate through search results
- `Enter`: Select current result and filter plugins
- `Shift+Enter`: Navigate directly to selected plugin's settings/configuration page
- `Esc`: Close modal and show all plugins
- Click outside modal: Close modal

### Quick Settings Navigation
The plugin can automatically detect and navigate to plugin settings pages:
- Press `Shift+Enter` on any selected plugin to go directly to its settings
- Supports plugins with "Settings", "Configure", or "Configuration" links
- Shows helpful notifications for plugins without settings pages
- Works seamlessly with the search and navigation system

## Settings

The plugin includes a settings page at **Settings → Plugin Quick Search** where you can customize:

- **Highlight Duration**: How long the highlight box stays visible (1-30 seconds)
- **Fade Duration**: How long the fade-out animation takes (0.5-5 seconds)
- **Highlight Color**: Color of the highlight box border (any hex color)
- **Highlight Opacity**: Transparency of the highlight box (0.1-1.0)

### Default Settings
- Highlight Duration: 8 seconds (increased from 5 seconds)
- Fade Duration: 2 seconds (increased from 1 second)
- Highlight Color: Red (#ff0000)
- Highlight Opacity: 1.0 (fully opaque)

## Technical Details

### Search Algorithm
The plugin uses a sophisticated relevance scoring system:
- **Exact matches**: 1000 points (highest priority)
- **Prefix matches**: 500 points
- **First word matches**: 400 points
- **Whole word matches**: 300 points
- **Partial matches**: 100 points + position bonus
- **Description matches**: 10 points
- **Penalties**: Applied for overly long plugin names
- **Bonuses**: Given to simpler, likely core plugins

### Performance Optimizations
- **Search Debouncing**: 150ms delay prevents excessive searches while typing
- **Search Result Caching**: Previously searched terms are cached for instant results
- **Pre-cached Lowercase Strings**: Plugin names and descriptions are converted to lowercase once during initialization
- **Early Exit Optimizations**: Exact matches return immediately without further processing
- **Limited Scoring**: Only processes first 100 matching plugins for complex searches
- **Batch DOM Updates**: Results are built in memory and updated in a single operation
- **Smart Result Limiting**: Maximum 20 items displayed, with intelligent truncation
- **Efficient DOM manipulation**: Optimized jQuery operations and minimal DOM queries
- **Responsive highlight box positioning**: Auto-adjusts on scroll/resize events
- **Smooth animations**: CSS transitions for professional user experience

## Developer API

### Cache System Integration

Other plugins can leverage the intelligent caching system for improved performance:

#### Cache Location & Structure
```javascript
// Cache is stored in browser localStorage with these keys:
localStorage.getItem('pqs_plugin_cache')     // Plugin data array
localStorage.getItem('pqs_cache_meta')       // Cache metadata (timestamp, version, etc.)
```

#### Global Cache API
```javascript
// Force rebuild cache
window.pqsRebuildCache()

// Get current cache status ('fresh', 'stale', 'error', 'loading')
window.pqsCacheStatus()

// Clear cache completely
window.pqsClearCache()
```

#### Cache Data Structure
```javascript
// Each cached plugin object contains:
{
    name: "Plugin Name",
    nameLower: "plugin name",           // Pre-computed for performance
    description: "Plugin description",
    descriptionLower: "plugin description", // Pre-computed for performance
    version: "1.0.0",
    isActive: true,
    settingsUrl: "admin.php?page=plugin-settings",
    rowIndex: 5,                        // DOM position for re-association
    wordCount: 2,                       // Pre-computed for scoring
    hasForIn: false                     // Pre-computed for scoring
}
```

#### Cache Metadata Structure
```javascript
// Cache metadata for validation:
{
    timestamp: 1692454800000,           // When cache was created
    version: "1.0",                     // Cache format version
    pluginCount: 25,                    // Number of plugins cached
    scanTime: 45.2                      // Time taken to scan (ms)
}
```

#### Integration Example
```javascript
// Example: Another plugin using the same caching pattern
function myPluginCacheSystem() {
    const CACHE_KEY = 'my_plugin_cache';
    const CACHE_META_KEY = 'my_plugin_cache_meta';
    const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

    // Check if PQS cache is available and fresh
    const pqsStatus = window.pqsCacheStatus();
    if (pqsStatus === 'fresh') {
        // Leverage existing fresh plugin data
        const pqsCache = JSON.parse(localStorage.getItem('pqs_plugin_cache') || '[]');
        // Use pqsCache for your plugin's needs
    }
}
```

#### Cache Events
The plugin fires custom events that other plugins can listen to:
```javascript
// Listen for cache rebuild events
document.addEventListener('pqs-cache-rebuilt', function(event) {
    console.log('PQS cache was rebuilt:', event.detail);
});

// Listen for cache status changes
document.addEventListener('pqs-cache-status-changed', function(event) {
    console.log('Cache status changed to:', event.detail.status);
});
```

## Requirements

- WordPress 4.0+
- jQuery (included with WordPress)
- Admin access with plugin management capabilities (`activate_plugins` capability)
- Modern browser with JavaScript enabled

## Browser Support

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## Troubleshooting

**Search modal doesn't open:**
- Ensure you're on the Plugins page (`/wp-admin/plugins.php`)
- Check that you have plugin management permissions
- Verify JavaScript is enabled in your browser

**Cache issues:**
- Press `Ctrl+Shift+R` to force rebuild the cache
- Check browser console for cache-related error messages
- Clear browser localStorage if persistent issues occur

**Keyboard shortcut conflicts:**
- The plugin uses `Cmd+Shift+P` / `Ctrl+Shift+P` which may conflict with browser developer tools
- Close developer tools or use a different browser if needed

**Highlight box positioning issues:**
- The highlight box automatically adjusts on scroll/resize
- If issues persist, try refreshing the page

## License

GPL v2 or later
No warranty; use at your own risk.

## Version

1.0.7

## Author

KISS Plugins - https://kissplugins.com/
