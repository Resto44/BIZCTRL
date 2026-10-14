import React, { useState, useRef, useEffect } from 'react';
import { useNotifications } from '@/lib/NotificationContext';
import { Bell, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useTenant } from '@/lib/TenantContext';
import { useLanguage } from '@/lib/LanguageContext';
import { presentNotificationBranches } from '@/lib/notificationBranchDisplay';

export default function NotificationBell() {
  const { unreadCount, notifications, markRead } = useNotifications();
  const { branches } = useTenant();
  const { translateLiteral } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target) &&
          buttonRef.current && !buttonRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const recentNotifications = notifications.slice(0, 5).map(n =>
    presentNotificationBranches(n, branches, translateLiteral('Branch')));

  return (
    <div className="relative">
      {/* Bell button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex items-center justify-center w-8 h-8 rounded-full hover:bg-muted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Notifications"
        aria-expanded={isOpen}
      >
        <motion.div
          animate={unreadCount > 0 ? { rotate: [0, -15, 15, -10, 10, 0] } : {}}
          transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 8 }}
        >
          <Bell className="w-4 h-4 text-muted-foreground" />
        </motion.div>
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              key="badge"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center ring-2 ring-background"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {/* Dropdown menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={dropdownRef}
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="absolute right-0 mt-2 w-80 bg-card border border-border rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto"
          >
            {/* Header */}
            <div className="sticky top-0 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
              <h3 className="font-semibold text-sm text-foreground">Notifications</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-muted rounded-md transition-colors"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Notifications list */}
            {recentNotifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                No notifications yet
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentNotifications.map((notif) => (
                  <motion.div
                    key={notif.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={`px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer ${
                      !notif.is_read ? 'bg-muted/30' : ''
                    }`}
                    onClick={() => {
                      if (!notif.is_read) {
                        markRead(notif.id);
                      }
                    }}
                  >
                    <div className="flex items-start gap-2">
                      {!notif.is_read && (
                        <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground line-clamp-2">
                          {notif.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {notif.message}
                        </p>
                        <p className="text-[10px] text-muted-foreground/60 mt-1">
                          {new Date(notif.created_date || Date.now()).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Footer link to inbox */}
            <Link
              to="/notifications"
              onClick={() => setIsOpen(false)}
              className="block px-4 py-3 text-center text-sm font-medium text-primary hover:bg-muted/50 transition-colors border-t border-border"
            >
              View all notifications
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
