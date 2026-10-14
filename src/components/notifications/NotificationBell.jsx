import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNotifications } from '@/lib/NotificationContext';
import { Bell, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import { useTenant } from '@/lib/TenantContext';
import { useLanguage } from '@/lib/LanguageContext';
import { presentNotificationBranches, localizeNotificationContent } from '@/lib/notificationBranchDisplay';
import { notificationPanelGeometry } from '@/lib/notificationPanelGeometry';

export default function NotificationBell() {
  const { unreadCount, notifications, markRead } = useNotifications();
  const { branches } = useTenant();
  const { lang, translateLiteral } = useLanguage();
  const route = useLocation();
  const rtl = lang === 'fa' || lang === 'ar';
  const [isOpen, setIsOpen] = useState(false);
  const [placement, setPlacement] = useState(null);
  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);

  const positionPanel = useCallback(() => {
    if (!buttonRef.current || typeof window === 'undefined') return;
    const rect = buttonRef.current.getBoundingClientRect();
    const viewport = window.visualViewport;
    // visualViewport accounts for Safari zoom and an on-screen keyboard.
    const width = viewport?.width || window.innerWidth;
    const height = viewport?.height || window.innerHeight;
    setPlacement(notificationPanelGeometry(rect, width, height, rtl));
  }, [rtl]);

  const openPanel = () => {
    if (!isOpen) positionPanel();
    setIsOpen(open => !open);
  };

  useEffect(() => { setIsOpen(false); }, [route.pathname]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onOutside = event => {
      if (!dropdownRef.current?.contains(event.target)
          && !buttonRef.current?.contains(event.target)) setIsOpen(false);
    };
    const onEscape = event => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };
    const viewport = window.visualViewport;
    positionPanel();
    document.addEventListener('pointerdown', onOutside);
    document.addEventListener('keydown', onEscape);
    window.addEventListener('resize', positionPanel);
    window.addEventListener('scroll', positionPanel, true);
    viewport?.addEventListener('resize', positionPanel);
    viewport?.addEventListener('scroll', positionPanel);
    return () => {
      document.removeEventListener('pointerdown', onOutside);
      document.removeEventListener('keydown', onEscape);
      window.removeEventListener('resize', positionPanel);
      window.removeEventListener('scroll', positionPanel, true);
      viewport?.removeEventListener('resize', positionPanel);
      viewport?.removeEventListener('scroll', positionPanel);
    };
  }, [isOpen, positionPanel]);

  const recentNotifications = notifications.slice(0, 5).map(n =>
    localizeNotificationContent(
      presentNotificationBranches(n, branches, translateLiteral('Branch')), lang));
  const locale = lang === 'fa' ? 'fa-IR' : lang === 'ar' ? 'ar-SA' : 'en-US';

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={openPanel}
        className="relative flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={translateLiteral('Notifications')}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls="erp-notifications-popover"
      >
        <motion.div
          animate={unreadCount > 0 ? { rotate: [0, -15, 15, -10, 10, 0] } : {}}
          transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 8 }}
        >
          <Bell className="h-4 w-4 text-muted-foreground" />
        </motion.div>
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              key="badge"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white ring-2 ring-background"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isOpen && placement && (
            <motion.div
              ref={dropdownRef}
              id="erp-notifications-popover"
              role="dialog"
              aria-label={translateLiteral('Notifications')}
              dir={rtl ? 'rtl' : 'ltr'}
              initial={{ opacity: 0, scale: 0.98, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -6 }}
              transition={{ duration: 0.16 }}
              style={{ position: 'fixed', left: placement.left, top: placement.top,
                width: placement.width, maxHeight: placement.maxHeight }}
              className="z-[300] flex min-w-0 max-w-full flex-col overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-2xl"
            >
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
                <h3 className="min-w-0 text-base font-semibold text-foreground">
                  {translateLiteral('Notifications')}
                </h3>
                <button type="button" onClick={() => setIsOpen(false)}
                  aria-label={translateLiteral('Close')}
                  className="shrink-0 rounded-md p-1 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto overscroll-contain">
                {recentNotifications.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                    {translateLiteral('No notifications yet')}
                  </p>
                ) : recentNotifications.map(notif => (
                  <div key={notif.id}
                    className={`cursor-pointer px-4 py-3 transition-colors hover:bg-muted/50 ${!notif.is_read ? 'bg-muted/30' : ''}`}
                    onClick={() => { if (!notif.is_read) markRead(notif.id); }}>
                    <div className="flex min-w-0 items-start gap-3">
                      {!notif.is_read && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-500" aria-label={translateLiteral('Unread')} />
                      )}
                      <div className="min-w-0 flex-1 text-start">
                        <p className="break-words text-sm font-semibold leading-6 text-foreground [overflow-wrap:anywhere]">
                          {notif.title}
                        </p>
                        <p className="mt-1 break-words text-sm leading-5 text-muted-foreground [overflow-wrap:anywhere]">
                          {notif.message}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          <time dir="ltr" className="inline-block tabular-nums"
                            dateTime={notif.created_date || undefined}>
                            {notif.created_date
                              ? new Date(notif.created_date).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
                              : '—'}
                          </time>
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <Link to="/notifications" onClick={() => setIsOpen(false)}
                className="block shrink-0 border-t border-border px-4 py-3 text-center text-sm font-medium text-primary transition-colors hover:bg-muted/50">
                {translateLiteral('View all notifications')}
              </Link>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
