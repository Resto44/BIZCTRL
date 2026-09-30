import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { base44 } from '@/api/base44Client';
import { disableDevicePush } from '@/lib/ownerPush';

const AuthContext = createContext();

// Simple timeout wrapper
const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

export const AuthProvider = ({ children }) => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    checkAppState();
    // Keep auth state in sync with Supabase session changes
    // NOTE: skip INITIAL_SESSION — checkAppState() is already called above
    let initialFired = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted.current) return;
      if (_event === 'SIGNED_OUT' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration('/').then(reg => reg?.pushManager?.getSubscription()).then(sub => sub?.unsubscribe()).catch(() => {});
      }
      if (_event === 'INITIAL_SESSION') { initialFired = true; return; }
      if (session) {
        checkAppState();
      } else {
        setUser(null);
        setIsAuthenticated(false);
        if (mounted.current) {
          setIsLoadingAuth(false);
          setIsLoadingPublicSettings(false);
        }
      }
    });
    return () => { mounted.current = false; subscription.unsubscribe(); };
  }, []);

  const checkAppState = async () => {
    try {
      if (mounted.current) setIsLoadingPublicSettings(true);
      if (mounted.current) setAuthError(null);

      // Try to get auth state — with a hard 8s timeout to prevent infinite loading
      try {
        const currentUser = await withTimeout(base44.auth.me(), 8000);
        if (!mounted.current) return;

        if (currentUser) {
          setUser(currentUser);
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
          setAuthError({ type: 'auth_required', message: 'Authentication required' });
        }
      } catch (e) {
        if (!mounted.current) return;
        // timeout or auth error — treat as unauthenticated
        setIsAuthenticated(false);
        if (e.status === 403) {
          setAuthError({ type: 'auth_required', message: 'Authentication required' });
        }
      }
    } catch (error) {
      if (!mounted.current) return;
      console.error('[AuthContext] Unexpected error:', error);
      setIsAuthenticated(false);
    } finally {
      if (mounted.current) {
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
        setAuthChecked(true);
      }
    }
  };

  const checkUserAuth = async () => {
    if (!mounted.current) return;
    setIsLoadingAuth(true);
    try {
      const currentUser = await withTimeout(base44.auth.me(), 8000);
      if (!mounted.current) return;
      setUser(currentUser);
      setIsAuthenticated(true);
    } catch (error) {
      if (!mounted.current) return;
      setIsAuthenticated(false);
      setAuthError({ type: 'auth_required', message: 'Authentication required' });
    } finally {
      if (mounted.current) {
        setIsLoadingAuth(false);
        setAuthChecked(true);
      }
    }
  };

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
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