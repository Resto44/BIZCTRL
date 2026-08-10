/**
 * EnterprisePurchaseCommandCenter
 * ─────────────────────────────────────────────────────────────────────────────
 * Cohesive Enterprise Purchase Command Center integrating:
 *
 * Section 1–13  — Core procurement workflow (invoices, suppliers, payments,
 *                 approval, OCR, forecasting, PO management)
 * Section 14    — Mobile First Optimization
 *                 • iPhone / Android / Tablet responsive
 *                 • Touch-optimized 44px+ tap targets
 *                 • No horizontal scrolling
 *                 • Sticky action bar with safe-area insets
 *                 • Fast rendering (memo, lazy, virtualization hints)
 * Section 15    — Enterprise UI Polish
 *                 • Glassmorphism KPI cards
 *                 • Executive typography & spacing
 *                 • Recharts analytics (area, bar, pie)
 *                 • Dark mode support
 *                 • Responsive layouts
 *                 • Enterprise animations
 *
 * i18n: EN / AR / FA — full RTL support
 * Performance: React.memo, useMemo, useCallback, lazy loading
 *
 * IMPORTANT: No DB schema changes. No migrations. No Supabase modifications.
 */

import React, {
  useState, useMemo, useCallback
} from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { useRole, ROLES } from '@/lib/RoleContext';
import BranchSelect from '@/components/shared/BranchSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';

import {
  BarChart3, DollarSign, AlertCircle,
  Clock, Star, TrendingUp, Plus, Search, Receipt, Truck, RefreshCw, ChevronRight,
  Building2, FileText, Zap, LayoutGrid, SlidersHorizontal, X
} from 'lucide-react';

// ── Section 14 — Mobile components ───────────────────────────────────────────
import MobileInvoiceList, { StickyActionBar } from '@/components/purchases/MobileOptimizedPurchaseView';

// ── Section 15 — Enterprise UI components ────────────────────────────────────
import {
  ExecutiveKPIGrid,
  MonthlySpendChart,
  SupplierSpendChart,
  PaymentStatusPie,
  SectionHeader,
  EnterpriseBanner,
  PurchaseSkeleton,
} from '@/components/purchases/EnterpriseUIComponents';

// ── Direct import (page is already lazy-loaded at route level) ───────────────
import PurchaseInvoiceForm from '@/components/purchases/PurchaseInvoiceForm';

// ── Procurement engine ────────────────────────────────────────────────────────
import {
  computeProcurementKPIs,
  deletePurchaseInvoiceWithRollback,
  getOverdueInfo,
} from '@/lib/procurementEngine';

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUS_FILTERS = [
  'all', 'draft', 'pending', 'approved', 'paid', 'partial', 'unpaid', 'cancelled'
];

// ── Analytics data builders ───────────────────────────────────────────────────
function buildMonthlySpend(invoices) {
  const map = {};
  invoices.forEach(inv => {
    if (!inv.date) return;
    const month = inv.date.substring(0, 7);
    if (!map[month]) map[month] = { month: month.slice(5) + '/' + month.slice(2, 4), total: 0, paid: 0 };
    map[month].total += inv.total_amount || 0;
    map[month].paid += inv.paid_amount || 0;
  });
  return Object.values(map)
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-6);
}

function buildSupplierSpend(invoices) {
  const map = {};
  invoices.forEach(inv => {
    const name = (inv.supplier_name || 'Unknown').slice(0, 14);
    map[name] = (map[name] || 0) + (inv.total_amount || 0);
  });
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, spend]) => ({ name, spend }));
}

function buildStatusPie(invoices) {
  const map = {};
  invoices.forEach(inv => {
    const s = inv.status || 'draft';
    map[s] = (map[s] || 0) + 1;
  });
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function EnterprisePurchaseCommandCenter() {
  const { t, currency, dir } = useLanguage();
  const { ownerFilter, activeRestaurant } = useTenant();
  const procurementScope = useMemo(() => {
    if (ownerFilter?.branch) return { branch: ownerFilter.branch };
    if (activeRestaurant?.id) return { restaurant_id: activeRestaurant.id };
    return ownerFilter || {};
  }, [ownerFilter, activeRestaurant?.id]);
  const { role } = useRole();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const isOwner = role === ROLES.OWNER;

  // ── UI state ────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('overview');
  const [filterBranch, setFilterBranch] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  // ── Data fetching ───────────────────────────────────────────────────────────
  const { data: invoices = [], isLoading: loadingInvoices, refetch } = useQuery({
    queryKey: ['supplier_invoices', procurementScope],
    queryFn: async () => {
      let q = supabase
        .from('supplier_invoices')
        .select('*')
        .order('date', { ascending: false })
        .limit(5000);
      if (procurementScope.branch) q = q.eq('branch', procurementScope.branch);
      else if (procurementScope.restaurant_id) q = q.eq('restaurant_id', procurementScope.restaurant_id);
      else if (procurementScope.created_by) q = q.eq('created_by', procurementScope.created_by);
      const { data, error } = await q;
      if (error) { console.warn('[EPCC] invoices fetch error:', error.message); return []; }
      return data || [];
    },
    staleTime: 120_000,
    enabled: !!(procurementScope.created_by || procurementScope.branch || procurementScope.restaurant_id),
  });

  const { data: payments = [] } = useQuery({
    queryKey: ['supplier_payments', procurementScope],
    queryFn: async () => {
      let q = supabase
        .from('supplier_payments')
        .select('*')
        .order('date', { ascending: false })
        .limit(5000);
      if (procurementScope.branch) q = q.eq('branch', procurementScope.branch);
      else if (procurementScope.restaurant_id) q = q.eq('restaurant_id', procurementScope.restaurant_id);
      else if (procurementScope.created_by) q = q.eq('created_by', procurementScope.created_by);
      const { data, error } = await q;
      if (error) { console.warn('[EPCC] payments fetch error:', error.message); return []; }
      return data || [];
    },
    staleTime: 120_000,
    enabled: !!(procurementScope.created_by || procurementScope.branch || procurementScope.restaurant_id),
  });

  // ── Delete mutation ─────────────────────────────────────────────────────────
  const deleteMut = useMutation({
    mutationFn: async (inv) => deletePurchaseInvoiceWithRollback(inv.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier_invoices'] });
      qc.invalidateQueries({ queryKey: ['supplier_invoices_dash'] });
      qc.invalidateQueries({ queryKey: ['supplier_payments'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['debt_records'] });
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['dashboard_metrics'] });
      qc.invalidateQueries({ queryKey: ['reports'] });
      setDeleting(null);
    },
  });

  // ── Approve mutation ────────────────────────────────────────────────────────
  const approveMut = useMutation({
    mutationFn: async (inv) => {
      const { error } = await supabase
        .from('supplier_invoices')
        .update({ approval_status: 'approved', status: 'approved' })
        .eq('id', inv.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier_invoices'] });
    },
  });

  // ── Derived data (memoized) ─────────────────────────────────────────────────
  const branchFiltered = useMemo(() =>
    filterBranch === 'all'
      ? invoices
      : invoices.filter(i => i.branch === filterBranch),
    [invoices, filterBranch]
  );

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return branchFiltered.filter(inv => {
      const statusMatch = filterStatus === 'all' || inv.status === filterStatus;
      const searchMatch = !q ||
        (inv.supplier_name || '').toLowerCase().includes(q) ||
        (inv.invoice_number || '').toLowerCase().includes(q) ||
        (inv.branch || '').toLowerCase().includes(q);
      return statusMatch && searchMatch;
    });
  }, [branchFiltered, filterStatus, searchQuery]);

  const kpis = useMemo(() =>
    computeProcurementKPIs(branchFiltered, payments),
    [branchFiltered, payments]
  );

  const overdueInvoices = useMemo(() =>
    branchFiltered
      .filter(inv => getOverdueInfo(inv).isOverdue)
      .sort((a, b) => getOverdueInfo(b).daysOverdue - getOverdueInfo(a).daysOverdue),
    [branchFiltered]
  );

  const pendingApproval = useMemo(() =>
    branchFiltered.filter(i => i.approval_status === 'pending'),
    [branchFiltered]
  );

  // ── Analytics data ──────────────────────────────────────────────────────────
  const monthlySpendData = useMemo(() => buildMonthlySpend(branchFiltered), [branchFiltered]);
  const supplierSpendData = useMemo(() => buildSupplierSpend(branchFiltered), [branchFiltered]);
  const statusPieData = useMemo(() => buildStatusPie(branchFiltered), [branchFiltered]);

  // ── Callbacks ───────────────────────────────────────────────────────────────
  const handleAddInvoice = useCallback(() => {
    setEditing(null);
    setShowForm(true);
  }, []);

  const handleEdit = useCallback((inv) => {
    setEditing(inv);
    setShowForm(true);
  }, []);

  const handleDelete = useCallback((inv) => {
    setDeleting(inv);
  }, []);

  const handleApprove = useCallback((inv) => {
    approveMut.mutate(inv);
  }, [approveMut]);

  const handleFormClose = useCallback(() => {
    setShowForm(false);
    setEditing(null);
    qc.invalidateQueries({ queryKey: ['supplier_invoices'] });
  }, [qc]);

  const handleViewDashboard = useCallback(() => {
    navigate('/procurement-dashboard');
  }, [navigate]);

  const clearSearch = useCallback(() => setSearchQuery(''), []);

  // ── Loading state ───────────────────────────────────────────────────────────
  if (loadingInvoices) {
    return (
      <div className="px-3 pt-4 pb-24 max-w-2xl mx-auto">
        <PurchaseSkeleton />
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen bg-background"
      dir={dir}
    >
      {/* ── Page container — no horizontal overflow ── */}
      <div className="px-3 pt-4 pb-28 max-w-2xl mx-auto space-y-4 overflow-x-hidden">

        {/* ── Page Header ── */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-foreground tracking-tight leading-tight">
              {t('procurement_center') || 'Purchase Command Center'}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('purchase_invoices') || 'Purchase Invoices'} · {t('procurement_analytics') || 'Analytics'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => refetch()}
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              className="h-9 gap-1.5 text-xs"
              onClick={handleAddInvoice}
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">{t('add_invoice') || 'Add Invoice'}</span>
            </Button>
          </div>
        </div>

        {/* ── Branch Filter ── */}
        <BranchSelect value={filterBranch} onChange={setFilterBranch} includeAll />

        {/* ── Tabs ── */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full grid grid-cols-3 h-9">
            <TabsTrigger value="overview" className="text-xs gap-1.5">
              <LayoutGrid className="w-3.5 h-3.5" />
              {t('overview') || 'Overview'}
            </TabsTrigger>
            <TabsTrigger value="invoices" className="text-xs gap-1.5">
              <Receipt className="w-3.5 h-3.5" />
              {t('purchase_invoices') || 'Invoices'}
              {filtered.length > 0 && (
                <span className="ms-1 bg-primary/10 text-primary text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                  {filtered.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="analytics" className="text-xs gap-1.5">
              <BarChart3 className="w-3.5 h-3.5" />
              {t('procurement_analytics') || 'Analytics'}
            </TabsTrigger>
          </TabsList>

          {/* ════════════════════════════════════════════════════════════════
              TAB 1: OVERVIEW
          ════════════════════════════════════════════════════════════════ */}
          <TabsContent value="overview" className="mt-4 space-y-4">

            {/* Executive KPI Grid — Section 15 */}
            <ExecutiveKPIGrid kpis={kpis} currency={currency} t={t} />

            {/* Pending Approval Banner */}
            {pendingApproval.length > 0 && (
              <EnterpriseBanner
                type="warning"
                icon={Clock}
                title={`${pendingApproval.length} ${t('invoice') || 'Invoice'}${pendingApproval.length !== 1 ? 's' : ''} ${t('pending') || 'Pending Approval'}`}
                items={pendingApproval.slice(0, 3).map(inv => ({
                  label: `${inv.supplier_name || 'Unknown'} — ${inv.invoice_number || inv.id.slice(0, 8)}`,
                  value: `${currency}${(inv.total_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
                }))}
                action={
                  <Button
                    size="sm"
                    className="w-full h-9 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                    onClick={() => setActiveTab('invoices')}
                  >
                    {t('review') || 'Review & Approve'}
                  </Button>
                }
              />
            )}

            {/* Overdue Banner */}
            {overdueInvoices.length > 0 && (
              <EnterpriseBanner
                type="danger"
                icon={AlertCircle}
                title={`${overdueInvoices.length} ${t('overdue') || 'Overdue'} Invoice${overdueInvoices.length !== 1 ? 's' : ''}`}
                items={overdueInvoices.slice(0, 5).map(inv => {
                  const { daysOverdue, color } = getOverdueInfo(inv);
                  const remaining = (inv.total_amount || 0) - (inv.paid_amount || 0);
                  return {
                    label: inv.supplier_name || 'Unknown',
                    value: `${currency}${remaining.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
                    badge: `${daysOverdue}d`,
                    badgeCls: color === 'red'
                      ? 'bg-red-200 text-red-800'
                      : color === 'orange'
                        ? 'bg-orange-200 text-orange-800'
                        : 'bg-yellow-200 text-yellow-800',
                  };
                })}
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-9 text-xs border-red-300 text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                    onClick={() => setActiveTab('invoices')}
                  >
                    {t('view') || 'View All Overdue'}
                  </Button>
                }
              />
            )}

            {/* Quick Stats Row */}
            <Card className="p-3">
              <SectionHeader
                title={t('summary') || 'Quick Summary'}
                icon={Zap}
              />
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="space-y-0.5">
                  <p className="text-lg font-bold text-foreground">{branchFiltered.length}</p>
                  <p className="text-[10px] text-muted-foreground">{t('invoice') || 'Invoices'}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-lg font-bold text-emerald-600">
                    {branchFiltered.filter(i => i.status === 'paid').length}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{t('paid') || 'Paid'}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-lg font-bold text-red-600">
                    {overdueInvoices.length}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{t('overdue') || 'Overdue'}</p>
                </div>
              </div>
            </Card>

            {/* Recent Invoices Preview */}
            <div>
              <SectionHeader
                title={t('recent') || 'Recent Invoices'}
                icon={Receipt}
                action={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-primary gap-1"
                    onClick={() => setActiveTab('invoices')}
                  >
                    {t('view') || 'View all'}
                    <ChevronRight className="w-3 h-3" />
                  </Button>
                }
              />
              <MobileInvoiceList
                invoices={branchFiltered.slice(0, 5)}
                currency={currency}
                isOwner={isOwner}
                onView={handleEdit}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onApprove={handleApprove}
                dir={dir}
              />
            </div>
          </TabsContent>

          {/* ════════════════════════════════════════════════════════════════
              TAB 2: INVOICES
          ════════════════════════════════════════════════════════════════ */}
          <TabsContent value="invoices" className="mt-4 space-y-3">

            {/* Search + Filter bar */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={t('search') || 'Search supplier, invoice #...'}
                  className="ps-9 pe-8 h-9 text-xs"
                />
                {searchQuery && (
                  <button
                    onClick={clearSearch}
                    className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <Button
                variant={showFilters ? 'default' : 'outline'}
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => setShowFilters(f => !f)}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
              </Button>
            </div>

            {/* Expandable filters */}
            {showFilters && (
              <div className="bg-muted/30 rounded-xl p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">
                  {t('filter') || 'Filters'}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_FILTERS.map(s => (
                    <button
                      key={s}
                      onClick={() => setFilterStatus(s)}
                      className={`text-[10px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
                        filterStatus === s
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                      }`}
                    >
                      {s === 'all' ? (t('all') || 'All') : s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Result count */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {filtered.length} {t('invoice') || 'invoice'}{filtered.length !== 1 ? 's' : ''}
              </p>
              {(filterStatus !== 'all' || searchQuery) && (
                <button
                  onClick={() => { setFilterStatus('all'); setSearchQuery(''); }}
                  className="text-xs text-primary hover:underline"
                >
                  {t('reset') || 'Clear filters'}
                </button>
              )}
            </div>

            {/* Mobile Invoice List — Section 14 */}
            <MobileInvoiceList
              invoices={filtered}
              currency={currency}
              isOwner={isOwner}
              onView={handleEdit}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onApprove={handleApprove}
              dir={dir}
            />
          </TabsContent>

          {/* ════════════════════════════════════════════════════════════════
              TAB 3: ANALYTICS
          ════════════════════════════════════════════════════════════════ */}
          <TabsContent value="analytics" className="mt-4 space-y-4">

            {/* Monthly Spend Trend */}
            <Card className="p-4">
              <SectionHeader
                title={t('monthly_spend') || 'Monthly Spend Trend'}
                subtitle={t('last_6_months') || 'Last 6 months'}
                icon={TrendingUp}
              />
              <MonthlySpendChart
                data={monthlySpendData}
                currency={currency}
                t={t}
              />
            </Card>

            {/* Top Suppliers */}
            <Card className="p-4">
              <SectionHeader
                title={t('top_supplier') || 'Top Suppliers'}
                subtitle={t('by_spend') || 'By total spend'}
                icon={Star}
              />
              <SupplierSpendChart
                data={supplierSpendData}
                currency={currency}
                t={t}
              />
            </Card>

            {/* Payment Status Distribution */}
            <Card className="p-4">
              <SectionHeader
                title={t('status') || 'Invoice Status'}
                subtitle={t('distribution') || 'Distribution'}
                icon={BarChart3}
              />
              <PaymentStatusPie data={statusPieData} t={t} />
            </Card>

            {/* Summary Stats */}
            <Card className="p-4">
              <SectionHeader
                title={t('summary') || 'Financial Summary'}
                icon={DollarSign}
              />
              <div className="space-y-2.5">
                {[
                  {
                    label: t('purchases_today') || 'Purchases Today',
                    value: `${currency}${kpis.purchasesToday.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
                    color: 'text-blue-600',
                  },
                  {
                    label: t('this_month') || 'This Month',
                    value: `${currency}${kpis.purchasesThisMonth.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
                    color: 'text-purple-600',
                  },
                  {
                    label: t('payables') || 'Outstanding Payables',
                    value: `${currency}${kpis.outstandingPayables.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
                    color: kpis.outstandingPayables > 0 ? 'text-amber-600' : 'text-emerald-600',
                  },
                  {
                    label: t('overdue') || 'Overdue Payables',
                    value: `${currency}${kpis.overduePayables.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
                    color: kpis.overduePayables > 0 ? 'text-red-600' : 'text-emerald-600',
                  },
                  {
                    label: t('avg_purchase_cost') || 'Avg Invoice Value',
                    value: `${currency}${kpis.avgPurchaseCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
                    color: 'text-slate-600',
                  },
                  {
                    label: t('inventory_value_added') || 'Inventory Value Added',
                    value: `${currency}${kpis.inventoryValueAdded.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
                    color: 'text-emerald-600',
                  },
                ].map((row, i) => (
                  <div key={i} className="flex items-center justify-between text-xs border-b border-border/40 pb-2 last:border-0 last:pb-0">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className={`font-bold ${row.color}`}>{row.value}</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Quick links */}
            <div className="grid grid-cols-2 gap-2">
              <Link to="/procurement-dashboard">
                <Card className="p-3 flex items-center gap-2 hover:shadow-md transition-shadow cursor-pointer active:scale-[0.98]">
                  <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950 flex items-center justify-center shrink-0">
                    <BarChart3 className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">{t('procurement_center') || 'Dashboard'}</p>
                    <p className="text-[10px] text-muted-foreground">KPIs</p>
                  </div>
                </Card>
              </Link>
              <Link to="/purchase-orders">
                <Card className="p-3 flex items-center gap-2 hover:shadow-md transition-shadow cursor-pointer active:scale-[0.98]">
                  <div className="w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-950 flex items-center justify-center shrink-0">
                    <Truck className="w-4 h-4 text-purple-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">{t('purchase_orders') || 'PO'}</p>
                    <p className="text-[10px] text-muted-foreground">Orders</p>
                  </div>
                </Card>
              </Link>
              <Link to="/suppliers">
                <Card className="p-3 flex items-center gap-2 hover:shadow-md transition-shadow cursor-pointer active:scale-[0.98]">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">{t('suppliers') || 'Suppliers'}</p>
                    <p className="text-[10px] text-muted-foreground">Ledger</p>
                  </div>
                </Card>
              </Link>
              <Link to="/supplier-ledger">
                <Card className="p-3 flex items-center gap-2 hover:shadow-md transition-shadow cursor-pointer active:scale-[0.98]">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">{t('supplier_ledger') || 'Ledger'}</p>
                    <p className="text-[10px] text-muted-foreground">Payables</p>
                  </div>
                </Card>
              </Link>
            </div>
          </TabsContent>
                </Tabs>
        
        {/* Bottom Spacer for Sticky Bar + BottomNav */}
        <div className="h-32" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} />
      </div>
      {/* ── Section 14: Sticky Action Bar ── */}
      <StickyActionBar
        onAddInvoice={handleAddInvoice}
        onViewDashboard={handleViewDashboard}
        pendingCount={pendingApproval.length}
        overdueCount={overdueInvoices.length}
        t={t}
      />

      {/* ── Invoice Form Dialog ── */}
      <Dialog open={showForm} onOpenChange={open => !open && handleFormClose()}>
        <DialogContent className="max-w-2xl w-full max-h-[90vh] overflow-y-auto overflow-x-hidden p-0 mx-auto">
          <DialogHeader className="px-4 pt-4 pb-0">
            <DialogTitle className="text-sm font-bold">
              {editing
                ? (t('edit_purchase') || 'Edit Invoice')
                : (t('add_invoice') || 'New Invoice')
              }
            </DialogTitle>
          </DialogHeader>
          <PurchaseInvoiceForm
            invoice={editing}
            onSuccess={handleFormClose}
            onCancel={handleFormClose}
          />
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      <AlertDialog open={!!deleting} onOpenChange={open => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirm_delete') || 'Delete Invoice?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('cannot_undo') || 'This action cannot be undone.'}
              {deleting && (
                <span className="block mt-1 font-semibold text-foreground">
                  {deleting.supplier_name} — {currency}{(deleting.total_amount || 0).toLocaleString()}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel') || 'Cancel'}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleting && deleteMut.mutate(deleting)}
            >
              {t('yes_delete') || 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
