/**
 * useOwnerDashboardRealtime
 *
 * Enterprise Real-Time synchronization for the Owner Dashboard.
 *
 * Architecture:
 *   • One Supabase Realtime channel per restaurant (scoped by restaurant_id filter).
 *   • All 26 ERP tables are subscribed in a single channel to minimise connection
 *     overhead and avoid duplicate subscriptions.
 *   • On any INSERT / UPDATE / DELETE the hook:
 *       1. Invalidates only the affected React Query cache keys.
 *       2. Appends a live event to the activity feed (capped at MAX_FEED_EVENTS).
 *   • The channel is created once when restaurantId is available and torn down
 *     on unmount or restaurantId change — no memory leaks.
 *   • Duplicate-subscription guard: the channel name encodes the restaurantId so
 *     React StrictMode double-invocations are safe (Supabase deduplicates by name).
 *
 * Usage:
 *   const { liveEvents, realtimeStatus } = useOwnerDashboardRealtime(restaurantId, branches);
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';

// ─── Table → Query Key mapping ────────────────────────────────────────────────
// Each entry maps a Postgres table name to the React Query prefixes that should
// be invalidated when that table changes.  Prefixes are matched with
// queryClient.invalidateQueries({ queryKey: [prefix], exact: false }).
const TABLE_QUERY_MAP = {
  // Sales
  // BUG FIX: also invalidate 'sales' (history list) and 'sales_today_live' so that
  // manager-created records immediately appear in Owner History and Live Summary.
  daily_sales:            ['sales_today', 'sales_yesterday', 'sales_week', 'sales_month', 'sales_year', 'sales_prev_week', 'sales_prev_month', 'sales', 'sales_today_live', 'sales_yesterday_live', 'sales_month_live', 'mgr-today-sales', 'mgr-yesterday-sales', 'driver-performance', 'driver-sales', 'bi_sales', 'bm_sales'],
  sales_invoices:         ['sales_invoices_today'],
  sales_sources:          ['sales_sources'],
  sales_categories:       ['sales_categories'],

  // Purchases
  // BUG FIX: also invalidate 'supplier_invoices' history list key
  purchases:              ['purchases_week', 'purchases_month'],
  supplier_invoices:      ['supplier_invoices', 'purchases', 'purchases_erp', 'product_price_history', 'bi_purchases', 'bm_purchases', 'mgr-today-purchases', 'mgr-pending-invoices'],
  purchase_orders:        ['purchase_orders', 'mgr-pending-pos'],

  // Expenses
  // BUG FIX: also invalidate 'expenses' history list key and manager expense key
  expenses:               ['expenses_today', 'expenses_yesterday', 'expenses_week', 'expenses_month', 'expenses_year', 'expenses_prev_month', 'expenses', 'bi_expenses', 'bm_expenses', 'mgr-today-expenses'],
  expense_categories:     ['expense_categories_dash'],

  // Products & Inventory
  products:               ['products'],
  product_categories:     ['product_categories'],
  inventory:              ['inventory', 'inventory_dash'],
  inventory_transfers:    ['inventory_dash'],
  inventory_transactions: ['inventory_dash', 'inventory_transactions_report'],
  inventory_waste:        ['inventory_dash'],

  // Suppliers & Customers
  suppliers:              ['suppliers'],
  customers:              ['customers'],
  debt_records:           ['debts_customer_dash'],
  debt_payments:          ['debts_customer_dash'],
  customer_collections:   ['debts_customer_dash'],

  // Treasury / Cash
  wallet_transactions:    ['wallet_transactions', 'wallet_transactions_dash'],
  cash_movements:         ['cash_movements'],
  cash_register_entries:  ['cash_register_entries'],
  daily_cash_settlements: ['daily_cash_settlements'],
  owner_cash_injections:  ['owner_cash_injections'],

  // Network / POS
  network_accounts:       ['network_accounts_dash'],
  network_transfers:      ['network_accounts_dash'],

  // Driver records remain managed through canonical Daily Sales attribution.
  drivers:                ['drivers', 'driver-performance', 'driver-sales'],

  // HR
  employees:              ['employees'],
  payroll_runs:           ['payroll_runs'],
  attendance:             ['attendance'],
  staff_attendance:       ['attendance'],

  // Branches & Restaurants
  branches:               ['branches'],
  restaurants:            ['restaurants'],

  // Notifications and canonical persisted Active Alerts
  notifications:          ['notifications', 'active-alerts'],
  active_alerts:          ['active-alerts'],
};

// ─── Human-readable event labels ─────────────────────────────────────────────
const TABLE_LABELS = {
  daily_sales:            'Daily Sales',
  sales_invoices:         'Sales Invoice',
  purchases:              'Purchase',
  supplier_invoices:      'Supplier Invoice',
  purchase_orders:        'Purchase Order',
  expenses:               'Expense',
  expense_categories:     'Expense Category',
  products:               'Product',
  product_categories:     'Product Category',
  inventory:              'Inventory',
  inventory_transfers:    'Inventory Transfer',
  inventory_transactions: 'Inventory Transaction',
  inventory_waste:        'Inventory Waste',
  suppliers:              'Supplier',
  customers:              'Customer',
  debt_records:           'Credit Sale',
  debt_payments:          'Debt Collection',
  customer_collections:   'Receivable',
  wallet_transactions:    'Wallet Transaction',
  cash_movements:         'Cash Movement',
  cash_register_entries:  'Cash Register',
  daily_cash_settlements: 'Cash Settlement',
  owner_cash_injections:  'Cash Injection',
  network_accounts:       'POS Device',
  network_transfers:      'Transfer',
  drivers:                'Driver',
  employees:              'Employee',
  payroll_runs:           'Payroll',
  attendance:             'Attendance',
  staff_attendance:       'Attendance',
  branches:               'Branch',
  restaurants:            'Restaurant',
  notifications:          'Notification',
  active_alerts:          'Active Alert',
};

const EVENT_VERB = { INSERT: 'created', UPDATE: 'updated', DELETE: 'deleted' };

const MAX_FEED_EVENTS = 50;

// ─── Helper: resolve branch name from payload ─────────────────────────────────
function resolveBranchName(record, branches) {
  if (!record) return null;
  const branchKey = record.branch || record.branch_key || record.branch_id;
  if (!branchKey) return null;
  const found = (branches || []).find(
    b => (b.key || b.branch_key || b.id) === String(branchKey),
  );
  return found ? (found.name || found.label || branchKey) : String(branchKey);
}

// ─── Helper: build a human-readable activity event ───────────────────────────
function buildEvent(table, eventType, record, branches) {
  const label = TABLE_LABELS[table] || table;
  const verb  = EVENT_VERB[eventType] || eventType.toLowerCase();
  const branchName = resolveBranchName(record, branches);
  const branchPrefix = branchName ? `Branch ${branchName}` : 'System';

  // Try to extract a meaningful identifier from the record
  const id = record?.id
    ? String(record.id).slice(0, 8)
    : null;
  const name = record?.name || record?.product_name || record?.description
    || record?.invoice_number || record?.reference || null;
  const detail = name || (id ? `#${id}` : '');

  return {
    id:         `${table}-${eventType}-${Date.now()}-${Math.random()}`,
    table,
    eventType,
    label,
    verb,
    branchName,
    branchPrefix,
    detail,
    record,
    timestamp:  new Date(),
  };
}

// ─── Main hook ────────────────────────────────────────────────────────────────
export function useOwnerDashboardRealtime(restaurantId, branches = []) {
  const qc = useQueryClient();
  const channelRef  = useRef(null);
  const branchesRef = useRef(branches);
  const [liveEvents, setLiveEvents]       = useState([]);
  const [realtimeStatus, setRealtimeStatus] = useState('CONNECTING');

  // Keep branches ref up-to-date without re-creating the subscription
  useEffect(() => {
    branchesRef.current = branches;
  }, [branches]);

  // ── Invalidation callback ─────────────────────────────────────────────────
  const handleChange = useCallback((table, eventType, record) => {
    // 1. Invalidate affected query keys
    const keys = TABLE_QUERY_MAP[table] || [];
    keys.forEach(prefix => {
      qc.invalidateQueries({ queryKey: [prefix], exact: false });
    });

    // 2. Append to live activity feed
    const event = buildEvent(table, eventType, record, branchesRef.current);
    setLiveEvents(prev => [event, ...prev].slice(0, MAX_FEED_EVENTS));
  }, [qc]);

  // ── Channel lifecycle ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!restaurantId) return;

    // Tear down any previous channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channelName = `owner-dashboard-rt-${restaurantId}`;
    let channel = supabase.channel(channelName);

    // Subscribe all tables in a single channel
    Object.keys(TABLE_QUERY_MAP).forEach(table => {
      channel = channel.on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table,
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          const record = payload.new || payload.old || {};
          handleChange(table, payload.eventType, record);
        },
      );
    });

    channel.subscribe((status) => {
      setRealtimeStatus(status);
      if (status === 'SUBSCRIBED') {
        globalThis.console?.info(`[useOwnerDashboardRealtime] Subscribed to ${Object.keys(TABLE_QUERY_MAP).length} tables for restaurant ${restaurantId}`);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        globalThis.console?.warn(`[useOwnerDashboardRealtime] Channel status: ${status}`);
      }
    });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      setRealtimeStatus('CLOSED');
    };
  }, [restaurantId, handleChange]);

  return { liveEvents, realtimeStatus };
}
