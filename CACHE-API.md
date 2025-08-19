# Plugin Quick Search - Cache API Documentation

## Overview

The Plugin Quick Search intelligent caching system provides a high-performance localStorage-based caching solution that other WordPress plugins can leverage. This document explains how to integrate with and extend the caching system.

## Cache Architecture

### Storage Location
- **Primary Cache**: `localStorage.getItem('pqs_plugin_cache')`
- **Metadata**: `localStorage.getItem('pqs_cache_meta')`
- **Browser Compatibility**: Works in all modern browsers with localStorage support

### Cache Lifecycle
1. **Initial Load**: Checks for existing valid cache
2. **Cache Hit**: Uses cached data, performs background integrity check
3. **Cache Miss**: Scans fresh data, stores in cache
4. **Validation**: Checks timestamp, version, and plugin count
5. **Invalidation**: Auto-expires after configured duration

## Global API Reference

### Core Functions

```javascript
// Force rebuild the entire cache
window.pqsRebuildCache()
// Returns: Promise that resolves when cache is rebuilt

// Get current cache status
window.pqsCacheStatus()
// Returns: 'fresh' | 'stale' | 'error' | 'loading'

// Clear all cache data
window.pqsClearCache()
// Returns: void (immediately clears localStorage)
```

### Cache Status Meanings
- **`fresh`**: Cache is valid and recently updated
- **`stale`**: Cache was expired/invalid, fresh data loaded
- **`error`**: Cache operation failed, using fresh data
- **`loading`**: Initial cache check in progress

## Data Structures

### Plugin Cache Object
```javascript
{
    name: "Plugin Name",                    // Display name
    nameLower: "plugin name",               // Lowercase for searching
    description: "Plugin description text", // Full description
    descriptionLower: "plugin description", // Lowercase for searching
    version: "1.2.3",                      // Version string
    isActive: true,                         // Activation status
    settingsUrl: "admin.php?page=settings", // Settings page URL (null if none)
    rowIndex: 5,                            // Original DOM position
    wordCount: 2,                           // Words in name (for scoring)
    hasForIn: false                         // Contains "for" or "-" (for scoring)
}
```

### Cache Metadata Object
```javascript
{
    timestamp: 1692454800000,    // Unix timestamp when cached
    version: "1.0",              // Cache format version
    pluginCount: 25,             // Number of plugins in cache
    scanTime: 45.2               // Milliseconds to scan and cache
}
```

## Integration Patterns

### Pattern 1: Leverage Existing Cache

```javascript
function useExistingPQSCache() {
    // Check if PQS cache is available and fresh
    if (window.pqsCacheStatus && window.pqsCacheStatus() === 'fresh') {
        try {
            const pluginData = JSON.parse(localStorage.getItem('pqs_plugin_cache') || '[]');
            const metadata = JSON.parse(localStorage.getItem('pqs_cache_meta') || '{}');
            
            console.log(`Using ${pluginData.length} cached plugins from ${new Date(metadata.timestamp)}`);
            
            // Use the cached plugin data for your purposes
            return pluginData;
        } catch (error) {
            console.warn('Failed to read PQS cache:', error);
            return null;
        }
    }
    return null;
}
```

### Pattern 2: Extend Cache with Additional Data

```javascript
function extendPQSCache() {
    const MY_CACHE_KEY = 'my_plugin_extended_cache';
    
    // Get base PQS cache
    const baseCache = useExistingPQSCache();
    if (!baseCache) return null;
    
    // Check if we have extended cache
    const extendedCache = localStorage.getItem(MY_CACHE_KEY);
    if (extendedCache) {
        try {
            return JSON.parse(extendedCache);
        } catch (error) {
            console.warn('Extended cache corrupted, rebuilding...');
        }
    }
    
    // Build extended cache from base cache
    const enhanced = baseCache.map(plugin => ({
        ...plugin,
        myCustomField: calculateCustomData(plugin),
        myScore: calculateScore(plugin)
    }));
    
    // Store extended cache
    try {
        localStorage.setItem(MY_CACHE_KEY, JSON.stringify(enhanced));
        return enhanced;
    } catch (error) {
        console.warn('Failed to store extended cache:', error);
        return enhanced; // Return data even if caching fails
    }
}
```

### Pattern 3: Cache Invalidation Coordination

```javascript
function setupCacheCoordination() {
    // Listen for PQS cache rebuilds
    document.addEventListener('pqs-cache-rebuilt', function(event) {
        console.log('PQS cache rebuilt, clearing my extended cache');
        localStorage.removeItem('my_plugin_extended_cache');
    });
    
    // Listen for cache status changes
    document.addEventListener('pqs-cache-status-changed', function(event) {
        const status = event.detail.status;
        if (status === 'stale' || status === 'error') {
            // PQS cache was invalidated, clear dependent caches
            clearMyDependentCaches();
        }
    });
}
```

## Performance Considerations

### Cache Size Limits
- **localStorage Limit**: ~5-10MB per domain (browser dependent)
- **PQS Cache Size**: ~1-5KB per 100 plugins
- **Recommendation**: Monitor cache size if storing large additional data

### Cache Validation Strategy
```javascript
function validateMyCache(baseTimestamp) {
    const MY_CACHE_META = 'my_cache_meta';
    
    try {
        const myMeta = JSON.parse(localStorage.getItem(MY_CACHE_META) || '{}');
        
        // Invalidate if older than base cache
        if (myMeta.baseTimestamp !== baseTimestamp) {
            return false;
        }
        
        // Invalidate if older than 30 minutes
        const age = Date.now() - myMeta.timestamp;
        if (age > 30 * 60 * 1000) {
            return false;
        }
        
        return true;
    } catch (error) {
        return false;
    }
}
```

## Error Handling

### Graceful Degradation
```javascript
function robustCacheAccess() {
    try {
        // Attempt to use cache
        const cached = useExistingPQSCache();
        if (cached) return cached;
    } catch (error) {
        console.warn('Cache access failed:', error);
    }
    
    // Fallback to fresh data collection
    return collectFreshData();
}
```

### Storage Quota Handling
```javascript
function safeLocalStorageSet(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (error) {
        if (error.name === 'QuotaExceededError') {
            console.warn('localStorage quota exceeded, clearing old caches');
            clearOldCaches();
            try {
                localStorage.setItem(key, value);
                return true;
            } catch (retryError) {
                console.error('Failed to store even after cleanup:', retryError);
            }
        }
        return false;
    }
}
```

## Best Practices

1. **Always Check Availability**: Verify `window.pqsCacheStatus` exists before using
2. **Handle Errors Gracefully**: Wrap cache operations in try-catch blocks
3. **Respect Cache Lifecycle**: Don't manually modify PQS cache data
4. **Use Events**: Listen for cache events rather than polling
5. **Validate Dependencies**: Check cache timestamps for consistency
6. **Fallback Strategy**: Always have a non-cached fallback method
7. **Monitor Performance**: Log cache hit/miss rates for optimization

## Example: Complete Integration

```javascript
class MyPluginCacheManager {
    constructor() {
        this.cacheKey = 'my_plugin_cache';
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        document.addEventListener('pqs-cache-rebuilt', () => {
            this.invalidateCache();
        });
    }
    
    async getData() {
        // Try cache first
        const cached = this.getCachedData();
        if (cached) return cached;
        
        // Fallback to fresh data
        const fresh = await this.collectFreshData();
        this.setCachedData(fresh);
        return fresh;
    }
    
    getCachedData() {
        if (window.pqsCacheStatus && window.pqsCacheStatus() === 'fresh') {
            try {
                const data = localStorage.getItem(this.cacheKey);
                return data ? JSON.parse(data) : null;
            } catch (error) {
                console.warn('Cache read failed:', error);
            }
        }
        return null;
    }
    
    setCachedData(data) {
        try {
            localStorage.setItem(this.cacheKey, JSON.stringify(data));
        } catch (error) {
            console.warn('Cache write failed:', error);
        }
    }
    
    invalidateCache() {
        localStorage.removeItem(this.cacheKey);
    }
    
    async collectFreshData() {
        // Your fresh data collection logic here
        return [];
    }
}
```

This caching system provides a robust foundation for high-performance WordPress admin interfaces. By leveraging the existing PQS cache infrastructure, other plugins can achieve similar performance improvements with minimal implementation overhead.
