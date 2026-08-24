import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, ChevronRight, Eye, EyeOff, Loader2, Plus, Save, Settings2, ShieldCheck, Trash2 } from 'lucide-react';
import { useTenant } from '@/lib/TenantContext';
import { useLanguage } from '@/lib/LanguageContext';
import { useSalesClosingCustomization } from '@/lib/SalesClosingCustomizationContext';
import { CORE_SALES_CLOSING_FIELDS, SALES_CLOSING_FIELD_TYPES, newSalesClosingCustomField, normalizeSalesClosingConfig, normalizeSalesClosingField } from '@/lib/salesClosingCustomization';
import { supabase } from '@/api/supabaseClient';
import PageHeader from '@/components/shared/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

const asArray = (value) => Array.isArray(value) ? value.filter(Boolean) : [];

function SectionCard({ title, description, children }) {
  return <Card className="p-4 sm:p-5"><div className="mb-4"><h2 className="text-base font-semibold">{title}</h2>{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}</div>{children}</Card>;
}

function FieldStatus({ field }) {
  return <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground"><Badge variant="outline">{field.field_type.replaceAll('_', ' ')}</Badge><Badge variant="outline">{field.is_required ? 'Required' : 'Optional'}</Badge><Badge variant="outline">{field.visible_mobile !== false ? 'Mobile' : 'Desktop only'}</Badge><Badge variant="outline">{field.visible_desktop !== false ? 'Desktop' : 'Mobile only'}</Badge>{field.is_system && <Badge variant="outline">System</Badge>}</div>;
}

function CustomFieldDialog({ editor, onClose, onSave, isSaving }) {
  const [draft, setDraft] = useState(editor?.field || newSalesClosingCustomField());
  const [error, setError] = useState('');
  useEffect(() => { setDraft(editor?.field || newSalesClosingCustomField()); setError(''); }, [editor]);
  if (!editor) return null;
  const set = (patch) => setDraft((current) => ({ ...current, ...patch }));
  const save = () => {
    const normalized = normalizeSalesClosingField({
      ...draft,
      options: Array.isArray(draft.options) ? draft.options : String(draft.options || '').split('\n'),
    }, draft.sort_order);
    if (!normalized.label_en) return setError('English label is required.');
    if (!normalized.field_key) return setError('Field key is required.');
    if (normalized.field_type === 'dropdown' && !normalized.options.length) return setError('Dropdown fields require at least one option.');
    if (normalized.is_required && normalized.is_active === false) return setError('A required field cannot be disabled.');
    onSave(normalized);
  };
  return <Dialog open={Boolean(editor)} onOpenChange={(open) => !open && onClose()}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{editor.mode === 'create' ? 'Add Sales Closing Field' : 'Edit Sales Closing Field'}</DialogTitle><DialogDescription>Definitions control future closings only. Historical saved closing values remain unchanged.</DialogDescription></DialogHeader><div className="grid gap-4"><div className="grid gap-3 sm:grid-cols-2"><div><Label>Field key</Label><Input value={draft.field_key || ''} disabled={Boolean(editor.field.is_system)} onChange={(event) => set({ field_key: event.target.value })} placeholder="delivery_reference" maxLength={64} /></div><div><Label>Field type</Label><Select value={draft.field_type || 'text'} onValueChange={(field_type) => set({ field_type, options: field_type === 'dropdown' ? draft.options || [] : [] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SALES_CLOSING_FIELD_TYPES.map((type) => <SelectItem key={type} value={type}>{type.replaceAll('_', ' ')}</SelectItem>)}</SelectContent></Select></div></div><div className="grid gap-3 sm:grid-cols-2"><div><Label>English label</Label><Input value={draft.label_en || ''} onChange={(event) => set({ label_en: event.target.value })} placeholder="Delivery Reference" maxLength={120} /></div><div><Label>Arabic label</Label><Input dir="rtl" value={draft.label_ar || ''} onChange={(event) => set({ label_ar: event.target.value })} placeholder="مرجع التوصيل" maxLength={120} /></div></div>{draft.field_type === 'dropdown' && <div><Label>Options, one per line</Label><Textarea value={asArray(draft.options).join('\n')} onChange={(event) => set({ options: event.target.value.split('\n') })} placeholder={'Standard\nPremium'} rows={4} /></div>}<div className="grid gap-3 sm:grid-cols-2"><div><Label>Display order</Label><Input type="number" min="0" value={draft.sort_order ?? 0} onChange={(event) => set({ sort_order: Number(event.target.value) || 0 })} /></div><div className="grid grid-cols-2 gap-2 pt-6"><label className="flex items-center justify-between gap-2 rounded-lg border p-2 text-xs">Required<Switch checked={Boolean(draft.is_required)} disabled={CORE_SALES_CLOSING_FIELDS.has(draft.field_key)} onCheckedChange={(is_required) => set({ is_required })} /></label><label className="flex items-center justify-between gap-2 rounded-lg border p-2 text-xs">Active<Switch checked={draft.is_active !== false} disabled={CORE_SALES_CLOSING_FIELDS.has(draft.field_key)} onCheckedChange={(is_active) => set({ is_active })} /></label></div></div><div className="grid gap-3 sm:grid-cols-2"><label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">Show on mobile<Switch checked={draft.visible_mobile !== false} onCheckedChange={(visible_mobile) => set({ visible_mobile })} /></label><label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">Show on desktop<Switch checked={draft.visible_desktop !== false} onCheckedChange={(visible_desktop) => set({ visible_desktop })} /></label></div>{error && <Alert variant="destructive"><AlertTitle>Unable to save field</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}</div><DialogFooter className="gap-2 sm:gap-0"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="button" disabled={isSaving} onClick={save}>{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save field'}</Button></DialogFooter></DialogContent></Dialog>;
}

function PaymentMethodDialog({ editor, onClose, onSave, isSaving }) {
  const [draft, setDraft] = useState(editor?.method || { code: '', name_en: '', name_ar: '', sort_order: 100, is_active: true, is_system: false });
  const [error, setError] = useState('');
  useEffect(() => { setDraft(editor?.method || { code: '', name_en: '', name_ar: '', sort_order: 100, is_active: true, is_system: false }); setError(''); }, [editor]);
  if (!editor) return null;
  const set = (patch) => setDraft((current) => ({ ...current, ...patch }));
  const save = () => {
    const method = { ...draft, code: String(draft.code || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'), name_en: String(draft.name_en || '').trim(), name_ar: String(draft.name_ar || '').trim() || null };
    if (!method.code || !method.name_en) return setError('Code and English name are required.');
    onSave(method);
  };
  return <Dialog open={Boolean(editor)} onOpenChange={(open) => !open && onClose()}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{editor.mode === 'create' ? 'Add Payment Method' : 'Edit Payment Method'}</DialogTitle><DialogDescription>Active methods are immediately available for future sales closings.</DialogDescription></DialogHeader><div className="grid gap-4"><div className="grid gap-3 sm:grid-cols-2"><div><Label>Code</Label><Input value={draft.code || ''} disabled={Boolean(editor.method.is_system)} onChange={(event) => set({ code: event.target.value })} placeholder="online_payment" maxLength={64} /></div><div><Label>Display order</Label><Input type="number" min="0" value={draft.sort_order ?? 0} onChange={(event) => set({ sort_order: Number(event.target.value) || 0 })} /></div></div><div className="grid gap-3 sm:grid-cols-2"><div><Label>English name</Label><Input value={draft.name_en || ''} onChange={(event) => set({ name_en: event.target.value })} placeholder="Online Payment" /></div><div><Label>Arabic name</Label><Input dir="rtl" value={draft.name_ar || ''} onChange={(event) => set({ name_ar: event.target.value })} placeholder="دفع إلكتروني" /></div></div><label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">Active for new closings<Switch checked={draft.is_active !== false} onCheckedChange={(is_active) => set({ is_active })} /></label>{error && <Alert variant="destructive"><AlertTitle>Unable to save payment method</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}</div><DialogFooter className="gap-2 sm:gap-0"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="button" disabled={isSaving} onClick={save}>{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save payment method'}</Button></DialogFooter></DialogContent></Dialog>;
}

function SalesSourceDialog({ editor, onClose, onSave, isSaving, paymentMethods }) {
  const [draft, setDraft] = useState(editor?.source || { name_en: '', name_ar: '', sort_order: 100, is_active: true, is_global: true, default_payment_method: 'cash', icon: 'Banknote', color: 'emerald', included_in_revenue: true, included_in_cash_register: true, included_in_dashboard_kpi: true, included_in_profit_calc: true, is_system: false });
  const [error, setError] = useState('');
  useEffect(() => { setDraft(editor?.source || { name_en: '', name_ar: '', sort_order: 100, is_active: true, is_global: true, default_payment_method: 'cash', icon: 'Banknote', color: 'emerald', included_in_revenue: true, included_in_cash_register: true, included_in_dashboard_kpi: true, included_in_profit_calc: true, is_system: false }); setError(''); }, [editor]);
  if (!editor) return null;
  const set = (patch) => setDraft((current) => ({ ...current, ...patch }));
  const save = () => {
    const source = { ...draft, name_en: String(draft.name_en || '').trim(), name_ar: String(draft.name_ar || '').trim() || null, default_payment_method: String(draft.default_payment_method || 'cash') };
    if (!source.name_en) return setError('English name is required.');
    onSave(source);
  };
  return <Dialog open={Boolean(editor)} onOpenChange={(open) => !open && onClose()}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{editor.mode === 'create' ? 'Add Sales Source' : 'Edit Sales Source'}</DialogTitle><DialogDescription>Deactivation removes a source from future closings while preserving historical records.</DialogDescription></DialogHeader><div className="grid gap-4"><div className="grid gap-3 sm:grid-cols-2"><div><Label>English name</Label><Input value={draft.name_en || ''} onChange={(event) => set({ name_en: event.target.value })} placeholder="Delivery Apps" /></div><div><Label>Arabic name</Label><Input dir="rtl" value={draft.name_ar || ''} onChange={(event) => set({ name_ar: event.target.value })} placeholder="تطبيقات التوصيل" /></div></div><div className="grid gap-3 sm:grid-cols-2"><div><Label>Default payment method</Label><Select value={draft.default_payment_method || 'cash'} onValueChange={(default_payment_method) => set({ default_payment_method })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{paymentMethods.map((method) => <SelectItem key={method.id} value={method.code}>{method.name_ar || method.name_en}</SelectItem>)}</SelectContent></Select></div><div><Label>Display order</Label><Input type="number" min="0" value={draft.sort_order ?? 0} onChange={(event) => set({ sort_order: Number(event.target.value) || 0 })} /></div></div><div className="grid gap-3 sm:grid-cols-2"><label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">Active for new closings<Switch checked={draft.is_active !== false} onCheckedChange={(is_active) => set({ is_active })} /></label><label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">Include in revenue<Switch checked={draft.included_in_revenue !== false} onCheckedChange={(included_in_revenue) => set({ included_in_revenue })} /></label></div>{error && <Alert variant="destructive"><AlertTitle>Unable to save source</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}</div><DialogFooter className="gap-2 sm:gap-0"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="button" disabled={isSaving} onClick={save}>{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save sales source'}</Button></DialogFooter></DialogContent></Dialog>;
}

function Preview({ fields, sources, paymentMethods, config, currency }) {
  const visibleFields = fields.filter((field) => field.is_active !== false);
  const activeSources = sources.filter((source) => source.is_active !== false);
  const activeMethods = paymentMethods.filter((method) => method.is_active !== false);
  return <SectionCard title="Preview Sales Closing" description="This preview updates immediately from the saved field, source, payment-method, calculation, mobile, and desktop configuration."><div className="rounded-xl border bg-muted/20 p-3 sm:p-4"><div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-sm font-black">SALES CLOSING</p><p className="text-xs text-muted-foreground">Live configuration preview</p></div><Badge variant="outline">{config.calculations.automatic_totals ? 'Automatic totals' : 'Manual totals'}</Badge></div><div className="grid gap-3 md:grid-cols-[1fr_0.8fr]"><div className="space-y-2"><div className="grid grid-cols-2 gap-2">{visibleFields.filter((field) => ['branch', 'date', 'shift', 'cashier'].includes(field.field_key)).map((field) => <div key={field.id} className="rounded-lg border bg-background p-2 text-xs"><p className="font-semibold">{field.label_en}</p><p className="text-muted-foreground">{field.field_type === 'date' ? 'YYYY-MM-DD' : '—'}</p></div>)}</div><div className="rounded-lg border bg-background p-3"><p className="text-xs font-bold uppercase tracking-wide">Sales Sources</p><div className="mt-2 space-y-1.5">{activeSources.length ? activeSources.map((source) => <div key={source.id} className="flex justify-between gap-3 text-sm"><span className="truncate">{source.name_en}</span><span className="shrink-0 font-semibold tabular-nums">{currency} 0.00</span></div>) : <p className="text-xs text-muted-foreground">No active sales sources</p>}</div></div><div className="rounded-lg border bg-background p-3"><p className="text-xs font-bold uppercase tracking-wide">Payment Methods</p><p className="mt-1 text-xs text-muted-foreground">{activeMethods.map((method) => method.name_en).join(' · ') || 'No active payment methods'}</p></div>{visibleFields.filter((field) => !['branch', 'date', 'shift', 'cashier', 'sales_sources', 'payment_methods'].includes(field.field_key)).map((field) => <div key={field.id} className="rounded-lg border bg-background p-2 text-xs"><span className="font-semibold">{field.label_en}</span>{field.is_required && <span className="ml-1 text-destructive">*</span>}</div>)}</div><div className="space-y-2"><div className="rounded-lg border bg-background p-3 text-sm"><p className="text-muted-foreground">Total Sales</p><p className="mt-1 text-xl font-black tabular-nums">{currency} 0.00</p></div><div className="rounded-lg border bg-background p-3 text-sm"><p className="text-muted-foreground">Expected Cash</p><p className="mt-1 font-bold tabular-nums">{currency} 0.00</p></div><div className="rounded-lg border bg-background p-3 text-sm"><p className="text-muted-foreground">Actual Cash</p><p className="mt-1 font-bold tabular-nums">{currency} 0.00</p></div><div className="rounded-lg border bg-background p-3 text-sm"><p className="text-muted-foreground">Operating Result</p><p className="mt-1 font-bold tabular-nums">{currency} 0.00</p></div><Button type="button" className="min-h-11 w-full" disabled>Save Closing</Button></div></div></div></SectionCard>;
}

export default function SalesClosingCustomization() {
  const queryClient = useQueryClient();
  const { activeRestaurant } = useTenant();
  const { currency } = useLanguage();
  const { config, fields, paymentMethods, isLoading, isSaving, error, canCustomize, saveConfig, reload } = useSalesClosingCustomization();
  const restaurantId = activeRestaurant?.id || null;
  const [configDraft, setConfigDraft] = useState(() => normalizeSalesClosingConfig(config));
  const [fieldEditor, setFieldEditor] = useState(null);
  const [paymentEditor, setPaymentEditor] = useState(null);
  const [sourceEditor, setSourceEditor] = useState(null);
  useEffect(() => setConfigDraft(normalizeSalesClosingConfig(config)), [config]);

  const sourceQuery = useQuery({
    queryKey: ['sales-closing-sources', restaurantId],
    enabled: Boolean(restaurantId),
    queryFn: async () => {
      const { data, error: queryError } = await supabase.from('sales_sources').select('id, name_en, name_ar, sort_order, is_active, is_system, is_global, branch_id, default_payment_method, icon, color, included_in_revenue, included_in_cash_register, included_in_dashboard_kpi, included_in_profit_calc, created_date').eq('restaurant_id', restaurantId).order('sort_order');
      if (queryError) throw queryError;
      return asArray(data);
    },
  });
  const sourceQueryKey = ['sales-closing-sources', restaurantId];
  const activeSourcesKey = ['sales_sources_active', restaurantId];
  const sortSources = (items) => asArray(items).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  // The displayed source list is its own React state. Query-cache updates keep it
  // current across consumers, and this state makes the Owner's successful mutation
  // visible in the same render cycle rather than waiting on a subsequent query read.
  const [sources, setSources] = useState(() => sortSources(sourceQuery.data));
  const pendingSourcePatchesRef = useRef(new Map());
  useEffect(() => {
    const nextSources = sortSources(sourceQuery.data);
    for (const [sourceId, patch] of pendingSourcePatchesRef.current.entries()) {
      const serverSource = nextSources.find((source) => source.id === sourceId);
      const patchHasReachedServer = patch === false
        ? !serverSource
        : Boolean(serverSource) && Object.entries(patch).every(([key, value]) => serverSource[key] === value);
      if (!patchHasReachedServer) return;
      pendingSourcePatchesRef.current.delete(sourceId);
    }
    setSources(nextSources);
  }, [sourceQuery.data]);
  const mergeSourceCache = (savedSource) => {
    if (!savedSource?.id) return;
    const merge = (items) => {
      const previous = asArray(items);
      const exists = previous.some((item) => item.id === savedSource.id);
      return sortSources(previous.map((item) => item.id === savedSource.id ? { ...item, ...savedSource } : item).concat(exists ? [] : [savedSource]));
    };
    pendingSourcePatchesRef.current.set(savedSource.id, savedSource);
    setSources(merge);
    queryClient.setQueryData(sourceQueryKey, merge);
    queryClient.setQueriesData({ queryKey: activeSourcesKey }, merge);
  };
  const removeSourceFromCache = (sourceId) => {
    const without = (items) => asArray(items).filter((item) => item.id !== sourceId);
    pendingSourcePatchesRef.current.set(sourceId, false);
    setSources(without);
    queryClient.setQueryData(sourceQueryKey, without);
    queryClient.setQueriesData({ queryKey: activeSourcesKey }, without);
  };
  const invalidate = async ({ refetchSources = false } = {}) => {
    // The mutation response is authoritative for the saved source. Mark all
    // related source queries stale without replacing it with a racing read.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: sourceQueryKey, refetchType: 'none' }),
      queryClient.invalidateQueries({ queryKey: ['sales_sources'], refetchType: 'none' }),
      queryClient.invalidateQueries({ queryKey: activeSourcesKey, refetchType: 'none' }),
      reload(),
    ]);
    if (refetchSources) await sourceQuery.refetch();
  };

  const requestSaveSource = (source) => saveSource.mutate(source);

  const saveSource = useMutation({
    mutationFn: async (source) => {
      if (!restaurantId) throw new Error('Select an active restaurant before saving a sales source.');
      const payload = { ...source, restaurant_id: restaurantId, is_global: true, branch_id: null };
      if (source.id) { const { data, error: mutationError } = await supabase.from('sales_sources').update(payload).eq('id', source.id).select().single(); if (mutationError) throw mutationError; return data; }
      const { data, error: mutationError } = await supabase.from('sales_sources').insert(payload).select().single(); if (mutationError) throw mutationError; return data;
    },
    onSuccess: async (savedSource, source) => {
      // PostgREST's returned representation can lag a trigger-backed write. The
      // submitted patch is the same successful write, so prefer it for immediate UI.
      const immediateSource = { ...savedSource, ...source, id: savedSource?.id || source.id };
      mergeSourceCache(immediateSource);
      setSourceEditor(null);
      await invalidate();
      toast.success('Sales source saved.');
    },
    onError: (mutationError) => toast.error(mutationError.message || 'Unable to save sales source.'),
  });

  const deleteSource = useMutation({
    mutationFn: async (source) => { const { error: mutationError } = await supabase.from('sales_sources').delete().eq('id', source.id); if (mutationError) throw mutationError; },
    onSuccess: async (_, source) => {
      removeSourceFromCache(source.id);
      await invalidate();
      toast.success('Sales source deleted.');
    },
    onError: (mutationError) => toast.error(mutationError.message === 'SALES_SOURCE_IN_USE' ? 'This source is used by a historical closing and can only be deactivated.' : (mutationError.message || 'Unable to delete sales source.')),
  });

  const saveField = useMutation({
    mutationFn: async (field) => {
      if (!restaurantId) throw new Error('Select an active restaurant before saving a field.');
      const { id: fieldId, ...fieldPayload } = field;
      const payload = { ...fieldPayload, restaurant_id: restaurantId };
      if (fieldId) { const { data, error: mutationError } = await supabase.from('sales_closing_fields').update(payload).eq('id', fieldId).select().single(); if (mutationError) throw mutationError; return data; }
      const { data, error: mutationError } = await supabase.from('sales_closing_fields').insert(payload).select().single(); if (mutationError) throw mutationError; return data;
    },
    onSuccess: async () => { setFieldEditor(null); await reload(); toast.success('Sales Closing field saved.'); },
    onError: (mutationError) => toast.error(mutationError.message || 'Unable to save Sales Closing field.'),
  });

  const deleteField = useMutation({
    mutationFn: async (field) => { const { error: mutationError } = await supabase.from('sales_closing_fields').delete().eq('id', field.id); if (mutationError) throw mutationError; },
    onSuccess: async () => { await reload(); toast.success('Custom field removed. Historical closing values were retained.'); },
    onError: (mutationError) => toast.error(mutationError.message || 'Unable to remove field.'),
  });

  const savePaymentMethod = useMutation({
    mutationFn: async (method) => {
      if (!restaurantId) throw new Error('Select an active restaurant before saving a payment method.');
      const payload = { ...method, restaurant_id: restaurantId };
      if (method.id) { const { data, error: mutationError } = await supabase.from('payment_methods').update(payload).eq('id', method.id).select().single(); if (mutationError) throw mutationError; return data; }
      const { data, error: mutationError } = await supabase.from('payment_methods').insert(payload).select().single(); if (mutationError) throw mutationError; return data;
    },
    onSuccess: async () => { setPaymentEditor(null); await reload(); toast.success('Payment method saved.'); },
    onError: (mutationError) => toast.error(mutationError.message || 'Unable to save payment method.'),
  });

  const deletePaymentMethod = useMutation({
    mutationFn: async (method) => { const { error: mutationError } = await supabase.from('payment_methods').delete().eq('id', method.id); if (mutationError) throw mutationError; },
    onSuccess: async () => { await reload(); toast.success('Payment method deleted.'); },
    onError: (mutationError) => toast.error(mutationError.message || 'Unable to delete payment method.'),
  });

  const reorder = async (collection, resource, index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= collection.length) return;
    const current = collection[index];
    const other = collection[targetIndex];
    const table = resource === 'source' ? 'sales_sources' : resource === 'field' ? 'sales_closing_fields' : 'payment_methods';
    const { error: firstError } = await supabase.from(table).update({ sort_order: other.sort_order }).eq('id', current.id);
    if (firstError) return toast.error(firstError.message);
    const { error: secondError } = await supabase.from(table).update({ sort_order: current.sort_order }).eq('id', other.id);
    if (secondError) return toast.error(secondError.message);
    if (resource === 'source') {
      mergeSourceCache({ ...current, sort_order: other.sort_order });
      mergeSourceCache({ ...other, sort_order: current.sort_order });
    }
    await invalidate();
  };

  const saveConfiguration = async () => {
    try {
      await saveConfig(configDraft);
      await reload();
      toast.success('Sales Closing configuration saved successfully.');
    } catch (saveError) { toast.error(saveError?.message || 'Unable to save Sales Closing configuration.'); }
  };

  const updateConfig = (section, patch) => setConfigDraft((current) => ({ ...current, [section]: { ...current[section], ...patch } }));

  if (!canCustomize && !isLoading) return <main className="mx-auto max-w-3xl p-4 sm:p-6"><Alert variant="destructive"><ShieldCheck className="h-4 w-4" /><AlertTitle>Sales Closing Customization is restricted</AlertTitle><AlertDescription>Only the organization Owner or an explicitly delegated administrator can manage the Sales Closing configuration.</AlertDescription></Alert></main>;

  const mutationPending = isSaving || saveSource.isPending || saveField.isPending || savePaymentMethod.isPending || deleteSource.isPending || deleteField.isPending || deletePaymentMethod.isPending;

  return <main className="mx-auto w-full max-w-7xl space-y-4 p-4 pb-28 sm:p-6 lg:p-8"><PageHeader title="Sales Closing Customization" subtitle="Configure the form, sales sources, payment methods, validation, responsive layout, and owner-only controls for future sales closings." icon={Settings2} />{error && <Alert variant="destructive"><AlertTitle>Configuration error</AlertTitle><AlertDescription>{error.message}</AlertDescription></Alert>}{isLoading ? <Card className="p-8 text-sm text-muted-foreground">Loading Sales Closing configuration…</Card> : <Tabs defaultValue="form-builder" className="space-y-4"><TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-lg bg-muted p-1"><TabsTrigger value="form-builder">Form Builder</TabsTrigger><TabsTrigger value="sources">Sales Sources</TabsTrigger><TabsTrigger value="payments">Payment Methods</TabsTrigger><TabsTrigger value="calculations">Calculations</TabsTrigger><TabsTrigger value="layout">Layouts</TabsTrigger><TabsTrigger value="validation">Validation</TabsTrigger><TabsTrigger value="permissions">Permissions</TabsTrigger><TabsTrigger value="preview">Live Preview</TabsTrigger></TabsList><TabsContent value="form-builder" className="space-y-4"><SectionCard title="Fields, Field Order, and Required Fields" description="Add, rename, enable, disable, reorder, and configure required status, supported type, Arabic label, and mobile/desktop visibility. Core integrity fields remain protected."><div className="space-y-3">{fields.map((field, index) => <div key={`${field.id}-${field.label_en}-${field.sort_order}-${field.is_active}-${field.is_required}-${field.visible_mobile}-${field.visible_desktop}`} className="rounded-xl border p-3"><div className="flex flex-col gap-3 sm:flex-row sm:items-start"><div className="min-w-0 flex-1"><p className="font-medium">{field.label_en}{field.label_ar && <span className="ml-2 text-sm font-normal text-muted-foreground" dir="rtl">{field.label_ar}</span>}</p><p className="mt-1 text-xs text-muted-foreground">{field.field_key} · display order {field.sort_order}</p><FieldStatus field={field} /></div><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setFieldEditor({ mode: 'edit', field })}>Edit</Button><Button type="button" size="icon" variant="outline" aria-label="Move field up" disabled={index === 0} onClick={() => reorder(fields, 'field', index, -1)}><ArrowUp className="h-4 w-4" /></Button><Button type="button" size="icon" variant="outline" aria-label="Move field down" disabled={index === fields.length - 1} onClick={() => reorder(fields, 'field', index, 1)}><ArrowDown className="h-4 w-4" /></Button>{!field.is_system && <Button type="button" size="icon" variant="ghost" className="text-destructive" aria-label="Delete custom field" onClick={() => deleteField.mutate(field)}><Trash2 className="h-4 w-4" /></Button>}</div></div></div>)}{!fields.length && <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">No fields found. Save the configuration once to initialize the protected default fields.</p>}<Button type="button" variant="outline" onClick={() => setFieldEditor({ mode: 'create', field: newSalesClosingCustomField(fields.length * 10 + 10) })}><Plus className="mr-2 h-4 w-4" />Add Field</Button></div></SectionCard></TabsContent><TabsContent value="sources"><SectionCard title="Manage Sales Sources" description="Create unlimited stable-ID sources, edit labels, activate/deactivate, reorder, and delete only sources never used by a historical closing."><div className="space-y-3">{sources.map((source, index) => <div key={`${source.id}-${source.name_en}-${source.default_payment_method}-${source.sort_order}`} className={`rounded-xl border p-3 ${source.is_active === false ? 'bg-muted/40 opacity-75' : ''}`}><div className="flex flex-col gap-3 sm:flex-row sm:items-start"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{source.name_en}</p>{source.name_ar && <span className="text-sm text-muted-foreground" dir="rtl">{source.name_ar}</span>}{source.is_system && <Badge variant="outline">System</Badge>}{source.is_active === false && <Badge variant="outline">Inactive</Badge>}</div><p className="mt-1 text-xs text-muted-foreground">Default method: {String(source.default_payment_method || 'cash').replaceAll('_', ' ')} · display order {source.sort_order}</p></div><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setSourceEditor({ mode: 'edit', source })}>Edit</Button><Button type="button" size="icon" variant="outline" aria-label="Move source up" disabled={index === 0} onClick={() => reorder(sources, 'source', index, -1)}><ArrowUp className="h-4 w-4" /></Button><Button type="button" size="icon" variant="outline" aria-label="Move source down" disabled={index === sources.length - 1} onClick={() => reorder(sources, 'source', index, 1)}><ArrowDown className="h-4 w-4" /></Button><Button type="button" size="icon" variant="outline" aria-label={source.is_active === false ? 'Activate source' : 'Deactivate source'} onClick={() => saveSource.mutate({ ...source, is_active: source.is_active === false })}>{source.is_active === false ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</Button>{!source.is_system && <Button type="button" size="icon" variant="ghost" className="text-destructive" aria-label="Delete source" onClick={() => deleteSource.mutate(source)}><Trash2 className="h-4 w-4" /></Button>}</div></div></div>)}{!sources.length && <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">No sales sources are available for the active organization.</p>}<Button type="button" onClick={() => setSourceEditor({ mode: 'create', source: { name_en: '', name_ar: '', sort_order: sources.length * 10 + 10, is_active: true, is_global: true, default_payment_method: 'cash', icon: 'Banknote', color: 'emerald', included_in_revenue: true, included_in_cash_register: true, included_in_dashboard_kpi: true, included_in_profit_calc: true, is_system: false } })}><Plus className="mr-2 h-4 w-4" />Add Sales Source</Button></div></SectionCard></TabsContent><TabsContent value="payments"><SectionCard title="Manage Payment Methods" description="Add, edit, activate, deactivate, reorder, and remove organization-scoped payment methods. Active methods appear in new Sales Closings."><div className="space-y-3">{paymentMethods.map((method, index) => <div key={`${method.id}-${method.name_en}-${method.sort_order}-${method.is_active}`} className={`rounded-xl border p-3 ${method.is_active === false ? 'bg-muted/40 opacity-75' : ''}`}><div className="flex flex-col gap-3 sm:flex-row sm:items-start"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{method.name_en}</p>{method.name_ar && <span className="text-sm text-muted-foreground" dir="rtl">{method.name_ar}</span>}{method.is_system && <Badge variant="outline">System</Badge>}{method.is_active === false && <Badge variant="outline">Inactive</Badge>}</div><p className="mt-1 text-xs text-muted-foreground">{method.code} · display order {method.sort_order}</p></div><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setPaymentEditor({ mode: 'edit', method })}>Edit</Button><Button type="button" size="icon" variant="outline" aria-label="Move payment method up" disabled={index === 0} onClick={() => reorder(paymentMethods, 'payment', index, -1)}><ArrowUp className="h-4 w-4" /></Button><Button type="button" size="icon" variant="outline" aria-label="Move payment method down" disabled={index === paymentMethods.length - 1} onClick={() => reorder(paymentMethods, 'payment', index, 1)}><ArrowDown className="h-4 w-4" /></Button><Button type="button" size="icon" variant="outline" aria-label={method.is_active === false ? 'Activate payment method' : 'Deactivate payment method'} onClick={() => savePaymentMethod.mutate({ ...method, is_active: method.is_active === false })}>{method.is_active === false ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</Button>{!method.is_system && <Button type="button" size="icon" variant="ghost" className="text-destructive" aria-label="Delete payment method" onClick={() => deletePaymentMethod.mutate(method)}><Trash2 className="h-4 w-4" /></Button>}</div></div></div>)}<Button type="button" onClick={() => setPaymentEditor({ mode: 'create', method: { code: '', name_en: '', name_ar: '', sort_order: paymentMethods.length * 10 + 10, is_active: true, is_system: false } })}><Plus className="mr-2 h-4 w-4" />Add Payment Method</Button></div></SectionCard></TabsContent><TabsContent value="calculations"><SectionCard title="Calculations" description="Core financial calculations remain standardized. This switch controls whether the workspace uses posted ERP sales automatically."><label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">Use automatic ERP sales totals<Switch checked={configDraft.calculations.automatic_totals !== false} onCheckedChange={(automatic_totals) => updateConfig('calculations', { automatic_totals })} /></label></SectionCard></TabsContent><TabsContent value="layout" className="space-y-4"><SectionCard title="Mobile Layout" description="The customization page and closing workspace maintain responsive, touch-friendly layouts with no horizontal page overflow."><label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">Show live summary on mobile<Switch checked={configDraft.layout.mobile_summary !== false} onCheckedChange={(mobile_summary) => updateConfig('layout', { mobile_summary })} /></label></SectionCard><SectionCard title="Desktop Layout" description="The live summary remains available in the desktop Sales Closing workspace."><label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">Show live summary on desktop<Switch checked={configDraft.layout.desktop_summary !== false} onCheckedChange={(desktop_summary) => updateConfig('layout', { desktop_summary })} /></label></SectionCard></TabsContent><TabsContent value="validation"><SectionCard title="Validation Rules" description="Choose whether future closings require cash reconciliation before saving. Core tenant and branch authorization remains enforced by the backend."><label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">Require cash reconciliation<Switch checked={configDraft.validation_rules.require_cash_reconciliation !== false} onCheckedChange={(require_cash_reconciliation) => updateConfig('validation_rules', { require_cash_reconciliation })} /></label></SectionCard></TabsContent><TabsContent value="permissions"><SectionCard title="Permissions" description="Configuration writes are protected by owner/delegated-administrator policies in the database. Normal staff cannot access these controls."><div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-700" /><div><p className="font-medium text-emerald-950">Owner/Admin configuration access</p><p className="mt-1 text-sm text-emerald-800">The current page is restricted to the organization Owner or an explicitly delegated customization administrator. Sales Closing data access remains governed by tenant and branch RLS.</p></div></div></SectionCard></TabsContent><TabsContent value="preview"><Preview fields={fields} sources={sources} paymentMethods={paymentMethods} config={configDraft} currency={currency} /></TabsContent></Tabs>}<div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur sm:left-auto sm:right-6 sm:bottom-6 sm:rounded-xl sm:border sm:shadow-lg"><div className="mx-auto flex max-w-7xl justify-end gap-2"><Button type="button" variant="outline" disabled={mutationPending} onClick={() => invalidate({ refetchSources: true })}><ChevronRight className="mr-2 h-4 w-4" />Reload</Button><Button type="button" disabled={mutationPending} onClick={saveConfiguration}><Save className="mr-2 h-4 w-4" />{mutationPending ? 'Saving…' : 'Save Configuration'}</Button></div></div><CustomFieldDialog editor={fieldEditor} onClose={() => setFieldEditor(null)} onSave={(field) => saveField.mutate(field)} isSaving={saveField.isPending} /><PaymentMethodDialog editor={paymentEditor} onClose={() => setPaymentEditor(null)} onSave={(method) => savePaymentMethod.mutate(method)} isSaving={savePaymentMethod.isPending} /><SalesSourceDialog editor={sourceEditor} onClose={() => setSourceEditor(null)} onSave={requestSaveSource} isSaving={saveSource.isPending} paymentMethods={paymentMethods} /></main>;
}
