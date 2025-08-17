# KISS Plugin Quick Search

A lightweight WordPress plugin that adds a keyboard shortcut to quickly search and filter plugins on the admin plugins page.

## Features

- **Keyboard Shortcut**: Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux) to open the search modal
- **Instant Search**: Filter plugins by name or description in real-time
- **Keyboard Navigation**: Use arrow keys to navigate results, Enter to filter
- **Clean UI**: Minimal, non-intrusive modal overlay
- **Security**: Proper capability checks and XSS protection

## Installation

1. Upload the plugin folder to `/wp-content/plugins/`
2. Activate the plugin through the 'Plugins' menu in WordPress
3. Navigate to the Plugins page and press `Cmd+Shift+P` to start searching

## Usage

1. Go to **Plugins** → **Installed Plugins** in your WordPress admin
2. Press `Cmd+Shift+P` (or `Ctrl+Shift+P`) to open the search modal
3. Type to search plugin names or descriptions
4. Use `↑↓` arrow keys to navigate results
5. Press `Enter` to filter the plugins list
6. Press `Esc` to close the modal

## Requirements

- WordPress 4.0+
- jQuery (included with WordPress)
- Admin access with plugin management capabilities

## License

GPL v2 or later
No warranty; use at your own risk.

## Version

1.0.1
