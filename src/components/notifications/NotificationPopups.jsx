import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotifications } from '@/lib/NotificationContext';
import { useNavigate } from 'react-router-dom';
import { X, ShoppingBag, ShoppingCart, AlertTriangle, Package, TrendingDown,
         DollarSign, ArrowRightLeft, FileText, Flame, Activity, UserCheck } from 'lucide-react';

const typeIcons = {
  sale_recorded:      ShoppingBag,
  purchase_recorded:  ShoppingCart,
  expense_recorded:   DollarSign,
  salary_advance:     UserCheck,
  salary_payment:     DollarSign,
  inventory_update:   Package,
  low_stock:          Package,
  credit_collection:  DollarSign,
  branch_to_owner:    ArrowRightLeft,
  owner_to_branch:    ArrowRightLeft,
  price_change:       TrendingDown,
  profit_drop:        TrendingDown,
  pdf_export:         FileText,
  expense_spike:      AlertTriangle,
  suspicious_activity:AlertTriangle,
  waste_high:         Flame,
  info:               Activity,
};

const typeRoute = {
  sale_recorded:      '/sales',
  purchase_recorded:  '/purchases',
  expense_recorded:   '/expenses',
  low_stock:          '/inventory',
  salary_advance:     '/payroll',
  salary_payment:     '/payroll',
  credit_collection:  '/cashflow',
  branch_to_owner:    '/treasury',
  owner_to_branch:    '/treasury',
  profit_drop:        '/profit-loss',
  suspicious_activity:'/activity-logs',
  expense_spike:      '/expenses',
};

const severityConfig = {
  info:     { bar: 'bg-blue-500',   bg: 'bg-slate-900 border-blue-500/40',  dot: 'bg-blue-400',   icon: 'bg-blue-500/20 text-blue-300' },
  warning:  { bar: 'bg-amber-500',  bg: 'bg-slate-900 border-amber-500/40', dot: 'bg-amber-400',  icon: 'bg-amber-500/20 text-amber-300' },
  critical: { bar: 'bg-red-500',    bg: 'bg-slate-900 border-red-500/60',   dot: 'bg-red-400',    icon: 'bg-red-500/20 text-red-300' },
};

export default function NotificationPopups() {
  const { popups, dismissPopup } = useNotifications();
  const navigate = useNavigate();

  const handleClick = (n) => {
    dismissPopup(n._popupId);
    const route = typeRoute[n.type];
    if (route) navigate(route);
  };

  return (
    <div className="pointer-events-none fixed bottom-24 end-3 z-[9999] flex w-[min(320px,calc(100vw-1.5rem))] max-w-full flex-col gap-2">
      <AnimatePresence mode="popLayout">
        {popups.map((n) => {
          const Icon = typeIcons[n.type] || Activity;
          const cfg = severityConfig[n.severity] || severityConfig.info;

          return (
            <motion.div
              key={n._popupId}
              layout
              initial={{ x: 340, opacity: 0, scale: 0.9 }}
              animate={{ x: 0, opacity: 1, scale: 1 }}
              exit={{ x: 340, opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              className={`pointer-events-auto relative rounded-xl border shadow-2xl overflow-hidden cursor-pointer ${cfg.bg} text-white`}
              onClick={() => handleClick(n)}
            >
              {/* Countdown bar */}
              <motion.div
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: 7, ease: 'linear' }}
                className={`absolute top-0 left-0 right-0 h-0.5 ${cfg.bar} origin-left`}
              />

              {/* Critical pulse ring */}
              {n.severity === 'critical' && (
                <div className="absolute inset-0 rounded-xl border-2 border-red-500/50 animate-pulse pointer-events-none" />
              )}

              <div className="flex items-start gap-3 p-3.5">
                {/* Icon */}
                <div className={`flex-shrink-0 rounded-lg p-2 mt-0.5 ${cfg.icon}`}>
                  <Icon className="w-4 h-4" />
                </div>

                <div className="flex-1 min-w-0">
                  {/* Branch tag */}
                  {n.branch && (
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                      <span className="text-[10px] font-semibold text-white/60 uppercase tracking-wide">{n.branch}</span>
                    </div>
                  )}
                  <p className="text-sm font-bold leading-tight text-white">{n.title}</p>
                  <p className="text-xs text-white/70 mt-0.5 leading-snug">{n.message}</p>
                  {n.amount && (
                    <p className="text-base font-black mt-1 text-white">
                      {Number(n.amount).toLocaleString()}
                    </p>
                  )}
                  <p className="text-[10px] text-white/40 mt-1">
                    {new Date(n.created_date || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {typeRoute[n.type] && <span className="ml-2 text-white/30">tap to open →</span>}
                  </p>
                </div>

                <button
                  onClick={(e) => { e.stopPropagation(); dismissPopup(n._popupId); }}
                  className="flex-shrink-0 p-1 rounded-full hover:bg-white/10 transition-colors mt-0.5"
                >
                  <X className="w-3.5 h-3.5 text-white/60" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
