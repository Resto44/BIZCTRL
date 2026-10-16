import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { base44, supabase } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useTenant } from '@/lib/TenantContext';
import { useRole } from '@/lib/RoleContext';
import { soundEngine } from '@/lib/soundEngine';

const NotificationContext = createContext({
  notifications: [],
  expenseCategories: [],
  unreadCount: 0,
  popups: [],
  dismissPopup: () => {},
  markRead: () => {},
  markAllRead: () => {},
  deleteNotification: () => {},
  soundMuted: false,
  setSoundMuted: () => {},
  soundVolume: 0.5,
  setSoundVolume: () => {},
  loadNotifications: () => {},
});

export function NotificationProvider({ children }) {
  const { orgId, activeRestaurantId } = useTenant();
  const { data: expenseCategories = [] } = useQuery({
    queryKey: ['notification_expense_category_labels', activeRestaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from('expense_categories')
        .select('id,name,name_ar,name_fa')
        .eq('restaurant_id', activeRestaurantId).limit(500);
      if (error) throw error;
      return data || [];
    },
    enabled: Boolean(activeRestaurantId), staleTime: 120000, retry: 1,
  });
  const { role, user } = useRole();
  const [notifications, setNotifications] = useState([]);
  const [popups, setPopups] = useState([]);
  const [soundMuted, setSoundMutedState] = useState(() => soundEngine.getMuted());
  const [soundVolume, setSoundVolumeState] = useState(() => soundEngine.getVolume());

  // IDs that existed when we first loaded — these never popup/sound
  // Initialize as empty Set to ensure it's never null
  const seenIds = useRef(new Set());
  const unsubRef = useRef(null);
  const initialLoadDone = useRef(false);
  const pollTimerRef = useRef(null);

  // Role-based filter
  const filterForRole = useCallback((notifs) => {
    if (!notifs?.length) return [];
    return notifs.filter(n => {
      if (role === 'owner') return true;
      if (role === 'manager') {
        if (n.target_role === 'owner') return false;
        // Branch managers only see their branch
        const myBranch = user?.branch;
        if (myBranch && n.branch && n.branch !== myBranch) return false;
        return true;
      }
      // cashier — only info-level, non-role-restricted
      return n.target_role === 'all' && n.severity === 'info';
    });
  }, [role, user]);

  // Show popup and play sound for a new notification
  const triggerPopupAndSound = useCallback((n) => {
    showPopup(n);
    soundEngine.playForSeverity(n.severity);
    if (n.severity !== 'info' && navigator.vibrate) {
      navigator.vibrate(n.severity === 'critical' ? [200, 100, 200] : [100]);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadNotifications = useCallback(async () => {
    if (!orgId) return;
    try {
      const data = await base44.entities.Notification.filter(
        { org_id: orgId },
        '-created_date',
        500
      );
      const filtered = filterForRole(data);

      // First load: seed all existing IDs as "already seen"
      if (!initialLoadDone.current) {
        seenIds.current = new Set(filtered.map(n => n.id));
        initialLoadDone.current = true;
        setNotifications(filtered);
        return;
      }

      // Subsequent poll: detect any new notifications that weren't in seenIds
      // (fallback for when realtime misses an event)
      const newOnes = filtered.filter(n => !seenIds.current.has(n.id));
      if (newOnes.length > 0) {
        newOnes.forEach(n => {
          seenIds.current.add(n.id);
          triggerPopupAndSound(n);
        });
      }

      setNotifications(filtered);
    } catch (e) {
      console.warn('[NotificationContext] load failed:', e);
    }
  }, [orgId, filterForRole, triggerPopupAndSound]);

  // Subscribe to real-time events
  useEffect(() => {
    if (!orgId) return;

    // Reset state on tenant change — clear stale notifications from previous tenant
    setNotifications([]);
    setPopups([]);
    seenIds.current = new Set();
    initialLoadDone.current = false;

    // Clear any existing poll timer
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    // Load initial data first
    loadNotifications();

    // Subscribe — the SDK fires for ALL Notification entity changes
    const unsub = base44.entities.Notification.subscribe((event) => {
      if (event.type === 'create') {
        const n = event.data;
        if (!n) return;

        // Only show if it belongs to our org
        if (n.org_id && n.org_id !== orgId) return;

        // Role filter
        const [allowed] = filterForRole([n]);
        if (!allowed) return;

        setNotifications(prev => {
          if (prev.find(x => x.id === n.id)) return prev;
          return [n, ...prev];
        });

        // Is this brand new (not in initial load)?
        const isNew = !seenIds.current.has(n.id);
        if (isNew) {
          seenIds.current.add(n.id);
          triggerPopupAndSound(n);
        }

      } else if (event.type === 'update') {
        setNotifications(prev =>
          prev.map(x => x.id === event.id ? { ...x, ...event.data } : x)
        );
      } else if (event.type === 'delete') {
        setNotifications(prev => prev.filter(x => x.id !== event.id));
      }
    });

    unsubRef.current = unsub;

    // Polling fallback: check every 30 seconds for new notifications
    // This catches any notifications missed by the realtime channel
    pollTimerRef.current = setInterval(() => {
      if (initialLoadDone.current) {
        loadNotifications();
      }
    }, 30000);

    return () => {
      if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
      if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null; }
    };
  }, [orgId, filterForRole]); // eslint-disable-line react-hooks/exhaustive-deps

  const showPopup = (n) => {
    const popup = { ...n, _popupId: `${n.id}_${Date.now()}` };
    setPopups(prev => {
      const deduped = prev.filter(p => p.id !== n.id);
      return [popup, ...deduped].slice(0, 5);
    });
    const timeout = n.severity === 'critical' ? 10000 : 7000;
    setTimeout(() => {
      setPopups(prev => prev.filter(p => p._popupId !== popup._popupId));
    }, timeout);
  };

  const dismissPopup = (popupId) => {
    setPopups(prev => prev.filter(p => p._popupId !== popupId));
  };

  const markRead = async (id) => {
    try {
      await base44.entities.Notification.update(id, { is_read: true });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (e) { console.warn('[notify] markRead failed', e); }
  };

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.is_read);
    try {
      await Promise.all(unread.map(n => base44.entities.Notification.update(n.id, { is_read: true })));
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (e) { console.warn('[notify] markAllRead failed', e); }
  };

  const deleteNotification = async (id) => {
    try {
      await base44.entities.Notification.delete(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (e) { console.warn('[notify] delete failed', e); }
  };

  const setSoundMuted = (val) => {
    soundEngine.setMuted(val);
    soundEngine.saveSettings();
    setSoundMutedState(val);
  };

  const setSoundVolume = (val) => {
    soundEngine.setVolume(val);
    soundEngine.saveSettings();
    setSoundVolumeState(val);
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <NotificationContext.Provider value={{
      notifications,
      expenseCategories,
      unreadCount,
      popups,
      dismissPopup,
      markRead,
      markAllRead,
      deleteNotification,
      soundMuted,
      setSoundMuted,
      soundVolume,
      setSoundVolume,
      loadNotifications,
    }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  // Context has a default value so this always returns something safe
  return ctx;
}
