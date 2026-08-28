import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { isPast, parseISO } from 'date-fns';
import DebtCard from '@/components/debts/DebtCard';
import DebtForm from '@/components/debts/DebtForm';
import PaymentForm from '@/components/debts/PaymentForm';
import DebtDetailSheet from '@/components/debts/DebtDetailSheet';
import DebtDashboard from '@/components/debts/DebtDashboard';
import { useRole } from '@/lib/RoleContext';
import { useTenant } from '@/lib/TenantContext';
import { useDebtI18n } from '@/lib/debtI18n';
import { useLanguage } from '@/lib/LanguageContext';
import { supabase } from '@/api/supabaseClient';
import { useBranchScope } from '@/lib/BranchScopeContext';
import { invalidateCustomerReceivableQueries, loadScopedDebtPayments, loadScopedDebtRecords } from '@/lib/debt/customerReceivableRepository';
import { format } from 'date-fns';
import { isWhatsAppConfigured } from '@/lib/whatsappService';
import { generateInvoicePDF, generateReceiptPDF, openPDFInNewTab } from '@/lib/debtInvoiceService';


// ── Customer Ledger Component ─────────────────────────────────────────────────
function CustomerLedger({ debts, payments, currency }) {
  const [search, setSearch] = React.useState('');
  const customerMap = React.useMemo(() => {
    const map = {};
    debts.filter(d => d.party_type === 'customer').forEach(debt => {
      // A display name is not an identity. Group canonical receivables by
      // customer_id so same-name customers can never merge across records.
      const key = debt.customer_id ? `customer:${debt.customer_id}` : `unlinked:${debt.id}`;
      if (!map[key]) map[key] = { id: debt.customer_id || debt.id, name: debt.party_name || 'Unknown', phone: debt.party_phone || '', debts: [], totalDebt: 0, totalPaid: 0, remaining: 0 };
      map[key].debts.push(debt);
      map[key].totalDebt += debt.total_amount || 0;
      map[key].totalPaid += debt.paid_amount || 0;
      map[key].remaining += debt.remaining_amount || 0;
    });
    return Object.values(map);
  }, [debts]);
  const filtered = React.useMemo(() => !search ? customerMap : customerMap.filter(c => c.name.toLowerCase().includes(search.toLowerCase())), [customerMap, search]);
  const totalRemaining = filtered.reduce((s, c) => s + c.remaining, 0);
  return (
    <div className="space-y-3">
      <div className="relative">
        <input className="w-full pl-9 pr-3 h-9 text-sm border rounded-md" placeholder="Search customer..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="text-xs text-blue-600">Total Customers</div>
          <div className="text-xl font-bold text-blue-800">{filtered.length}</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="text-xs text-red-600">Total Outstanding</div>
          <div className="text-xl font-bold text-red-800">{currency}{totalRemaining.toLocaleString()}</div>
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">No customers found</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(customer => (
            <div key={customer.id} className={`rounded-lg p-3 border ${customer.remaining > 0 ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">{customer.name.charAt(0).toUpperCase()}</div>
                  <div>
                    <div className="font-semibold text-sm">{customer.name}</div>
                    {customer.phone && <div className="text-xs text-muted-foreground">{customer.phone}</div>}
                  </div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${customer.remaining > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                  {customer.remaining > 0 ? `${currency}${customer.remaining.toLocaleString()} due` : 'Settled'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2 text-center">
                <div className="bg-white rounded p-1.5"><div className="text-[10px] text-muted-foreground">Total</div><div className="text-xs font-bold">{currency}{customer.totalDebt.toLocaleString()}</div></div>
                <div className="bg-white rounded p-1.5"><div className="text-[10px] text-muted-foreground">Paid</div><div className="text-xs font-bold text-green-700">{currency}{customer.totalPaid.toLocaleString()}</div></div>
                <div className="bg-white rounded p-1.5"><div className="text-[10px] text-muted-foreground">Remaining</div><div className="text-xs font-bold text-red-700">{currency}{customer.remaining.toLocaleString()}</div></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Debt History Component ────────────────────────────────────────────────────
function DebtHistory({ debts, payments, currency }) {
  const [filter, setFilter] = React.useState('all');
  const allTransactions = React.useMemo(() => {
    const debtTx = debts.map(d => ({ id: d.id, type: 'debt', date: d.date || d.created_date, party: d.party_name, amount: d.total_amount, invoice: d.invoice_auto_number || d.invoice_number, status: d.status, description: d.description }));
    const payTx = payments.map(p => ({ id: p.id, type: 'payment', date: p.date || p.created_date, party: p.party_name, amount: p.amount, receipt: p.receipt_number, method: p.payment_method }));
    return [...debtTx, ...payTx].sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [debts, payments]);
  const filtered = React.useMemo(() => filter === 'all' ? allTransactions : allTransactions.filter(t => t.type === filter), [allTransactions, filter]);
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {['all', 'debt', 'payment'].map(f => (
          <button key={f} className={`text-xs px-3 py-1 rounded-full border ${filter === f ? 'bg-primary text-primary-foreground' : 'bg-white'}`} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : f === 'debt' ? 'Debts' : 'Payments'}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">No transactions found</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(tx => (
            <div key={tx.id} className={`rounded-lg p-3 border ${tx.type === 'debt' ? 'bg-blue-50 border-blue-200' : 'bg-green-50 border-green-200'}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-sm">{tx.party || 'Unknown'}</div>
                  <div className="text-[10px] text-muted-foreground">{tx.type === 'debt' ? (tx.invoice || 'No invoice') : (tx.receipt || 'No receipt')}</div>
                </div>
                <div className="text-right">
                  <div className={`font-bold text-sm ${tx.type === 'debt' ? 'text-blue-700' : 'text-green-700'}`}>{tx.type === 'debt' ? '-' : '+'}{currency}{Number(tx.amount || 0).toLocaleString()}</div>
                  <div className="text-[10px] text-muted-foreground">{tx.date ? format(new Date(tx.date), 'dd MMM yyyy') : '-'}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Invoice History Component ─────────────────────────────────────────────────
function InvoiceHistory({ createdBy, currency }) {
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['debt_invoices', createdBy],
    queryFn: async () => {
      const { data, error } = await supabase.from('debt_invoices').select('*').eq('created_by', createdBy).order('created_date', { ascending: false }).limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: !!createdBy,
  });
  if (isLoading) return <div className="flex justify-center py-8"><div className="w-6 h-6 border-4 border-slate-200 border-t-primary rounded-full animate-spin" /></div>;
  return (
    <div className="space-y-2">
      {invoices.length === 0 ? <div className="text-center py-8 text-muted-foreground text-sm">No invoices yet</div> : invoices.map(inv => (
        <div key={inv.id} className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-mono text-sm font-bold text-blue-700">{inv.invoice_number}</div>
              <div className="text-sm font-medium">{inv.party_name}</div>
              <div className="text-xs text-muted-foreground">{inv.invoice_date}</div>
            </div>
            <div className="text-right">
              <div className="font-bold text-sm">{currency}{Number(inv.total_amount || 0).toLocaleString()}</div>
              <div className="flex items-center gap-1 mt-1 justify-end">
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${inv.status === 'paid' ? 'bg-green-100 text-green-700' : inv.status === 'partial' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{inv.status}</span>
                {inv.whatsapp_status === 'pending' && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Pending WA</span>}
                {inv.whatsapp_status === 'sent' && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">WA Sent</span>}
              </div>
            </div>
          </div>
          <button className="mt-2 w-full text-xs text-blue-600 border border-blue-200 rounded py-1" onClick={() => { const html = generateInvoicePDF(inv); openPDFInNewTab(html); }}>
            View Invoice PDF
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Receipt History Component ─────────────────────────────────────────────────
function ReceiptHistory({ createdBy, currency }) {
  const { data: receipts = [], isLoading } = useQuery({
    queryKey: ['debt_receipts', createdBy],
    queryFn: async () => {
      const { data, error } = await supabase.from('debt_receipts').select('*').eq('created_by', createdBy).order('created_date', { ascending: false }).limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: !!createdBy,
  });
  if (isLoading) return <div className="flex justify-center py-8"><div className="w-6 h-6 border-4 border-slate-200 border-t-primary rounded-full animate-spin" /></div>;
  return (
    <div className="space-y-2">
      {receipts.length === 0 ? <div className="text-center py-8 text-muted-foreground text-sm">No receipts yet</div> : receipts.map(rec => (
        <div key={rec.id} className="bg-green-50 border border-green-200 rounded-lg p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-mono text-sm font-bold text-green-700">{rec.receipt_number}</div>
              <div className="text-sm font-medium">{rec.party_name}</div>
              <div className="text-xs text-muted-foreground">{rec.receipt_date} • {rec.payment_method}</div>
            </div>
            <div className="text-right">
              <div className="font-bold text-sm text-green-700">{currency}{Number(rec.amount || 0).toLocaleString()}</div>
              {rec.whatsapp_status === 'pending' && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 mt-1 block">Pending WA</span>}
              {rec.whatsapp_status === 'sent' && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 mt-1 block">WA Sent</span>}
            </div>
          </div>
          {rec.invoice_number && <div className="text-[10px] text-muted-foreground mt-1">Invoice: {rec.invoice_number}</div>}
          <button className="mt-2 w-full text-xs text-green-600 border border-green-200 rounded py-1" onClick={() => { const html = generateReceiptPDF(rec); openPDFInNewTab(html); }}>
            View Receipt PDF
          </button>
        </div>
      ))}
    </div>
  );
}

// ── WhatsApp Queue Component ──────────────────────────────────────────────────
function WhatsAppQueue({ createdBy }) {
  const { data: queue = [], isLoading } = useQuery({
    queryKey: ['whatsapp_queue', createdBy],
    queryFn: async () => {
      const { data, error } = await supabase.from('whatsapp_outbound_queue').select('*').eq('created_by', createdBy).order('created_date', { ascending: false }).limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!createdBy,
  });
  if (isLoading) return <div className="flex justify-center py-8"><div className="w-6 h-6 border-4 border-slate-200 border-t-primary rounded-full animate-spin" /></div>;
  const pending = queue.filter(q => q.status === 'pending').length;
  const sent = queue.filter(q => q.status === 'sent').length;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3"><div className="text-xs text-amber-600">Pending Delivery</div><div className="text-xl font-bold text-amber-800">{pending}</div></div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-3"><div className="text-xs text-green-600">Sent</div><div className="text-xl font-bold text-green-800">{sent}</div></div>
      </div>
      <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${isWhatsAppConfigured() ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-amber-50 border border-amber-200 text-amber-700'}`}>
        <span>{isWhatsAppConfigured() ? 'WhatsApp API configured — messages sent automatically' : 'WhatsApp API not configured — messages queued (Pending WhatsApp Delivery)'}</span>
      </div>
      {queue.length === 0 ? <div className="text-center py-8 text-muted-foreground text-sm">No WhatsApp messages queued</div> : (
        <div className="space-y-2">
          {queue.map(msg => (
            <div key={msg.id} className={`rounded-lg p-3 border ${msg.status === 'sent' ? 'bg-green-50 border-green-200' : msg.status === 'failed' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">{msg.recipient_name || msg.recipient_phone}</div>
                  <div className="text-xs text-muted-foreground">{msg.recipient_phone}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">{msg.message_type} • {msg.created_date ? format(new Date(msg.created_date), 'dd MMM HH:mm') : '-'}</div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${msg.status === 'sent' ? 'bg-green-100 text-green-700' : msg.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{msg.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DebtManagement() {
  const { role } = useRole();
  const tenant = useTenant();
  const qc = useQueryClient();
  const d = useDebtI18n();
  const { currency } = useLanguage();

  const [tab, setTab] = useState('dashboard');
  const [typeFilter, setTypeFilter] = useState('all');
  const [partyFilter, setPartyFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('open');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingDebt, setEditingDebt] = useState(null);
  const [payingDebt, setPayingDebt] = useState(null);
  const [viewingDebt, setViewingDebt] = useState(null);

  const { ownerFilter, activeRestaurantId } = tenant;
  const createdBy = ownerFilter?.created_by;
  const { selectedBranchId, selectedBranchKey, isAllBranches } = useBranchScope();
  const debtScope = {
    restaurantId: activeRestaurantId,
    branchId: selectedBranchId,
    branchKey: selectedBranchKey,
    isAllBranches,
  };
  const hasDebtScope = Boolean(activeRestaurantId && (isAllBranches || selectedBranchId || selectedBranchKey));

  const { data: payments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ['debt_payments', activeRestaurantId, selectedBranchId, selectedBranchKey, isAllBranches],
    queryFn: () => loadScopedDebtPayments(debtScope),
    enabled: hasDebtScope,
  });

  const { data: debts = [], isLoading: debtsLoading } = useQuery({
    queryKey: ['debts', activeRestaurantId, selectedBranchId, selectedBranchKey, isAllBranches],
    queryFn: () => loadScopedDebtRecords(debtScope),
    enabled: hasDebtScope,
  });

  // Both owner and manager reads are already constrained in the database query.
  // Keeping this alias avoids reintroducing browser-side branch filtering.
  const filteredByRole = debts;
  const isLoading = debtsLoading || paymentsLoading;

  const filtered = useMemo(() => {
    return filteredByRole.filter(debt => {
      if (typeFilter !== 'all' && debt.type !== typeFilter) return false;
      if (partyFilter !== 'all' && debt.party_type !== partyFilter) return false;
      if (statusFilter === 'open' && !['open', 'partial'].includes(debt.status)) return false;
      if (statusFilter === 'overdue' && !(debt.status !== 'paid' && debt.due_date && isPast(parseISO(debt.due_date)))) return false;
      if (statusFilter === 'paid' && debt.status !== 'paid') return false;
      if (search && !debt.party_name?.toLowerCase().includes(search.toLowerCase()) &&
          !debt.description?.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [filteredByRole, typeFilter, partyFilter, statusFilter, search]);

  const receivableTotal = useMemo(() =>
    filteredByRole.filter(d => d.type === 'receivable' && d.status !== 'paid')
      .reduce((s, d) => s + (d.remaining_amount || 0), 0), [filteredByRole]);

  const liabilityTotal = useMemo(() =>
    filteredByRole.filter(d => d.type === 'liability' && d.status !== 'paid')
      .reduce((s, d) => s + (d.remaining_amount || 0), 0), [filteredByRole]);

  const overdueCount = useMemo(() =>
    filteredByRole.filter(d => d.status !== 'paid' && d.due_date && isPast(parseISO(d.due_date))).length,
    [filteredByRole]);

  const handleSaved = () => {
    setShowForm(false);
    setEditingDebt(null);
    invalidateCustomerReceivableQueries(qc);
    qc.invalidateQueries({ queryKey: ['debt_invoices'] });
    qc.invalidateQueries({ queryKey: ['whatsapp_queue'] });
  };

  const handlePaymentSaved = () => {
    setPayingDebt(null);
    invalidateCustomerReceivableQueries(qc);
    qc.invalidateQueries({ queryKey: ['debt_payments'] });
    qc.invalidateQueries({ queryKey: ['debt_receipts'] });
    qc.invalidateQueries({ queryKey: ['whatsapp_queue'] });
  };

  const partyOptions = [
    { value: 'customer', label: d.party_customer },
    { value: 'company', label: d.party_company },
    { value: 'supplier', label: d.party_supplier },
    { value: 'loan', label: d.party_loan },
    { value: 'branch', label: d.party_branch },
    { value: 'owner_personal', label: d.party_owner_personal },
    { value: 'employee', label: d.party_employee },
    { value: 'driver', label: d.party_driver },
  ];

  const remainingTotal = filtered.reduce((s, debt) => s + (debt.remaining_amount || 0), 0);

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{d.title}</h1>
          <p className="text-xs text-muted-foreground">{d.subtitle}</p>
        </div>
        <Button size="sm" onClick={() => { setEditingDebt(null); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-1" /> {d.add}
        </Button>
      </div>

      {/* Quick KPIs */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => { setTypeFilter('receivable'); setTab('list'); setStatusFilter('open'); }}
          className="bg-green-50 border border-green-200 rounded-xl p-3 text-center transition hover:bg-green-100"
        >
          <TrendingUp className="w-4 h-4 text-green-600 mx-auto mb-1" />
          <div className="text-sm font-bold text-green-700">{receivableTotal.toLocaleString()}</div>
          <div className="text-[10px] text-green-600">{d.owed_to_us}</div>
        </button>
        <button
          onClick={() => { setTypeFilter('liability'); setTab('list'); setStatusFilter('open'); }}
          className="bg-red-50 border border-red-200 rounded-xl p-3 text-center transition hover:bg-red-100"
        >
          <TrendingDown className="w-4 h-4 text-red-600 mx-auto mb-1" />
          <div className="text-sm font-bold text-red-700">{liabilityTotal.toLocaleString()}</div>
          <div className="text-[10px] text-red-600">{d.we_owe}</div>
        </button>
        <button
          onClick={() => { setTab('list'); setStatusFilter('overdue'); setTypeFilter('all'); }}
          className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center transition hover:bg-amber-100"
        >
          <AlertTriangle className="w-4 h-4 text-amber-600 mx-auto mb-1" />
          <div className="text-sm font-bold text-amber-700">{overdueCount}</div>
          <div className="text-[10px] text-amber-600">{d.overdue}</div>
        </button>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full grid grid-cols-4 h-auto gap-0.5 p-1">
          <TabsTrigger value="dashboard" className="text-[10px] py-1.5">{d.tab_dashboard}</TabsTrigger>
          <TabsTrigger value="list" className="text-[10px] py-1.5">{d.tab_list}</TabsTrigger>
          <TabsTrigger value="ledger" className="text-[10px] py-1.5">Ledger</TabsTrigger>
          <TabsTrigger value="more" className="text-[10px] py-1.5">More</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
            </div>
          ) : (
            <DebtDashboard debts={filteredByRole} />
          )}
        </TabsContent>

        <TabsContent value="list" className="mt-4 space-y-4">
          {/* Filters */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9 text-sm"
                placeholder={d.search_placeholder}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={d.filter_type} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{d.all}</SelectItem>
                  <SelectItem value="receivable">{d.type_receivable}</SelectItem>
                  <SelectItem value="liability">{d.type_liability}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={partyFilter} onValueChange={setPartyFilter}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={d.filter_party} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{d.all}</SelectItem>
                  {partyOptions.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={d.filter_status} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">{d.status_open}</SelectItem>
                  <SelectItem value="overdue">{d.status_overdue}</SelectItem>
                  <SelectItem value="paid">{d.status_paid}</SelectItem>
                  <SelectItem value="all_statuses">{d.status_all}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-xs text-muted-foreground">
              {d.records_count(filtered.length, remainingTotal.toLocaleString())}
            </div>
          </div>

          {/* List */}
          {isLoading ? (
            <div className="flex justify-center py-10">
              <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <div className="text-4xl mb-2">💳</div>
              <div className="text-sm">{d.no_records}</div>
              <Button size="sm" className="mt-3" onClick={() => { setEditingDebt(null); setShowForm(true); }}>
                <Plus className="w-4 h-4 mr-1" /> {d.add_first}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(debt => (
                <DebtCard
                  key={debt.id}
                  debt={debt}
                  onPay={setPayingDebt}
                  onView={setViewingDebt}
                  onEdit={d => { setEditingDebt(d); setShowForm(true); }}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="ledger" className="mt-4">
          <CustomerLedger debts={filteredByRole} payments={payments} currency={currency} />
        </TabsContent>

        <TabsContent value="more" className="mt-4">
          <Tabs defaultValue="history">
            <TabsList className="w-full grid grid-cols-4 h-auto gap-0.5 p-1">
              <TabsTrigger value="history" className="text-[10px] py-1.5">History</TabsTrigger>
              <TabsTrigger value="invoices" className="text-[10px] py-1.5">Invoices</TabsTrigger>
              <TabsTrigger value="receipts" className="text-[10px] py-1.5">Receipts</TabsTrigger>
              <TabsTrigger value="whatsapp" className="text-[10px] py-1.5">WA Queue</TabsTrigger>
            </TabsList>
            <TabsContent value="history" className="mt-3">
              <DebtHistory debts={filteredByRole} payments={payments} currency={currency} />
            </TabsContent>
            <TabsContent value="invoices" className="mt-3">
              <InvoiceHistory createdBy={createdBy} currency={currency} />
            </TabsContent>
            <TabsContent value="receipts" className="mt-3">
              <ReceiptHistory createdBy={createdBy} currency={currency} />
            </TabsContent>
            <TabsContent value="whatsapp" className="mt-3">
              <WhatsAppQueue createdBy={createdBy} />
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>

      {/* Add / Edit Dialog */}
      <Dialog open={showForm} onOpenChange={v => { if (!v) { setShowForm(false); setEditingDebt(null); } }}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingDebt ? d.edit_record : d.add_record}</DialogTitle>
          </DialogHeader>
          <DebtForm
            initial={editingDebt || {}}
            onSave={handleSaved}
            onCancel={() => { setShowForm(false); setEditingDebt(null); }}
          />
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={!!payingDebt} onOpenChange={v => { if (!v) setPayingDebt(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{d.payment_title(payingDebt?.party_name || '')}</DialogTitle>
          </DialogHeader>
          {payingDebt && (
            <PaymentForm
              debt={payingDebt}
              onSave={handlePaymentSaved}
              onCancel={() => setPayingDebt(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <DebtDetailSheet
        debt={viewingDebt}
        open={!!viewingDebt}
        onClose={() => setViewingDebt(null)}
        onUpdated={() => invalidateCustomerReceivableQueries(qc)}
      />
    </div>
  );
}