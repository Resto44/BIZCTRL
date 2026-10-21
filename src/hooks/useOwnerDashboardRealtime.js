/** Tenant-scoped dashboard updates with reconnect and polling recovery. */
import { useEffect, useRef, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';

// These prefixes match the current OwnerDashboard queries, not legacy cards.
export const OWNER_DASHBOARD_TABLE_QUERIES = {
  daily_sales: ['sales_report_period', 'sales_report_previous_period', 'owner_drawer_cash_asof'],
  supplier_invoices: ['supplier_invoices'],
  expenses: ['expenses_report_period', 'expenses_report_previous_period', 'expenses_report_fixed_pool', 'expenses_report_previous_fixed_pool'],
  expense_categories: ['expense_categories_dash'],
  products: ['products'],
  inventory: ['inventory_dash'],
  inventory_transactions: ['inventory_transactions_report', 'inventory_dash'],
  product_price_history: ['product_price_history'],
  debt_records: ['debts_customer_dash'],
  wallet_transactions: ['wallet_transactions_dash'],
  branches: ['branches', 'owner_drawer_cash_asof'],
};
const TABLE_QUERY_MAP = OWNER_DASHBOARD_TABLE_QUERIES;
const DASHBOARD_KEYS = new Set(Object.values(TABLE_QUERY_MAP).flat());
let channelSequence = 0;

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
      qc.invalidateQueries({ queryKey: [prefix, restaurantId], exact: false });
    });

    // 2. Append to live activity feed
    const event = buildEvent(table, eventType, record, branchesRef.current);
    setLiveEvents(prev => [event, ...prev].slice(0, MAX_FEED_EVENTS));
  }, [qc, restaurantId]);

  // ── Channel lifecycle ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!restaurantId) return;

    let disposed = false;
    setLiveEvents([]);
    setRealtimeStatus('CONNECTING');
    const refreshDashboard = () => {
      if (disposed || document.visibilityState === 'hidden') return;
      qc.invalidateQueries({
        predicate: query => DASHBOARD_KEYS.has(query.queryKey[0]) && query.queryKey[1] === restaurantId,
        refetchType: 'active',
      });
    };
    // A distinct channel per effect prevents adding handlers to an already
    // subscribed channel during StrictMode or cached workspace tab mounts.
    const channelName = `owner-dashboard-rt-${restaurantId}-${++channelSequence}`;
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
          if (disposed) return;
          const record = payload.eventType === 'DELETE' ? (payload.old || {}) : (payload.new || {});
          handleChange(table, payload.eventType, record);
        },
      );
    });

    channel.subscribe((status) => {
      if (disposed) return;
      setRealtimeStatus(status);
      if (status === 'SUBSCRIBED') {
        refreshDashboard();
        globalThis.console?.info(`[useOwnerDashboardRealtime] Subscribed to ${Object.keys(TABLE_QUERY_MAP).length} tables for restaurant ${restaurantId}`);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        globalThis.console?.warn(`[useOwnerDashboardRealtime] Channel status: ${status}`);
      }
    });

    // Filtered DELETE events, interrupted sockets and mobile backgrounding can
    // miss events. Re-fetch active tenant queries without remounting the page.
    // Real-time events update immediately; use a low-frequency safety sweep for missed events.
    const timer = setInterval(refreshDashboard, 60000);
    document.addEventListener('visibilitychange', refreshDashboard);
    window.addEventListener('online', refreshDashboard);
    return () => {
      disposed = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshDashboard);
      window.removeEventListener('online', refreshDashboard);
      supabase.removeChannel(channel);
    };
  }, [restaurantId, handleChange, qc]);

  return { liveEvents, realtimeStatus };
}
