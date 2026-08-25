import React, { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { CORE_SALES_CLOSING_FIELDS, SALES_CLOSING_FIELD_TYPES, newSalesClosingCustomField, normalizeSalesClosingField } from '@/lib/salesClosingCustomization';

const asArray = (value) => Array.isArray(value) ? value.filter(Boolean) : [];

export function newSalesClosingSource(order = 10) {
  return {
    name_en: '',
    name_ar: '',
    description: '',
    sort_order: order,
    is_active: true,
    is_global: true,
    default_payment_method: 'cash',
    icon: 'Banknote',
    color: 'emerald',
    included_in_revenue: true,
    included_in_cash_register: true,
    included_in_dashboard_kpi: true,
    included_in_profit_calc: true,
    is_system: false,
  };
}

export function SalesClosingFieldDialog({ editor, onClose, onSave, isSaving }) {
  const [draft, setDraft] = useState(editor?.field || newSalesClosingCustomField());
  const [error, setError] = useState('');

  useEffect(() => {
    setDraft(editor?.field || newSalesClosingCustomField());
    setError('');
  }, [editor]);

  if (!editor) return null;
  const set = (patch) => setDraft((current) => ({ ...current, ...patch }));
  const save = () => {
    const normalized = normalizeSalesClosingField({
      ...draft,
      options: Array.isArray(draft.options) ? draft.options : String(draft.options || '').split('\n'),
    }, draft.sort_order);
    if (!normalized.label_en) return setError('Field name is required.');
    if (!normalized.field_key) return setError('Field key is required.');
    if (normalized.field_type === 'dropdown' && !normalized.options.length) return setError('Select fields require at least one option.');
    if (normalized.is_required && normalized.is_active === false) return setError('A required field cannot be disabled.');
    onSave(normalized);
  };

  return (
    <Dialog open={Boolean(editor)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editor.mode === 'create' ? 'Add Closing Field' : 'Edit Closing Field'}</DialogTitle>
          <DialogDescription>Changes apply to future closings only. Historical saved values remain unchanged.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Field key</Label><Input value={draft.field_key || ''} disabled={Boolean(editor.field?.is_system)} onChange={(event) => set({ field_key: event.target.value })} placeholder="driver_cash" maxLength={64} /></div>
            <div><Label>Field type</Label><Select value={draft.field_type || 'text'} onValueChange={(field_type) => set({ field_type, options: field_type === 'dropdown' ? draft.options || [] : [] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SALES_CLOSING_FIELD_TYPES.map((type) => <SelectItem key={type} value={type}>{type.replaceAll('_', ' ')}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Field name / English label</Label><Input value={draft.label_en || ''} onChange={(event) => set({ label_en: event.target.value })} placeholder="Driver Cash" maxLength={120} /></div>
            <div><Label>Arabic label</Label><Input dir="rtl" value={draft.label_ar || ''} onChange={(event) => set({ label_ar: event.target.value })} placeholder="نقد السائق" maxLength={120} /></div>
          </div>
          <div><Label>Help text (optional)</Label><Textarea value={draft.help_text || ''} onChange={(event) => set({ help_text: event.target.value })} placeholder="Enter the cash collected by drivers." rows={2} maxLength={300} /></div>
          {draft.field_type === 'dropdown' && <div><Label>Options, one per line</Label><Textarea value={asArray(draft.options).join('\n')} onChange={(event) => set({ options: event.target.value.split('\n') })} placeholder={'Standard\nPremium'} rows={4} /></div>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Display order</Label><Input type="number" min="0" value={draft.sort_order ?? 0} onChange={(event) => set({ sort_order: Number(event.target.value) || 0 })} /></div>
            <div className="grid grid-cols-2 gap-2 pt-6"><label className="flex items-center justify-between gap-2 rounded-lg border p-2 text-xs">Required<Switch checked={Boolean(draft.is_required)} disabled={CORE_SALES_CLOSING_FIELDS.has(draft.field_key)} onCheckedChange={(is_required) => set({ is_required })} /></label><label className="flex items-center justify-between gap-2 rounded-lg border p-2 text-xs">Active<Switch checked={draft.is_active !== false} disabled={CORE_SALES_CLOSING_FIELDS.has(draft.field_key)} onCheckedChange={(is_active) => set({ is_active })} /></label></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2"><label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">Show on mobile<Switch checked={draft.visible_mobile !== false} onCheckedChange={(visible_mobile) => set({ visible_mobile })} /></label><label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">Show on desktop<Switch checked={draft.visible_desktop !== false} onCheckedChange={(visible_desktop) => set({ visible_desktop })} /></label></div>
          {error && <Alert variant="destructive"><AlertTitle>Unable to save field</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        </div>
        <DialogFooter className="gap-2 sm:gap-0"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="button" disabled={isSaving} onClick={save}>{isSaving ? 'Saving…' : 'Save field'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SalesSourceDialog({ editor, onClose, onSave, isSaving, paymentMethods }) {
  const [draft, setDraft] = useState(editor?.source || newSalesClosingSource());
  const [error, setError] = useState('');

  useEffect(() => {
    setDraft(editor?.source || newSalesClosingSource());
    setError('');
  }, [editor]);

  if (!editor) return null;
  const set = (patch) => setDraft((current) => ({ ...current, ...patch }));
  const save = () => {
    const source = {
      ...draft,
      name_en: String(draft.name_en || '').trim(),
      name_ar: String(draft.name_ar || '').trim() || null,
      description: String(draft.description || '').trim() || null,
      default_payment_method: String(draft.default_payment_method || 'cash'),
    };
    if (!source.name_en) return setError('Source name is required.');
    onSave(source);
  };

  return (
    <Dialog open={Boolean(editor)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editor.mode === 'create' ? 'Add Sales Source' : 'Edit Sales Source'}</DialogTitle>
          <DialogDescription>Deactivation removes a source from future closings while preserving historical records.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2"><div><Label>Source name / English label</Label><Input value={draft.name_en || ''} onChange={(event) => set({ name_en: event.target.value })} placeholder="Delivery Orders" /></div><div><Label>Arabic name</Label><Input dir="rtl" value={draft.name_ar || ''} onChange={(event) => set({ name_ar: event.target.value })} placeholder="طلبات التوصيل" /></div></div>
          <div><Label>Description (optional)</Label><Textarea value={draft.description || ''} onChange={(event) => set({ description: event.target.value })} placeholder="Optional context for this sales source." rows={2} maxLength={300} /></div>
          <div className="grid gap-3 sm:grid-cols-2"><div><Label>Default payment method</Label><Select value={draft.default_payment_method || 'cash'} onValueChange={(default_payment_method) => set({ default_payment_method })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{paymentMethods.filter((method) => method.is_active !== false).map((method) => <SelectItem key={method.id} value={method.code}>{method.name_ar || method.name_en}</SelectItem>)}</SelectContent></Select></div><div><Label>Display order</Label><Input type="number" min="0" value={draft.sort_order ?? 0} onChange={(event) => set({ sort_order: Number(event.target.value) || 0 })} /></div></div>
          <div className="grid gap-3 sm:grid-cols-2"><label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">Active for new closings<Switch checked={draft.is_active !== false} onCheckedChange={(is_active) => set({ is_active })} /></label><label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">Include in revenue<Switch checked={draft.included_in_revenue !== false} onCheckedChange={(included_in_revenue) => set({ included_in_revenue })} /></label></div>
          {error && <Alert variant="destructive"><AlertTitle>Unable to save source</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        </div>
        <DialogFooter className="gap-2 sm:gap-0"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="button" disabled={isSaving} onClick={save}>{isSaving ? 'Saving…' : 'Save sales source'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
