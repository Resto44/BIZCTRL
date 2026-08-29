import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { CORE_SALES_CLOSING_FIELDS, SALES_CLOSING_FIELD_TYPES, newSalesClosingCustomField, normalizeSalesClosingField } from '@/lib/salesClosingCustomization';
import { useLanguage } from '@/lib/LanguageContext';
import { Check } from 'lucide-react';
import { SALES_SOURCE_COLOR_OPTIONS, SALES_SOURCE_ICON_OPTIONS, salesSourceToneFor } from '@/lib/salesSourceAppearance';

const asArray = (value) => Array.isArray(value) ? value.filter(Boolean) : [];
const localizedDataName = (record, lang) => {
  if (lang === 'fa') return record?.name_fa || record?.name_ar || record?.name_en || '';
  if (lang === 'ar') return record?.name_ar || record?.name_en || '';
  return record?.name_en || record?.name_ar || record?.name_fa || '';
};

const SOURCE_CATEGORIES = ['delivery', 'wholesale', 'counter', 'online', 'corporate', 'credit', 'bank_transfer', 'other'];

export function newSalesClosingSource(order = 10) {
  return {
    name_en: '',
    name_ar: '',
    name_fa: '',
    description: '',
    category: 'other',
    subcategory: '',
    allows_driver_entries: false,
    sort_order: order,
    is_active: true,
    is_global: true,
    branch_id: null,
    branch_ids: [],
    default_payment_method: 'cash',
    icon: 'Banknote',
    color: 'emerald',
    included_in_revenue: true,
    included_in_cash_register: true,
    included_in_dashboard_kpi: true,
    included_in_profit_calc: true,
    requires_customer: false,
    requires_pos_device: false,
    requires_reference: false,
    requires_wallet: false,
    is_system: false,
  };
}

export function SalesClosingFieldDialog({ editor, onClose, onSave, isSaving }) {
  const { t } = useLanguage();
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
    if (!normalized.label_en) return setError(t('salesClosing.dialog.fieldNameRequired'));
    if (!normalized.field_key) return setError(t('salesClosing.dialog.fieldKeyRequired'));
    if (normalized.field_type === 'dropdown' && !normalized.options.length) return setError(t('salesClosing.dialog.selectOptionRequired'));
    if (normalized.is_required && normalized.is_active === false) return setError(t('salesClosing.dialog.requiredCannotDisabled'));
    onSave(normalized);
  };

  return (
    <Dialog open={Boolean(editor)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl" data-i18n-skip="true">
        <DialogHeader>
          <DialogTitle>{editor.mode === 'create' ? t('salesClosing.dialog.addField') : t('salesClosing.dialog.editField')}</DialogTitle>
          <DialogDescription>{t('salesClosing.dialog.fieldChanges')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>{t('salesClosing.dialog.fieldKey')}</Label><Input value={draft.field_key || ''} disabled={Boolean(editor.field?.is_system)} onChange={(event) => set({ field_key: event.target.value })} placeholder="field_key" maxLength={64} /></div>
            <div><Label>{t('salesClosing.dialog.fieldType')}</Label><Select value={draft.field_type || 'text'} onValueChange={(field_type) => set({ field_type, options: field_type === 'dropdown' ? draft.options || [] : [] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SALES_CLOSING_FIELD_TYPES.map((type) => <SelectItem key={type} value={type}>{type.replaceAll('_', ' ')}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>{t('salesClosing.dialog.fieldNameEnglish')}</Label><Input value={draft.label_en || ''} onChange={(event) => set({ label_en: event.target.value })} maxLength={120} /></div>
            <div><Label>{t('salesClosing.dialog.arabicLabel')}</Label><Input dir="rtl" value={draft.label_ar || ''} onChange={(event) => set({ label_ar: event.target.value })} maxLength={120} /></div>
          </div>
          <div><Label>{t('salesClosing.dialog.helpTextOptional')}</Label><Textarea value={draft.help_text || ''} onChange={(event) => set({ help_text: event.target.value })} rows={2} maxLength={300} /></div>
          {draft.field_type === 'dropdown' && <div><Label>{t('salesClosing.dialog.optionsOnePerLine')}</Label><Textarea value={asArray(draft.options).join('\n')} onChange={(event) => set({ options: event.target.value.split('\n') })} placeholder={'Standard\nPremium'} rows={4} /></div>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>{t('salesClosing.dialog.displayOrder')}</Label><Input type="number" min="0" value={draft.sort_order ?? 0} onChange={(event) => set({ sort_order: Number(event.target.value) || 0 })} /></div>
            <div className="grid grid-cols-2 gap-2 pt-6"><label className="flex items-center justify-between gap-2 rounded-lg border p-2 text-xs">{t('salesClosing.dialog.required')}<Switch checked={Boolean(draft.is_required)} disabled={CORE_SALES_CLOSING_FIELDS.has(draft.field_key)} onCheckedChange={(is_required) => set({ is_required })} /></label><label className="flex items-center justify-between gap-2 rounded-lg border p-2 text-xs">{t('salesClosing.dialog.active')}<Switch checked={draft.is_active !== false} disabled={CORE_SALES_CLOSING_FIELDS.has(draft.field_key)} onCheckedChange={(is_active) => set({ is_active })} /></label></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2"><label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">{t('salesClosing.dialog.showMobile')}<Switch checked={draft.visible_mobile !== false} onCheckedChange={(visible_mobile) => set({ visible_mobile })} /></label><label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">{t('salesClosing.dialog.showDesktop')}<Switch checked={draft.visible_desktop !== false} onCheckedChange={(visible_desktop) => set({ visible_desktop })} /></label></div>
          {error && <Alert variant="destructive"><AlertTitle>{t('salesClosing.dialog.unableSaveField')}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        </div>
        <DialogFooter className="gap-2 sm:gap-0"><Button type="button" variant="outline" onClick={onClose}>{t('salesClosing.dialog.cancel')}</Button><Button type="button" disabled={isSaving} onClick={save}>{isSaving ? t('salesClosing.dialog.saving') : t('salesClosing.dialog.saveField')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SalesSourceDialog({ editor, onClose, onSave, isSaving, paymentMethods = [], branches = [] }) {
  const { lang, t } = useLanguage();
  const [draft, setDraft] = useState(editor?.source || newSalesClosingSource());
  const [error, setError] = useState('');

  useEffect(() => {
    setDraft({ ...newSalesClosingSource(), ...(editor?.source || {}) });
    setError('');
  }, [editor]);

  if (!editor) return null;
  const set = (patch) => setDraft((current) => ({ ...current, ...patch }));
  const toggleBranch = (branchId) => set((current) => {
    const selected = new Set(asArray(current.branch_ids).map(String));
    if (selected.has(String(branchId))) selected.delete(String(branchId));
    else selected.add(String(branchId));
    return { branch_ids: Array.from(selected) };
  });
  const save = () => {
    const source = {
      ...draft,
      name_en: String(draft.name_en || '').trim(),
      name_ar: String(draft.name_ar || '').trim() || null,
      name_fa: String(draft.name_fa || '').trim() || null,
      description: String(draft.description || '').trim() || null,
      category: String(draft.category || 'other'),
      subcategory: String(draft.subcategory || '').trim() || null,
      default_payment_method: String(draft.default_payment_method || 'cash'),
      icon: SALES_SOURCE_ICON_OPTIONS.some((option) => option.value === draft.icon) ? draft.icon : 'Banknote',
      color: SALES_SOURCE_COLOR_OPTIONS.some((option) => option.value === draft.color) ? draft.color : 'emerald',
      allows_driver_entries: Boolean(draft.allows_driver_entries),
      branch_ids: draft.is_global === false ? Array.from(new Set(asArray(draft.branch_ids).map(String).filter(Boolean))) : [],
    };
    if (!source.name_en) return setError(t('salesClosing.dialog.sourceNameRequired'));
    if (source.is_global === false && !source.branch_ids.length && !source.branch_id) return setError(t('salesSourceManagement.branchRequired'));
    onSave(source);
  };

  return (
    <Dialog open={Boolean(editor)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl" data-i18n-skip="true">
        <DialogHeader>
          <DialogTitle>{editor.mode === 'create' ? t('salesClosing.dialog.addSource') : t('salesClosing.dialog.editSource')}</DialogTitle>
          <DialogDescription>{t('salesClosing.dialog.sourceDeactivation')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <section className="grid gap-3">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t('salesSourceManagement.identity')}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div><Label>{t('salesClosing.dialog.sourceNameEnglish')}</Label><Input value={draft.name_en || ''} onChange={(event) => set({ name_en: event.target.value })} /></div>
              <div><Label>{t('salesClosing.dialog.arabicName')}</Label><Input dir="rtl" value={draft.name_ar || ''} onChange={(event) => set({ name_ar: event.target.value })} /></div>
              <div><Label>{t('salesSourceManagement.persianName')}</Label><Input dir="rtl" value={draft.name_fa || ''} onChange={(event) => set({ name_fa: event.target.value })} /></div>
            </div>
            <div><Label>{t('salesClosing.dialog.descriptionOptional')}</Label><Textarea value={draft.description || ''} onChange={(event) => set({ description: event.target.value })} rows={2} maxLength={300} /></div>
          </section>
          <section className="grid gap-3 rounded-xl border bg-muted/20 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t('salesSourceManagement.configuration')}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div><Label>{t('salesSourceManagement.category')}</Label><Select value={draft.category || 'other'} onValueChange={(category) => set({ category })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SOURCE_CATEGORIES.map((category) => <SelectItem key={category} value={category}>{t(`salesSourceManagement.category.${category}`)}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Optional Subcategory</Label><Input value={draft.subcategory || ''} onChange={(event) => set({ subcategory: event.target.value })} placeholder="e.g. Drivers" maxLength={120} /></div>
              <div><Label>{t('salesClosing.dialog.defaultPayment')}</Label><Select value={draft.default_payment_method || 'cash'} onValueChange={(default_payment_method) => set({ default_payment_method })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{paymentMethods.filter((method) => method.is_active !== false).map((method) => <SelectItem key={method.id} value={method.code}>{localizedDataName(method, lang)}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>{t('salesClosing.dialog.displayOrder')}</Label><Input type="number" min="0" value={draft.sort_order ?? 0} onChange={(event) => set({ sort_order: Number(event.target.value) || 0 })} /></div>
            </div>
            <div className="grid gap-4 rounded-xl border bg-background p-3">
              <div>
                <Label>{t('salesSourceManagement.appearance')}</Label>
                <p className="mt-1 text-xs text-muted-foreground">{t('salesSourceManagement.appearanceHelp')}</p>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold text-foreground">{t('salesSourceManagement.icon')}</p>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-7" role="group" aria-label={t('salesSourceManagement.icon')}>
                  {SALES_SOURCE_ICON_OPTIONS.map(({ value, label, Icon }) => {
                    const selected = (draft.icon || 'Banknote') === value;
                    const tone = salesSourceToneFor(draft.color);
                    return <button key={value} type="button" aria-label={label} aria-pressed={selected} title={label} onClick={() => set({ icon: value })} className={`flex min-h-12 items-center justify-center rounded-xl border transition ${selected ? `${tone.border} ${tone.soft} ${tone.text} ring-2 ring-current/20` : 'border-border bg-background text-muted-foreground hover:bg-muted'}`}><Icon className="h-5 w-5" /></button>;
                  })}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold text-foreground">{t('salesSourceManagement.color')}</p>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-7" role="group" aria-label={t('salesSourceManagement.color')}>
                  {SALES_SOURCE_COLOR_OPTIONS.map((option) => {
                    const selected = (draft.color || 'emerald') === option.value;
                    return <button key={option.value} type="button" aria-label={option.label} aria-pressed={selected} title={option.label} onClick={() => set({ color: option.value })} className={`relative flex min-h-11 items-center justify-center rounded-xl border ${selected ? `${option.border} ${option.soft} ring-2 ring-current/20` : 'border-border bg-background hover:bg-muted'}`}><span className={`h-5 w-5 rounded-full ${option.swatch}`} />{selected && <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-background shadow"><Check className={`h-3 w-3 ${option.text}`} /></span>}</button>;
                  })}
                </div>
              </div>
            </div>
            <label className="flex items-center justify-between gap-3 rounded-lg border bg-background p-3 text-sm"><span><span className="block font-medium">Driver-linked entries</span><span className="mt-0.5 block text-xs text-muted-foreground">Allow this source to collect branch-scoped Driver Master records. Its today total will be derived from those entries.</span></span><Switch checked={Boolean(draft.allows_driver_entries)} onCheckedChange={(allows_driver_entries) => set({ allows_driver_entries })} /></label>
            <label className="flex items-center justify-between gap-3 rounded-lg border bg-background p-3 text-sm"><span><span className="block font-medium">{t('salesSourceManagement.allBranches')}</span><span className="mt-0.5 block text-xs text-muted-foreground">{t('salesSourceManagement.allBranchesHelp')}</span></span><Switch checked={draft.is_global !== false} onCheckedChange={(is_global) => set({ is_global, branch_ids: is_global ? [] : draft.branch_ids || [] })} /></label>
            {draft.is_global === false && <div className="grid gap-2 rounded-lg border bg-background p-3 sm:grid-cols-2">{branches.map((branch) => { const id = String(branch.id); const checked = asArray(draft.branch_ids).map(String).includes(id); return <label key={id} className="flex min-h-10 items-center gap-2 rounded-md px-2 text-sm hover:bg-muted"><input type="checkbox" checked={checked} onChange={() => toggleBranch(id)} className="h-4 w-4 accent-primary" /><span className="truncate">{branch.name || branch.label || branch.branch_key || branch.key}</span></label>; })}</div>}
          </section>
          <section className="grid gap-3">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t('salesSourceManagement.accountingBehavior')}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">{t('salesClosing.dialog.activeForNew')}<Switch checked={draft.is_active !== false} onCheckedChange={(is_active) => set({ is_active })} /></label>
              <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">{t('salesClosing.dialog.includeRevenue')}<Switch checked={draft.included_in_revenue !== false} onCheckedChange={(included_in_revenue) => set({ included_in_revenue })} /></label>
              <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">{t('salesSourceManagement.includeCashRegister')}<Switch checked={draft.included_in_cash_register !== false} onCheckedChange={(included_in_cash_register) => set({ included_in_cash_register })} /></label>
              <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">{t('salesSourceManagement.includeDashboard')}<Switch checked={draft.included_in_dashboard_kpi !== false} onCheckedChange={(included_in_dashboard_kpi) => set({ included_in_dashboard_kpi })} /></label>
              <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">{t('salesSourceManagement.includeProfit')}<Switch checked={draft.included_in_profit_calc !== false} onCheckedChange={(included_in_profit_calc) => set({ included_in_profit_calc })} /></label>
              <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">{t('salesSourceManagement.requireCustomer')}<Switch checked={Boolean(draft.requires_customer)} onCheckedChange={(requires_customer) => set({ requires_customer })} /></label>
              <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">{t('salesSourceManagement.requirePos')}<Switch checked={Boolean(draft.requires_pos_device)} onCheckedChange={(requires_pos_device) => set({ requires_pos_device })} /></label>
              <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">{t('salesSourceManagement.requireReference')}<Switch checked={Boolean(draft.requires_reference)} onCheckedChange={(requires_reference) => set({ requires_reference })} /></label>
              <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">{t('salesSourceManagement.requireWallet')}<Switch checked={Boolean(draft.requires_wallet)} onCheckedChange={(requires_wallet) => set({ requires_wallet })} /></label>
            </div>
          </section>
          {error && <Alert variant="destructive"><AlertTitle>{t('salesClosing.dialog.unableSaveSource')}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        </div>
        <DialogFooter className="gap-2 sm:gap-0"><Button type="button" variant="outline" onClick={onClose}>{t('salesClosing.dialog.cancel')}</Button><Button type="button" disabled={isSaving} onClick={save}>{isSaving ? t('salesClosing.dialog.saving') : t('salesClosing.dialog.saveSource')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
