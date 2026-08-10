/**
 * ProcurementDashboard — Phase 7
 * Enterprise procurement analytics with:
 * - KPI cards (purchases today/month, outstanding, overdue)
 * - Top supplier & most purchased product
 * - Overdue alerts
 * - Branch filtering
 */

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import PageHeader from '@/components/shared/PageHeader';
import BranchSelect from '@/components/shared/BranchSelect';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  BarChart3, ShoppingCart, DollarSign, AlertCircle, Package, TrendingUp, Clock, Star, Boxes
} from 'lucide-react';
import { computeProcurementKPIs, getOverdueInfo } from '@/lib/procurementEngine';
import { Link } from 'react-router-dom';

function KpiCard({ icon: Icon, label, value, sub, color = 'text-foreground', bgColor = '' }) {
  return (
    <Card className={`p-3 ${bgColor}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </Card>
  );
}

export default function ProcurementDashboard() {
  const { currency } = useLanguage();
  const { ownerFilter, activeRestaurant } = useTenant();
  const procurementScope = useMemo(() => {
    if (ownerFilter?.branch) return { branch: ownerFilter.branch };
    if (activeRestaurant?.id) return { restaurant_id: activeRestaurant.id };
    return ownerFilter || {};
  }, [ownerFilter, activeRestaurant?.id]);
  const [filterBranch, setFilterBranch] = useState('all');

  // ── Fetch invoices ─────────────────────────────────────────────────────
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['supplier_invoices', procurementScope],
    queryFn: async () => {
      let q = supabase.from('supplier_invoices').select('*').order('date', { ascending: false }).limit(5000);
      if (procurementScope.branch) q = q.eq('branch', procurementScope.branch);
      else if (procurementScope.restaurant_id) q = q.eq('restaurant_id', procurementScope.restaurant_id);
      else if (procurementScope.created_by) q = q.eq('created_by', procurementScope.created_by);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: !!(procurementScope.created_by || procurementScope.branch || procurementScope.restaurant_id),
  });

  const { data: payments = [] } = useQuery({
    queryKey: ['supplier_payments', procurementScope],
    queryFn: async () => {
      let q = supabase.from('supplier_payments').select('*').order('date', { ascending: false }).limit(5000);
      if (procurementScope.branch) q = q.eq('branch', procurementScope.branch);
      else if (procurementScope.restaurant_id) q = q.eq('restaurant_id', procurementScope.restaurant_id);
      else if (procurementScope.created_by) q = q.eq('created_by', procurementScope.created_by);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: !!(procurementScope.created_by || procurementScope.branch || procurementScope.restaurant_id),
  });

  // ── Filter by branch ───────────────────────────────────────────────────
  const filteredInvoices = useMemo(() => {
    return filterBranch === 'all' ? invoices : invoices.filter(i => i.branch === filterBranch);
  }, [invoices, filterBranch]);

  // ── KPIs ───────────────────────────────────────────────────────────────
  const kpis = useMemo(() => computeProcurementKPIs(filteredInvoices, payments), [filteredInvoices, payments]);

  // ── Overdue invoices ───────────────────────────────────────────────────
  const overdueInvoices = useMemo(() => {
    return filteredInvoices.filter(inv => getOverdueInfo(inv).isOverdue)
      .sort((a, b) => {
        const da = getOverdueInfo(a).daysOverdue;
        const db = getOverdueInfo(b).daysOverdue;
        return db - da;
      });
  }, [filteredInvoices]);

  // ── Pending approval ───────────────────────────────────────────────────
  const pendingApproval = filteredInvoices.filter(i => i.approval_status === 'pending');

  // ── Recent invoices ────────────────────────────────────────────────────
  const recentInvoices = filteredInvoices.slice(0, 5);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Procurement Dashboard"
        subtitle="Enterprise purchasing analytics"
        icon={<BarChart3 className="w-5 h-5" />}
        action={
          <Link to="/enterprise-purchases">
            <Button size="sm" variant="outline" className="text-xs">View Invoices</Button>
          </Link>
        }
      />

      {/* Branch Filter */}
      <BranchSelect value={filterBranch} onChange={setFilterBranch} includeAll />

      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-2">
        <KpiCard icon={ShoppingCart} label="Purchases Today" value={`${currency}${kpis.purchasesToday.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} color="text-blue-600" />
        <KpiCard icon={TrendingUp} label="This Month" value={`${currency}${kpis.purchasesThisMonth.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} color="text-indigo-600" />
        <KpiCard icon={DollarSign} label="Outstanding Payables" value={`${currency}${kpis.outstandingPayables.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} color="text-orange-600" bgColor={kpis.outstandingPayables > 0 ? 'bg-orange-50/30' : ''} />
        <KpiCard icon={AlertCircle} label="Overdue Payables" value={`${currency}${kpis.overduePayables.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} color="text-red-600" bgColor={kpis.overduePayables > 0 ? 'bg-red-50/30' : ''} />
        <KpiCard icon={Star} label="Top Supplier" value={kpis.topSupplier} color="text-purple-600" />
        <KpiCard icon={Package} label="Most Purchased" value={kpis.mostPurchasedProduct} color="text-teal-600" />
        <KpiCard icon={BarChart3} label="Avg Purchase Cost" value={`${currency}${kpis.avgPurchaseCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} color="text-slate-600" />
        <KpiCard icon={Boxes} label="Inventory Value Added" value={`${currency}${kpis.inventoryValueAdded.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} color="text-emerald-600" />
      </div>

      {/* Pending Approval Alerts */}
      {pendingApproval.length > 0 && (
        <Card className="p-3 bg-yellow-50 dark:bg-yellow-950 border-yellow-200">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-yellow-600" />
            <span className="text-sm font-semibold text-yellow-700">{pendingApproval.length} Invoice{pendingApproval.length !== 1 ? 's' : ''} Pending Approval</span>
          </div>
          <div className="space-y-1">
            {pendingApproval.slice(0, 3).map(inv => (
              <div key={inv.id} className="flex items-center justify-between text-xs">
                <span className="text-yellow-800">{inv.supplier_name} — {inv.invoice_number || inv.id.slice(0, 8)}</span>
                <span className="font-semibold text-yellow-900">{currency}{(inv.total_amount || 0).toLocaleString()}</span>
              </div>
            ))}
          </div>
          <Link to="/enterprise-purchases">
            <Button size="sm" className="mt-2 w-full h-7 text-xs bg-yellow-600 hover:bg-yellow-700">Review & Approve</Button>
          </Link>
        </Card>
      )}

      {/* Overdue Alerts */}
      {overdueInvoices.length > 0 && (
        <Card className="p-3 bg-red-50 dark:bg-red-950 border-red-200">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-red-600" />
            <span className="text-sm font-semibold text-red-700">{overdueInvoices.length} Overdue Invoice{overdueInvoices.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="space-y-1">
            {overdueInvoices.slice(0, 5).map(inv => {
              const { daysOverdue, color } = getOverdueInfo(inv);
              const remaining = (inv.total_amount || 0) - (inv.paid_amount || 0);
              return (
                <div key={inv.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color === 'red' ? 'bg-red-500' : color === 'orange' ? 'bg-orange-400' : 'bg-yellow-400'}`} />
                    <span className="text-red-800">{inv.supplier_name}</span>
                    <Badge className={`text-[9px] ${color === 'red' ? 'bg-red-100 text-red-700' : color === 'orange' ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {daysOverdue}d
                    </Badge>
                  </div>
                  <span className="font-semibold text-red-900">{currency}{remaining.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Recent Invoices */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Recent Invoices</h3>
          <Link to="/enterprise-purchases" className="text-xs text-primary">View all</Link>
        </div>
        {recentInvoices.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">No invoices yet</div>
        ) : (
          <div className="space-y-1.5">
            {recentInvoices.map(inv => {
              const { isOverdue, color } = getOverdueInfo(inv);
              return (
                <Card key={inv.id} className={`p-2.5 ${isOverdue ? `border-l-4 ${color === 'red' ? 'border-l-red-500' : color === 'orange' ? 'border-l-orange-400' : 'border-l-yellow-400'}` : ''}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold">{inv.supplier_name}</p>
                      <p className="text-[10px] text-muted-foreground">{inv.date} · {inv.branch}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold">{currency}{(inv.total_amount || 0).toLocaleString()}</p>
                      <Badge className={`text-[9px] ${inv.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : inv.status === 'partial' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>
                        {inv.status}
                      </Badge>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
