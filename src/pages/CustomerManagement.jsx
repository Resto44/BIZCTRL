/**
 * CustomerManagement — Full ERP Customer Module
 *
 * Features:
 *  1.  Customer CRUD (create / edit / delete)
 *  2.  Customer Ledger (per-customer debt records)
 *  3.  Outstanding Balance (live from debt_records)
 *  4.  Credit Sales Tracking (debt_records where party_type='customer')
 *  5.  Collection History (customer_collections)
 *  6.  Customer Notes (customer_notes table)
 *  7.  Last Transaction (from v_customer_summary view)
 *  8.  Customer Ranking (by total credit sales)
 *  9.  VIP Customers (filter by vip_tier)
 * 10.  Customer Statements (printable per-customer statement)
 * 11.  Search & Filters (name, phone, branch, status, VIP, overdue)
 * 12.  Aging Report (v_customer_aging view — 0-30 / 31-60 / 61-90 / 90+)
 * 13.  Collection Dashboard (v_collection_dashboard view)
 *
 * Database: customers, debt_records, customer_collections, customer_notes,
 *           v_customer_summary, v_customer_aging, v_collection_dashboard
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { useRole } from '@/lib/RoleContext';
import { createCustomerReceivable, customerDebtPaymentErrorMessage, invalidateCustomerReceivableQueries, newReceivableRequestId, recordCustomerDebtPayment } from '@/lib/debt/customerReceivableRepository';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';

// UI Components
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import BranchSelect from '@/components/shared/BranchSelect';
import PageHeader from '@/components/shared/PageHeader';

// Icons
import {
  Plus, Search, Crown, CreditCard, Wallet,
  TrendingUp, AlertTriangle, CheckCircle2,
  Pencil, Trash2, ArrowLeft, RefreshCw, Calendar, DollarSign,
  Users, Activity, Shield, Award, Printer
} from 'lucide-react';

// ── Constants ──────────────────────────────────────────────────────────────
const VIP_TIERS = ['standard', 'silver', 'gold', 'platinum', 'vip'];
const VIP_COLORS = {
  standard: 'bg-gray-100 text-gray-700',
  silver:   'bg-slate-100 text-slate-700',
  gold:     'bg-amber-100 text-amber-700',
  platinum: 'bg-purple-100 text-purple-700',
  vip:      'bg-rose-100 text-rose-700',
};
const PAYMENT_METHODS = ['cash', 'network', 'bank_transfer', 'cheque'];
const STATUS_COLORS = {
  open:        'bg-blue-100 text-blue-700',
  partial:     'bg-orange-100 text-orange-700',
  paid:        'bg-emerald-100 text-emerald-700',
  overdue:     'bg-red-100 text-red-700',
  written_off: 'bg-gray-100 text-gray-500',
};
const NOTE_TYPES = ['general', 'collection', 'complaint', 'promise', 'vip', 'other'];
const NOTE_COLORS = {
  general:    'bg-gray-100 text-gray-700',
  collection: 'bg-blue-100 text-blue-700',
  complaint:  'bg-red-100 text-red-700',
  promise:    'bg-amber-100 text-amber-700',
  vip:        'bg-rose-100 text-rose-700',
  other:      'bg-slate-100 text-slate-600',
};

const emptyCustomerForm = {
  name: '', phone: '', email: '', address: '',
  vip_tier: 'standard', credit_limit: '', notes: '', is_active: true,
  branch_id: '', branch: '',
};
const emptyCreditSaleForm = {
  customer_id: '', party_name: '', party_phone: '', invoice_number: '',
  date: format(new Date(), 'yyyy-MM-dd'),
  due_date: '', total_amount: '', paid_amount: '0',
  notes: '', branch: '',
};
const emptyCollectionForm = {
  customer_id: '', customer_name: '', debt_id: '', amount: '',
  date: format(new Date(), 'yyyy-MM-dd'),
  payment_method: 'cash', notes: '', branch: '',
};
const emptyNoteForm = { note: '', note_type: 'general' };

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt(n, currency = '') {
  if (!n && n !== 0) return `${currency}0`;
  return `${currency}${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
function fmtDate(d) {
  if (!d) return '—';
  try { return format(parseISO(String(d).substring(0, 10)), 'dd MMM yyyy'); } catch { return String(d).substring(0, 10); }
}

// ── KPI Card ──────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, color = 'blue', loading }) {
  const colors = {
    blue:   'bg-blue-50 text-blue-600',
    green:  'bg-emerald-50 text-emerald-600',
    amber:  'bg-amber-50 text-amber-600',
    red:    'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600',
  };
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${colors[color]}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground truncate">{label}</p>
            {loading ? <Skeleton className="h-6 w-20 mt-1" /> : <p className="text-lg font-bold truncate">{value}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Customer Row Card ─────────────────────────────────────────────────────
function CustomerCard({ customer, onSelect, onEdit, onDelete, currency, t }) {
  const outstanding = Number(customer.outstanding_balance || 0);
  const isOverdue = customer.overdue_count > 0;
  const tier = customer.vip_tier || 'standard';
  return (
    <Card className="border shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => onSelect(customer)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${VIP_COLORS[tier]}`}>
              {(customer.customer_name || customer.name || '?').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{customer.customer_name || customer.name}</p>
              <p className="text-xs text-muted-foreground truncate">{customer.phone || customer.customer_phone || '—'}</p>
              {customer.branch && <p className="text-xs text-muted-foreground">{customer.branch}</p>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <Badge className={`text-xs ${VIP_COLORS[tier]}`}>{tier.toUpperCase()}</Badge>
            {isOverdue && <Badge className="text-xs bg-red-100 text-red-700"><AlertTriangle className="w-3 h-3 mr-1" />{t('filter_overdue')}</Badge>}
          </div>
        </div>
        <Separator className="my-3" />
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-xs text-muted-foreground">{t('total_credit_sales')}</p>
            <p className="text-xs font-semibold text-blue-600">{fmt(customer.total_credit_sales, currency)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('total_collected')}</p>
            <p className="text-xs font-semibold text-emerald-600">{fmt(customer.total_collected, currency)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('outstanding_balance')}</p>
            <p className={`text-xs font-bold ${outstanding > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmt(outstanding, currency)}</p>
          </div>
        </div>
        {customer.last_transaction_date && (
          <p className="text-xs text-muted-foreground mt-2">{t('last_transaction')}: {fmtDate(customer.last_transaction_date)}</p>
        )}
        <div className="flex gap-2 mt-3" onClick={e => e.stopPropagation()}>
          <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => onEdit(customer)}>
            <Pencil className="w-3 h-3 mr-1" />{t('edit')}
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 hover:bg-red-50" onClick={() => onDelete(customer)}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function CustomerManagement() {
  const { t, currency, lang, dir, translateLiteral, translateLabel } = useLanguage();
  const { ownerFilter, activeRestaurantId, branches, isManager, managerBranch } = useTenant();
  const { role } = useRole();
  const qc = useQueryClient();

  // UI State
  const [tab, setTab] = useState('dashboard');
  const [search, setSearch] = useState('');
  const [filterBranch, setFilterBranch] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [detailTab, setDetailTab] = useState('ledger');
  
  // Modals
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [customerForm, setCustomerForm] = useState(emptyCustomerForm);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showCreditSaleForm, setShowCreditSaleForm] = useState(false);
  const [creditSaleForm, setCreditSaleForm] = useState(emptyCreditSaleForm);
  const [showCollectionForm, setShowCollectionForm] = useState(false);
  const [collectionForm, setCollectionForm] = useState(emptyCollectionForm);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteForm, setNoteForm] = useState(emptyNoteForm);
  const creditSaleRequestId = useRef(null);
  const collectionRequestId = useRef(null);

  // Auto-set default branch for managers
  useEffect(() => {
    if (isManager && managerBranch && !showCustomerForm) {
      const defaultBranch = (branches || []).find(b => b.key === managerBranch);
      if (defaultBranch) {
        setFilterBranch(defaultBranch.key);
      }
    }
  }, [isManager, managerBranch, branches, showCustomerForm]);

  const createdBy = ownerFilter?.created_by;
  const enabled = !!activeRestaurantId;

  // ── Data Fetching ──────────────────────────────────────────────────────

  const { data: customerSummary = [], isLoading: loadingSummary, refetch: refetchSummary } = useQuery({
    queryKey: ['v_customer_summary', activeRestaurantId],
    queryFn: async () => {
      const q = supabase.from('v_customer_summary').select('*').eq('restaurant_id', activeRestaurantId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled,
  });

  const { data: registeredCustomers = [], isLoading: loadingCustomers, refetch: refetchCustomers } = useQuery({
    queryKey: ['customers', activeRestaurantId],
    queryFn: async () => {
      const q = supabase.from('customers').select('*').eq('restaurant_id', activeRestaurantId).order('name');
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled,
  });

  const { data: debtRecords = [], isLoading: loadingDebts } = useQuery({
    queryKey: ['debt_records_customers', activeRestaurantId],
    queryFn: async () => {
      const q = supabase.from('debt_records').select('*')
        .eq('restaurant_id', activeRestaurantId)
        .eq('party_type', 'customer')
        .order('date', { ascending: false })
        .limit(500);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled,
  });

  const { data: collections = [], isLoading: loadingCollections } = useQuery({
    queryKey: ['customer_collections', activeRestaurantId],
    queryFn: async () => {
      const q = supabase.from('customer_collections').select('*')
        .eq('restaurant_id', activeRestaurantId)
        .order('date', { ascending: false }).limit(500);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled,
  });

  const { data: agingData = [], isLoading: loadingAging } = useQuery({
    queryKey: ['v_customer_aging', activeRestaurantId],
    queryFn: async () => {
      const q = supabase.from('v_customer_aging').select('*').eq('restaurant_id', activeRestaurantId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled,
  });

  const { data: collectionDash = [], isLoading: loadingDash } = useQuery({
    queryKey: ['v_collection_dashboard', activeRestaurantId],
    queryFn: async () => {
      const q = supabase.from('v_collection_dashboard').select('*').eq('restaurant_id', activeRestaurantId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled,
  });

  const { data: customerNotes = [], isLoading: loadingNotes, refetch: refetchNotes } = useQuery({
    queryKey: ['customer_notes', selectedCustomer?.customer_name || selectedCustomer?.name, createdBy],
    queryFn: async () => {
      const name = selectedCustomer?.customer_name || selectedCustomer?.name;
      if (!name) return [];
      let q = supabase.from('customer_notes').select('*')
        .eq('customer_name', name)
        .order('created_date', { ascending: false });
      if (createdBy) q = q.eq('created_by', createdBy);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedCustomer,
  });

  // ── Merged customer list ───────────────────────────────────────────────
  const mergedCustomers = useMemo(() => {
    const map = new Map();
    // Filter customers by current restaurant and active status only
    const activeCustomers = registeredCustomers.filter(c => 
      c.is_active !== false && 
      (!activeRestaurantId || c.restaurant_id === activeRestaurantId)
    );
    customerSummary.forEach(c => {
      if (c.is_active !== false && (!activeRestaurantId || c.restaurant_id === activeRestaurantId)) {
        map.set(c.customer_name, { ...c, source: 'summary' });
      }
    });
    activeCustomers.forEach(rc => {
      const key = rc.name;
      if (map.has(key)) {
        map.set(key, { ...map.get(key), ...rc, customer_name: rc.name, source: 'both' });
      } else {
        map.set(key, {
          ...rc, customer_name: rc.name,
          outstanding_balance: rc.outstanding_balance || 0,
          total_credit_sales: rc.total_credit_sales || 0,
          total_collected: rc.total_collected || 0,
          overdue_count: 0, source: 'registered',
        });
      }
    });
    return Array.from(map.values());
  }, [customerSummary, registeredCustomers, activeRestaurantId]);

  // ── Filtered customers ────────────────────────────────────────────────
  const filteredCustomers = useMemo(() => {
    let list = mergedCustomers;
    // Filter by selected branch (from UI filter, not form)
    if (filterBranch !== 'all') list = list.filter(c => c.branch === filterBranch);
    // Apply status filters
    if (filterStatus === 'vip') list = list.filter(c => c.vip_tier && c.vip_tier !== 'standard');
    else if (filterStatus === 'outstanding') list = list.filter(c => Number(c.outstanding_balance) > 0);
    else if (filterStatus === 'overdue') list = list.filter(c => c.overdue_count > 0);
    else if (filterStatus === 'active') list = list.filter(c => c.is_active !== false);
    else if (filterStatus === 'inactive') list = list.filter(c => c.is_active === false);
    // Search filter
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        (c.customer_name || c.name || '').toLowerCase().includes(q) ||
        (c.phone || c.customer_phone || '').includes(q)
      );
    }
    return list.sort((a, b) => Number(b.outstanding_balance || 0) - Number(a.outstanding_balance || 0));
  }, [mergedCustomers, filterBranch, filterStatus, search]);

  // ── Dashboard KPIs ────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const totalOutstanding = mergedCustomers.reduce((s, c) => s + Number(c.outstanding_balance || 0), 0);
    const totalCreditSales = mergedCustomers.reduce((s, c) => s + Number(c.total_credit_sales || 0), 0);
    const totalCollected = mergedCustomers.reduce((s, c) => s + Number(c.total_collected || 0), 0);
    const customersWithDebt = mergedCustomers.filter(c => Number(c.outstanding_balance) > 0).length;
    const overdueCustomers = mergedCustomers.filter(c => c.overdue_count > 0).length;
    const vipCustomers = mergedCustomers.filter(c => c.vip_tier && c.vip_tier !== 'standard').length;
    const collectionRate = totalCreditSales > 0 ? ((totalCollected / totalCreditSales) * 100).toFixed(1) : 0;
    const dashTotals = collectionDash.reduce((acc, row) => ({
      today: acc.today + Number(row.collected_today || 0),
      week:  acc.week  + Number(row.collected_this_week || 0),
      month: acc.month + Number(row.collected_this_month || 0),
    }), { today: 0, week: 0, month: 0 });
    return { totalOutstanding, totalCreditSales, totalCollected, customersWithDebt, overdueCustomers, vipCustomers, collectionRate, ...dashTotals, totalCustomers: mergedCustomers.length };
  }, [mergedCustomers, collectionDash]);

  // ── Aging totals ──────────────────────────────────────────────────────
  const agingTotals = useMemo(() => agingData.reduce((acc, row) => ({
    b0_30:   acc.b0_30   + Number(row.bucket_0_30   || 0),
    b31_60:  acc.b31_60  + Number(row.bucket_31_60  || 0),
    b61_90:  acc.b61_90  + Number(row.bucket_61_90  || 0),
    bOver90: acc.bOver90 + Number(row.bucket_over_90 || 0),
    total:   acc.total   + Number(row.total_outstanding || 0),
  }), { b0_30: 0, b31_60: 0, b61_90: 0, bOver90: 0, total: 0 }), [agingData]);

  // ── Ranked customers ──────────────────────────────────────────────────
  const rankedCustomers = useMemo(() =>
    [...mergedCustomers].sort((a, b) => Number(b.total_credit_sales || 0) - Number(a.total_credit_sales || 0)).slice(0, 20),
    [mergedCustomers]
  );

  // ── Selected customer data ────────────────────────────────────────────
  const selectedDebts = useMemo(() => {
    if (!selectedCustomer?.id) return [];
    return debtRecords.filter((debt) => String(debt.customer_id) === String(selectedCustomer.id));
  }, [selectedCustomer, debtRecords]);

  const selectedCollections = useMemo(() => {
    if (!selectedCustomer?.id) return [];
    return collections.filter((collection) => String(collection.customer_id) === String(selectedCustomer.id));
  }, [selectedCustomer, collections]);

  // ── Mutations ─────────────────────────────────────────────────────────

  const saveCustomerMutation = useMutation({
    mutationFn: async (form) => {
      const { data: { user } } = await supabase.auth.getUser();
      const selectedBranchId = form.branch_id || (branches.find(b => b.key === form.branch)?.id);
      
      if (editingCustomer?.id) {
        const { data, error } = await supabase.from('customers')
          .update({ 
            ...form, 
            branch_id: selectedBranchId,
            updated_date: new Date().toISOString() 
          })
          .eq('id', editingCustomer.id).select().single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase.from('customers').insert({
          ...form,
          restaurant_id: activeRestaurantId,
          branch_id: selectedBranchId,
          created_by: user?.email || '',
          created_date: new Date().toISOString(),
          updated_date: new Date().toISOString(),
        }).select().single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      toast.success(t('customer_saved'));
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['v_customer_summary'] });
      qc.invalidateQueries({ queryKey: ['customers_form'] });
      setShowCustomerForm(false); setEditingCustomer(null); setCustomerForm(emptyCustomerForm);
      refetchCustomers();
      refetchSummary();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteCustomerMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('customer_deleted'));
      qc.invalidateQueries({ queryKey: ['customers'] });
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const addCreditSaleMutation = useMutation({
    mutationFn: async (form) => {
      const branch = form.branch || managerBranch || '';
      const branchId = branches.find((candidate) => candidate.key === branch || candidate.branch_key === branch)?.id || null;
      if (!activeRestaurantId || !branchId) {
        throw new Error('An active organization and branch are required to save a credit sale.');
      }
      return createCustomerReceivable({
        customerId: form.customer_id,
        branchId,
        branch,
        totalAmount: form.total_amount,
        paidAmount: form.paid_amount,
        date: form.date,
        dueDate: form.due_date,
        invoiceNumber: form.invoice_number,
        description: 'Manual customer credit sale',
        notes: form.notes,
        requestId: creditSaleRequestId.current || (creditSaleRequestId.current = newReceivableRequestId()),
      });
    },
    onSuccess: () => {
      toast.success(t('credit_sale_saved'));
      invalidateCustomerReceivableQueries(qc);
      qc.invalidateQueries({ queryKey: ['v_collection_dashboard'] });
      creditSaleRequestId.current = null;
      setShowCreditSaleForm(false); setCreditSaleForm(emptyCreditSaleForm);
    },
    onError: (error) => toast.error(customerDebtPaymentErrorMessage(error)),
  });

  const addCollectionMutation = useMutation({
    mutationFn: async (form) => recordCustomerDebtPayment({
      debtId: form.debt_id,
      amount: form.amount,
      date: form.date,
      paymentMethod: form.payment_method,
      notes: form.notes,
      requestId: collectionRequestId.current || (collectionRequestId.current = newReceivableRequestId()),
    }),
    onSuccess: () => {
      toast.success(t('collection_saved'));
      invalidateCustomerReceivableQueries(qc);
      qc.invalidateQueries({ queryKey: ['v_collection_dashboard'] });
      collectionRequestId.current = null;
      setShowCollectionForm(false); setCollectionForm(emptyCollectionForm);
    },
    onError: (error) => toast.error(customerDebtPaymentErrorMessage(error)),
  });

  const addNoteMutation = useMutation({
    mutationFn: async (form) => {
      const { data: { user } } = await supabase.auth.getUser();
      const name = selectedCustomer?.customer_name || selectedCustomer?.name;
      const { data, error } = await supabase.from('customer_notes').insert({
        customer_name: name, customer_id: selectedCustomer?.id || null,
        branch: selectedCustomer?.branch || '', note: form.note, note_type: form.note_type,
        created_by: user?.email || '',
        created_date: new Date().toISOString(),
        updated_date: new Date().toISOString(),
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(t('note_saved'));
      qc.invalidateQueries({ queryKey: ['customer_notes'] });
      refetchNotes();
      setShowNoteForm(false); setNoteForm(emptyNoteForm);
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleEditCustomer = useCallback((c) => {
    setEditingCustomer(c);
    setCustomerForm({
      name: c.name || c.customer_name || '', phone: c.phone || c.customer_phone || '',
      email: c.email || '', address: c.address || '',
      vip_tier: c.vip_tier || 'standard', credit_limit: c.credit_limit || '',
      notes: c.notes || '', is_active: c.is_active !== false,
      branch_id: c.branch_id || '', branch: c.branch || '',
    });
    setShowCustomerForm(true);
  }, []);

  const handleSelectCustomer = useCallback((c) => {
    setSelectedCustomer(c);
    setDetailTab('ledger');
    setCollectionForm(f => ({ ...f, customer_name: c.customer_name || c.name || '', branch: c.branch || '' }));
    setCreditSaleForm(f => ({ ...f, party_name: c.customer_name || c.name || '', party_phone: c.phone || c.customer_phone || '', branch: c.branch || '' }));
  }, []);

  const handlePrintStatement = useCallback(() => {
    if (!selectedCustomer) return;
    const name = selectedCustomer.customer_name || selectedCustomer.name;
    const rtl = dir === 'rtl';
    const locale = lang === 'fa' ? 'fa-IR' : lang === 'ar' ? 'ar-SA' : 'en-US';
    const escapeHTML = (value) => String(value ?? '—').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    const label = (value) => translateLiteral(value);
    const win = window.open('', '_blank', 'noopener');
    if (!win) return;
    const rows = selectedDebts.map((debt) => `<tr><td>${escapeHTML(fmtDate(debt.date))}</td><td>${escapeHTML(debt.invoice_number || '—')}</td><td dir="ltr">${escapeHTML(fmt(debt.total_amount, currency))}</td><td dir="ltr">${escapeHTML(fmt(debt.paid_amount, currency))}</td><td dir="ltr">${escapeHTML(fmt(debt.remaining_amount, currency))}</td><td>${escapeHTML(translateLabel(debt.status, debt.status || '—'))}</td></tr>`).join('');
    const collectionRows = selectedCollections.map((collection) => `<tr><td>${escapeHTML(fmtDate(collection.date))}</td><td dir="ltr">${escapeHTML(fmt(collection.amount, currency))}</td><td>${escapeHTML(translateLabel(collection.payment_method, collection.payment_method || '—'))}</td><td>${escapeHTML(collection.notes || '—')}</td></tr>`).join('');
    const title = `${label('Customer Statement')} — ${name}`;
    win.document.write(`<!doctype html><html dir="${rtl ? 'rtl' : 'ltr'}" lang="${lang}"><head><meta charset="UTF-8"><link href="https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;700&family=Vazirmatn:wght@400;600;700&display=swap" rel="stylesheet"><title>${escapeHTML(title)}</title><style>body{font-family:${rtl ? "'Vazirmatn','Noto Naskh Arabic',Tahoma,sans-serif" : 'Arial,sans-serif'};padding:20px;direction:${rtl ? 'rtl' : 'ltr'};color:#111827}table{width:100%;border-collapse:collapse;margin-bottom:20px}th,td{border:1px solid #ccc;padding:6px 10px;font-size:12px;text-align:${rtl ? 'right' : 'left'}}th{background:#f5f5f5}h2{margin-bottom:4px}p{margin:2px 0;font-size:12px}</style></head><body><h2>${escapeHTML(title)}</h2><p>${escapeHTML(label('Phone'))}: ${escapeHTML(selectedCustomer.phone || selectedCustomer.customer_phone || '—')}</p><p>${escapeHTML(label('Generated'))}: ${escapeHTML(new Date().toLocaleString(locale))}</p><hr/><h3>${escapeHTML(label('Credit Sales'))}</h3><table><thead><tr><th>${escapeHTML(label('Date'))}</th><th>${escapeHTML(label('Invoice'))}</th><th>${escapeHTML(label('Amount'))}</th><th>${escapeHTML(label('Paid'))}</th><th>${escapeHTML(label('Remaining'))}</th><th>${escapeHTML(label('Status'))}</th></tr></thead><tbody>${rows}</tbody></table><h3>${escapeHTML(label('Collections'))}</h3><table><thead><tr><th>${escapeHTML(label('Date'))}</th><th>${escapeHTML(label('Amount'))}</th><th>${escapeHTML(label('Method'))}</th><th>${escapeHTML(label('Notes'))}</th></tr></thead><tbody>${collectionRows}</tbody></table><p><strong>${escapeHTML(label('Total Outstanding'))}: <span dir="ltr">${escapeHTML(fmt(selectedCustomer.outstanding_balance, currency))}</span></strong></p></body></html>`);
    win.document.close();
    win.print();
  }, [selectedCustomer, selectedDebts, selectedCollections, currency, dir, lang, translateLabel, translateLiteral]);

  const loading = loadingSummary || loadingCustomers;

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <PageHeader
        title={t('customer_management')}
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { refetchSummary(); refetchCustomers(); }}>
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button size="sm" onClick={() => { setEditingCustomer(null); setCustomerForm(emptyCustomerForm); setShowCustomerForm(true); }}>
              <Plus className="w-4 h-4 mr-1" />{t('add_customer')}
            </Button>
          </div>
        }
      />

      {/* Main Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:grid-cols-5">
          <TabsTrigger value="dashboard" className="min-h-10 whitespace-normal px-2 py-2 text-center text-xs leading-tight sm:min-h-9 sm:whitespace-nowrap">{t('collection_dashboard')}</TabsTrigger>
          <TabsTrigger value="customers" className="min-h-10 whitespace-normal px-2 py-2 text-center text-xs leading-tight sm:min-h-9 sm:whitespace-nowrap">{t('customer_profiles')}</TabsTrigger>
          <TabsTrigger value="ranking" className="min-h-10 whitespace-normal px-2 py-2 text-center text-xs leading-tight sm:min-h-9 sm:whitespace-nowrap">{t('customer_ranking')}</TabsTrigger>
          <TabsTrigger value="aging" className="min-h-10 whitespace-normal px-2 py-2 text-center text-xs leading-tight sm:min-h-9 sm:whitespace-nowrap">{t('aging_report')}</TabsTrigger>
          <TabsTrigger value="vip" className="col-span-2 min-h-10 whitespace-normal px-2 py-2 text-center text-xs leading-tight sm:col-span-1 sm:min-h-9 sm:whitespace-nowrap">{t('vip_customers')}</TabsTrigger>
        </TabsList>

        {/* ── DASHBOARD ── */}
        <TabsContent value="dashboard" className="space-y-4 mt-3">
          <div className="grid grid-cols-2 gap-3">
            <KpiCard icon={DollarSign}    label={t('collected_today')}      value={fmt(kpis.today, currency)}   color="green"  loading={loadingDash} />
            <KpiCard icon={TrendingUp}    label={t('collected_this_week')}  value={fmt(kpis.week, currency)}    color="blue"   loading={loadingDash} />
            <KpiCard icon={Calendar}      label={t('collected_this_month')} value={fmt(kpis.month, currency)}   color="purple" loading={loadingDash} />
            <KpiCard icon={Activity}      label={t('collection_rate')}      value={`${kpis.collectionRate}%`}   color="amber"  loading={loading} />
          </div>
          <Separator />
          <div className="grid grid-cols-2 gap-3">
            <KpiCard icon={AlertTriangle} label={t('total_receivables')}    value={fmt(kpis.totalOutstanding, currency)} color="red"    loading={loading} />
            <KpiCard icon={Users}         label={t('customers_with_debt')}  value={kpis.customersWithDebt}              color="amber"  loading={loading} />
            <KpiCard icon={Shield}        label={t('filter_overdue')}       value={kpis.overdueCustomers}               color="red"    loading={loading} />
            <KpiCard icon={Crown}         label={t('vip_customers')}        value={kpis.vipCustomers}                   color="purple" loading={loading} />
          </div>
          <Separator />
          <div className="grid grid-cols-2 gap-2">
            <Button className="h-12 flex-col gap-1" variant="outline" onClick={() => setShowCreditSaleForm(true)}>
              <CreditCard className="w-4 h-4" />
              <span className="text-xs">{t('add_credit_sale')}</span>
            </Button>
            <Button className="h-12 flex-col gap-1" variant="outline" onClick={() => setShowCollectionForm(true)}>
              <Wallet className="w-4 h-4" />
              <span className="text-xs">{t('add_collection')}</span>
            </Button>
          </div>
          <Card>
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm">{t('collection_history')}</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-2">
              {loadingCollections ? (
                Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
              ) : collections.slice(0, 10).length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">{t('no_credit_sales')}</p>
              ) : (
                collections.slice(0, 10).map(c => (
                  <div key={c.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium">{c.customer_name}</p>
                      <p className="text-xs text-muted-foreground">{fmtDate(c.date)} · {c.payment_method} · {c.branch}</p>
                    </div>
                    <span className="text-sm font-bold text-emerald-600">{fmt(c.amount, currency)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── CUSTOMERS ── */}
        <TabsContent value="customers" className="space-y-3 mt-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9 h-9 text-sm" placeholder={`${t('search')}...`} value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-32 h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('filter_all')}</SelectItem>
                <SelectItem value="outstanding">{t('filter_outstanding')}</SelectItem>
                <SelectItem value="overdue">{t('filter_overdue')}</SelectItem>
                <SelectItem value="vip">{t('filter_vip')}</SelectItem>
                <SelectItem value="active">{t('filter_active')}</SelectItem>
                <SelectItem value="inactive">{t('filter_inactive')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <BranchSelect value={filterBranch} onChange={setFilterBranch} includeAll />
          <p className="text-xs text-muted-foreground">{filteredCustomers.length} {t('customers_with_debt')}</p>
          {loading ? (
            Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)
          ) : filteredCustomers.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">{t('no_customers')}</p>
              <Button size="sm" className="mt-3" onClick={() => { setEditingCustomer(null); setCustomerForm(emptyCustomerForm); setShowCustomerForm(true); }}>
                <Plus className="w-4 h-4 mr-1" />{t('add_customer')}
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filteredCustomers.map((c, i) => (
                <CustomerCard key={c.id || c.customer_name || i} customer={c} onSelect={handleSelectCustomer} onEdit={handleEditCustomer} onDelete={setDeleteTarget} currency={currency} t={t} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── RANKING ── */}
        <TabsContent value="ranking" className="space-y-3 mt-3">
          <Card>
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-500" />{t('top_customers')}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              {loading ? (
                Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full mb-2" />)
              ) : rankedCustomers.map((c, i) => {
                const outstanding = Number(c.outstanding_balance || 0);
                return (
                  <div key={c.customer_name || i} className="flex items-center gap-3 py-2 border-b last:border-0 cursor-pointer hover:bg-muted/30 rounded px-1" onClick={() => { handleSelectCustomer(c); setTab('customers'); }}>
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-slate-100 text-slate-700' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.customer_name || c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.credit_sale_count || 0} sales · {c.branch}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-bold text-blue-600">{fmt(c.total_credit_sales, currency)}</p>
                      {outstanding > 0 && <p className="text-xs text-red-600">{fmt(outstanding, currency)} due</p>}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── AGING ── */}
        <TabsContent value="aging" className="space-y-3 mt-3">
          <div className="grid grid-cols-2 gap-3">
            <Card className="border-0 shadow-sm"><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">{t('bucket_0_30')}</p><p className="text-lg font-bold text-blue-600">{fmt(agingTotals.b0_30, currency)}</p></CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">{t('bucket_31_60')}</p><p className="text-lg font-bold text-amber-600">{fmt(agingTotals.b31_60, currency)}</p></CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">{t('bucket_61_90')}</p><p className="text-lg font-bold text-orange-600">{fmt(agingTotals.b61_90, currency)}</p></CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">{t('bucket_over_90')}</p><p className="text-lg font-bold text-red-600">{fmt(agingTotals.bOver90, currency)}</p></CardContent></Card>
          </div>
          <Card>
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm">{t('aging_report')} — {t('total_receivables')}: {fmt(agingTotals.total, currency)}</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              {loadingAging ? (
                Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full mb-2" />)
              ) : agingData.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">{t('no_data')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 font-medium text-muted-foreground">{t('customer_name')}</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">{t('bucket_0_30')}</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">{t('bucket_31_60')}</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">{t('bucket_61_90')}</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">{t('bucket_over_90')}</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">{t('total')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agingData.map((row, i) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="py-2 font-medium">{row.customer_name}</td>
                          <td className="py-2 text-right text-blue-600">{fmt(row.bucket_0_30, currency)}</td>
                          <td className="py-2 text-right text-amber-600">{fmt(row.bucket_31_60, currency)}</td>
                          <td className="py-2 text-right text-orange-600">{fmt(row.bucket_61_90, currency)}</td>
                          <td className="py-2 text-right text-red-600">{fmt(row.bucket_over_90, currency)}</td>
                          <td className="py-2 text-right font-bold">{fmt(row.total_outstanding, currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── VIP ── */}
        <TabsContent value="vip" className="space-y-3 mt-3">
          {['vip', 'platinum', 'gold', 'silver'].map(tier => {
            const tierCustomers = mergedCustomers.filter(c => c.vip_tier === tier);
            if (tierCustomers.length === 0) return null;
            return (
              <div key={tier}>
                <div className="flex items-center gap-2 mb-2">
                  <Crown className={`w-4 h-4 ${tier === 'vip' ? 'text-rose-500' : tier === 'platinum' ? 'text-purple-500' : tier === 'gold' ? 'text-amber-500' : 'text-slate-400'}`} />
                  <h3 className="text-sm font-semibold">{tier.toUpperCase()} ({tierCustomers.length})</h3>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {tierCustomers.map((c, i) => (
                    <Card key={i} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleSelectCustomer(c)}>
                      <CardContent className="p-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${VIP_COLORS[tier]}`}>
                            {(c.customer_name || c.name || '?').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{c.customer_name || c.name}</p>
                            <p className="text-xs text-muted-foreground">{c.phone || c.customer_phone}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-blue-600">{fmt(c.total_credit_sales, currency)}</p>
                          <p className="text-xs text-muted-foreground">{fmtDate(c.last_transaction_date)}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
          {mergedCustomers.filter(c => c.vip_tier && c.vip_tier !== 'standard').length === 0 && (
            <div className="text-center py-12">
              <Crown className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">{t('no_customers')}</p>
              <p className="text-xs text-muted-foreground mt-1">Edit a customer to assign a VIP tier</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── CUSTOMER DETAIL FULLSCREEN ── */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
          <div className="max-w-2xl mx-auto p-4 pb-24">
            <div className="flex items-center gap-3 mb-4">
              <Button size="sm" variant="ghost" onClick={() => setSelectedCustomer(null)}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="flex-1">
                <h2 className="text-lg font-bold">{selectedCustomer.customer_name || selectedCustomer.name}</h2>
                <p className="text-xs text-muted-foreground">{selectedCustomer.phone || selectedCustomer.customer_phone}</p>
              </div>
              <Badge className={VIP_COLORS[selectedCustomer.vip_tier || 'standard']}>
                {(selectedCustomer.vip_tier || 'standard').toUpperCase()}
              </Badge>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4">
              <Card className="border-0 shadow-sm"><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">{t('total_credit_sales')}</p><p className="text-sm font-bold text-blue-600">{fmt(selectedCustomer.total_credit_sales, currency)}</p></CardContent></Card>
              <Card className="border-0 shadow-sm"><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">{t('total_collected')}</p><p className="text-sm font-bold text-emerald-600">{fmt(selectedCustomer.total_collected, currency)}</p></CardContent></Card>
              <Card className="border-0 shadow-sm"><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">{t('outstanding_balance')}</p><p className={`text-sm font-bold ${Number(selectedCustomer.outstanding_balance) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmt(selectedCustomer.outstanding_balance, currency)}</p></CardContent></Card>
            </div>

            <div className="flex gap-2 mb-4">
              <Button size="sm" className="flex-1" onClick={() => setShowCreditSaleForm(true)}>
                <CreditCard className="w-4 h-4 mr-1" />{t('add_credit_sale')}
              </Button>
              <Button size="sm" variant="outline" className="flex-1" onClick={() => setShowCollectionForm(true)}>
                <Wallet className="w-4 h-4 mr-1" />{t('add_collection')}
              </Button>
              <Button size="sm" variant="outline" onClick={handlePrintStatement}>
                <Printer className="w-4 h-4" />
              </Button>
            </div>

            <Tabs value={detailTab} onValueChange={setDetailTab}>
              <TabsList className="w-full grid grid-cols-4 h-8 text-xs mb-3">
                <TabsTrigger value="ledger" className="text-xs">{t('customer_ledger')}</TabsTrigger>
                <TabsTrigger value="collections" className="text-xs">{t('collection_history')}</TabsTrigger>
                <TabsTrigger value="notes" className="text-xs">{t('customer_notes')}</TabsTrigger>
                <TabsTrigger value="statement" className="text-xs">{t('customer_statement')}</TabsTrigger>
              </TabsList>

              <TabsContent value="ledger" className="space-y-2">
                {loadingDebts ? (
                  Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
                ) : selectedDebts.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">{t('no_credit_sales')}</p>
                ) : (
                  selectedDebts.map(d => (
                    <Card key={d.id} className="border shadow-sm">
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-medium">{d.invoice_number || '—'}</p>
                            <p className="text-xs text-muted-foreground">{fmtDate(d.date)}{d.due_date ? ` · Due: ${fmtDate(d.due_date)}` : ''}</p>
                          </div>
                          <Badge className={`text-xs ${STATUS_COLORS[d.status] || 'bg-gray-100 text-gray-600'}`}>{d.status}</Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-2 text-center">
                          <div><p className="text-xs text-muted-foreground">{t('amount')}</p><p className="text-xs font-semibold">{fmt(d.total_amount, currency)}</p></div>
                          <div><p className="text-xs text-muted-foreground">{t('paid_amount')}</p><p className="text-xs font-semibold text-emerald-600">{fmt(d.paid_amount, currency)}</p></div>
                          <div><p className="text-xs text-muted-foreground">{t('remaining')}</p><p className={`text-xs font-bold ${Number(d.remaining_amount) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmt(d.remaining_amount, currency)}</p></div>
                        </div>
                        {d.notes && <p className="text-xs text-muted-foreground mt-2">{d.notes}</p>}
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>

              <TabsContent value="collections" className="space-y-2">
                {loadingCollections ? (
                  Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
                ) : selectedCollections.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">{t('no_credit_sales')}</p>
                ) : (
                  selectedCollections.map(c => (
                    <Card key={c.id} className="border shadow-sm">
                      <CardContent className="p-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-emerald-600">{fmt(c.amount, currency)}</p>
                          <p className="text-xs text-muted-foreground">{fmtDate(c.date)} · {c.payment_method}</p>
                          {c.notes && <p className="text-xs text-muted-foreground">{c.notes}</p>}
                        </div>
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>

              <TabsContent value="notes" className="space-y-2">
                <Button size="sm" variant="outline" className="w-full" onClick={() => setShowNoteForm(true)}>
                  <Plus className="w-4 h-4 mr-1" />{t('add_note')}
                </Button>
                {loadingNotes ? (
                  Array(2).fill(0).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
                ) : customerNotes.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">{t('no_notes')}</p>
                ) : (
                  customerNotes.map(n => (
                    <Card key={n.id} className="border shadow-sm">
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <Badge className={`text-xs ${NOTE_COLORS[n.note_type] || 'bg-gray-100 text-gray-600'}`}>{n.note_type}</Badge>
                          <span className="text-xs text-muted-foreground">{fmtDate(n.created_date)}</span>
                        </div>
                        <p className="text-sm mt-2">{n.note}</p>
                        <p className="text-xs text-muted-foreground mt-1">{n.created_by}</p>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>

              <TabsContent value="statement" className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{t('customer_statement')}</h3>
                  <Button size="sm" variant="outline" onClick={handlePrintStatement}>
                    <Printer className="w-4 h-4 mr-1" />{t('print_statement')}
                  </Button>
                </div>
                <Card>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t('customer_name')}</span><span className="font-medium">{selectedCustomer.customer_name || selectedCustomer.name}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t('phone')}</span><span>{selectedCustomer.phone || selectedCustomer.customer_phone || '—'}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t('last_transaction')}</span><span>{fmtDate(selectedCustomer.last_transaction_date)}</span></div>
                    <Separator />
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t('total_credit_sales')}</span><span className="font-bold text-blue-600">{fmt(selectedCustomer.total_credit_sales, currency)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t('total_collected')}</span><span className="font-bold text-emerald-600">{fmt(selectedCustomer.total_collected, currency)}</span></div>
                    <div className="flex justify-between text-sm border-t pt-2"><span className="font-semibold">{t('outstanding_balance')}</span><span className={`font-bold text-lg ${Number(selectedCustomer.outstanding_balance) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmt(selectedCustomer.outstanding_balance, currency)}</span></div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}

      {/* ── CUSTOMER FORM ── */}
      <Dialog open={showCustomerForm} onOpenChange={setShowCustomerForm}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editingCustomer ? t('edit_customer') : t('add_customer')}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">{t('customer_name')} *</Label><Input value={customerForm.name} onChange={e => setCustomerForm(f => ({ ...f, name: e.target.value }))} className="h-9 mt-1" /></div>
            <div><Label className="text-xs">{t('phone')}</Label><Input value={customerForm.phone} onChange={e => setCustomerForm(f => ({ ...f, phone: e.target.value }))} className="h-9 mt-1" /></div>
            <div><Label className="text-xs">{t('email')}</Label><Input type="email" value={customerForm.email} onChange={e => setCustomerForm(f => ({ ...f, email: e.target.value }))} className="h-9 mt-1" /></div>
            <div><Label className="text-xs">{t('address')}</Label><Input value={customerForm.address} onChange={e => setCustomerForm(f => ({ ...f, address: e.target.value }))} className="h-9 mt-1" /></div>
            <div>
              <Label className="text-xs">{t('branch')} *</Label>
              <Select value={customerForm.branch} onValueChange={v => setCustomerForm(f => ({ ...f, branch: v }))}>
                <SelectTrigger className="h-9 mt-1 text-xs"><SelectValue placeholder={t('branch')} /></SelectTrigger>
                <SelectContent>
                  {branches.map(b => <SelectItem key={b.key} value={b.key}>{b.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">{t('vip_tier')}</Label>
                <Select value={customerForm.vip_tier} onValueChange={v => setCustomerForm(f => ({ ...f, vip_tier: v }))}>
                  <SelectTrigger className="h-9 mt-1 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
  {VIP_TIERS.map(tier => (
    <SelectItem key={tier} value={tier}>
      {tier.toUpperCase()}
    </SelectItem>
  ))}
</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">{t('credit_limit')}</Label><Input type="number" value={customerForm.credit_limit} onChange={e => setCustomerForm(f => ({ ...f, credit_limit: e.target.value }))} className="h-9 mt-1" placeholder="0" /></div>
            </div>
            <div><Label className="text-xs">{t('notes')}</Label><Textarea value={customerForm.notes} onChange={e => setCustomerForm(f => ({ ...f, notes: e.target.value }))} className="mt-1 text-sm" rows={2} /></div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowCustomerForm(false)}>{t('cancel')}</Button>
              <Button className="flex-1" onClick={() => saveCustomerMutation.mutate(customerForm)} disabled={!customerForm.name || !customerForm.branch || saveCustomerMutation.isPending}>
                {saveCustomerMutation.isPending ? t('loading') : t('save')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── CREDIT SALE FORM ── */}
      <Dialog open={showCreditSaleForm} onOpenChange={setShowCreditSaleForm}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t('add_credit_sale')}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">{t('customer_name')} *</Label>
              <Select value={creditSaleForm.customer_id || '__none__'} onValueChange={(customerId) => {
                const customer = registeredCustomers.find((candidate) => String(candidate.id) === String(customerId));
                setCreditSaleForm((current) => ({
                  ...current,
                  customer_id: customer?.id || '',
                  party_name: customer?.name || '',
                  party_phone: customer?.phone || '',
                  branch: customer?.branch || current.branch,
                }));
              }}>
                <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Select active customer" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— {t('filter_all')} —</SelectItem>
                  {registeredCustomers.filter((customer) => customer.is_active !== false && (!activeRestaurantId || customer.restaurant_id === activeRestaurantId) && (!creditSaleForm.branch || customer.branch === creditSaleForm.branch)).map((customer) => <SelectItem key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">{t('phone')}</Label><Input value={creditSaleForm.party_phone} readOnly className="h-9 mt-1 bg-muted/40" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">{t('invoice_number')}</Label><Input value={creditSaleForm.invoice_number} onChange={e => setCreditSaleForm(f => ({ ...f, invoice_number: e.target.value }))} className="h-9 mt-1" /></div>
              <div><Label className="text-xs">{t('sale_date')} *</Label><Input type="date" value={creditSaleForm.date} onChange={e => setCreditSaleForm(f => ({ ...f, date: e.target.value }))} className="h-9 mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">{t('amount')} *</Label><Input type="number" value={creditSaleForm.total_amount} onChange={e => setCreditSaleForm(f => ({ ...f, total_amount: e.target.value }))} className="h-9 mt-1" placeholder="0" /></div>
              <div><Label className="text-xs">{t('paid_amount')}</Label><Input type="number" value={creditSaleForm.paid_amount} onChange={e => setCreditSaleForm(f => ({ ...f, paid_amount: e.target.value }))} className="h-9 mt-1" placeholder="0" /></div>
            </div>
            <div><Label className="text-xs">{t('due_date')}</Label><Input type="date" value={creditSaleForm.due_date} onChange={e => setCreditSaleForm(f => ({ ...f, due_date: e.target.value }))} className="h-9 mt-1" /></div>
            <div><Label className="text-xs">{t('branch')}</Label><BranchSelect value={creditSaleForm.branch || 'all'} onChange={v => setCreditSaleForm(f => ({ ...f, branch: v === 'all' ? '' : v }))} includeAll /></div>
            <div><Label className="text-xs">{t('notes')}</Label><Textarea value={creditSaleForm.notes} onChange={e => setCreditSaleForm(f => ({ ...f, notes: e.target.value }))} className="mt-1 text-sm" rows={2} /></div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowCreditSaleForm(false)}>{t('cancel')}</Button>
              <Button className="flex-1" onClick={() => addCreditSaleMutation.mutate(creditSaleForm)} disabled={!creditSaleForm.customer_id || !creditSaleForm.total_amount || addCreditSaleMutation.isPending}>
                {addCreditSaleMutation.isPending ? t('loading') : t('save')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── COLLECTION FORM ── */}
      <Dialog open={showCollectionForm} onOpenChange={setShowCollectionForm}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t('add_collection')}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">{t('customer_name')} *</Label>
              <Select value={collectionForm.customer_id || '__none__'} onValueChange={(customerId) => {
                const customer = registeredCustomers.find((candidate) => String(candidate.id) === String(customerId));
                setCollectionForm((current) => ({
                  ...current,
                  customer_id: customer?.id || '',
                  customer_name: customer?.name || '',
                  debt_id: '',
                  branch: customer?.branch || current.branch,
                }));
              }}>
                <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Select active customer" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— {t('filter_all')} —</SelectItem>
                  {registeredCustomers.filter((customer) => customer.is_active !== false && (!activeRestaurantId || customer.restaurant_id === activeRestaurantId) && (!collectionForm.branch || customer.branch === collectionForm.branch)).map((customer) => <SelectItem key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {collectionForm.customer_id && (
              <div>
                <Label className="text-xs">{t('credit_sales')} (link)</Label>
                <Select value={collectionForm.debt_id || "__none__"} onValueChange={v => setCollectionForm(f => ({ ...f, debt_id: v === "__none__" ? "" : v }))}>
                  <SelectTrigger className="h-9 mt-1 text-xs"><SelectValue placeholder="Select open debt (optional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— {t('filter_all')} —</SelectItem>
                    {debtRecords.filter(d => 
                      String(d.customer_id) === String(collectionForm.customer_id) &&
                      ['open','partial','overdue'].includes(d.status) &&
                      (!activeRestaurantId || d.restaurant_id === activeRestaurantId) &&
                      (!collectionForm.branch || d.branch === collectionForm.branch)
                    ).map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.invoice_number || d.date} — {fmt(d.remaining_amount, currency)} due</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">{t('amount')} *</Label><Input type="number" value={collectionForm.amount} onChange={e => setCollectionForm(f => ({ ...f, amount: e.target.value }))} className="h-9 mt-1" placeholder="0" /></div>
              <div><Label className="text-xs">{t('date')}</Label><Input type="date" value={collectionForm.date} onChange={e => setCollectionForm(f => ({ ...f, date: e.target.value }))} className="h-9 mt-1" /></div>
            </div>
            <div>
              <Label className="text-xs">{t('payment_method')}</Label>
              <Select value={collectionForm.payment_method} onValueChange={v => setCollectionForm(f => ({ ...f, payment_method: v }))}>
                <SelectTrigger className="h-9 mt-1 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{t(m) || m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">{t('branch')}</Label><BranchSelect value={collectionForm.branch || 'all'} onChange={v => setCollectionForm(f => ({ ...f, branch: v === 'all' ? '' : v }))} includeAll /></div>
            <div><Label className="text-xs">{t('notes')}</Label><Textarea value={collectionForm.notes} onChange={e => setCollectionForm(f => ({ ...f, notes: e.target.value }))} className="mt-1 text-sm" rows={2} /></div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowCollectionForm(false)}>{t('cancel')}</Button>
              <Button className="flex-1" onClick={() => addCollectionMutation.mutate(collectionForm)} disabled={!collectionForm.customer_id || !collectionForm.debt_id || !collectionForm.amount || addCollectionMutation.isPending}>
                {addCollectionMutation.isPending ? t('loading') : t('save')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── NOTE FORM ── */}
      <Dialog open={showNoteForm} onOpenChange={setShowNoteForm}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t('add_note')}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">{t('note_type')}</Label>
              <Select value={noteForm.note_type} onValueChange={v => setNoteForm(f => ({ ...f, note_type: v }))}>
                <SelectTrigger className="h-9 mt-1 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{NOTE_TYPES.map(nt => <SelectItem key={nt} value={nt}>{t(`note_${nt}`) || nt}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">{t('notes')} *</Label><Textarea value={noteForm.note} onChange={e => setNoteForm(f => ({ ...f, note: e.target.value }))} className="mt-1 text-sm" rows={4} placeholder="Enter note..." /></div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowNoteForm(false)}>{t('cancel')}</Button>
              <Button className="flex-1" onClick={() => addNoteMutation.mutate(noteForm)} disabled={!noteForm.note || addNoteMutation.isPending}>
                {addNoteMutation.isPending ? t('loading') : t('save')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── DELETE CONFIRM ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t('confirm_delete_customer')}</AlertDialogTitle></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteTarget?.id && deleteCustomerMutation.mutate(deleteTarget.id)}>
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
