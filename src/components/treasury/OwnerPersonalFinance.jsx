/**
 * OwnerPersonalFinance
 * Owner-only personal finance module — completely separated from restaurant operations.
 * Tracks personal income, expenses, and business treasury withdrawals.
 */
import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { formatCurrency } from '@/lib/helpers';
import { createNotification } from '@/lib/notificationEngine';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { format } from 'date-fns';
import { ArrowDownLeft, ArrowUpRight, Wallet,
  Camera, ZoomIn, Loader2, Trash2, ShieldCheck, AlertTriangle
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, CartesianGrid
} from 'recharts';

const CATEGORIES = [
  { value: 'family',           label: 'Family',           color: '#f59e0b' },
  { value: 'travel',           label: 'Travel',           color: '#3b82f6' },
  { value: 'transfers',        label: 'Transfers / Remittance', color: '#8b5cf6' },
  { value: 'vehicles',         label: 'Vehicles',         color: '#6366f1' },
  { value: 'investments',      label: 'Investments',      color: '#10b981' },
  { value: 'loans',            label: 'Loans',            color: '#ef4444' },
  { value: 'housing',          label: 'Housing / Rent',   color: '#f97316' },
  { value: 'personal_shopping',label: 'Personal Shopping',color: '#ec4899' },
  { value: 'external_business',label: 'External Business',color: '#0ea5e9' },
  { value: 'miscellaneous',    label: 'Miscellaneous',    color: '#94a3b8' },
];
const CAT_MAP = Object.fromEntries(CATEGORIES.map(c => [c.value, c]));

const MONTH_OPTIONS = Array.from({ length: 6 }, (_, i) => {
  const d = new Date();
  d.setMonth(d.getMonth() - i);
  return { value: format(d, 'yyyy-MM'), label: format(d, 'MMM yyyy') };
});

const emptyForm = {
  record_type: 'expense',
  date: format(new Date(), 'yyyy-MM-dd'),
  amount: '',
  category: 'miscellaneous',
  source: '',
  payment_method: 'cash',
  wallet_source: 'owner_cash',
  notes: '',
};

export default function OwnerPersonalFinance() {
  const { user } = useAuth();
  const { currency, lang } = useLanguage();
  const { orgId, activeRestaurantId } = useTenant();
  const fmt = v => formatCurrency(v, currency);
  const qc = useQueryClient();

  const [innerTab, setInnerTab] = useState('dashboard');
  const [showForm, setShowForm] = useState(null); // 'expense' | 'income' | 'withdrawal'
  const [form, setForm] = useState(emptyForm);
  const [proofUrl, setProofUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [zoomImg, setZoomImg] = useState(null);
  const [filterMonth, setFilterMonth] = useState(MONTH_OPTIONS[0].value);
  const [saveError, setSaveError] = useState('');
  const pendingRequestId = useRef(null);
  const submissionLock = useRef(false);
  const label = (en, fa, ar) => lang === 'fa' ? fa : lang === 'ar' ? ar : en;
  const financialSaveMessage = (error) => {
    const message = String(error?.message || '');
    if (message.includes('ERP_PERSONAL_FINANCE_INSUFFICIENT_BALANCE')) {
      return label('Insufficient Treasury account balance.', 'موجودی حساب خزانه کافی نیست.', 'رصيد حساب الخزينة غير كافٍ.');
    }
    if (message.includes('ERP_PERSONAL_FINANCE_WALLET_NOT_CONFIGURED')) {
      return label('An active owner Treasury account is required.', 'حساب فعال خزانه مالک پیدا نشد.', 'يلزم حساب خزينة نشط للمالك.');
    }
    if (message.includes('ERP_PERSONAL_FINANCE_POSTED_IMMUTABLE')) {
      return label('Posted withdrawals require an audited reversal.', 'برداشت ثبت‌شده باید با سند اصلاحی برگشت شود.', 'السحب المرحّل يحتاج إلى قيد عكسي موثق.');
    }
    if (message.includes('row-level security') || error?.code === '42501') {
      return label('You do not have permission to post this entry.', 'اجازه ثبت این سند را ندارید.', 'لا تملك صلاحية تسجيل هذه العملية.');
    }
    return label('Saving failed. Check the amount and try again.', 'ذخیره ناموفق بود. مبلغ را بررسی کرده دوباره تلاش کنید.', 'تعذر الحفظ. تحقق من المبلغ وحاول مجددًا.');
  };
  const proofRef = useRef();
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data: records = [], isLoading, isError: recordsError, refetch: retryRead } = useQuery({
    queryKey: ['owner_personal_finance', activeRestaurantId, user?.email],
    queryFn: async () => {
      const { data, error } = await supabase.from('owner_personal_finance')
        .select('*').eq('restaurant_id', activeRestaurantId)
        .eq('created_by', user.email)
        .order('date', { ascending: false }).limit(1000);
      if (error) throw error;
      return data || [];
    },
    staleTime: 30000,
    enabled: Boolean(activeRestaurantId && user?.email && user?.role === 'owner'),
  });

  const saveMut = useMutation({
    mutationFn: async (record) => {
      try {
        return await base44.entities.OwnerPersonalFinance.create(record);
      } catch (error) {
        // A network timeout may hide an already committed entry. Reuse the
        // identical UUID, then confirm its tenant/amount instead of re-posting.
        if (error?.code === '23505' && record.id) {
          const { data: existing, error: verifyError } = await supabase
            .from('owner_personal_finance')
            .select('id, restaurant_id, record_type, amount')
            .eq('id', record.id).eq('restaurant_id', record.restaurant_id)
            .eq('created_by', user.email).maybeSingle();
          if (!verifyError && existing?.id === record.id &&
              existing.record_type === record.record_type &&
              Number(existing.amount) === record.amount) return existing;
        }
        throw error;
      }
    },
  });

  const deleteMut = useMutation({
    mutationFn: id => base44.entities.OwnerPersonalFinance.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['owner_personal_finance'] }); setDeleteId(null); },
    onError: error => toast.error(financialSaveMessage(error)),
  });

  const handleProofUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      if (!file_url) throw new Error('Upload was not confirmed');
      setProofUrl(file_url);
    } catch (error) {
      toast.error(label('File upload failed.', 'آپلود فایل ناموفق بود.', 'تعذر رفع الملف.'));
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (submissionLock.current || saveMut.isPending) return;
    setSaveError('');
    const amountText = String(form.amount).trim();
    const amount = Number(amountText);
    if (!/^\\d+(?:\\.\\d{1,2})?$/.test(amountText) ||
        !Number.isFinite(amount) || amount <= 0 || amount > 999999999.99 ||
        !/^\\d{4}-\\d{2}-\\d{2}$/.test(form.date)) {
      setSaveError(label('Enter a valid positive amount (up to 2 decimals) and date.',
        'مبلغ مثبت معتبر (حداکثر دو رقم اعشار) و تاریخ وارد کنید.',
        'أدخل مبلغًا موجبًا صالحًا (حتى منزلتين عشريتين) وتاريخًا.'));
      return;
    }
    if (!activeRestaurantId || user?.role !== 'owner') {
      setSaveError(label('Choose an owner business first.',
        'ابتدا کسب‌وکار مالک را انتخاب کنید.', 'حدد منشأة المالك أولاً.'));
      return;
    }
    submissionLock.current = true;
    pendingRequestId.current ||= crypto.randomUUID();
    try {
      const record = {
        ...form,
        id: pendingRequestId.current,
        restaurant_id: activeRestaurantId,
        org_id: orgId,
        type: form.record_type,
        amount,
        description: form.notes?.trim() || null,
        notes: form.notes?.trim() || null,
        source: form.source?.trim() || null,
        proof_url: proofUrl || null,
        recorded_by: user.email,
      };
      const confirmed = await saveMut.mutateAsync(record);
      if (!confirmed?.id) throw new Error('Server did not confirm the record');
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['owner_personal_finance'] }),
        qc.invalidateQueries({ queryKey: ['wallet_transactions'] }),
        qc.invalidateQueries({ queryKey: ['treasury_owner_central_transactions'] }),
        qc.invalidateQueries({ queryKey: ['treasury_accounts'] }),
      ]);
      pendingRequestId.current = null;
      setShowForm(null);
      setForm(emptyForm);
      setProofUrl('');
      toast.success(label('Entry saved.', 'سند ذخیره شد.', 'تم حفظ العملية.'));
      // Push alerts are best-effort; they must never block a financial save.
      if (form.record_type === 'withdrawal' && amount > 5000) {
        try {
          await createNotification({
            orgId, type: 'info', severity: 'warning', targetRole: 'owner',
            title: '⚠️ Large Personal Withdrawal',
            message: `Owner withdrew ${currency} ${amount.toLocaleString()} from treasury for personal use`,
            amount, actorEmail: user?.email, actorName: user?.full_name,
          });
        } catch (notificationError) {
          console.warn('[OwnerPersonalFinance] optional notification failed:', notificationError);
        }
      }
    } catch (error) {
      const message = financialSaveMessage(error);
      setSaveError(message);
      toast.error(message);
    } finally {
      submissionLock.current = false;
    }
  };

  // ── Derived totals ──────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const expenses = records.filter(r => r.record_type === 'expense').reduce((s, r) => s + Number(r.amount || 0), 0);
    const income   = records.filter(r => r.record_type === 'income').reduce((s, r) => s + Number(r.amount || 0), 0);
    const withdrawals = records.filter(r => r.record_type === 'withdrawal').reduce((s, r) => s + Number(r.amount || 0), 0);
    return { expenses, income, withdrawals, balance: income - expenses - withdrawals };
  }, [records]);

  // ── Monthly trend ───────────────────────────────────────────────────────
  const trendData = useMemo(() =>
    MONTH_OPTIONS.slice().reverse().map(({ value, label }) => {
      const m = records.filter(r => r.date?.startsWith(value));
      return {
        label,
        Income: m.filter(r => r.record_type === 'income').reduce((s, r) => s + Number(r.amount || 0), 0),
        Expenses: m.filter(r => r.record_type === 'expense').reduce((s, r) => s + Number(r.amount || 0), 0),
        Withdrawals: m.filter(r => r.record_type === 'withdrawal').reduce((s, r) => s + Number(r.amount || 0), 0),
      };
    }), [records]);

  // ── Category breakdown ──────────────────────────────────────────────────
  const catBreakdown = useMemo(() => {
    const map = {};
    records.filter(r => r.record_type === 'expense').forEach(r => {
      const c = r.category || 'miscellaneous';
      map[c] = (map[c] || 0) + (r.amount || 0);
    });
    return Object.entries(map).map(([key, value]) => ({
      name: CAT_MAP[key]?.label || key,
      value,
      color: CAT_MAP[key]?.color || '#94a3b8',
    })).sort((a, b) => b.value - a.value);
  }, [records]);

  // ── Filtered records for history ────────────────────────────────────────
  const filtered = useMemo(() =>
    records.filter(r => r.date?.startsWith(filterMonth)), [records, filterMonth]);

  const openForm = (type) => {
    setForm({ ...emptyForm, record_type: type });
    setProofUrl('');
    setSaveError('');
    pendingRequestId.current = null;
    setShowForm(type);
  };

  return (
    <div className="space-y-4">
      {/* Owner-only notice */}
      <Card className="p-3 bg-violet-50 border-violet-200 flex items-start gap-2">
        <ShieldCheck className="w-4 h-4 text-violet-500 mt-0.5 shrink-0" />
        <div>
          <p className="text-xs font-semibold text-violet-700">Owner Private — Strictly Separated from Restaurant Operations</p>
          <p className="text-xs text-violet-600">Personal finances never affect restaurant P&L, branch balances, or operational analytics.</p>
        </div>
      </Card>

      {recordsError && (
        <Card role="alert" className="p-3 border-red-300 text-red-700">
          {label('Personal finance data could not be loaded.', 'معلومات مالی شخصی بارگذاری نشد.', 'تعذر تحميل بيانات المالية الشخصية.')}
          <Button type="button" variant="outline" className="ms-2" onClick={() => retryRead()}>
            {label('Retry', 'تلاش دوباره', 'إعادة المحاولة')}
          </Button>
        </Card>
      )}

      {/* Quick action buttons */}
      <div className="grid grid-cols-3 gap-2">
        <Button variant="outline" className="flex-col h-14 gap-1 text-red-600 border-red-200 hover:bg-red-50" onClick={() => openForm('expense')}>
          <ArrowUpRight className="w-4 h-4" />
          <span className="text-xs">Personal Expense</span>
        </Button>
        <Button variant="outline" className="flex-col h-14 gap-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50" onClick={() => openForm('income')}>
          <ArrowDownLeft className="w-4 h-4" />
          <span className="text-xs">Personal Income</span>
        </Button>
        <Button variant="outline" className="flex-col h-14 gap-1 text-amber-600 border-amber-200 hover:bg-amber-50" onClick={() => openForm('withdrawal')}>
          <Wallet className="w-4 h-4" />
          <span className="text-xs">Withdrawal</span>
        </Button>
      </div>

      <Tabs value={innerTab} onValueChange={setInnerTab}>
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="dashboard" className="text-xs">Dashboard</TabsTrigger>
          <TabsTrigger value="history" className="text-xs">History</TabsTrigger>
          <TabsTrigger value="charts" className="text-xs">Charts</TabsTrigger>
        </TabsList>

        {/* ── DASHBOARD ─────────────────────────────────────────────── */}
        <TabsContent value="dashboard" className="mt-3 space-y-3">
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-2">
            <Card className="p-3 bg-emerald-50 border-emerald-200">
              <p className="text-xs text-emerald-600 font-medium">Personal Income</p>
              <p className="text-xl font-bold text-emerald-700">{fmt(totals.income)}</p>
            </Card>
            <Card className="p-3 bg-red-50 border-red-200">
              <p className="text-xs text-red-600 font-medium">Personal Expenses</p>
              <p className="text-xl font-bold text-red-600">{fmt(totals.expenses)}</p>
            </Card>
            <Card className="p-3 bg-amber-50 border-amber-200">
              <p className="text-xs text-amber-600 font-medium">Withdrawals from Treasury</p>
              <p className="text-xl font-bold text-amber-600">{fmt(totals.withdrawals)}</p>
            </Card>
            <Card className={`p-3 ${totals.balance >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200'}`}>
              <p className={`text-xs font-medium ${totals.balance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>Personal Balance</p>
              <p className={`text-xl font-bold ${totals.balance >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{fmt(totals.balance)}</p>
            </Card>
          </div>

          {/* Recent records */}
          <Card className="p-4">
            <p className="text-sm font-semibold mb-2">Recent Records</p>
            {isLoading ? (
              <p className="text-xs text-center text-muted-foreground py-4">Loading...</p>
            ) : records.length === 0 ? (
              <p className="text-xs text-center text-muted-foreground py-6">No personal finance records yet</p>
            ) : (
              <div className="space-y-2">
                {records.slice(0, 8).map(r => (
                  <RecordRow key={r.id} r={r} fmt={fmt} onDelete={setDeleteId} onZoom={setZoomImg} />
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ── HISTORY ───────────────────────────────────────────────── */}
        <TabsContent value="history" className="mt-3 space-y-3">
          <Select value={filterMonth} onValueChange={setFilterMonth}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTH_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Month summary */}
          {filtered.length > 0 && (
            <div className="grid grid-cols-3 gap-2 text-center">
              {['expense','income','withdrawal'].map(type => {
                const total = filtered.filter(r => r.record_type === type).reduce((s, r) => s + Number(r.amount || 0), 0);
                const colors = { expense: 'text-red-600', income: 'text-emerald-600', withdrawal: 'text-amber-600' };
                return (
                  <Card key={type} className="p-2">
                    <p className="text-xs text-muted-foreground capitalize">{type}</p>
                    <p className={`text-sm font-bold ${colors[type]}`}>{fmt(total)}</p>
                  </Card>
                );
              })}
            </div>
          )}

          {filtered.length === 0 ? (
            <p className="text-xs text-center text-muted-foreground py-8">No records this month</p>
          ) : (
            <div className="space-y-2">
              {filtered.map(r => (
                <RecordRow key={r.id} r={r} fmt={fmt} onDelete={setDeleteId} onZoom={setZoomImg} expanded />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── CHARTS ────────────────────────────────────────────────── */}
        <TabsContent value="charts" className="mt-3 space-y-4">
          {/* Monthly trend */}
          <Card className="p-4">
            <p className="text-sm font-semibold mb-3">Monthly Personal Finance Trend</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={v => fmt(v)} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="Income" fill="#10b981" radius={[3,3,0,0]} />
                <Bar dataKey="Expenses" fill="#ef4444" radius={[3,3,0,0]} />
                <Bar dataKey="Withdrawals" fill="#f59e0b" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Expense category pie */}
          {catBreakdown.length > 0 && (
            <Card className="p-4">
              <p className="text-sm font-semibold mb-3">Expense by Category</p>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={catBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {catBreakdown.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={v => fmt(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2 mt-2">
                {catBreakdown.map(c => (
                  <div key={c.name} className="flex items-center gap-1">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                    <span className="text-xs text-muted-foreground">{c.name}: {fmt(c.value)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Add record dialog */}
      <Dialog open={!!showForm} onOpenChange={v => { if (!v && !saveMut.isPending) { setShowForm(null); setProofUrl(''); setSaveError(''); pendingRequestId.current = null; } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {showForm === 'expense' ? 'Personal Expense' : showForm === 'income' ? 'Personal Income' : 'Treasury Withdrawal'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {showForm === 'withdrawal' && (
              <Card className="p-2.5 bg-amber-50 border-amber-200 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  This withdrawal reduces your business treasury balance but is recorded separately — it will NOT affect restaurant P&L or branch analytics.
                </p>
              </Card>
            )}

            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <Label className="text-xs">{label('Date *','تاریخ *','التاريخ *')}</Label>
                <Input className="mt-1 w-full min-w-0 max-w-full text-base" type="date" dir="ltr"
                  value={form.date} onChange={e => { pendingRequestId.current = null; set('date', e.target.value); }} />
              </div>
              <div className="min-w-0">
                <Label className="text-xs">{label('Amount *','مبلغ *','المبلغ *')}</Label>
                <Input className="mt-1 w-full min-w-0 max-w-full text-base" type="number" inputMode="decimal"
                  min="0.01" step="0.01" dir="ltr" value={form.amount}
                  onChange={e => { pendingRequestId.current = null; set('amount', e.target.value); }} placeholder="0.00" />
              </div>
            </div>

            {showForm === 'expense' && (
              <div>
                <Label className="text-xs">Category</Label>
                <Select value={form.category} onValueChange={v => set('category', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {showForm === 'income' && (
              <div>
                <Label className="text-xs">Source</Label>
                <Input value={form.source} onChange={e => set('source', e.target.value)} placeholder="e.g. External business, investment return..." />
              </div>
            )}

            {showForm === 'withdrawal' && (
              <div>
                <Label className="text-xs">From Wallet</Label>
                <Select value={form.wallet_source} onValueChange={v => {
                  pendingRequestId.current = null;
                  setForm(current => ({ ...current, wallet_source: v, payment_method: v === 'owner_network' ? 'network' : 'cash' }));
                }}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner_cash">Owner Cash</SelectItem>
                    <SelectItem value="owner_network">Owner Network</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label className="text-xs">Payment Method</Label>
              <Select value={form.payment_method} onValueChange={v => set('payment_method', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="network">Network / Card</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Notes</Label>
              <Input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional description..." />
            </div>

            {/* Proof upload */}
            <div>
              <Label className="text-xs mb-1 block">Attachment / Proof (optional)</Label>
              <label className={`flex items-center gap-2 cursor-pointer border-2 border-dashed rounded-lg p-2.5 transition-colors ${proofUrl ? 'border-emerald-400 bg-emerald-50' : 'border-border hover:border-primary'}`}>
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4 text-muted-foreground" />}
                <span className="text-xs text-muted-foreground">{uploading ? 'Uploading...' : proofUrl ? '✓ Attached' : 'Take photo / choose file'}</span>
                <input ref={proofRef} type="file" accept="image/*,.pdf" capture="environment" className="hidden" onChange={handleProofUpload} disabled={uploading} />
              </label>
              {proofUrl && (
                <button onClick={() => setZoomImg(proofUrl)} className="flex items-center gap-1 text-xs text-primary mt-1 hover:underline">
                  <ZoomIn className="w-3 h-3" /> View attached
                </button>
              )}
            </div>

            {saveError && <p role="alert" className="text-sm font-medium text-red-700">{saveError}</p>}
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={handleSave} disabled={saveMut.isPending || uploading || !form.amount}>
                {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setShowForm(null)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete this record?</AlertDialogTitle></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteMut.mutate(deleteId)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Proof zoom */}
      <Dialog open={!!zoomImg} onOpenChange={() => setZoomImg(null)}>
        <DialogContent className="max-w-sm p-2">
          <img src={zoomImg} alt="Proof" className="w-full rounded-lg" />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Sub-component: record row ───────────────────────────────────────────────
function RecordRow({ r, fmt, onDelete, onZoom, expanded = false }) {
  const TYPE_COLOR = {
    expense: 'text-red-500',
    income: 'text-emerald-600',
    withdrawal: 'text-amber-600',
  };
  const TYPE_SIGN = { expense: '-', income: '+', withdrawal: '-' };
  const cat = CAT_MAP[r.category];

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${r.record_type === 'income' ? 'bg-emerald-100' : 'bg-red-100'}`}>
            {r.record_type === 'income'
              ? <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
              : <ArrowUpRight className="w-3.5 h-3.5 text-red-500" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge variant="outline" className="text-xs py-0 capitalize">{r.record_type}</Badge>
              {cat && <span className="text-xs text-muted-foreground">{cat.label}</span>}
              {r.source && <span className="text-xs text-muted-foreground">{r.source}</span>}
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-xs text-muted-foreground">{r.date}</span>
              {expanded && r.notes && <span className="text-xs text-muted-foreground truncate max-w-28">{r.notes}</span>}
              {r.wallet_source && r.record_type === 'withdrawal' && (
                <span className="text-xs text-muted-foreground">from {r.wallet_source.replace('_', ' ')}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {r.proof_url && (
            <button onClick={() => onZoom(r.proof_url)} className="p-1 border rounded hover:bg-muted">
              <ZoomIn className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
          <span className={`text-sm font-bold ${TYPE_COLOR[r.record_type]}`}>
            {TYPE_SIGN[r.record_type]}{fmt(r.amount)}
          </span>
          {r.record_type !== 'withdrawal' && (
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => onDelete(r.id)}>
              <Trash2 className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

const CATEGORIES_REF = CATEGORIES; // keep in scope for RecordRow