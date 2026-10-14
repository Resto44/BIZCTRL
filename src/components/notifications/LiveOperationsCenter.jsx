import React, { useState, useMemo } from 'react';
import { useNotifications } from '@/lib/NotificationContext';
import { useTenant } from '@/lib/TenantContext';
import { useLanguage } from '@/lib/LanguageContext';
import { presentNotificationBranches, localizeNotificationContent } from '@/lib/notificationBranchDisplay';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDistanceToNow } from 'date-fns';
import {
  ShoppingBag, ShoppingCart, DollarSign, Package, ArrowRightLeft,
  TrendingDown, AlertTriangle, Flame, Activity, UserCheck, FileText,
  Radio, Wifi
} from 'lucide-react';

const TYPE_ICONS = {
  sale_recorded:      { icon: ShoppingBag,   color: 'text-emerald-600', bg: 'bg-emerald-50' },
  purchase_recorded:  { icon: ShoppingCart,  color: 'text-blue-600',    bg: 'bg-blue-50' },
  expense_recorded:   { icon: DollarSign,    color: 'text-amber-600',   bg: 'bg-amber-50' },
  salary_advance:     { icon: UserCheck,     color: 'text-purple-600',  bg: 'bg-purple-50' },
  salary_payment:     { icon: DollarSign,    color: 'text-purple-600',  bg: 'bg-purple-50' },
  inventory_update:   { icon: Package,       color: 'text-cyan-600',    bg: 'bg-cyan-50' },
  low_stock:          { icon: Package,       color: 'text-amber-600',   bg: 'bg-amber-50' },
  credit_collection:  { icon: DollarSign,    color: 'text-green-600',   bg: 'bg-green-50' },
  branch_to_owner:    { icon: ArrowRightLeft,color: 'text-blue-600',    bg: 'bg-blue-50' },
  owner_to_branch:    { icon: ArrowRightLeft,color: 'text-blue-600',    bg: 'bg-blue-50' },
  price_change:       { icon: TrendingDown,  color: 'text-amber-600',   bg: 'bg-amber-50' },
  profit_drop:        { icon: TrendingDown,  color: 'text-red-600',     bg: 'bg-red-50' },
  pdf_export:         { icon: FileText,      color: 'text-slate-600',   bg: 'bg-slate-50' },
  expense_spike:      { icon: AlertTriangle, color: 'text-amber-600',   bg: 'bg-amber-50' },
  suspicious_activity:{ icon: AlertTriangle, color: 'text-red-600',     bg: 'bg-red-50' },
  waste_high:         { icon: Flame,         color: 'text-orange-600',  bg: 'bg-orange-50' },
  info:               { icon: Activity,      color: 'text-slate-600',   bg: 'bg-slate-50' },
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

const SEVERITY_BORDER = {
  info:     'border-l-blue-400',
  warning:  'border-l-amber-400',
  critical: 'border-l-red-500',
};

const SEVERITY_DOT = {
  info:     'bg-blue-400',
  warning:  'bg-amber-400',
  critical: 'bg-red-500 animate-pulse',
};

// Summary stats
function StatCard({ label, value, color }) {
  return (
    <div className="bg-card rounded-lg border p-3 text-center">
      <p className={`text-xl font-black ${color}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

export default function LiveOperationsCenter() {
  const { notifications } = useNotifications();
  const { branches } = useTenant();
  const { lang, translateLiteral } = useLanguage();
  const navigate = useNavigate();
  const [filterBranch, setFilterBranch] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');

  // Only show last 24h activity
  const cutoff = useMemo(() => Date.now() - 24 * 60 * 60 * 1000, []);

  const recent = useMemo(() => {
    return notifications.filter(n => {
      const ts = new Date(n.created_date || 0).getTime();
      if (ts < cutoff) return false;
      if (filterBranch !== 'all' && n.branch !== filterBranch) return false;
      if (filterPriority !== 'all' && n.severity !== filterPriority) return false;
      return true;
    });
  }, [notifications, cutoff, filterBranch, filterPriority]);

  // Stats
  const stats = useMemo(() => {
    const all = notifications.filter(n => new Date(n.created_date || 0).getTime() >= cutoff);
    return {
      total:    all.length,
      critical: all.filter(n => n.severity === 'critical').length,
      warning:  all.filter(n => n.severity === 'warning').length,
      unread:   all.filter(n => !n.is_read).length,
    };
  }, [notifications, cutoff]);

  return (
    <div className="space-y-4">
      {/* Live indicator */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
          </span>
          <span className="text-sm font-semibold">Live Feed</span>
          <Badge variant="outline" className="text-[10px]">Last 24h</Badge>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Wifi className="w-3.5 h-3.5 text-emerald-500" />
          Real-time connected
        </div>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-4 gap-2">
        <StatCard label="Events" value={stats.total} color="text-foreground" />
        <StatCard label="Unread" value={stats.unread} color="text-primary" />
        <StatCard label="Warnings" value={stats.warning} color="text-amber-600" />
        <StatCard label="Critical" value={stats.critical} color="text-red-600" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {branches.length > 0 && (
          <Select value={filterBranch} onValueChange={setFilterBranch}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {branches.map(b => <SelectItem key={b.key} value={b.key}>{b.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="critical">🔴 Critical</SelectItem>
            <SelectItem value="warning">🟡 Warning</SelectItem>
            <SelectItem value="info">🔵 Info</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Live timeline */}
      {recent.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Radio className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No activity in the last 24 hours</p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {recent.map(raw => {
              const n = localizeNotificationContent(presentNotificationBranches(raw, branches, translateLiteral('Branch')), lang);
              const cfg = TYPE_ICONS[n.type] || TYPE_ICONS.info;
              const Icon = cfg.icon;
              const route = TYPE_ROUTE[n.type];

              return (
                <motion.div
                  key={n.id}
                  layout
                  initial={{ opacity: 0, y: -12, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 30 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                  className={`flex items-start gap-3 p-3 rounded-lg border bg-card border-l-4 ${SEVERITY_BORDER[n.severity] || 'border-l-slate-300'} ${route ? 'cursor-pointer hover:bg-muted/40' : ''} ${!n.is_read ? 'ring-1 ring-primary/10' : ''}`}
                  onClick={() => route && navigate(route)}
                >
                  {/* Icon */}
                  <div className={`flex-shrink-0 rounded-lg p-1.5 mt-0.5 ${cfg.bg}`}>
                    <Icon className={`w-4 h-4 ${cfg.color}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm leading-tight">{n.title}</span>
                      {n.severity !== 'info' && (
                        <span className={`inline-block w-2 h-2 rounded-full ${SEVERITY_DOT[n.severity]}`} />
                      )}
                      {!n.is_read && (
                        <Badge className="text-[9px] px-1 py-0 bg-primary/10 text-primary border-0">new</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{n.message}</p>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {n.branch && (
                        <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                          {n.branch}
                        </span>
                      )}
                      {n.amount && (
                        <span className="text-xs font-bold text-foreground">
                          {Number(n.amount).toLocaleString()}
                        </span>
                      )}
                      {n.actor_name && (
                        <span className="text-[10px] text-muted-foreground">{n.actor_name}</span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(n.created_date || Date.now()), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}