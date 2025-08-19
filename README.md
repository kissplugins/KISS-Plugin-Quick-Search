# KISS Plugin Quick Search

A powerful yet lightweight WordPress plugin that adds intelligent search capabilities to the WordPress admin plugins page. Quickly find and filter plugins using keyboard shortcuts and smart search algorithms.

## Features

### Core Functionality
- **Keyboard Shortcut**: Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux) to open the search modal
- **Instant Search**: Filter plugins by name or description in real-time
- **Keyboard Navigation**: Use arrow keys to navigate results, Enter to filter
- **Clean UI**: Minimal, non-intrusive modal overlay with smooth animations

### Advanced Search Features
- **Smart Ranking Algorithm**: Results are intelligently ranked by relevance
  - Exact matches get highest priority
  - Name prefix matches get very high priority
  - Whole word matches get high priority
  - Partial matches are ranked by position and context
- **Word-Based Matching**: Revolutionary search improvement for non-sequential word matching
  - "WP SMTP" now matches "WP Mail SMTP Pro" and similar patterns
  - Intelligent word scoring system with exact, prefix, and partial word matching
- **Fuzzy Matching**: Levenshtein distance allows small typos (e.g., `wocomm` → `woocommerce`)
- **Visual Match Indicators**:
  - ⭐ Star icon for exact matches
  - Special highlighting for strong matches
  - Visual separators between match types
- **Result Limiting**: Automatically limits results for broad searches to show most relevant matches

### Plugin Management Features
- **Activation Status Display**: See at a glance which plugins are "Active" or "Inactive"
  - Color-coded status badges: green for active, red for inactive
  - Status indicators adapt to selected/highlighted states
- **Quick Settings Navigation**: Press `Shift+Enter` on any selected plugin to go directly to its settings
  - Supports plugins with "Settings", "Configure", or "Configuration" links
  - Shows helpful notifications for plugins without settings pages
  - Works seamlessly with the search and navigation system

### Performance & Security
- **High Performance**: Optimized for large plugin lists (500+ plugins)
  - Phase 1 & 2 optimizations: ~200-500ms lag reduced to ~20-50ms lag
  - Incremental filtering and tiered search strategy
  - Lazy fuzzy matching and early result limiting
  - Search result caching for instant repeated searches
- **Security & Performance**
  - **Capability Checks**: Only loads for users with plugin management permissions
  - **XSS Protection**: All user input is properly sanitized and escaped
  - **Input Validation**: Search queries are sanitized and length-limited
  - **Efficient Loading**: Only loads on the plugins.php admin page
  - **Smart Cache Busting**: Automatic cache invalidation for development and production
  - **Debug Mode Support**: Enhanced debugging features when WP_DEBUG is enabled

## Installation

1. Upload the plugin folder to `/wp-content/plugins/`
2. Activate the plugin through the 'Plugins' menu in WordPress
3. (Optional) Go to **Settings → Plugin Quick Search** to customize highlight behavior
4. Navigate to the Plugins page and press `Cmd+Shift+P` to start searching

## Usage

### Basic Search
1. Go to **Plugins** → **Installed Plugins** in your WordPress admin
2. Press `Cmd+Shift+P` (or `Ctrl+Shift+P`) to open the search modal
3. Type to search plugin names or descriptions
4. Use `↑↓` arrow keys to navigate results
5. Press `Enter` to filter the plugins list and highlight the selected plugin
6. **NEW**: Press `Shift+Enter` to go directly to the selected plugin's settings page
7. Press `Esc` to close the modal and return to full plugin list

### Search Tips
- **Exact matches** are marked with ⭐ and appear first
- **Prefix matches** (plugins starting with your search) appear near the top
- **Word-based matching** finds plugins even when words aren't sequential (e.g., "WP SMTP" finds "WP Mail SMTP Pro")
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
- **Highlight Color**: Custom color for the highlight box border
- **Highlight Opacity**: Transparency level of the highlight box (10-100%)

### Search Algorithm

The plugin uses a sophisticated relevance scoring system:
- **Exact matches**: 1000 points (highest priority)
- **Prefix matches**: 500 points
- **First word matches**: 400 points
- **Whole word matches**: 300 points
- **Partial matches**: 100 points + position bonus
- **Word-based matches**: 150+ points with intelligent word scoring
- **Description matches**: 10 points
- **Penalties**: Applied for overly long plugin names
- **Bonuses**: Given to simpler, likely core plugins

## Technical Details

### Performance Optimizations
- **Phase 1**: Increased debounce delay, lazy fuzzy matching, early result limiting
- **Phase 2**: Incremental filtering, tiered search strategy
- **Word-Based Matching**: Pre-calculated word arrays for optimal performance
- **Caching**: Intelligent search result caching
- **DOM Optimization**: Batch updates and efficient rendering

### Browser Compatibility
- Modern browsers with ES6 support
- WordPress 4.0+
- jQuery (included with WordPress)

### Security Features
- Capability checks (`activate_plugins`)
- Input sanitization and validation
- XSS protection with HTML escaping
- Nonce verification for AJAX requests

## Development

### Debug Mode
When `WP_DEBUG` is enabled:
- Enhanced console logging
- File modification time used for cache busting
- Performance timing information
- Settings debugging output

### Customization
The plugin is designed to be easily customizable:
- Centralized settings system
- Modular JavaScript architecture
- CSS custom properties for theming
- Extensible scoring algorithm

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for detailed version history.

## License

GPL v2 or later

## Support

For support, feature requests, or bug reports, please visit the plugin's support forum or repository.

---

**KISS Plugin Quick Search** - Keep It Simple, Search!
