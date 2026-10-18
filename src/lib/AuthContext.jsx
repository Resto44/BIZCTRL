import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { base44 } from '@/api/base44Client';
import { disableDevicePush } from '@/lib/ownerPush';

const AuthContext = createContext();

// Simple timeout wrapper
const withTimeout = (promise, ms) => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), ms); })])
    .finally(() => clearTimeout(timer));
};

export const AuthProvider = ({ children }) => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const mounted = useRef(true);
  const authRequestVersion = useRef(0);

  useEffect(() => {
    mounted.current = true;
    checkAppState();
    let authRefreshTimer;
    // Keep auth state in sync with Supabase session changes
    // NOTE: skip INITIAL_SESSION — checkAppState() is already called above
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted.current) return;
      if (_event === 'SIGNED_OUT' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration('/').then(reg => reg?.pushManager?.getSubscription()).then(sub => sub?.unsubscribe()).catch(() => {});
      }
      if (_event === 'INITIAL_SESSION') { return; }
      clearTimeout(authRefreshTimer);
      if (session) {
        // Supabase invokes listeners while holding its auth lock. Defer SDK
        // calls until the callback has returned; coalesce same-tick events.
        authRefreshTimer = setTimeout(() => {
          if (mounted.current) checkAppState();
        }, 0);
      } else {
        authRequestVersion.current += 1;
        setUser(null);
        setIsAuthenticated(false);
        if (mounted.current) {
          setAuthChecked(true);
          setIsLoadingAuth(false);
          setIsLoadingPublicSettings(false);
        }
      }
    });
    return () => { clearTimeout(authRefreshTimer); mounted.current = false; authRequestVersion.current += 1; subscription.unsubscribe(); };
  }, []);

  const checkAppState = async () => {
    const version = ++authRequestVersion.current;
    try {
      if (mounted.current && version === authRequestVersion.current) setIsLoadingPublicSettings(true);
      if (mounted.current && version === authRequestVersion.current) setAuthError(null);

      // Try to get auth state — with a hard 8s timeout to prevent infinite loading
      try {
        const currentUser = await withTimeout(base44.auth.me(), 8000);
        if (!mounted.current || version !== authRequestVersion.current) return;

        if (currentUser) {
          setUser(currentUser);
          setIsAuthenticated(true);
        } else {
          setUser(null);
          setIsAuthenticated(false);
          setAuthError({ type: 'auth_required', message: 'Authentication required' });
        }
      } catch (e) {
        if (!mounted.current || version !== authRequestVersion.current) return;
        // timeout or auth error — treat as unauthenticated
        setUser(null);
        setIsAuthenticated(false);
        if (e.status === 403) {
          setAuthError({ type: 'auth_required', message: 'Authentication required' });
        }
      }
    } catch (error) {
      if (!mounted.current || version !== authRequestVersion.current) return;
      console.error('[AuthContext] Unexpected error:', error);
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      if (mounted.current && version === authRequestVersion.current) {
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
        setAuthChecked(true);
      }
    }
  };

  const checkUserAuth = async () => {
    const version = ++authRequestVersion.current;
    if (!mounted.current || version !== authRequestVersion.current) return;
    setIsLoadingAuth(true);
    try {
      const currentUser = await withTimeout(base44.auth.me(), 8000);
      if (!mounted.current || version !== authRequestVersion.current) return;
      setUser(currentUser);
      setIsAuthenticated(Boolean(currentUser));
      setAuthError(currentUser ? null : { type: 'auth_required', message: 'Authentication required' });
    } catch (error) {
      if (!mounted.current || version !== authRequestVersion.current) return;
      setUser(null);
      setIsAuthenticated(false);
      setAuthError({ type: 'auth_required', message: 'Authentication required' });
    } finally {
      if (mounted.current && version === authRequestVersion.current) {
        setIsLoadingAuth(false);
        setIsLoadingPublicSettings(false);
        setAuthChecked(true);
      }
    }
  };

  const logout = () => {
    authRequestVersion.current += 1;
    setUser(null);
    setIsAuthenticated(false);
    setIsLoadingAuth(false);
    setIsLoadingPublicSettings(false);
    setAuthChecked(true);
    disableDevicePush().catch(() => {}).then(() => supabase.auth.signOut()).then(() => { navigate('/erp-login', { replace: true }); });
  };

  const navigateToLogin = () => {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    navigate(`/erp-login?next=${next}`, { replace: true });
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      authChecked,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};