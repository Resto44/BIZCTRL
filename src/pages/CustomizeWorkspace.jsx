import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowDown, ArrowUp, Building2, ChevronRight,
  CheckCircle2, Gauge, LayoutDashboard, ListFilter, Palette, Plus,
  RotateCcw, Save, Settings2, ShieldCheck, Trash2,
} from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { useWorkspaceCustomization } from '@/lib/WorkspaceCustomizationContext';
import {
  CUSTOM_FIELD_TYPES,
  BUSINESS_TEMPLATE_PRESETS,
  DEFAULT_WORKSPACE_CUSTOMIZATION,
  PRODUCT_FIELD_KEYS,
  PRODUCT_TABLE_COLUMNS,
  WORKSPACE_MODULE_CATALOG,
  WORKSPACE_NAVIGATION_PATHS,
  applyBusinessTemplate,
  isWorkspaceModuleEnabled,
  mergeWorkspaceCustomization,
  normalizeWorkspaceCustomization,
  reorderList,
} from '@/lib/workspaceCustomization';
import { ERP_NAV_GROUPS } from '@/components/layout/ERPSidebar';
import { useBusinessMode } from '@/lib/BusinessModeContext';
import PageHeader from '@/components/shared/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

const COPY = {
  en: {
    title: 'Customize your workspace',
    description: 'Configure the visible BizCTRL workspace for this organization. These presentation preferences never grant routes, permissions, or subscription access.',
    save: 'Save changes',
    saving: 'Saving…',
    restore: 'Restore defaults',
    saved: 'Workspace customization saved.',
    restored: 'Workspace defaults restored.',
    denied: 'Workspace customization is restricted',
    deniedDescription: 'Only the organization Owner or an explicitly delegated administrator can change organization-wide workspace settings.',
  },
  ar: {
    title: 'تخصيص مساحة العمل',
    description: 'يمكنك ضبط مساحة عمل BizCTRL المرئية لهذه المؤسسة. لا تمنح هذه التفضيلات أي مسارات أو صلاحيات أو وصول للاشتراك.',
    save: 'حفظ التغييرات',
    saving: 'جارٍ الحفظ…',
    restore: 'استعادة الإعدادات الافتراضية',
    saved: 'تم حفظ تخصيص مساحة العمل.',
    restored: 'تمت استعادة إعدادات مساحة العمل الافتراضية.',
    denied: 'تخصيص مساحة العمل مقيّد',
    deniedDescription: 'يمكن لمالك المؤسسة أو مسؤول مفوض صراحة فقط تغيير إعدادات مساحة العمل على مستوى المؤسسة.',
  },
  fa: {
    title: 'شخصی‌سازی فضای کاری',
    description: 'فضای کاری قابل مشاهده BizCTRL را برای این سازمان پیکربندی کنید. این ترجیحات نمایشی هرگز مسیر، مجوز یا دسترسی اشتراک ایجاد نمی‌کنند.',
    save: 'ذخیره تغییرات',
    saving: 'در حال ذخیره…',
    restore: 'بازیابی پیش‌فرض‌ها',
    saved: 'شخصی‌سازی فضای کاری ذخیره شد.',
    restored: 'پیش‌فرض‌های فضای کاری بازیابی شد.',
    denied: 'شخصی‌سازی فضای کاری محدود است',
    deniedDescription: 'تنها مالک سازمان یا مدیر دارای واگذاری صریح می‌تواند تنظیمات سراسر سازمان را تغییر دهد.',
  },
};

const navigationItems = ERP_NAV_GROUPS
  .flatMap((group) => group.items.map((item) => ({ ...item, group: group.label })))
  .filter((item) => WORKSPACE_NAVIGATION_PATHS.includes(item.path));

function Checkbox({ checked = false, onCheckedChange, disabled = false }) {
  return <input type="checkbox" className="h-4 w-4 accent-primary" checked={checked} disabled={disabled} onChange={(event) => onCheckedChange?.(event.target.checked)} />;
}

function SectionCard({ title, description, children }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </Card>
  );
}

function SettingLink({ to, icon: Icon, title, description }) {
  return (
    <Link to={to} className="flex items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/60">
      <span className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{title}</span><span className="block text-xs text-muted-foreground">{description}</span></span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}

function NavigationEditor({ draft, setDraft }) {
  const hiddenPaths = new Set(draft.navigation.hidden_paths || []);
  const orderedPaths = draft.navigation.order || [];
  const orderedItems = useMemo(() => {
    const rank = new Map(orderedPaths.map((path, index) => [path, index]));
    return [...navigationItems].sort((a, b) => (rank.get(a.path) ?? 9999) - (rank.get(b.path) ?? 9999));
  }, [orderedPaths]);
  const update = (patch) => setDraft((current) => mergeWorkspaceCustomization(current, { navigation: patch }));

  return (
    <SectionCard title="Navigation and module visibility" description="Hide a module from workspace navigation or change its navigation order. These settings only change presentation; protected routes and APIs remain protected by existing server authorization and subscription enforcement.">
      <div className="space-y-2">
        {orderedItems.map((item, index) => {
          const hidden = hiddenPaths.has(item.path);
          return (
            <div key={item.path} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
              <Switch
                checked={!hidden}
                onCheckedChange={(visible) => update({ hidden_paths: visible ? [...hiddenPaths].filter((path) => path !== item.path) : [...hiddenPaths, item.path] })}
                aria-label={`Toggle ${item.label}`}
              />
              <div className="min-w-0 flex-1"><p className="text-sm font-medium">{item.label}</p><p className="text-xs text-muted-foreground">{item.group}</p></div>
              <div className="flex gap-1">
                <Button type="button" size="icon" variant="ghost" disabled={index === 0} onClick={() => update({ order: reorderList(orderedItems.map((entry) => entry.path), item.path, 'up') })} aria-label={`Move ${item.label} up`}><ArrowUp className="h-4 w-4" /></Button>
                <Button type="button" size="icon" variant="ghost" disabled={index === orderedItems.length - 1} onClick={() => update({ order: reorderList(orderedItems.map((entry) => entry.path), item.path, 'down') })} aria-label={`Move ${item.label} down`}><ArrowDown className="h-4 w-4" /></Button>
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function BusinessTemplateEditor({ draft, setDraft }) {
  const selectedTemplate = draft.business.template || 'restaurant';
  const moduleGroups = useMemo(() => {
    const groups = new Map();
    WORKSPACE_MODULE_CATALOG.forEach((module) => {
      const list = groups.get(module.group) || [];
      list.push(module);
      groups.set(module.group, list);
    });
    return [...groups.entries()];
  }, []);
  const selectTemplate = (templateKey) => setDraft((current) => applyBusinessTemplate(current, templateKey));
  const toggleModule = (moduleKey, enabled) => setDraft((current) => {
    const disabled = new Set(current.business.disabled_modules || []);
    if (enabled) disabled.delete(moduleKey);
    else disabled.add(moduleKey);
    return mergeWorkspaceCustomization(current, { business: { ...current.business, disabled_modules: [...disabled] } });
  });

  return <div className="space-y-4">
    <SectionCard title="Business template" description="Choose the closest operating model, then enable only the modules this organization needs. Applying a template never deletes existing records.">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {Object.entries(BUSINESS_TEMPLATE_PRESETS).map(([key, template]) => {
          const selected = selectedTemplate === key;
          return <button key={key} type="button" onClick={() => selectTemplate(key)} className={`relative min-h-32 rounded-2xl border p-3 text-left transition-all ${selected ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100 dark:bg-blue-950/30' : 'border-border bg-card hover:border-blue-200 hover:bg-muted/40'}`}>
            {selected && <CheckCircle2 className="absolute right-3 top-3 h-5 w-5 text-blue-600" />}
            <span className="text-2xl" aria-hidden="true">{template.icon}</span>
            <span className="mt-2 block text-sm font-black">{template.label}</span>
            <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">{template.description}</span>
          </button>;
        })}
      </div>
      <Alert className="mt-4 border-blue-200 bg-blue-50/60 dark:bg-blue-950/20"><Settings2 className="h-4 w-4" /><AlertTitle>Safe template change</AlertTitle><AlertDescription>Saving updates the organization business mode and its visible modules together. Products, sales, invoices, debts, users and accounting records remain unchanged.</AlertDescription></Alert>
    </SectionCard>

    <SectionCard title="Module builder" description="Turn modules on or off for this organization. Required core controls stay enabled, and role permissions, subscription entitlements and database RLS remain authoritative.">
      <div className="grid gap-4 lg:grid-cols-2">
        {moduleGroups.map(([group, modules]) => <div key={group} className="overflow-hidden rounded-2xl border border-border">
          <div className="border-b border-border bg-muted/50 px-3 py-2 text-xs font-black uppercase tracking-wide text-muted-foreground">{group}</div>
          <div className="divide-y divide-border">
            {modules.map((module) => {
              const enabled = isWorkspaceModuleEnabled(draft, module.key);
              return <label key={module.key} className="flex min-h-14 items-center gap-3 px-3 py-2.5">
                <Switch checked={enabled} disabled={module.required} onCheckedChange={(checked) => toggleModule(module.key, checked)} aria-label={`Toggle ${module.label}`} />
                <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{module.label}</span><span className="block text-[11px] text-muted-foreground">{module.required ? 'Required ERP control' : enabled ? 'Enabled in workspace' : 'Hidden and blocked in workspace'}</span></span>
                <span className={`h-2.5 w-2.5 rounded-full ${enabled ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              </label>;
            })}
          </div>
        </div>)}
      </div>
    </SectionCard>
  </div>;
}

function ProductFieldsEditor({ draft, setDraft }) {
  const { savePatch, isSaving } = useWorkspaceCustomization();
  const productFields = draft.fields.products || [];
  const [editor, setEditor] = useState(null);
  const [fieldError, setFieldError] = useState('');
  const newField = () => ({ id: '', label: '', type: 'text', required: false, active: true, visible: true, options: [], order: productFields.length });
  const setEditorValue = (patch) => setEditor((current) => ({ ...current, field: { ...current.field, ...patch } }));
  const persistFields = async (fields, message) => {
    const normalizedFields = fields.map((field, index) => ({ ...field, order: Number.isFinite(Number(field.order)) ? Number(field.order) : index }));
    try {
      await savePatch({ fields: { products: normalizedFields } });
      setDraft((current) => mergeWorkspaceCustomization(current, { fields: { products: normalizedFields } }));
      toast.success(message);
      return true;
    } catch (saveError) {
      console.error('Product custom field save failed', saveError);
      toast.error(saveError?.message || 'Unable to save the product custom field.');
      setFieldError(saveError?.message || 'Unable to save the product custom field.');
      return false;
    }
  };
  const openCreate = () => { setFieldError(''); setEditor({ mode: 'create', originalId: null, field: newField() }); };
  const openEdit = (field) => { setFieldError(''); setEditor({ mode: 'edit', originalId: field.id, field: { ...field, options: field.options || [] } }); };
  const saveField = async () => {
    const field = { ...editor.field, id: editor.field.id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_'), label: editor.field.label.trim(), options: (editor.field.options || []).map((option) => option.trim()).filter(Boolean) };
    if (!field.id) { setFieldError('Field name is required.'); return; }
    if (!field.label) { setFieldError('Label is required.'); return; }
    if (!CUSTOM_FIELD_TYPES.includes(field.type)) { setFieldError('Choose a supported field type.'); return; }
    if (['select', 'multiselect'].includes(field.type) && !field.options.length) { setFieldError('Dropdown fields require at least one option.'); return; }
    if (field.required && field.visible === false) { setFieldError('A required field must remain visible on the product form.'); return; }
    if (field.options.length !== new Set(field.options.map((option) => option.toLowerCase())).size) { setFieldError('Dropdown options must be unique.'); return; }
    if (productFields.some((current) => current.id === field.id && current.id !== editor.originalId)) { setFieldError('Field name must be unique within this organization.'); return; }
    const nextFields = editor.mode === 'edit' ? productFields.map((current) => current.id === editor.originalId ? field : current) : [...productFields, field];
    if (await persistFields(nextFields, editor.mode === 'edit' ? 'Product custom field updated.' : 'Product custom field saved.')) setEditor(null);
  };
  const toggleActive = async (field) => persistFields(productFields.map((current) => current.id === field.id ? { ...current, active: !(current.active !== false) } : current), field.active === false ? 'Product custom field activated.' : 'Product custom field deactivated.');
  const removeField = async (field) => {
    if (!window.confirm(`Remove the ${field.label} definition? Existing product values are retained and are not deleted.`)) return;
    await persistFields(productFields.filter((current) => current.id !== field.id), 'Product custom field definition removed. Existing product values were retained.');
  };
  return <SectionCard title="Product custom fields" description="Define tenant-specific product attributes. Every change is saved through the authorized organization configuration path; existing product values are kept in the canonical product custom-attributes column."><div className="space-y-3">{productFields.map((field) => <div key={field.id} className="rounded-lg border border-border p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium">{field.label}</p><p className="text-xs text-muted-foreground">{field.id} · {field.type.replace('_', ' ')} · order {field.order}</p></div><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={() => openEdit(field)}>Edit</Button><Button type="button" variant="outline" size="sm" disabled={isSaving} onClick={() => toggleActive(field)}>{field.active === false ? 'Activate' : 'Deactivate'}</Button><Button type="button" variant="ghost" size="sm" className="text-destructive" disabled={isSaving} onClick={() => removeField(field)}><Trash2 className="mr-1 h-4 w-4" />Delete</Button></div></div><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>{field.required ? 'Required' : 'Optional'}</span><span>{field.active === false ? 'Inactive' : 'Active'}</span><span>{field.visible === false ? 'Hidden from product form' : 'Visible on product form'}</span>{field.options?.length ? <span>Options: {field.options.join(', ')}</span> : null}</div></div>)}{!productFields.length && <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">No custom product fields are configured for this organization.</p>}<Button type="button" variant="outline" onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Add product custom field</Button></div><Dialog open={Boolean(editor)} onOpenChange={(open) => { if (!open) { setEditor(null); setFieldError(''); } }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>{editor?.mode === 'edit' ? 'Edit product custom field' : 'Add product custom field'}</DialogTitle><DialogDescription>Configuration is stored only for the active organization and is applied to product create and edit forms.</DialogDescription></DialogHeader>{editor && <div className="grid gap-4 py-2"><div className="grid gap-3 sm:grid-cols-2"><div><Label>Field name</Label><Input value={editor.field.id} onChange={(event) => setEditorValue({ id: event.target.value })} placeholder="supplier_code" maxLength={72} /></div><div><Label>Label</Label><Input value={editor.field.label} onChange={(event) => setEditorValue({ label: event.target.value })} placeholder="Supplier Code" maxLength={80} /></div></div><div className="grid gap-3 sm:grid-cols-2"><div><Label>Field type</Label><Select value={editor.field.type} onValueChange={(type) => setEditorValue({ type, options: ['select', 'multiselect'].includes(type) ? editor.field.options : [] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CUSTOM_FIELD_TYPES.map((type) => <SelectItem key={type} value={type}>{type.replaceAll('_', ' ')}</SelectItem>)}</SelectContent></Select></div><div><Label>Display order</Label><Input type="number" min="0" value={editor.field.order} onChange={(event) => setEditorValue({ order: event.target.value })} /></div></div>{['select', 'multiselect'].includes(editor.field.type) && <div><Label>Options (one per line)</Label><Textarea value={(editor.field.options || []).join('\n')} onChange={(event) => setEditorValue({ options: event.target.value.split('\n') })} placeholder={'Preferred\nStandard\nPremium'} rows={4} /></div>}<div className="grid gap-3 sm:grid-cols-3"><label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"><span>Required</span><Switch checked={Boolean(editor.field.required)} onCheckedChange={(required) => setEditorValue({ required })} /></label><label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"><span>Active</span><Switch checked={editor.field.active !== false} onCheckedChange={(active) => setEditorValue({ active })} /></label><label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"><span>Visible</span><Switch checked={editor.field.visible !== false} onCheckedChange={(visible) => setEditorValue({ visible })} /></label></div>{fieldError && <Alert variant="destructive"><AlertTitle>Unable to save field</AlertTitle><AlertDescription>{fieldError}</AlertDescription></Alert>}</div>}<DialogFooter className="gap-2 sm:gap-0"><Button type="button" variant="outline" onClick={() => setEditor(null)}>Cancel</Button><Button type="button" disabled={isSaving} onClick={saveField}>{isSaving ? 'Saving…' : 'Save field'}</Button></DialogFooter></DialogContent></Dialog></SectionCard>;
}

function ProductFormEditor({ draft, setDraft }) {
  const { savePatch, isSaving } = useWorkspaceCustomization();
  const settings = draft.forms.products;
  const hidden = new Set(settings.hidden_fields || []);
  const required = new Set(settings.required_fields || []);
  const update = async (patch) => {
    const nextSettings = { ...settings, ...patch };
    setDraft((current) => mergeWorkspaceCustomization(current, { forms: { products: nextSettings } }));
    try {
      await savePatch({ forms: { products: nextSettings } });
      toast.success('Product form settings saved.');
    } catch (saveError) {
      console.error('Product form settings save failed', saveError);
      toast.error(saveError?.message || 'Unable to save product form settings.');
    }
  };
  const setVisibility = (field, visible) => update({ hidden_fields: visible ? [...hidden].filter((value) => value !== field) : [...hidden, field] });
  const setRequired = (field, value) => update({ required_fields: value ? [...required, field] : [...required].filter((entry) => entry !== field) });
  return <SectionCard title="Product form" description="Each switch is saved immediately for this organization. The mandatory product name remains protected for data integrity."><div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="pb-2 font-medium">Field</th><th className="pb-2 font-medium">Visible</th><th className="pb-2 font-medium">Required</th></tr></thead><tbody>{PRODUCT_FIELD_KEYS.map((field) => { const isMandatory = field === 'name'; return <tr key={field} className="border-b last:border-0"><td className="py-2 capitalize">{field.replaceAll('_', ' ')}</td><td className="py-2"><Switch checked={isMandatory || !hidden.has(field)} disabled={isMandatory || isSaving} onCheckedChange={(visible) => setVisibility(field, visible)} /></td><td className="py-2"><Switch checked={isMandatory || required.has(field)} disabled={isMandatory || isSaving} onCheckedChange={(value) => setRequired(field, value)} /></td></tr>; })}</tbody></table></div></SectionCard>;
}

function ProductTableEditor({ draft, setDraft }) {
  const settings = draft.tables.products;
  const visible = new Set(settings.visible_columns || []);
  const update = (patch) => setDraft((current) => mergeWorkspaceCustomization(current, { tables: { products: patch } }));
  return (
    <SectionCard title="Product list columns" description="Control the supported fields displayed in the product list and its default sort. This does not alter product data or query authorization.">
      <div className="grid gap-3 sm:grid-cols-2">
        {PRODUCT_TABLE_COLUMNS.map((column) => <label key={column.key} className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm"><Checkbox checked={column.required || visible.has(column.key)} disabled={column.required} onCheckedChange={(checked) => update({ visible_columns: checked ? [...visible, column.key] : [...visible].filter((value) => value !== column.key) })} />{column.label}</label>)}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><div><Label>Default sort</Label><Select value={settings.default_sort} onValueChange={(default_sort) => update({ default_sort })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PRODUCT_TABLE_COLUMNS.map((column) => <SelectItem key={column.key} value={column.key}>{column.label}</SelectItem>)}</SelectContent></Select></div><div><Label>Direction</Label><Select value={settings.default_sort_direction} onValueChange={(default_sort_direction) => update({ default_sort_direction })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="asc">Ascending</SelectItem><SelectItem value="desc">Descending</SelectItem></SelectContent></Select></div></div>
    </SectionCard>
  );
}

function SavedViewsManager() {
  const { user } = useAuth();
  const { activeRestaurant } = useTenant();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const viewQuery = useQuery({
    queryKey: ['workspace-saved-views', activeRestaurant?.id, user?.id],
    enabled: Boolean(activeRestaurant?.id && user?.id),
    queryFn: async () => {
      const { data, error } = await supabase.from('workspace_saved_views').select('id, name, is_shared, definition, created_by, updated_at').eq('restaurant_id', activeRestaurant.id).order('updated_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
  const create = async () => {
    const safeName = name.trim();
    if (!safeName) return;
    const { error } = await supabase.from('workspace_saved_views').insert({ restaurant_id: activeRestaurant.id, name: safeName, is_shared: shared, definition: { surface: 'products', filters: {}, sorting: { key: 'name', direction: 'asc' } } });
    if (error) { toast.error(error.message); return; }
    setName(''); setShared(false); queryClient.invalidateQueries({ queryKey: ['workspace-saved-views', activeRestaurant?.id, user?.id] });
  };
  const remove = async (id) => {
    const { error } = await supabase.from('workspace_saved_views').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    queryClient.invalidateQueries({ queryKey: ['workspace-saved-views', activeRestaurant?.id, user?.id] });
  };
  return <SectionCard title="Saved views" description="Save a reusable product-list view for yourself or share it with your organization. Stored views remain tenant-scoped and do not broaden data access."><div className="flex flex-col gap-3 sm:flex-row"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Example: Low inventory" maxLength={100} /><label className="flex shrink-0 items-center gap-2 text-sm"><Checkbox checked={shared} onCheckedChange={(checked) => setShared(checked === true)} />Share with organization</label><Button type="button" onClick={create}><Plus className="mr-2 h-4 w-4" />Save view</Button></div><div className="mt-4 space-y-2">{viewQuery.isLoading && <p className="text-sm text-muted-foreground">Loading saved views…</p>}{(viewQuery.data || []).map((view) => <div className="flex items-center gap-3 rounded-lg border border-border p-3" key={view.id}><ListFilter className="h-4 w-4 text-muted-foreground" /><span className="min-w-0 flex-1 text-sm font-medium">{view.name}{view.is_shared && <span className="ml-2 text-xs font-normal text-muted-foreground">Shared</span>}</span>{(view.created_by === user?.id) && <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => remove(view.id)} aria-label={`Delete ${view.name}`}><Trash2 className="h-4 w-4" /></Button>}</div>)}{!viewQuery.isLoading && !(viewQuery.data || []).length && <p className="text-sm text-muted-foreground">No saved views yet.</p>}</div></SectionCard>;
}

function RegionalEditor({ draft, setDraft }) {
  const update = (patch) => setDraft((current) => mergeWorkspaceCustomization(current, { regional: patch }));
  return <SectionCard title="Language and regional display" description="Set the organization workspace default language, display precision, date format, and week start. These display preferences do not change stored monetary values or accounting calculations."><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><div><Label>Language</Label><Select value={draft.regional.language} onValueChange={(language) => update({ language })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="en">English</SelectItem><SelectItem value="ar">العربية</SelectItem><SelectItem value="fa">فارسی</SelectItem></SelectContent></Select></div><div><Label>Currency display</Label><Select value={draft.regional.currency_display} onValueChange={(currency_display) => update({ currency_display })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="symbol">Symbol</SelectItem><SelectItem value="code">Code</SelectItem></SelectContent></Select></div><div><Label>Decimal places</Label><Select value={String(draft.regional.decimal_places)} onValueChange={(value) => update({ decimal_places: Number(value) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[0, 1, 2, 3, 4].map((value) => <SelectItem key={value} value={String(value)}>{value}</SelectItem>)}</SelectContent></Select></div><div><Label>Date format</Label><Select value={draft.regional.date_format} onValueChange={(date_format) => update({ date_format })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem><SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem><SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem></SelectContent></Select></div><div><Label>First day of week</Label><Select value={draft.regional.first_day_of_week} onValueChange={(first_day_of_week) => update({ first_day_of_week })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="monday">Monday</SelectItem><SelectItem value="sunday">Sunday</SelectItem><SelectItem value="saturday">Saturday</SelectItem></SelectContent></Select></div></div></SectionCard>;
}

function ReportWorkflowEditor({ draft, setDraft }) {
  const updateReports = (patch) => setDraft((current) => mergeWorkspaceCustomization(current, { reports: patch }));
  const updateWorkflow = (patch) => setDraft((current) => mergeWorkspaceCustomization(current, { workflows: { purchases: patch } }));
  const states = draft.workflows.purchases.enabled_states || [];
  return <div className="grid gap-4 xl:grid-cols-2"><SectionCard title="Reports" description="Set the default reporting period. Authorized report data, branch scope, export controls, and subscription rules remain unchanged."><Label>Default report period</Label><Select value={draft.reports.default_date_range} onValueChange={(default_date_range) => updateReports({ default_date_range })}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent>{['today', 'week', 'month', 'quarter', 'year'].map((period) => <SelectItem key={period} value={period}>{period}</SelectItem>)}</SelectContent></Select><SettingLink to="/reports" icon={Gauge} title="Open reports" description="Use the existing authorized reporting workspace." /></SectionCard><SectionCard title="Purchase workflow" description="Select supported presentation states for purchase work. Accounting posting and approval authorization remain enforced by existing backend workflows."><div className="space-y-2">{['draft', 'submitted', 'approved', 'received', 'paid'].map((state) => <label key={state} className="flex items-center gap-2 text-sm"><Checkbox checked={states.includes(state)} onCheckedChange={(checked) => updateWorkflow({ enabled_states: checked ? [...states, state] : states.filter((value) => value !== state) })} />{state}</label>)}</div></SectionCard></div>;
}

function NotificationEditor({ draft, setDraft }) {
  const update = (patch) => setDraft((current) => mergeWorkspaceCustomization(current, { notifications: patch }));
  return <SectionCard title="Low-inventory notification preference" description="Configure the workspace low-stock threshold used by product list health indicators. Delivery, approval, and payment notification authorization remains unchanged."><div className="flex flex-col gap-4 sm:flex-row sm:items-end"><div className="flex items-center gap-2"><Switch checked={draft.notifications.low_stock_enabled} onCheckedChange={(low_stock_enabled) => update({ low_stock_enabled })} /><Label>Show low-stock indicators</Label></div><div className="min-w-48 flex-1"><Label>Threshold</Label><Input type="number" min="0" max="999999" value={draft.notifications.low_stock_threshold} onChange={(event) => update({ low_stock_threshold: Number(event.target.value) || 0 })} /></div></div></SectionCard>;
}

function DocumentsEditor({ draft, setDraft }) {
  const update = (patch) => setDraft((current) => mergeWorkspaceCustomization(current, { documents: patch }));
  return <SectionCard title="Server-generated document numbering" description="Choose a supported pattern. Numbers remain generated by the server using the existing sequence, so browser input cannot create duplicates."><div className="grid gap-3 sm:grid-cols-2"><div><Label>Sales invoices</Label><Select value={draft.documents.sales_pattern} onValueChange={(sales_pattern) => update({ sales_pattern })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="INV-{YYYYMMDD}-{SEQ:4}">INV-20260822-0001</SelectItem><SelectItem value="INV-{YYYY}-{SEQ:6}">INV-2026-000001</SelectItem></SelectContent></Select></div><div><Label>Purchase invoices</Label><Select value={draft.documents.purchase_pattern} onValueChange={(purchase_pattern) => update({ purchase_pattern })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PUR-{YYYYMMDD}-{SEQ:4}">PUR-20260822-0001</SelectItem><SelectItem value="PUR-{YYYY}-{SEQ:6}">PUR-2026-000001</SelectItem></SelectContent></Select></div></div></SectionCard>;
}

export default function CustomizeWorkspace() {
  const { lang, setLang } = useLanguage();
  const { activeRestaurant } = useTenant();
  const { activeMode } = useBusinessMode();
  const { configuration, canCustomize, error, isLoading, isSaving, saveBusinessConfiguration } = useWorkspaceCustomization();
  const [draft, setDraft] = useState(() => normalizeWorkspaceCustomization(configuration));
  const copy = COPY[lang] || COPY.en;

  useEffect(() => {
    const next = normalizeWorkspaceCustomization(configuration);
    setDraft(mergeWorkspaceCustomization(next, { business: { ...next.business, template: activeMode } }));
  }, [activeMode, configuration]);

  const save = async () => {
    try {
      const next = normalizeWorkspaceCustomization(draft);
      await saveBusinessConfiguration(next.business.template, next);
      setLang(next.regional.language);
      toast.success(copy.saved);
    } catch (saveError) {
      toast.error(saveError?.message || 'Unable to save workspace customization.');
    }
  };
  const restore = async () => {
    try {
      const defaults = applyBusinessTemplate(DEFAULT_WORKSPACE_CUSTOMIZATION, activeMode);
      await saveBusinessConfiguration(activeMode, defaults);
      toast.success(copy.restored);
    } catch (restoreError) {
      toast.error(restoreError?.message || 'Unable to restore workspace defaults.');
    }
  };

  if (!canCustomize && !isLoading) {
    return <main className="mx-auto max-w-3xl p-4 sm:p-6"><Alert variant="destructive"><ShieldCheck className="h-4 w-4" /><AlertTitle>{copy.denied}</AlertTitle><AlertDescription>{copy.deniedDescription}</AlertDescription></Alert></main>;
  }

  return <main className="mx-auto w-full max-w-7xl space-y-4 p-4 pb-28 sm:p-6 lg:p-8">
    <PageHeader title={copy.title} subtitle={activeRestaurant?.name ? `${copy.description} ${activeRestaurant.name}.` : copy.description} icon={Settings2} />
    {error && <Alert variant="destructive"><AlertTitle>Configuration error</AlertTitle><AlertDescription>{error.message}</AlertDescription></Alert>}
    {isLoading ? <Card className="p-8 text-sm text-muted-foreground">Loading workspace configuration…</Card> : <Tabs defaultValue="business" className="space-y-4"><TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-lg bg-muted p-1"><TabsTrigger value="business">Business & modules</TabsTrigger><TabsTrigger value="navigation">Navigation</TabsTrigger><TabsTrigger value="dashboard">Dashboard</TabsTrigger><TabsTrigger value="fields">Fields & forms</TabsTrigger><TabsTrigger value="tables">Tables & views</TabsTrigger><TabsTrigger value="reports">Reports & workflows</TabsTrigger><TabsTrigger value="notifications">Notifications</TabsTrigger><TabsTrigger value="regional">Regional</TabsTrigger><TabsTrigger value="documents">Documents</TabsTrigger><TabsTrigger value="administration">Administration</TabsTrigger></TabsList><TabsContent value="business"><BusinessTemplateEditor draft={draft} setDraft={setDraft} /></TabsContent><TabsContent value="navigation"><NavigationEditor draft={draft} setDraft={setDraft} /></TabsContent><TabsContent value="dashboard"><SectionCard title="Dashboard widgets" description="Use the existing dashboard customization control to add, remove, show, hide, rename, and describe the supported owner dashboard widgets."><SettingLink to="/owner-command-center" icon={LayoutDashboard} title="Open owner dashboard" description="Open the live dashboard and select Customize Dashboard." /></SectionCard></TabsContent><TabsContent value="fields" className="space-y-4"><ProductFieldsEditor draft={draft} setDraft={setDraft} /><ProductFormEditor draft={draft} setDraft={setDraft} /></TabsContent><TabsContent value="tables" className="space-y-4"><ProductTableEditor draft={draft} setDraft={setDraft} /><SavedViewsManager /></TabsContent><TabsContent value="reports"><ReportWorkflowEditor draft={draft} setDraft={setDraft} /></TabsContent><TabsContent value="notifications"><NotificationEditor draft={draft} setDraft={setDraft} /></TabsContent><TabsContent value="regional"><RegionalEditor draft={draft} setDraft={setDraft} /></TabsContent><TabsContent value="documents"><DocumentsEditor draft={draft} setDraft={setDraft} /></TabsContent><TabsContent value="administration" className="grid gap-4 lg:grid-cols-2"><SectionCard title="Organization settings" description="Open existing secured settings surfaces. These pages retain their own authorization and data validation."><div className="space-y-3"><SettingLink to="/brand" icon={Palette} title="Branding" description="Manage organization logo, name, invoice and receipt branding." /><SettingLink to="/branch-management" icon={Building2} title="Branches" description="Manage tenant-scoped branch records and assignments." /><SettingLink to="/role-permissions" icon={ShieldCheck} title="Roles & permissions" description="Use the existing RBAC control center for delegated access." /></div></SectionCard><SectionCard title="Configuration safeguards" description="Workspace customization is presentation configuration only. It cannot edit Paddle, billing, plans, entitlements, API routes, permissions, audit records, business data, or executable code."><div className="space-y-2 text-sm text-muted-foreground"><p>All organization-wide changes are written through an authorized server mutation and recorded in the existing audit log.</p><p>Restoring defaults resets configuration only; it does not delete products, invoices, accounting records, users, branches, or other business data.</p></div></SectionCard></TabsContent></Tabs>}
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur sm:left-auto sm:right-6 sm:bottom-6 sm:rounded-xl sm:border sm:shadow-lg"><div className="mx-auto flex max-w-7xl justify-end gap-2"><Button type="button" variant="outline" disabled={isSaving || isLoading} onClick={restore}><RotateCcw className="mr-2 h-4 w-4" />{copy.restore}</Button><Button type="button" disabled={isSaving || isLoading} onClick={save}><Save className="mr-2 h-4 w-4" />{isSaving ? copy.saving : copy.save}</Button></div></div>
  </main>;
}
