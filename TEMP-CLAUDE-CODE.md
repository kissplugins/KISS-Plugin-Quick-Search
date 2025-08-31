<?php
/**
 * WordPress Plugin Folder Names Display
 * Add this code to your theme's functions.php file or create a custom plugin
 */

// Hook into the plugin action links to add folder name display
add_filter('plugin_action_links', 'display_plugin_folder_name', 10, 2);
add_filter('plugin_row_meta', 'add_folder_name_to_meta', 10, 2);

/**
 * Extract folder name from plugin file path
 */
function get_plugin_folder_name($plugin_file) {
    // Split the plugin file path by directory separator
    $parts = explode('/', $plugin_file);
    
    // If it's a single-file plugin (no folder), return the filename without extension
    if (count($parts) == 1) {
        return pathinfo($plugin_file, PATHINFO_FILENAME);
    }
    
    // Return the folder name (first part of the path)
    return $parts[0];
}

/**
 * Add folder name to plugin action links area
 */
function display_plugin_folder_name($actions, $plugin_file) {
    $folder_name = get_plugin_folder_name($plugin_file);
    
    // Add folder name as a non-clickable item in the actions area
    $actions['folder_name'] = '<span style="color: #666; font-style: italic;">Folder: <strong>' . esc_html($folder_name) . '</strong></span>';
    
    return $actions;
}

/**
 * Alternative: Add folder name to the plugin meta row (appears on the right side)
 */
function add_folder_name_to_meta($plugin_meta, $plugin_file) {
    $folder_name = get_plugin_folder_name($plugin_file);
    
    // Add folder name to the meta information
    $plugin_meta[] = 'Folder: <code>' . esc_html($folder_name) . '</code>';
    
    return $plugin_meta;
}

/**
 * Alternative approach: Add custom column to plugins table
 * This adds a dedicated column for folder names
 */
add_filter('manage_plugins_columns', 'add_folder_column');
add_action('manage_plugins_custom_column', 'show_folder_column', 10, 3);

function add_folder_column($columns) {
    // Add new column after the name column
    $new_columns = array();
    foreach ($columns as $key => $value) {
        $new_columns[$key] = $value;
        if ($key == 'name') {
            $new_columns['folder'] = 'Folder Name';
        }
    }
    return $new_columns;
}

function show_folder_column($column_name, $plugin_file, $plugin_data) {
    if ($column_name == 'folder') {
        $folder_name = get_plugin_folder_name($plugin_file);
        echo '<code>' . esc_html($folder_name) . '</code>';
    }
}

/**
 * Add some CSS to style the folder name display
 */
add_action('admin_head', 'plugin_folder_styles');
function plugin_folder_styles() {
    $screen = get_current_screen();
    if ($screen->id != 'plugins') {
        return;
    }
    ?>
    <style>
        .plugins .folder.column-folder {
            width: 15%;
        }
        .plugin-action-buttons .folder_name {
            display: block;
            margin-top: 5px;
            padding: 3px 0;
            border-top: 1px solid #ddd;
        }
    </style>
    <?php
}

/**
 * Get all plugin folders (both active and inactive) as an array
 * Use this function if you need to programmatically work with the folder list
 */
function get_all_plugin_folders() {
    $all_plugins = get_plugins();
    $folders = array();
    
    foreach ($all_plugins as $plugin_file => $plugin_data) {
        $folder_name = get_plugin_folder_name($plugin_file);
        if (!in_array($folder_name, $folders)) {
            $folders[] = $folder_name;
        }
    }
    
    return $folders;
}

/**
 * Example: Output all plugin folders for debugging
 * Uncomment to use in admin footer
 */
/*
add_action('admin_footer', 'debug_plugin_folders');
function debug_plugin_folders() {
    $screen = get_current_screen();
    if ($screen->id != 'plugins') {
        return;
    }
    
    $folders = get_all_plugin_folders();
    echo '<script>console.log("All Plugin Folders:", ' . json_encode($folders) . ');</script>';
}
*/