import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, BellRing, Bot, CheckCircle2, Clock3, CloudUpload,
  FileClock, KeyRound, Link2, Mail, MessageCircle, Plus, Save, ShieldCheck,
  TimerReset, Workflow,
} from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { useTenant } from '@/lib/TenantContext';
import useERPSettings from '@/hooks/useERPSettings';
import { activeAutomationCount } from '@/lib/erpSettings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  SavedBadge, SettingRow, SettingsCard, SettingsPageFrame, SettingsScopeSelector,
  SettingsSection, SettingsSkeleton,
} from '@/components/settings/ERPSettingsUI';
import { cn } from '@/lib/utils';

const EMPTY_RULE = { name: '', trigger: '', action: '' };

function safeJson(value) {
  try { return JSON.parse(value || '{}'); } catch { return {}; }
}

function HealthMetric({ icon: Icon, label, value }) {
  return <div className="flex min-w-0 items-center gap-3 px-3 py-4 sm:px-5"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white"><Icon className="h-5 w-5" /></span><div className="min-w-0"><p className="text-[11px] font-semibold text-blue-100">{label}</p><p className="mt-0.5 break-words text-lg font-black text-white sm:text-xl">{value}</p></div></div>;
}

function IntegrationCard({ icon: Icon, title, status, connected, to, color }) {
  const card = <div className="flex h-full min-w-0 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm transition hover:border-blue-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"><span className={cn('flex h-11 w-11 items-center justify-center rounded-2xl', color)}><Icon className="h-5 w-5" /></span><p className="mt-2 break-words text-sm font-black text-slate-950 dark:text-white">{title}</p><p className={cn('mt-1 text-[11px] font-bold', connected ? 'text-emerald-600' : 'text-slate-400')}>{status}</p></div>;
  return to ? <Link to={to} className="min-w-0">{card}</Link> : card;
}

export default function AutomationSecuritySettings() {
  const { activeRestaurant } = useTenant();
  const {
    settings, updateSection, discard, save, isDirty, isLoading, isSaving, loadError,
  } = useERPSettings();
  const [createOpen, setCreateOpen] = useState(false);
  const [newRule, setNewRule] = useState(EMPTY_RULE);
  const restaurantId = activeRestaurant?.id || null;
  const automation = settings.automation || {};
  const security = settings.security || {};
  const patchAutomation = (patch) => updateSection('automation', patch);
  const patchSecurity = (patch) => updateSection('security', patch);

  const { data: organizationSettings = [] } = useQuery({
    queryKey: ['settings-integration-records', restaurantId],
    queryFn: () => restaurantId ? base44.entities.AppSettings.filter({ restaurant_id: restaurantId }, '-updated_date', 100) : [],
    enabled: Boolean(restaurantId),
    staleTime: 60_000,
  });

  const { data: recentActivity = [] } = useQuery({
    queryKey: ['settings-security-activity', restaurantId],
    queryFn: () => restaurantId ? base44.entities.AuditLog.filter({ restaurant_id: restaurantId }, '-created_date', 10) : [],
    enabled: Boolean(restaurantId),
    staleTime: 30_000,
  });

  const integrationState = useMemo(() => {
    const enabledKeys = new Set();
    let webhookCount = 0;
    organizationSettings.forEach((record) => {
      const config = safeJson(record.value);
      if (config.enabled) enabledKeys.add(record.key);
      if (Array.isArray(config.webhooks)) webhookCount += config.webhooks.length;
      if (Number(config.webhook_count) > 0) webhookCount += Number(config.webhook_count);
    });
    return {
      telegram: enabledKeys.has('telegram_notification_settings'),
      whatsapp: [...enabledKeys].some((key) => key.includes('whatsapp')),
      email: [...enabledKeys].some((key) => key.includes('email')),
      webhookCount,
    };
  }, [organizationSettings]);
  const connectedCount = [integrationState.telegram, integrationState.whatsapp, integrationState.email, integrationState.webhookCount > 0].filter(Boolean).length;
  const activeCount = activeAutomationCount(automation) + (automation.customRules || []).filter((rule) => rule.enabled).length;

  const standardRules = [
    { key: 'purchaseApproval', icon: ShieldCheck, title: 'Purchase approval', description: `Above ${settings.finance?.currencyCode || 'SAR'} ${(automation.purchaseApproval?.threshold || 0).toLocaleString()}` },
    { key: 'lowStockAlerts', icon: BellRing, title: 'Low-stock alerts', description: 'Notify manager at reorder level' },
    { key: 'closingReminder', icon: Clock3, title: 'Daily closing reminder', description: `Every day · ${automation.closingReminder?.time || '23:30'}` },
    { key: 'overdueReceivables', icon: AlertTriangle, title: 'Overdue receivables', description: `After ${automation.overdueReceivables?.days || 7} days` },
  ];

  const toggleRule = (key, enabled) => patchAutomation({ [key]: { ...(automation[key] || {}), enabled } });
  const toggleCustomRule = (id, enabled) => patchAutomation({ customRules: (automation.customRules || []).map((rule) => rule.id === id ? { ...rule, enabled } : rule) });
  const addRule = () => {
    if (!newRule.name.trim() || !newRule.trigger.trim() || !newRule.action.trim()) return;
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `rule-${Date.now()}`;
    patchAutomation({ customRules: [...(automation.customRules || []), { ...newRule, id, enabled: true }] });
    setNewRule(EMPTY_RULE);
    setCreateOpen(false);
  };
  const handleSave = async () => {
    try { await save(); toast.success('Automation and security settings saved.'); }
    catch (error) { toast.error(error?.message || 'Automation settings could not be saved.'); }
  };

  return (
    <SettingsPageFrame
      title="Automation & Security"
      subtitle="Automate repeatable ERP controls and protect organization access."
      badge={loadError ? <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-700">Needs attention</span> : <SavedBadge isDirty={isDirty} isSaving={isSaving} />}
      actions={(
        <>
          <Button variant="outline" className="min-h-11 rounded-xl sm:min-w-32" onClick={discard} disabled={!isDirty || isSaving}>Discard</Button>
          <Button className="min-h-11 rounded-xl bg-blue-600 px-6 hover:bg-blue-700 sm:min-w-56" onClick={handleSave} disabled={!isDirty || isSaving}><Save className="mr-2 h-4 w-4" />{isSaving ? 'Saving…' : 'Save automation settings'}</Button>
        </>
      )}
    >
      <SettingsScopeSelector />
      {isLoading ? <div className="mt-4"><SettingsSkeleton /></div> : (
        <div className="mt-4 space-y-6">
          <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-800 p-2 shadow-lg shadow-blue-900/10">
            <h2 className="px-3 pt-2 text-sm font-black text-white sm:text-base">Operations health</h2>
            <div className="mt-1 grid grid-cols-1 divide-y divide-white/15 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <HealthMetric icon={Bot} label="Automations" value={`${activeCount} active`} />
              <HealthMetric icon={Link2} label="Integrations" value={`${connectedCount} connected`} />
              <HealthMetric icon={CloudUpload} label="Backup schedule" value={`Every ${security.backupIntervalHours || 6} hours`} />
            </div>
          </div>

          <SettingsSection title="Workflow automation" description="Rules run only after they are saved for this organization." action={<Button size="sm" variant="outline" className="rounded-xl" onClick={() => setCreateOpen(true)}><Plus className="mr-1.5 h-4 w-4" />Create rule</Button>}>
            <SettingsCard className="divide-y divide-slate-100 dark:divide-slate-800">
              {standardRules.map(({ key, icon, title, description }) => <SettingRow key={key} icon={icon} title={title} description={description}><div className="flex shrink-0 items-center gap-2"><span className={cn('hidden rounded-full px-2 py-0.5 text-[10px] font-bold sm:inline', automation[key]?.enabled ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800')}>{automation[key]?.enabled ? 'Active' : 'Off'}</span><Switch checked={Boolean(automation[key]?.enabled)} onCheckedChange={(value) => toggleRule(key, value)} /></div></SettingRow>)}
              {(automation.customRules || []).map((rule) => <SettingRow key={rule.id} icon={Workflow} title={rule.name} description={`${rule.trigger} → ${rule.action}`}><Switch checked={Boolean(rule.enabled)} onCheckedChange={(value) => toggleCustomRule(rule.id, value)} /></SettingRow>)}
            </SettingsCard>
          </SettingsSection>

          <SettingsSection title="Connected services" description="A service is marked connected only when an enabled configuration record exists.">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <IntegrationCard icon={MessageCircle} title="WhatsApp" status={integrationState.whatsapp ? 'Connected' : 'Not configured'} connected={integrationState.whatsapp} to="/notifications" color="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300" />
              <IntegrationCard icon={Bot} title="Telegram" status={integrationState.telegram ? 'Connected' : 'Not configured'} connected={integrationState.telegram} to="/telegram-settings" color="bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-300" />
              <IntegrationCard icon={Mail} title="Email" status={integrationState.email ? 'Connected' : 'Not configured'} connected={integrationState.email} to="/notifications" color="bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300" />
              <IntegrationCard icon={Link2} title="API & Webhooks" status={`${integrationState.webhookCount} endpoints`} connected={integrationState.webhookCount > 0} to="/support" color="bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300" />
            </div>
          </SettingsSection>

          <SettingsSection title="Security & recovery" description="Organization-wide defaults for sessions, recovery and audit history.">
            <SettingsCard className="grid gap-0 divide-y divide-slate-100 dark:divide-slate-800 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                <SettingRow icon={KeyRound} title="Two-factor authentication" description="Managed from Users & Access" value={settings.access?.requireManagerMfa ? 'Required' : 'Optional'} to="/settings/access" />
                <SettingRow icon={CloudUpload} title="Automatic backup" description="Scheduled recovery configuration"><div className="flex shrink-0 items-center gap-2"><Select value={String(security.backupIntervalHours || 6)} onValueChange={(value) => patchSecurity({ backupIntervalHours: Number(value) })} disabled={!security.automaticBackup}><SelectTrigger className="h-9 w-28 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">Every hour</SelectItem><SelectItem value="6">Every 6h</SelectItem><SelectItem value="12">Every 12h</SelectItem><SelectItem value="24">Daily</SelectItem></SelectContent></Select><Switch checked={Boolean(security.automaticBackup)} onCheckedChange={(value) => patchSecurity({ automaticBackup: value })} /></div></SettingRow>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                <SettingRow icon={TimerReset} title="Session timeout"><Select value={String(security.sessionTimeoutMinutes || 30)} onValueChange={(value) => patchSecurity({ sessionTimeoutMinutes: Number(value) })}><SelectTrigger className="h-9 w-32 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="15">15 minutes</SelectItem><SelectItem value="30">30 minutes</SelectItem><SelectItem value="60">60 minutes</SelectItem><SelectItem value="120">2 hours</SelectItem></SelectContent></Select></SettingRow>
                <SettingRow icon={FileClock} title="Audit retention"><Select value={String(security.auditRetentionYears || 7)} onValueChange={(value) => patchSecurity({ auditRetentionYears: Number(value) })}><SelectTrigger className="h-9 w-28 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">1 year</SelectItem><SelectItem value="3">3 years</SelectItem><SelectItem value="7">7 years</SelectItem><SelectItem value="10">10 years</SelectItem></SelectContent></Select></SettingRow>
              </div>
            </SettingsCard>
          </SettingsSection>

          <SettingsSection title="Recent security activity" description="Latest organization audit entries." action={<Link to="/activity-logs" className="text-xs font-bold text-blue-600 hover:underline">View audit log</Link>}>
            <SettingsCard className="divide-y divide-slate-100 dark:divide-slate-800">
              {recentActivity.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No recent security activity is available.</p> : recentActivity.slice(0, 4).map((event) => <div key={event.id} className="flex min-w-0 items-start gap-3 p-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="break-words text-sm font-bold text-slate-900 dark:text-white">{event.description || event.details || event.action || 'ERP activity'}</p><p className="mt-0.5 break-all text-xs text-slate-500">{event.user_name || event.user_email || event.created_by || 'System'}</p></div><span className="shrink-0 text-[10px] text-slate-400">{event.created_date ? new Date(event.created_date).toLocaleDateString() : ''}</span></div>)}
            </SettingsCard>
          </SettingsSection>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md rounded-2xl">
          <DialogHeader><DialogTitle>Create ERP automation</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label htmlFor="automation-name">Rule name</Label><Input id="automation-name" value={newRule.name} onChange={(event) => setNewRule((current) => ({ ...current, name: event.target.value }))} placeholder="Example: Approve urgent purchase" className="mt-1.5 h-11 rounded-xl" /></div>
            <div><Label htmlFor="automation-trigger">When this happens</Label><Input id="automation-trigger" value={newRule.trigger} onChange={(event) => setNewRule((current) => ({ ...current, trigger: event.target.value }))} placeholder="Purchase marked urgent" className="mt-1.5 h-11 rounded-xl" /></div>
            <div><Label htmlFor="automation-action">Do this</Label><Input id="automation-action" value={newRule.action} onChange={(event) => setNewRule((current) => ({ ...current, action: event.target.value }))} placeholder="Notify owner for approval" className="mt-1.5 h-11 rounded-xl" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button onClick={addRule} disabled={!newRule.name.trim() || !newRule.trigger.trim() || !newRule.action.trim()}><Plus className="mr-2 h-4 w-4" />Add rule</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsPageFrame>
  );
}
