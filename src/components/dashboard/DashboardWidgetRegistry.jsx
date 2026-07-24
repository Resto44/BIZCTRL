/**
 * DashboardWidgetRegistry — Business Mode Aware Widget System
 *
 * The Dashboard uses a single shared framework.
 * Widgets change automatically based on Business Type.
 *
 * Architecture Rules:
 * - Dashboard NEVER calculates inventory independently.
 * - All data comes from shared services via hooks.
 * - Widget visibility is controlled by Business Mode.
 * - No duplicate widget code for Restaurant vs Retail.
 */

import React, { useMemo } from 'react';
import { useBusinessMode } from '@/lib/BusinessModeContext';
import { useLanguage } from '@/lib/LanguageContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, Package, AlertTriangle, ChefHat,
  Truck, Users, Wallet, Receipt, ShoppingBag, Barcode, Tags,
  Calendar, ScanLine, Clock, CheckCircle2, XCircle, Boxes,
  UtensilsCrossed, Factory, BookOpen, Star, ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Widget: KPI Card ──────────────────────────────────────────────────────────
export function KPIWidget({ title, value, subtitle, icon: Icon, trend, trendValue, color = 'blue', linkTo }) {
  const colorMap = {
    blue:   { bg: 'bg-blue-100 dark:bg-blue-900/40',   icon: 'text-blue-600',   trend: 'text-blue-600' },
    green:  { bg: 'bg-emerald-100 dark:bg-emerald-900/40', icon: 'text-emerald-600', trend: 'text-emerald-600' },
    orange: { bg: 'bg-orange-100 dark:bg-orange-900/40', icon: 'text-orange-600', trend: 'text-orange-600' },
    red:    { bg: 'bg-red-100 dark:bg-red-900/40',     icon: 'text-red-600',    trend: 'text-red-600' },
    purple: { bg: 'bg-violet-100 dark:bg-violet-900/40', icon: 'text-violet-600', trend: 'text-violet-600' },
    amber:  { bg: 'bg-amber-100 dark:bg-amber-900/40', icon: 'text-amber-600',  trend: 'text-amber-600' },
  };
  const c = colorMap[color] || colorMap.blue;

  const content = (
    <Card className="border border-border/60 hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground font-medium">{title}</p>
            <p className="text-2xl font-bold text-foreground mt-0.5 leading-none">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
            {trend !== undefined && (
              <div className="flex items-center gap-1 mt-1">
                {trend >= 0
                  ? <TrendingUp className="w-3 h-3 text-emerald-500" />
                  : <TrendingDown className="w-3 h-3 text-red-500" />
                }
                <span className={cn('text-xs font-medium', trend >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                  {trend >= 0 ? '+' : ''}{trendValue || trend + '%'}
                </span>
              </div>
            )}
          </div>
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', c.bg)}>
            <Icon className={cn('w-5 h-5', c.icon)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (linkTo) return <Link to={linkTo}>{content}</Link>;
  return content;
}

// ── Widget: Alert Card ────────────────────────────────────────────────────────
export function AlertWidget({ title, items, emptyMsg, icon: Icon, color = 'amber', linkTo }) {
  const colorMap = {
    amber: 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800',
    red:   'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800',
    blue:  'bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800',
  };
  const iconColorMap = {
    amber: 'text-amber-600',
    red:   'text-red-600',
    blue:  'text-blue-600',
  };

  return (
    <Card className={cn('border', colorMap[color] || colorMap.amber)}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icon className={cn('w-4 h-4', iconColorMap[color] || iconColorMap.amber)} />
            <h3 className="text-sm font-semibold">{title}</h3>
          </div>
          {linkTo && (
            <Link to={linkTo} className="text-xs text-primary hover:underline flex items-center gap-0.5">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        </div>
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">{emptyMsg}</p>
        ) : (
          <div className="space-y-1.5">
            {items.slice(0, 5).map((item, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-foreground font-medium truncate max-w-[60%]">{item.label}</span>
                <span className={cn('font-medium', item.valueColor || 'text-muted-foreground')}>{item.value}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}



// ── Dashboard Widget Layout ───────────────────────────────────────────────────

/**
 * useModeDashboardConfig — Returns the widget configuration for the current mode.
 * This is the single place that determines what widgets appear on the dashboard.
 */
export function useModeDashboardConfig() {
  const { isRetail, isRestaurant } = useBusinessMode();

  return useMemo(() => ({

    mode: isRetail ? 'retail' : 'restaurant',

    // KPI widget definitions (data fetched by parent)
    kpiWidgets: isRetail ? [
      { id: 'daily_sales',    title: 'Today Sales',    icon: Receipt,    color: 'blue',   dataKey: 'dailySales' },
      { id: 'inventory_value', title: 'Inventory Value', icon: Boxes,    color: 'green',  dataKey: 'inventoryValue' },
      { id: 'low_stock',      title: 'Low Stock Items', icon: AlertTriangle, color: 'amber', dataKey: 'lowStockCount' },
      { id: 'expiring_soon',  title: 'Expiring Soon',  icon: Calendar,  color: 'red',    dataKey: 'expiringSoon' },
    ] : [
      { id: 'daily_sales',    title: 'Today Sales',    icon: Receipt,    color: 'blue',   dataKey: 'dailySales' },
      { id: 'orders_today',   title: 'Orders Today',   icon: ClipboardList, color: 'orange', dataKey: 'ordersToday' },
      { id: 'kitchen_pending', title: 'Kitchen Queue', icon: ChefHat,   color: 'amber',  dataKey: 'kitchenPending' },
      { id: 'low_ingredients', title: 'Low Ingredients', icon: AlertTriangle, color: 'red', dataKey: 'lowIngredients' },
    ],

    // Alert widget definitions
    alertWidgets: isRetail ? [
      { id: 'low_stock',    title: 'Low Stock Alerts',  icon: AlertTriangle, color: 'amber', linkTo: '/inventory' },
      { id: 'expiry',       title: 'Expiry Alerts',     icon: Calendar,      color: 'red',   linkTo: '/retail/expiry' },
    ] : [
      { id: 'low_stock',    title: 'Low Ingredients',   icon: AlertTriangle, color: 'amber', linkTo: '/inventory' },
      { id: 'pending_orders', title: 'Pending Orders',  icon: Clock,         color: 'blue',  linkTo: '/order-management' },
    ],
  }), [isRetail, isRestaurant]);
}

// ── Mode-Aware Dashboard Section ──────────────────────────────────────────────

export function ModeSpecificDashboardSection({ lowStockItems = [], expiryAlerts = [], pendingOrders = [] }) {
  const { isRetail } = useBusinessMode();
  const { t } = useLanguage();

  if (isRetail) {
    return (
      <div className="space-y-4">
        {/* Retail: Low Stock */}
        <AlertWidget
          title={t('low_stock_alerts')}
          icon={AlertTriangle}
          color="amber"
          linkTo="/inventory"
          items={lowStockItems.map(item => ({
            label: item.name || item.products?.name,
            value: `${item.current_stock || item.opening_stock || 0} ${item.unit || ''}`,
            valueColor: 'text-amber-600',
          }))}
          emptyMsg={t('all_products_stocked')}
        />

        {/* Retail: Expiry Alerts */}
        <AlertWidget
          title={t('expiry_alerts')}
          icon={Calendar}
          color="red"
          linkTo="/retail/expiry"
          items={expiryAlerts.map(item => ({
            label: item.products?.name || item.name,
            value: item.expiry_date ? `${t('exp_label')} ${new Date(item.expiry_date).toLocaleDateString()}` : t('no_date_label'),
            valueColor: 'text-red-600',
          }))}
          emptyMsg={t('no_expiry_alerts')}
        />
      </div>
    );
  }

  // Restaurant mode
  return (
    <div className="space-y-4">
      {/* Restaurant: Low Ingredients */}
      <AlertWidget
        title={t('low_ingredients')}
        icon={AlertTriangle}
        color="amber"
        linkTo="/inventory"
        items={lowStockItems.map(item => ({
          label: item.name || item.products?.name,
          value: `${item.current_stock || item.opening_stock || 0} ${item.unit || ''}`,
          valueColor: 'text-amber-600',
        }))}
        emptyMsg={t('all_ingredients_stocked')}
      />

      {/* Restaurant: Pending Orders */}
      <AlertWidget
        title={t('pending_label')}
        icon={Clock}
        color="blue"
        linkTo="/order-management"
        items={pendingOrders.map(order => ({
          label: `${t('order_label')}${order.id?.slice(-6) || '—'}`,
          value: order.total_amount ? `${order.total_amount}` : t('pending_label'),
          valueColor: 'text-blue-600',
        }))}
        emptyMsg={t('no_pending_orders')}
      />
    </div>
  );
}

// Fix missing import
import { ClipboardList } from 'lucide-react';
