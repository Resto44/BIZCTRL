import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowDown, ArrowUp, Building2, ChevronRight,
  Gauge, LayoutDashboard, ListFilter, Palette, Plus,
  RotateCcw, Save, Settings2, ShieldCheck, Trash2,
} from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { useWorkspaceCustomization } from '@/lib/WorkspaceCustomizationContext';
import {
  CUSTOM_FIELD_TYPES,
  PRODUCT_FIELD_KEYS,
  PRODUCT_TABLE_COLUMNS,
  WORKSPACE_NAVIGATION_PATHS,
  mergeWorkspaceCustomization,
  normalizeWorkspaceCustomization,
  reorderList,
} from '@/lib/workspaceCustomization';
import { ERP_NAV_GROUPS } from '@/components/layout/ERPSidebar';
import PageHeader from '@/components/shared/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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

function ProductFieldsEditor({ draft, setDraft }) {
  const productFields = draft.fields.products || [];
  const update = (fields) => setDraft((current) => mergeWorkspaceCustomization(current, { fields: { products: fields } }));
  const add = () => update([...productFields, { id: `field_${Date.now()}`, label: '', type: 'text', visible: true, required: false, searchable: false, sortable: false, filterable: false, order: productFields.length }]);
  const updateField = (index, patch) => update(productFields.map((field, currentIndex) => currentIndex === index ? { ...field, ...patch } : field));
  return (
    <SectionCard title="Product custom fields" description="Define tenant-specific product attributes. Values are stored as validated product custom attributes and never alter canonical product, pricing, inventory, or accounting columns.">
      <div className="space-y-3">
        {productFields.map((field, index) => (
          <div key={`${field.id}-${index}`} className="rounded-lg border border-border p-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div><Label>Field ID</Label><Input value={field.id} onChange={(event) => updateField(index, { id: event.target.value.replace(/[^a-zA-Z0-9_-]/g, '') })} maxLength={72} /></div>
              <div><Label>Label</Label><Input value={field.label} onChange={(event) => updateField(index, { label: event.target.value })} maxLength={80} /></div>
              <div><Label>Type</Label><Select value={field.type} onValueChange={(type) => updateField(index, { type })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CUSTOM_FIELD_TYPES.map((type) => <SelectItem key={type} value={type}>{type.replace('_', ' ')}</SelectItem>)}</SelectContent></Select></div>
            </div>
            {(field.type === 'multiselect') && <div className="mt-3"><Label>Options (comma separated)</Label><Input value={(field.options || []).join(', ')} onChange={(event) => updateField(index, { options: event.target.value.split(',').map((entry) => entry.trim()).filter(Boolean) })} /></div>}
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              {['visible', 'required', 'searchable', 'sortable', 'filterable'].map((key) => <label className="flex items-center gap-2" key={key}><Checkbox checked={Boolean(field[key])} onCheckedChange={(checked) => updateField(index, { [key]: checked === true })} />{key}</label>)}
              <Button type="button" variant="ghost" size="sm" className="ml-auto text-destructive" onClick={() => update(productFields.filter((_, currentIndex) => currentIndex !== index))}><Trash2 className="mr-1 h-4 w-4" />Remove</Button>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" onClick={add}><Plus className="mr-2 h-4 w-4" />Add product custom field</Button>
      </div>
    </SectionCard>
  );
}

function ProductFormEditor({ draft, setDraft }) {
  const settings = draft.forms.products;
  const hidden = new Set(settings.hidden_fields || []);
  const required = new Set(settings.required_fields || []);
  const update = (patch) => setDraft((current) => mergeWorkspaceCustomization(current, { forms: { products: patch } }));
  const setVisibility = (field, visible) => update({ hidden_fields: visible ? [...hidden].filter((value) => value !== field) : [...hidden, field] });
  const setRequired = (field, value) => update({ required_fields: value ? [...required, field] : [...required].filter((entry) => entry !== field) });
  return (
    <SectionCard title="Product form" description="Configure only supported optional product fields. The mandatory product name remains protected for data integrity.">
      <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="pb-2 font-medium">Field</th><th className="pb-2 font-medium">Visible</th><th className="pb-2 font-medium">Required</th></tr></thead><tbody>{PRODUCT_FIELD_KEYS.map((field) => {
        const isMandatory = field === 'name';
        return <tr key={field} className="border-b last:border-0"><td className="py-2 capitalize">{field.replaceAll('_', ' ')}</td><td className="py-2"><Switch checked={isMandatory || !hidden.has(field)} disabled={isMandatory} onCheckedChange={(visible) => setVisibility(field, visible)} /></td><td className="py-2"><Switch checked={isMandatory || required.has(field)} disabled={isMandatory} onCheckedChange={(value) => setRequired(field, value)} /></td></tr>;
      })}</tbody></table></div>
    </SectionCard>
  );
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
  const { configuration, canCustomize, error, isLoading, isSaving, restoreDefaults, saveConfiguration } = useWorkspaceCustomization();
  const [draft, setDraft] = useState(() => normalizeWorkspaceCustomization(configuration));
  const copy = COPY[lang] || COPY.en;

  useEffect(() => setDraft(normalizeWorkspaceCustomization(configuration)), [configuration]);

  const save = async () => {
    try {
      const next = normalizeWorkspaceCustomization(draft);
      await saveConfiguration(next);
      setLang(next.regional.language);
      toast.success(copy.saved);
    } catch (saveError) {
      toast.error(saveError?.message || 'Unable to save workspace customization.');
    }
  };
  const restore = async () => {
    try {
      await restoreDefaults();
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
    {isLoading ? <Card className="p-8 text-sm text-muted-foreground">Loading workspace configuration…</Card> : <Tabs defaultValue="navigation" className="space-y-4"><TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-lg bg-muted p-1"><TabsTrigger value="navigation">Navigation</TabsTrigger><TabsTrigger value="dashboard">Dashboard</TabsTrigger><TabsTrigger value="fields">Fields & forms</TabsTrigger><TabsTrigger value="tables">Tables & views</TabsTrigger><TabsTrigger value="reports">Reports & workflows</TabsTrigger><TabsTrigger value="notifications">Notifications</TabsTrigger><TabsTrigger value="regional">Regional</TabsTrigger><TabsTrigger value="documents">Documents</TabsTrigger><TabsTrigger value="administration">Administration</TabsTrigger></TabsList><TabsContent value="navigation"><NavigationEditor draft={draft} setDraft={setDraft} /></TabsContent><TabsContent value="dashboard"><SectionCard title="Dashboard widgets" description="Use the existing dashboard customization control to add, remove, show, hide, rename, and describe the supported owner dashboard widgets."><SettingLink to="/owner-command-center" icon={LayoutDashboard} title="Open owner dashboard" description="Open the live dashboard and select Customize Dashboard." /></SectionCard></TabsContent><TabsContent value="fields" className="space-y-4"><ProductFieldsEditor draft={draft} setDraft={setDraft} /><ProductFormEditor draft={draft} setDraft={setDraft} /></TabsContent><TabsContent value="tables" className="space-y-4"><ProductTableEditor draft={draft} setDraft={setDraft} /><SavedViewsManager /></TabsContent><TabsContent value="reports"><ReportWorkflowEditor draft={draft} setDraft={setDraft} /></TabsContent><TabsContent value="notifications"><NotificationEditor draft={draft} setDraft={setDraft} /></TabsContent><TabsContent value="regional"><RegionalEditor draft={draft} setDraft={setDraft} /></TabsContent><TabsContent value="documents"><DocumentsEditor draft={draft} setDraft={setDraft} /></TabsContent><TabsContent value="administration" className="grid gap-4 lg:grid-cols-2"><SectionCard title="Organization settings" description="Open existing secured settings surfaces. These pages retain their own authorization and data validation."><div className="space-y-3"><SettingLink to="/brand" icon={Palette} title="Branding" description="Manage organization logo, name, invoice and receipt branding." /><SettingLink to="/branch-management" icon={Building2} title="Branches" description="Manage tenant-scoped branch records and assignments." /><SettingLink to="/role-permissions" icon={ShieldCheck} title="Roles & permissions" description="Use the existing RBAC control center for delegated access." /></div></SectionCard><SectionCard title="Configuration safeguards" description="Workspace customization is presentation configuration only. It cannot edit Paddle, billing, plans, entitlements, API routes, permissions, audit records, business data, or executable code."><div className="space-y-2 text-sm text-muted-foreground"><p>All organization-wide changes are written through an authorized server mutation and recorded in the existing audit log.</p><p>Restoring defaults resets configuration only; it does not delete products, invoices, accounting records, users, branches, or other business data.</p></div></SectionCard></TabsContent></Tabs>}
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur sm:left-auto sm:right-6 sm:bottom-6 sm:rounded-xl sm:border sm:shadow-lg"><div className="mx-auto flex max-w-7xl justify-end gap-2"><Button type="button" variant="outline" disabled={isSaving || isLoading} onClick={restore}><RotateCcw className="mr-2 h-4 w-4" />{copy.restore}</Button><Button type="button" disabled={isSaving || isLoading} onClick={save}><Save className="mr-2 h-4 w-4" />{isSaving ? copy.saving : copy.save}</Button></div></div>
  </main>;
}
