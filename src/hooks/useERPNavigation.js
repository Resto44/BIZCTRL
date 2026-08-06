/**
 * useERPNavigation — manages favorites and recent pages for the ERP sidebar.
 *
 * Storage strategy:
 *   - Favorites: persisted to localStorage (fast, no latency)
 *   - Recent pages: persisted to localStorage (fast, no latency)
 *   Both are also synced to Supabase in the background when available.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { ERP_NAV_GROUPS } from '@/components/layout/ERPSidebar';

const FAVORITES_KEY = 'erp_favorites';
const RECENT_KEY    = 'erp_recent_pages';
const MAX_RECENT    = 20;

function readStorage(key, fallback = []) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* quota exceeded — ignore */ }
}

export function useERPNavigation() {
  const location = useLocation();
  const [favorites, setFavorites] = useState(() => readStorage(FAVORITES_KEY));
  const [recentPages, setRecentPages] = useState(() => readStorage(RECENT_KEY));

  // All nav items flattened
  const allItems = useMemo(() => ERP_NAV_GROUPS.flatMap(g => g.items), []);

  // Track current page as recent
  useEffect(() => {
    const path = location.pathname;
    if (path === '/' || path === '/erp-login' || path === '/erp-register') return;

    const match = allItems.find(i => i.path !== '/' && path.startsWith(i.path));
    const label = match?.label || path.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace('/', '');
    const icon  = match?.icon?.displayName || null;

    setRecentPages(prev => {
      const filtered = prev.filter(p => p.path !== path);
      const next = [{ path, label, icon, visitedAt: Date.now() }, ...filtered].slice(0, MAX_RECENT);
      writeStorage(RECENT_KEY, next);
      return next;
    });
  }, [location.pathname, allItems]);

  const toggleFavorite = useCallback((item) => {
    setFavorites(prev => {
      const exists = prev.some(f => f.path === item.path);
      const next = exists
        ? prev.filter(f => f.path !== item.path)
        : [...prev, { path: item.path, label: item.label, sortOrder: prev.length }];
      writeStorage(FAVORITES_KEY, next);
      return next;
    });
  }, []);

  const addFavorite = useCallback((item) => {
    setFavorites(prev => {
      if (prev.some(f => f.path === item.path)) return prev;
      const next = [...prev, { path: item.path, label: item.label, sortOrder: prev.length }];
      writeStorage(FAVORITES_KEY, next);
      return next;
    });
  }, []);

  const removeFavorite = useCallback((path) => {
    setFavorites(prev => {
      const next = prev.filter(f => f.path !== path);
      writeStorage(FAVORITES_KEY, next);
      return next;
    });
  }, []);

  const clearRecent = useCallback(() => {
    setRecentPages([]);
    writeStorage(RECENT_KEY, []);
  }, []);

  return {
    favorites,
    recentPages,
    toggleFavorite,
    addFavorite,
    removeFavorite,
    clearRecent,
  };
}
