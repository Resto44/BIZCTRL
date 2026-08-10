/**
 * SupplierLedger — Phase 7
 * Full supplier account statement with:
 * - Invoices list
 * - Payments history
 * - Running balance
 * - Overdue detection
 * - Branch filtering
 */

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import PageHeader from '@/components/shared/PageHeader';
import BranchSelect from '@/components/shared/BranchSelect';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  BookOpen, Truck, DollarSign, AlertCircle, CheckCircle2, Clock,
  TrendingDown, TrendingUp, Calendar, ArrowLeft
} from 'lucide-react';
import { getOverdueInfo } from '@/lib/procurementEngine';
import { useNavigate } from 'react-router-dom';

const STATUS_CONFIG = {
  paid:      { label: 'Paid',     cls: 'bg-emerald-100 text-emerald-700' },
  partial:   { label: 'Partial',  cls: 'bg-orange-100 text-orange-700' },
  unpaid:    { label: 'Unpaid',   cls: 'bg-red-100 text-red-700' },
  pending:   { label: 'Pending',  cls: 'bg-yellow-100 text-yellow-700' },
  approved:  { label: 'Approved', cls: 'bg-blue-100 text-blue-700' },
  draft:     { label: 'Draft',    cls: 'bg-gray-100 text-gray-600' },
  cancelled: { label: 'Cancelled',cls: 'bg-gray-100 text-gray-400' },
};

export default function SupplierLedger() {
  const { currency } = useLanguage();
  const { ownerFilter, activeRestaurant } = useTenant();
  const procurementScope = useMemo(() => {
    if (ownerFilter?.branch) return { branch: ownerFilter.branch };
    if (activeRestaurant?.id) return { restaurant_id: activeRestaurant.id };
    return ownerFilter || {};
  }, [ownerFilter, activeRestaurant?.id]);
  const navigate = useNavigate();

  const [filterBranch, setFilterBranch] = useState('all');
  const [filterSupplier, setFilterSupplier] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // ── Fetch data ─────────────────────────────────────────────────────────
  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers', procurementScope],
    queryFn: () => base44.entities.Supplier.filter(procurementScope, 'name', 500),
    enabled: !!(procurementScope.created_by || procurementScope.branch || procurementScope.restaurant_id),
  });

  const { data: invoices = [], isLoading: loadingInvoices } = useQuery({
    queryKey: ['supplier_invoices', procurementScope],
    queryFn: async () => {
      let q = supabase.from('supplier_invoices').select('*').order('date', { ascending: false }).limit(2000);
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
      let q = supabase.from('supplier_payments').select('*').order('date', { ascending: false }).limit(2000);
      if (procurementScope.branch) q = q.eq('branch', procurementScope.branch);
      else if (procurementScope.restaurant_id) q = q.eq('restaurant_id', procurementScope.restaurant_id);
      else if (procurementScope.created_by) q = q.eq('created_by', procurementScope.created_by);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: !!(procurementScope.created_by || procurementScope.branch || procurementScope.restaurant_id),
  });

  // ── Filtered data ──────────────────────────────────────────────────────
  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      const branchMatch = filterBranch === 'all' || inv.branch === filterBranch;
      const supplierMatch = filterSupplier === 'all' || inv.supplier_id === filterSupplier || inv.supplier_name === filterSupplier;
      const searchMatch = !searchQuery || 
        (inv.supplier_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (inv.invoice_number || '').toLowerCase().includes(searchQuery.toLowerCase());
      return branchMatch && supplierMatch && searchMatch;
    });
  }, [invoices, filterBranch, filterSupplier, searchQuery]);

  const filteredPayments = useMemo(() => {
    return payments.filter(p => {
      const branchMatch = filterBranch === 'all' || p.branch === filterBranch;
      const supplierMatch = filterSupplier === 'all' || p.supplier_id === filterSupplier || p.supplier_name === filterSupplier;
      return branchMatch && supplierMatch;
    });
  }, [payments, filterBranch, filterSupplier]);

  // ── Running balance ────────────────────────────────────────────────────
  const runningBalance = useMemo(() => {
    // Merge invoices and payments into a timeline
    const events = [
      ...filteredInvoices.map(inv => ({
        date: inv.date,
        type: 'invoice',
        description: `Invoice ${inv.invoice_number || inv.id.slice(0, 8)} — ${inv.supplier_name}`,
        debit: inv.total_amount || 0,
        credit: 0,
        ref: inv,
      })),
      ...filteredPayments.map(p => ({
        date: p.date,
        type: 'payment',
        description: `Payment — ${p.supplier_name} (${p.payment_method})`,
        debit: 0,
        credit: p.amount || 0,
        ref: p,
      })),
    ].sort((a, b) => a.date.localeCompare(b.date));

    let balance = 0;
    return events.map(ev => {
      balance += ev.debit - ev.credit;
      return { ...ev, balance };
    });
  }, [filteredInvoices, filteredPayments]);

  // ── Summary KPIs ───────────────────────────────────────────────────────
  const totalInvoiced = filteredInvoices.reduce((s, i) => s + (i.total_amount || 0), 0);
  const totalPaid = filteredPayments.reduce((s, p) => s + (p.amount || 0), 0);
  const outstanding = filteredInvoices
    .filter(i => i.status !== 'paid' && i.status !== 'cancelled')
    .reduce((s, i) => s + ((i.total_amount || 0) - (i.paid_amount || 0)), 0);
  const overdue = filteredInvoices.filter(i => getOverdueInfo(i).isOverdue);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Supplier Ledger"
        subtitle="Account statements, invoices & payments"
        icon={<BookOpen className="w-5 h-5" />}
      />

      {/* Filters */}
      <div className="flex flex-col gap-2">
        <Input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search supplier or invoice #..."
          className="h-9"
        />
        <div className="grid grid-cols-2 gap-2">
          <BranchSelect value={filterBranch} onChange={setFilterBranch} includeAll />
          <Select value={filterSupplier} onValueChange={setFilterSupplier}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="All Suppliers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Suppliers</SelectItem>
              {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-2">
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="w-4 h-4 text-red-500" />
            <span className="text-xs text-muted-foreground">Total Invoiced</span>
          </div>
          <p className="text-lg font-bold">{currency}{totalInvoiced.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-emerald-500" />
            <span className="text-xs text-muted-foreground">Total Paid</span>
          </div>
          <p className="text-lg font-bold text-emerald-600">{currency}{totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-orange-500" />
            <span className="text-xs text-muted-foreground">Outstanding</span>
          </div>
          <p className="text-lg font-bold text-orange-600">{currency}{outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
        </Card>
        <Card className={`p-3 ${overdue.length > 0 ? 'bg-red-50 dark:bg-red-950' : ''}`}>
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className={`w-4 h-4 ${overdue.length > 0 ? 'text-red-500' : 'text-muted-foreground'}`} />
            <span className="text-xs text-muted-foreground">Overdue</span>
          </div>
          <p className={`text-lg font-bold ${overdue.length > 0 ? 'text-red-600' : ''}`}>{overdue.length} invoice{overdue.length !== 1 ? 's' : ''}</p>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="statement">
        <TabsList className="w-full">
          <TabsTrigger value="statement" className="flex-1">Statement</TabsTrigger>
          <TabsTrigger value="invoices" className="flex-1">Invoices ({filteredInvoices.length})</TabsTrigger>
          <TabsTrigger value="payments" className="flex-1">Payments ({filteredPayments.length})</TabsTrigger>
        </TabsList>

        {/* Running Statement */}
        <TabsContent value="statement" className="mt-3">
          {runningBalance.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">No transactions found</div>
          ) : (
            <div className="space-y-1">
              {/* Header */}
              <div className="grid grid-cols-4 gap-1 px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase">
                <span>Date</span><span>Description</span><span className="text-right">Amount</span><span className="text-right">Balance</span>
              </div>
              {runningBalance.map((row, i) => (
                <Card key={i} className={`px-2 py-2 ${row.type === 'payment' ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : ''}`}>
                  <div className="grid grid-cols-4 gap-1 text-xs items-center">
                    <span className="text-muted-foreground">{row.date}</span>
                    <span className="truncate col-span-1">{row.description}</span>
                    <span className={`text-right font-medium ${row.type === 'payment' ? 'text-emerald-600' : 'text-red-600'}`}>
                      {row.type === 'payment' ? '-' : '+'}{currency}{(row.debit || row.credit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                    <span className={`text-right font-bold ${row.balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {currency}{row.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Invoices Tab */}
        <TabsContent value="invoices" className="mt-3 space-y-2">
          {filteredInvoices.map(inv => {
            const { isOverdue, daysOverdue, color } = getOverdueInfo(inv);
            const statusCfg = STATUS_CONFIG[inv.status] || STATUS_CONFIG.draft;
            const remaining = (inv.total_amount || 0) - (inv.paid_amount || 0);

            return (
              <Card key={inv.id} className={`p-3 ${isOverdue ? `border-l-4 ${color === 'red' ? 'border-l-red-500 bg-red-50/20' : color === 'orange' ? 'border-l-orange-400 bg-orange-50/20' : 'border-l-yellow-400 bg-yellow-50/20'}` : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold">{inv.supplier_name}</span>
                      <Badge className={`text-[10px] ${statusCfg.cls}`}>{statusCfg.label}</Badge>
                      {isOverdue && (
                        <Badge className={`text-[10px] ${color === 'red' ? 'bg-red-100 text-red-700' : color === 'orange' ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {daysOverdue}d overdue
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {inv.invoice_number && <span>#{inv.invoice_number} · </span>}
                      {inv.date}
                      {inv.due_date && <span> · Due: {inv.due_date}</span>}
                      {inv.branch && <span> · {inv.branch}</span>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold">{currency}{(inv.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    {remaining > 0.01 && (
                      <p className="text-xs text-red-600">Rem: {currency}{remaining.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </TabsContent>

        {/* Payments Tab */}
        <TabsContent value="payments" className="mt-3 space-y-2">
          {filteredPayments.map(p => (
            <Card key={p.id} className="p-3 bg-emerald-50/30 dark:bg-emerald-950/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{p.supplier_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.date} · {(p.payment_method || 'cash').charAt(0).toUpperCase() + (p.payment_method || 'cash').slice(1)}
                    {p.branch && ` · ${p.branch}`}
                  </p>
                  {p.notes && <p className="text-xs text-muted-foreground mt-0.5">{p.notes}</p>}
                </div>
                <p className="text-base font-bold text-emerald-600">{currency}{(p.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </div>
            </Card>
          ))}
          {filteredPayments.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">No payments found</div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
