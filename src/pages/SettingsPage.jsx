import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity, AlertTriangle, BarChart3, Building2, ChevronRight, Clock3,
  DollarSign, Globe2, History, Moon, Package, Search,
  ShieldCheck, Sun, Users, Workflow,
} from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { useRole } from '@/lib/RoleContext';
import useERPSettings from '@/hooks/useERPSettings';
import { activeAutomationCount, financeControlIssues } from '@/lib/erpSettings';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  SettingsCard, SettingsPageFrame, SettingsScopeSelector, SettingsSection, SettingsSkeleton,
} from '@/components/settings/ERPSettingsUI';
import { cn } from '@/lib/utils';

const CATEGORY_DEFINITIONS = [
  { key: 'organization', title: 'Organization', description: 'Branches, brand and legal identity', icon: Building2, to: '/restaurants', color: 'blue' },
  { key: 'finance', title: 'Finance & Tax', description: 'Currency, VAT and fiscal controls', icon: DollarSign, to: '/settings/finance', color: 'indigo' },
  { key: 'access', title: 'Users & Access', description: 'Roles, permissions and approvals', icon: Users, to: '/settings/access', color: 'violet' },
  { key: 'inventory', title: 'Inventory', description: 'Categories, units and costing rules', icon: Package, to: '/categories', color: 'sky' },
  { key: 'sales', title: 'Sales & Closing', description: 'Sources, shifts and closing controls', icon: BarChart3, to: '/sales-closing-customization', color: 'emerald' },
  { key: 'automation', title: 'Automation & Security', description: 'Workflows, integrations and recovery', icon: Workflow, to: '/settings/automation', color: 'amber' },
];

const COLOR_STYLES = {
  blue: 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300',
  indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300',
  violet: 'bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300',
  sky: 'bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-300',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300',
};

function Metric({ icon: Icon, label, value, tone = 'blue' }) {
  return (
    <div className="flex min-w-0 items-center gap-3 px-3 py-3 sm:px-4">
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', COLOR_STYLES[tone])}><Icon className="h-4 w-4" /></span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">{label}</p>
        <p className="mt-0.5 truncate text-lg font-black text-slate-950 dark:text-white">{value}</p>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { lang, setLang, currency, setCurrency, darkMode, setDarkMode } = useLanguage();
  const { activeRestaurant, branches } = useTenant();
  const { user } = useRole();
  const { settings, isLoading, loadError, lastSavedAt } = useERPSettings();
  const [search, setSearch] = useState('');
  const restaurantId = activeRestaurant?.id || null;

  const { data: liveStats = { users: 0, alerts: 0 } } = useQuery({
    queryKey: ['settings-center-live-stats', restaurantId],
    queryFn: async () => {
      if (!restaurantId) return { users: 0, alerts: 0 };
      const [memberships, alerts] = await Promise.all([
        supabase.from('erp_memberships').select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurantId).eq('status', 'approved'),
        supabase.from('active_alerts').select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurantId).in('status', ['open', 'active']),
      ]);
      return { users: memberships.count || 0, alerts: alerts.count || 0 };
    },
    enabled: Boolean(restaurantId),
    staleTime: 60_000,
  });

  const filteredCategories = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return CATEGORY_DEFINITIONS;
    return CATEGORY_DEFINITIONS.filter((item) => `${item.title} ${item.description}`.toLowerCase().includes(query));
  }, [search]);

  const configuredWorkflows = useMemo(() => {
    const automation = settings.automation || {};
    return activeAutomationCount(automation) + (automation.customRules || []).filter((rule) => rule.enabled).length;
  }, [settings.automation]);
  const financeIssues = financeControlIssues(settings.finance).length;
  const setupChecks = [restaurantId, branches?.length, settings.finance?.currencyCode, settings.finance?.fiscalYear, settings.access?.ownerApprovalRoleChanges];
  const setupPercent = Math.round((setupChecks.filter(Boolean).length / setupChecks.length) * 100);
  const savedLabel = lastSavedAt ? new Date(lastSavedAt).toLocaleString() : 'No organization settings saved yet';

  return (
    <SettingsPageFrame
      title="ERP Settings Center"
      subtitle="Configure your business, controls and workflows from one owner-controlled workspace."
      backTo={null}
      badge={<span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">Owner control</span>}
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.72fr)]">
        <SettingsScopeSelector />
        <div className="relative min-w-0">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search settings" className="h-full min-h-14 rounded-2xl border-slate-200 bg-white pl-10 shadow-sm dark:border-slate-800 dark:bg-slate-900" />
        </div>
      </div>

      {isLoading ? <div className="mt-4"><SettingsSkeleton /></div> : (
        <>
          {loadError && (
            <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <p>Saved ERP settings could not be loaded. Existing operational data is unchanged.</p>
            </div>
          )}

          <SettingsCard className="mt-4 grid grid-cols-2 divide-x divide-y divide-slate-100 overflow-hidden dark:divide-slate-800 sm:grid-cols-4 sm:divide-y-0">
            <Metric icon={Activity} label="Setup" value={`${setupPercent}%`} tone="blue" />
            <Metric icon={Users} label="Approved users" value={liveStats.users} tone="violet" />
            <Metric icon={Workflow} label="Active workflows" value={configuredWorkflows} tone="emerald" />
            <Metric icon={AlertTriangle} label="Open alerts" value={liveStats.alerts + financeIssues} tone={liveStats.alerts + financeIssues ? 'amber' : 'emerald'} />
          </SettingsCard>

          <SettingsSection title="Workspace preferences" description="Personal display preferences save immediately on this device." className="mt-6">
            <SettingsCard className="grid gap-0 divide-y divide-slate-100 p-1 dark:divide-slate-800 md:grid-cols-3 md:divide-x md:divide-y-0">
              <div className="flex items-center gap-3 p-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300"><Globe2 className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-slate-500">Language</p><Select value={lang} onValueChange={setLang}><SelectTrigger className="mt-0.5 h-8 border-0 px-0 font-bold shadow-none focus:ring-0"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="en">English</SelectItem><SelectItem value="ar">العربية</SelectItem><SelectItem value="fa">فارسی</SelectItem></SelectContent></Select></div>
              </div>
              <div className="flex items-center gap-3 p-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300"><DollarSign className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-slate-500">Display currency</p><Select value={currency} onValueChange={setCurrency}><SelectTrigger className="mt-0.5 h-8 border-0 px-0 font-bold shadow-none focus:ring-0"><SelectValue /></SelectTrigger><SelectContent>{['SAR', 'USD', 'EUR', 'AFN'].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
              </div>
              <div className="flex items-center gap-3 p-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300">{darkMode ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}</span>
                <div className="min-w-0 flex-1"><p className="text-sm font-bold text-slate-900 dark:text-white">Dark mode</p><p className="text-xs text-slate-500">Use across the ERP workspace</p></div>
                <Switch checked={darkMode} onCheckedChange={setDarkMode} />
              </div>
            </SettingsCard>
          </SettingsSection>

          <SettingsSection title="System configuration" description="Settings are grouped by business responsibility, not by isolated app screens." className="mt-6">
            <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredCategories.map(({ key, title, description, icon: Icon, to, color }) => (
                <Link key={key} to={to} className="group flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-800">
                  <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl', COLOR_STYLES[color])}><Icon className="h-6 w-6" /></span>
                  <div className="min-w-0 flex-1"><h3 className="break-words text-sm font-black text-slate-950 dark:text-white sm:text-base">{title}</h3><p className="mt-0.5 break-words text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p></div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-600 rtl:rotate-180" />
                </Link>
              ))}
            </div>
            {filteredCategories.length === 0 && <SettingsCard className="p-8 text-center text-sm text-slate-500">No settings match “{search}”.</SettingsCard>}
          </SettingsSection>

          <SettingsSection title="Control & history" description="Fast access to approvals and auditable configuration changes." className="mt-6">
            <SettingsCard className="divide-y divide-slate-100 overflow-hidden dark:divide-slate-800">
              <Link to="/erp-approval-center" className="flex min-w-0 items-center gap-3 p-4 transition hover:bg-slate-50 dark:hover:bg-slate-800/70"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300"><ShieldCheck className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="font-bold text-slate-900 dark:text-white">Approval center</p><p className="text-xs text-slate-500">Review owner-controlled ERP requests</p></div><ChevronRight className="h-4 w-4 shrink-0 text-slate-400 rtl:rotate-180" /></Link>
              <Link to="/activity-logs" className="flex min-w-0 items-center gap-3 p-4 transition hover:bg-slate-50 dark:hover:bg-slate-800/70"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><History className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="font-bold text-slate-900 dark:text-white">Audit log</p><p className="break-words text-xs text-slate-500">Last settings save: {savedLabel}</p></div><ChevronRight className="h-4 w-4 shrink-0 text-slate-400 rtl:rotate-180" /></Link>
              <div className="flex min-w-0 items-center gap-3 p-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300"><Clock3 className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="font-bold text-slate-900 dark:text-white">Current owner session</p><p className="break-all text-xs text-slate-500">{user?.email || 'Authenticated owner'} · {activeRestaurant?.name || 'No organization selected'}</p></div></div>
            </SettingsCard>
          </SettingsSection>
        </>
      )}
    </SettingsPageFrame>
  );
}
