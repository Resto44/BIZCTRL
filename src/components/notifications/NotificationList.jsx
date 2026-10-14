import React from 'react';
import { useNotifications } from '@/lib/NotificationContext';
import { useNavigate } from 'react-router-dom';
import { Bell, Trash2, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { useTenant } from '@/lib/TenantContext';
import { useLanguage } from '@/lib/LanguageContext';
import { presentNotificationBranches } from '@/lib/notificationBranchDisplay';

const TYPE_ICONS = {
  sale_recorded: '💰',
  purchase_recorded: '🛒',
  expense_recorded: '💸',
  salary_advance: '👤',
  salary_payment: '💵',
  low_stock: '📦',
  credit_collection: '🏦',
  branch_to_owner: '↔️',
  owner_to_branch: '↔️',
  profit_drop: '📉',
  expense_spike: '⚠️',
  suspicious_activity: '🚨',
  price_change: '🏷️',
  pdf_export: '📄',
  info: 'ℹ️',
};

const TYPE_ROUTE = {
  sale_recorded: '/sales',
  purchase_recorded: '/purchases',
  expense_recorded: '/expenses',
  low_stock: '/inventory',
  salary_advance: '/payroll',
  salary_payment: '/payroll',
  credit_collection: '/cashflow',
  branch_to_owner: '/treasury',
  owner_to_branch: '/treasury',
  profit_drop: '/profit-loss',
  suspicious_activity: '/activity-logs',
  expense_spike: '/expenses',
};

const SEVERITY_COLORS = {
  info:     'bg-blue-100 text-blue-700 border-blue-200',
  warning:  'bg-amber-100 text-amber-700 border-amber-200',
  critical: 'bg-red-100 text-red-700 border-red-200',
};

export default function NotificationList({ notifications }) {
  const { markRead, deleteNotification } = useNotifications();
  const navigate = useNavigate();
  const { branches } = useTenant();
  const { translateLiteral } = useLanguage();
  const displayNotifications = notifications.map(n =>
    presentNotificationBranches(n, branches, translateLiteral('Branch')));

  const handleClick = (n) => {
    if (!n.is_read) markRead(n.id);
    const route = TYPE_ROUTE[n.type];
    if (route) navigate(route);
  };

  if (notifications.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Bell className="w-10 h-10 mx-auto mb-2 opacity-30" />
        <p>No notifications found</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <AnimatePresence>
        {displayNotifications.map(n => (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className={`flex items-start gap-3 p-3 rounded-lg border bg-card transition-colors cursor-pointer hover:bg-muted/50 ${!n.is_read ? 'border-primary/30 bg-primary/3' : ''}`}
            onClick={() => handleClick(n)}
          >
            <div className="text-2xl mt-0.5 select-none">{TYPE_ICONS[n.type] || 'ℹ️'}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`font-semibold text-sm ${!n.is_read ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {n.title}
                </span>
                <Badge className={`text-[10px] px-1.5 py-0 border ${SEVERITY_COLORS[n.severity] || SEVERITY_COLORS.info}`}>
                  {n.severity}
                </Badge>
                {!n.is_read && <Circle className="w-2 h-2 fill-primary text-primary flex-shrink-0" />}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
              {n.amount && (
                <p className="text-sm font-bold text-foreground mt-0.5">
                  {Number(n.amount).toLocaleString()}
                </p>
              )}
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                {n.branch && <span className="font-medium">{n.branch}</span>}
                {n.actor_name && <span>{n.actor_name}</span>}
                <span>{formatDistanceToNow(new Date(n.created_date || Date.now()), { addSuffix: true })}</span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={e => { e.stopPropagation(); deleteNotification(n.id); }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}