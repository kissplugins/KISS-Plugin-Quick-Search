# Refactor Boundaries - What to Touch vs. What to Protect

## 🛡️ PROTECTED ZONES - DO NOT REFACTOR

These areas are well-architected and should be preserved:

### 1. Core Search Pipeline (plugin-quick-search.js:236-365)
**Lines**: 236-365  
**Why**: Tiered search (exact → prefix → contains → fuzzy) with debouncing and incremental filtering  
**Status**: ✅ KEEPER - Performance-optimized, well-tested  
**Action**: DO NOT TOUCH

### 2. Optimized Render Path (plugin-quick-search.js:1200-1330)
**Lines**: 1200-1330  
**Why**: Builds HTML in memory, single DOM update, minimizes layout thrash  
**Status**: ✅ KEEPER - Proper rendering optimization  
**Action**: DO NOT TOUCH

### 3. Cache Versioning & Migration (plugin-quick-search.js:4-160)
**Lines**: 4-160  
**Why**: CACHE_VERSION, TTL, localStorage→sessionStorage migration, corruption handling  
**Status**: ✅ KEEPER - Proper cache hygiene  
**Action**: DO NOT TOUCH

### 4. Scoped Capabilities & Conditional Loading (KISS-quick-search.php:60-134)
**Lines**: 60-134  
**Why**: Capability checks, conditional enqueuing, reduced attack surface  
**Status**: ✅ KEEPER - Security best practice  
**Action**: DO NOT TOUCH

### 5. User-Centric UX (plugin-quick-search.js:720-870)
**Lines**: 720-870  
**Why**: Keyboard navigation, Shift+Enter to settings, highlight/scroll, cache rebuild hotkey  
**Status**: ✅ KEEPER - Thoughtful UX polish  
**Action**: DO NOT TOUCH

### 6. Cache Invalidation Hooks (KISS-quick-search.php:52-58, plugin-quick-search.js:400-518)
**Lines**: 52-58, 400-518  
**Why**: Server-side transient deletion on lifecycle events, client-side integrity checks  
**Status**: ✅ KEEPER - Proper cache coherence  
**Action**: DO NOT TOUCH

### 7. Extensibility API (plugin-quick-search.js:20-120, KISS-quick-search.php:833-1187)
**Lines**: 20-120, 833-1187  
**Why**: window.PQS API, custom events, self-test panel  
**Status**: ✅ KEEPER - Integration-friendly design  
**Action**: DO NOT TOUCH

### 8. Defense-in-Depth Security (plugin-quick-search.js:540-620)
**Lines**: 540-620  
**Why**: Input sanitization, HTML escaping, admin-context checks  
**Status**: ✅ KEEPER - Security fundamentals  
**Action**: DO NOT TOUCH

---

## 🔧 REFACTOR ZONES - Safe to Improve

These areas have architectural issues and can be refactored:

### 1. Cache Status Display Widget (KISS-quick-search.php:983-1013)
**Lines**: 983-1013  
**Issue**: Raw HTML concatenation without escaping (XSS risk)  
**Status**: ❌ NEEDS REFACTOR  
**Action**: Replace with DOM APIs (createElement, textContent)  
**Scope**: This is a SEPARATE widget, NOT part of core search

### 2. Cache Status AJAX Loader (KISS-quick-search.php:941-1007)
**Lines**: 941-1007  
**Issue**: No FSM, no timeout, no error handling, no cancellation  
**Status**: ❌ NEEDS REFACTOR  
**Action**: Add FSM states, fetch + AbortController, exponential backoff  
**Scope**: This is a SEPARATE polling widget, NOT part of core search

### 3. Diagnostic Helpers (KISS-quick-search.php:1095-1147)
**Lines**: 1095-1147  
**Issue**: Reading from localStorage instead of sessionStorage  
**Status**: ❌ NEEDS REFACTOR  
**Action**: Align with sessionStorage migration  
**Scope**: Diagnostics only, doesn't affect core functionality

---

## 🎯 Refactor Strategy

### Phase 1: Cache Status Widget (Isolated, Low Risk)
1. Add FSM for cache status loader (IDLE → LOADING → SUCCESS/ERROR/EMPTY)
2. Replace $.post with fetch + AbortController + timeout
3. Replace HTML string concatenation with DOM APIs
4. Add proper error/loading/empty states
5. Implement exponential backoff for retries

**Why this is safe**: The cache status widget is completely separate from the core search functionality. It's just a status display that polls the server.

### Phase 2: Align Diagnostics with sessionStorage
1. Update diagnostic helpers to read from sessionStorage
2. Ensure consistency with cache migration

**Why this is safe**: Diagnostics are read-only and don't affect core functionality.

### Phase 3: Document and Test
1. Add tests for refactored components
2. Verify core search functionality is untouched
3. Update documentation

---

## 🚨 Red Flags - Stop Immediately If You See These

If a refactor starts touching any of these, STOP and reassess:

- ❌ Changing the tiered search algorithm (exact → prefix → contains → fuzzy)
- ❌ Modifying the debounced input handler
- ❌ Changing the render path (memory → single DOM update)
- ❌ Touching cache versioning or migration logic
- ❌ Modifying keyboard navigation handlers
- ❌ Changing cache invalidation hooks
- ❌ Altering the window.PQS API surface
- ❌ Modifying input sanitization or HTML escaping

---

## 📝 Summary

**PROTECTED**: Core search, render pipeline, cache system, UX, security, extensibility  
**REFACTORABLE**: Cache status widget, AJAX loader, diagnostics alignment  

**Key Principle**: The cache status widget is a SEPARATE concern from the core search functionality. Refactoring it is safe and won't affect the well-architected search pipeline.

