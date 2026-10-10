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
import { Plus, Trash2, Mail, Clock, Loader2, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { useBranchScope } from '@/lib/BranchScopeContext';
import { salesReportDateRange,buildSalesReportSnapshot,salesReportGrowth } from '@/lib/salesReportPeriod';
import { buildOperationsPdfReport } from '@/lib/operationsPdfReport';
import { generateSalesAnalyticsPDF } from '@/lib/salesAnalyticsPdf';
import { fetchScheduledERPReportData } from '@/lib/scheduledERPReportData';
import EmptyState from '@/components/shared/EmptyState';
import { formatCurrency } from '@/lib/helpers';
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
  const { branches,activeRestaurant } = useTenant();
  const { selectedBranchId,selectedBranchKey,selectedBranchLabel,isAllBranches } = useBranchScope();
  const { revenueSources } = useSalesSources();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfDone, setPdfDone] = useState(false);
  const [form, setForm] = useState({ name: '', email_to: '', frequency: 'weekly' });


  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ['scheduled_reports'],
    queryFn: () => base44.entities.ScheduledReport.list('-created_date'),
  });

  const reportRange = useMemo(()=>salesReportDateRange('week'),[]);
  const fromStr=reportRange.from,toStr=reportRange.to;
  const hasScope=Boolean(activeRestaurant?.id);
  const { data:reportData,isLoading:loadingERP,isError:reportError }=useQuery({
    queryKey:['scheduled_erp_pdf',activeRestaurant?.id,selectedBranchId,reportRange.from,reportRange.to],
    queryFn:()=>fetchScheduledERPReportData({
      db:supabase,restaurantId:activeRestaurant.id,range:reportRange,
      branchId:selectedBranchId,branchKey:selectedBranchKey,allBranches:isAllBranches,
    }),
    enabled:hasScope,staleTime:120000,
  });
  const emptyData={sales:[],purchases:[],expenses:[],expenseCategories:[],
    inventory:[],inventoryTransactions:[],customerDebts:[]};
  const d=reportData||emptyData;
  const periodSnapshot=useMemo(()=>buildSalesReportSnapshot({
    sales:d.sales,purchases:d.purchases,expenses:d.expenses,expenseCategories:d.expenseCategories,
    revenueSources,from:reportRange.from,to:reportRange.to,
  }),[reportData,revenueSources,reportRange]);
  const previousSnapshot=useMemo(()=>buildSalesReportSnapshot({
    sales:d.sales,purchases:d.purchases,expenses:d.expenses,expenseCategories:d.expenseCategories,
    revenueSources,from:reportRange.previousFrom,to:reportRange.previousTo,
  }),[reportData,revenueSources,reportRange]);
  const growth=salesReportGrowth(periodSnapshot,previousSnapshot);
  const scopedBranches=useMemo(()=>(isAllBranches?branches:
    branches.filter(b=>String(b.id)===String(selectedBranchId)))
    .map(b=>({...b,key:b.branch_key||b.key||String(b.id),label:b.name||b.label||b.branch_key||b.key})),
    [isAllBranches,branches,selectedBranchId]);
  const operationsReport=useMemo(()=>reportData?buildOperationsPdfReport({
    branches:scopedBranches,sales:d.sales,purchases:d.purchases,expenses:d.expenses,
    expenseCategories:d.expenseCategories,inventory:d.inventory,inventoryTransactions:d.inventoryTransactions,
    customerDebts:d.customerDebts,range:reportRange,revenueSources,
  }):null,[reportData,scopedBranches,revenueSources,reportRange]);

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

  const handlePDF=async()=>{
    if(!hasScope||loadingERP||reportError||!reportData){
      toast.error(lang==='ar'?'بيانات التقرير غير مكتملة؛ لا يمكن التصدير.':
        lang==='fa'?'اطلاعات گزارش کامل بارگذاری نشده است.':'Report data is incomplete. Export disabled.');
      return;
    }
    setPdfLoading(true);setPdfDone(false);
    try{
      const doc=await generateSalesAnalyticsPDF({
        snapshot:periodSnapshot,previousSnapshot,growth,range:reportRange,
        branchLabel:isAllBranches?(lang==='ar'?'جميع الفروع':lang==='fa'?'تمام شعبه‌ها':'All branches'):selectedBranchLabel,
        businessName:activeRestaurant?.name||'BizCTRL',currency,lang,dir,
        operationsReport,download:true,
      });
      if(doc.getNumberOfPages()!==1)throw new Error('PDF must be one A4 page');
      setPdfDone(true);
      toast.success(lang==='ar'?'تم تنزيل تقرير المبيعات':lang==='fa'?'گزارش فروشات دانلود شد':'Sales Analytics PDF downloaded');
    }catch(e){
      console.error('Scheduled sales analytics PDF failed:',e);
      toast.error(e?.message||'Could not generate PDF');
    }finally{setPdfLoading(false);}
  };

  const branchLabel = key => key==='all'?t('all_branches'):(branches?.find(b=>b.key===key||b.branch_key===key)?.name||key);

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
          {label:t('total_sales'),val:periodSnapshot.sales,icon:TrendingUp,color:'text-emerald-600',bg:'bg-emerald-50'},
          {label:t('total_purchase_cost'),val:periodSnapshot.purchases,icon:DollarSign,color:'text-blue-600',bg:'bg-blue-50'},
          {label:t('total_expenses'),val:periodSnapshot.totalExpenses,icon:TrendingDown,color:'text-amber-600',bg:'bg-amber-50'},
          {label:t('net_profit'),val:periodSnapshot.netProfit,icon:periodSnapshot.netProfit>=0?TrendingUp:TrendingDown,
            color:periodSnapshot.netProfit>=0?'text-emerald-700':'text-red-600',bg:periodSnapshot.netProfit>=0?'bg-emerald-50':'bg-red-50'},

        ].map(({ label, val, icon: KpiIcon, color, bg }) => (
          <Card key={label} className={`p-3 ${bg} border-0`}>
            <KpiIcon className={`w-4 h-4 mb-1 ${color}`} />
            <p className={`text-base font-bold ${color}`}>{loadingERP?'…':reportError?'—':formatCurrency(val, currency)}</p>
            <p className="text-[10px] text-muted-foreground">{label} ({t('this_week')})</p>
          </Card>
        ))}
      </div>

      {/* Manual export */}
      <Card className="p-4 mb-4 border-primary/20 bg-primary/5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-semibold text-sm">{lang==='ar'?'تقرير تحليلات المبيعات ERP (صفحة واحدة)':lang==='fa'?'گزارش تحلیل فروشات ERP (یک صفحه)':'ERP Sales Analytics PDF · One A4 page'}</h3>
            <p className="text-xs text-muted-foreground">{t('pdf_period')}: {fromStr} → {toStr}</p>
          </div>
          <button
            onClick={handlePDF}
            disabled={pdfLoading || loadingERP || reportError || !hasScope || !reportData}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${pdfDone ? 'text-emerald-600 border-emerald-300 bg-emerald-50' : 'bg-primary text-primary-foreground border-primary hover:bg-primary/90'}`}
          >
            {pdfLoading ? <span className="animate-spin">⏳</span> : pdfDone ? '✓' : <FileText className="w-4 h-4" />}
            {pdfLoading ? t('generating_pdf') : pdfDone ? t('pdf_ready') : (lang==='ar'?'تحميل تقرير المبيعات':lang==='fa'?'دانلود گزارش فروشات':'Export Sales Analytics PDF')}
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
                  <Button size="sm" variant="outline" className="h-8 text-xs gap-1"
                    onClick={handlePDF} disabled={pdfLoading || loadingERP || reportError || !reportData}>
                    <FileText className="w-3 h-3"/>{t('export')}
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
        <p>{t('pdf_disclaimer')} · {"AR / EN / FA · PDF A4 · 1 / 1"}</p>
      </div>
    </div>
  );
}