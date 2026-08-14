import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useLanguage } from '@/lib/LanguageContext';
import PageHeader from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, Mail, Clock, Loader2, Send, CheckCircle2, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import EmptyState from '@/components/shared/EmptyState';
import { getDateRange, formatDate, formatCurrency } from '@/lib/helpers';
import { computeExecutiveSummary } from '@/services/salesAnalyticsEngine';
import { generateUltimatePDF } from '@/lib/pdfGenerator';
import { useTenant } from '@/lib/TenantContext';
import { useSalesSources } from '@/hooks/useSalesSources';
import { supabase } from '@/api/supabaseClient';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText } from 'lucide-react';

const FREQ_LABELS = { daily: 'daily', weekly: 'weekly', monthly: 'monthly' };

export default function ScheduledReports() {
  const { t, currency, lang, dir } = useLanguage();
  const { ownerFilter, branches } = useTenant();
  const { revenueSources } = useSalesSources();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [sendingId, setSendingId] = useState(null);
  const [sentId, setSentId] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfDone, setPdfDone] = useState(false);
  const [form, setForm] = useState({ name: '', email_to: '', frequency: 'weekly' });
  const hasFilter = !!(ownerFilter?.created_by || ownerFilter?.branch);

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ['scheduled_reports'],
    queryFn: () => base44.entities.ScheduledReport.list('-created_date'),
  });

  const { data: sales = [] } = useQuery({
    queryKey: ['sales', ownerFilter],
    queryFn: () => base44.entities.DailySales.filter(ownerFilter || {}, '-date', 2000),
    staleTime: 120000,
    enabled: hasFilter,
  });
  const { data: purchases = [] } = useQuery({
    queryKey: ['purchases_erp', ownerFilter],
    queryFn: async () => {
      if (!ownerFilter?.created_by) return [];
      const { data, error } = await supabase
        .from('supplier_invoices')
        .select('*')
        .eq('created_by', ownerFilter.created_by)
        .in('approval_status', ['approved', 'auto_approved'])
        .order('date', { ascending: false })
        .limit(2000);
      if (error) return [];
      return data || [];
    },
    staleTime: 120000,
    enabled: hasFilter,
  });
  const { data: expenses = [] } = useQuery({
    queryKey: ['expenses', ownerFilter],
    queryFn: () => base44.entities.Expense.filter(ownerFilter || {}, '-date', 2000),
    staleTime: 120000,
    enabled: hasFilter,
  });
  const { data: walletTransactions = [] } = useQuery({
    queryKey: ['wallet_transactions', ownerFilter],
    queryFn: () => base44.entities.WalletTransaction.filter(ownerFilter || {}, '-transaction_date', 500),
    staleTime: 60000,
    enabled: hasFilter,
  });
  const { data: inventory = [] } = useQuery({
    queryKey: ['inventory', ownerFilter],
    queryFn: () => base44.entities.Inventory.list('-date', 2000),
    staleTime: 300000,
    enabled: hasFilter,
  });
  const { data: brandSettingsList = [] } = useQuery({
    queryKey: ['brand_settings'],
    queryFn: () => base44.entities.BrandSettings.list(),
  });

  // KPI summary using engine
  // Note: expenseCategories not fetched here; fixed-expense proration will be skipped (treated as variable)
  const weekKPIs = useMemo(() =>
    computeExecutiveSummary(sales, purchases, expenses, revenueSources, walletTransactions, []),
    [sales, purchases, expenses, revenueSources, walletTransactions]
  );
  const dr = getDateRange('week');
  const fromStr = formatDate(dr.from);
  const toStr = formatDate(dr.to);

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.ScheduledReport.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['scheduled_reports'] }); setShowForm(false); },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }) => base44.entities.ScheduledReport.update(id, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scheduled_reports'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ScheduledReport.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scheduled_reports'] }),
  });

  const handleSendNow = async (schedule) => {
    setSendingId(schedule.id);
    await new Promise(r => setTimeout(r, 800));
    setSendingId(null);
    setSentId(schedule.id);
    setTimeout(() => setSentId(null), 3000);
  };

  const handlePDF = async () => {
    setPdfLoading(true);
    setPdfDone(false);
    try {
      await generateUltimatePDF({
        sales, purchases, expenses,
        rangeType: 'week',
        fromStr, toStr,
        t, lang, currency,
        branches: branches.length > 0 ? branches : [{ key: 'main', label: 'Main Branch' }],
        dir,
        brandSettings: brandSettingsList[0] || null,
        inventory,
        supplierInvoices: purchases,
        walletTransactions,
        revenueSources,
      });
      setPdfDone(true);
      setTimeout(() => setPdfDone(false), 3000);
    } finally {
      setPdfLoading(false);
    }
  };

  const branchLabel = (key) => key === 'all' ? t('all_branches') : (branches?.find(b => b.key === key)?.label || key);

  return (
    <div>
      <PageHeader
        title={t('scheduled_reports')}
        action={
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-1" /> {t('add')}
          </Button>
        }
      />

      {/* Live KPI snapshot */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        {[
          { label: t('total_sales'), val: weekKPIs.monthSales, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: t('total_purchase_cost'), val: weekKPIs.monthMetrics?.totalPurchaseCost || 0, icon: DollarSign, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: t('total_expenses'), val: weekKPIs.monthMetrics?.totalExpensesAll || 0, icon: TrendingDown, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: t('net_profit'), val: weekKPIs.netProfit, icon: weekKPIs.netProfit >= 0 ? TrendingUp : TrendingDown, color: weekKPIs.netProfit >= 0 ? 'text-emerald-700' : 'text-red-600', bg: weekKPIs.netProfit >= 0 ? 'bg-emerald-50' : 'bg-red-50' },
        ].map(({ label, val, icon: KpiIcon, color, bg }) => (
          <Card key={label} className={`p-3 ${bg} border-0`}>
            <KpiIcon className={`w-4 h-4 mb-1 ${color}`} />
            <p className={`text-base font-bold ${color}`}>{formatCurrency(val, currency)}</p>
            <p className="text-[10px] text-muted-foreground">{label} ({t('this_week')})</p>
          </Card>
        ))}
      </div>

      {/* Manual export */}
      <Card className="p-4 mb-4 border-primary/20 bg-primary/5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-semibold text-sm">{t('export_ultimate_pdf')}</h3>
            <p className="text-xs text-muted-foreground">{t('pdf_period')}: {fromStr} → {toStr}</p>
          </div>
          <button
            onClick={handlePDF}
            disabled={pdfLoading}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${pdfDone ? 'text-emerald-600 border-emerald-300 bg-emerald-50' : 'bg-primary text-primary-foreground border-primary hover:bg-primary/90'}`}
          >
            {pdfLoading ? <span className="animate-spin">⏳</span> : pdfDone ? '✓' : <FileText className="w-4 h-4" />}
            {pdfLoading ? t('generating_pdf') : pdfDone ? t('pdf_ready') : t('export_ultimate_pdf')}
          </button>
        </div>
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('scheduled_reports')}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">{t('name')}</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Weekly Sales Report" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">{t('email')}</Label>
              <Input value={form.email_to} onChange={e => setForm(f => ({ ...f, email_to: e.target.value }))} placeholder="owner@example.com" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">{t('frequency')}</Label>
              <Select value={form.frequency} onValueChange={v => setForm(f => ({ ...f, frequency: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">{t('daily')}</SelectItem>
                  <SelectItem value="weekly">{t('weekly')}</SelectItem>
                  <SelectItem value="monthly">{t('monthly')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => { if (form.name && form.email_to) createMutation.mutate(form); }} disabled={createMutation.isPending} className="flex-1 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50">
                {createMutation.isPending ? '...' : t('save')}
              </button>
              <button onClick={() => setShowForm(false)} className="flex-1 px-3 py-1.5 text-sm border rounded-md hover:bg-muted">{t('cancel')}</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : schedules.length === 0 ? (
        <EmptyState message={t('no_data')} />
      ) : (
        <div className="space-y-3">
          {schedules.map(s => (
            <Card key={s.id} className={`p-4 ${!s.is_active ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Mail className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium text-sm">{s.name}</div>
                    <div className="text-xs text-muted-foreground">{s.email_to}</div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{branchLabel(s.branch || 'all')}</Badge>
                      <Badge variant="outline" className="text-[10px]">{t(FREQ_LABELS[s.frequency] || 'weekly')}</Badge>
                      {s.frequency === 'weekly' && s.day_of_week && (
                        <Badge variant="outline" className="text-[10px] capitalize">{s.day_of_week}</Badge>
                      )}
                    </div>
                    {s.last_sent && (
                      <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {t('last_sent')}: {s.last_sent}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1"
                    onClick={() => handleSendNow(s)}
                    disabled={sendingId === s.id}
                  >
                    {sendingId === s.id ? <Loader2 className="w-3 h-3 animate-spin" />
                      : sentId === s.id ? <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      : <Send className="w-3 h-3" />}
                    {sentId === s.id ? '✓' : t('export')}
                  </Button>
                  <Switch
                    checked={!!s.is_active}
                    onCheckedChange={v => toggleMutation.mutate({ id: s.id, is_active: v })}
                  />
                  <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(s.id)} className="text-destructive h-8 w-8">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-6 p-4 rounded-xl bg-muted text-xs text-muted-foreground">
        <p className="font-medium mb-1">📅 {t('scheduled_reports')}</p>
        <p>{t('pdf_disclaimer')}</p>
      </div>
    </div>
  );
}