import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, CheckCircle2, ChevronRight, Clock3, FileClock,
  KeyRound, LockKeyhole, Plus, Save, Search, Shield, ShieldAlert, Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/api/supabaseClient';
import { useTenant } from '@/lib/TenantContext';
import useERPSettings from '@/hooks/useERPSettings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  SavedBadge, SettingRow, SettingsCard, SettingsPageFrame, SettingsScopeSelector,
  SettingsSection, SettingsSkeleton,
} from '@/components/settings/ERPSettingsUI';
import { cn } from '@/lib/utils';

const TABS = ['Users', 'Roles', 'Approvals', 'Audit'];
const ROLE_LABELS = { owner: 'Owner', manager: 'Branch Manager', employee: 'Employee', supplier: 'Supplier' };
const STATUS_STYLE = {
  approved: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  pending: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  suspended: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300',
  rejected: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300',
};

function Kpi({ icon: Icon, label, value, tone }) {
  return <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center gap-2"><span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', tone)}><Icon className="h-4 w-4" /></span><div className="min-w-0"><p className="truncate text-[11px] font-semibold text-slate-500">{label}</p><p className="truncate text-lg font-black text-slate-950 dark:text-white">{value}</p></div></div></div>;
}

export default function UsersAccessSettings() {
  const { activeRestaurant, branches } = useTenant();
  const {
    settings, updateSection, discard, save, isDirty, isLoading: settingsLoading, isSaving,
  } = useERPSettings();
  const [activeTab, setActiveTab] = useState('Users');
  const [search, setSearch] = useState('');
  const restaurantId = activeRestaurant?.id || null;
  const access = settings.access || {};
  const patchAccess = (patch) => updateSection('access', patch);

  const { data: memberships = [], isLoading: membershipsLoading } = useQuery({
    queryKey: ['settings-access-memberships', restaurantId],
    queryFn: async () => {
      if (!restaurantId) return [];
      const { data, error } = await supabase.from('erp_memberships').select('id,full_name,email,role,status,branch_id,permissions,last_login_at,created_at').eq('restaurant_id', restaurantId).order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: Boolean(restaurantId),
    staleTime: 30_000,
  });

  const { data: auditEvents = [], isLoading: auditLoading } = useQuery({
    queryKey: ['settings-access-audit', restaurantId],
    queryFn: async () => {
      if (!restaurantId) return [];
      const { data, error } = await supabase.from('permission_audit_log').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }).limit(20);
      if (error) return [];
      return data || [];
    },
    enabled: Boolean(restaurantId) && activeTab === 'Audit',
  });

  const filteredMemberships = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return memberships;
    return memberships.filter((membership) => `${membership.full_name || ''} ${membership.email || ''} ${membership.role || ''}`.toLowerCase().includes(query));
  }, [memberships, search]);
  const activeCount = memberships.filter((item) => item.status === 'approved').length;
  const pendingCount = memberships.filter((item) => item.status === 'pending').length;
  const roleCount = new Set(memberships.map((item) => item.role).filter(Boolean)).size;
  const highRiskMembers = memberships.filter((item) => item.role !== 'owner' && item.status === 'approved' && (item.permissions?.manageSettings || item.permissions?.manageUsers || item.permissions?.manageRoles));
  const branchName = (id) => branches?.find((branch) => String(branch.id) === String(id))?.name || (id ? 'Assigned branch' : 'All branches');

  const handleSave = async () => {
    try {
      await save();
      toast.success('Access safeguards saved.');
    } catch (error) {
      toast.error(error?.message || 'Access settings could not be saved.');
    }
  };

  return (
    <SettingsPageFrame
      title="Users & Access"
      subtitle="Owner-controlled roles, branch scope, approvals and security safeguards."
      badge={<SavedBadge isDirty={isDirty} isSaving={isSaving} />}
      actions={(
        <>
          <Button variant="outline" className="min-h-11 rounded-xl sm:min-w-28" onClick={discard} disabled={!isDirty || isSaving}>Discard</Button>
          <Button asChild variant="outline" className="min-h-11 rounded-xl sm:min-w-48"><Link to="/role-permissions"><Shield className="mr-2 h-4 w-4" />Manage full permissions</Link></Button>
          <Button className="min-h-11 rounded-xl bg-blue-600 px-6 hover:bg-blue-700 sm:min-w-48" onClick={handleSave} disabled={!isDirty || isSaving}><Save className="mr-2 h-4 w-4" />{isSaving ? 'Saving…' : 'Save safeguards'}</Button>
        </>
      )}
    >
      <SettingsScopeSelector />
      <div className="mt-3 flex min-w-0 flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users or roles" className="h-12 rounded-2xl border-slate-200 bg-white pl-10 shadow-sm dark:border-slate-800 dark:bg-slate-900" /></div>
        <Button asChild className="h-12 rounded-2xl bg-blue-600 px-5 hover:bg-blue-700"><Link to="/staff-invitations"><Plus className="mr-2 h-4 w-4" />Invite user</Link></Button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi icon={Users} label="Active" value={activeCount} tone="bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300" />
        <Kpi icon={Clock3} label="Pending" value={pendingCount} tone="bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300" />
        <Kpi icon={Shield} label="Roles" value={roleCount} tone="bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300" />
        <Kpi icon={KeyRound} label="Manager MFA" value={access.requireManagerMfa ? 'Required' : 'Optional'} tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300" />
      </div>

      <div className="mt-4 grid grid-cols-4 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {TABS.map((tab) => <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={cn('min-h-10 rounded-xl px-1 text-xs font-bold transition sm:text-sm', activeTab === tab ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800')}>{tab}</button>)}
      </div>

      {(settingsLoading || membershipsLoading) ? <div className="mt-4"><SettingsSkeleton /></div> : (
        <div className="mt-5 space-y-6">
          {activeTab === 'Users' && (
            <SettingsSection title="ERP portal users" description="Every user receives only the role and branch scope approved by the owner.">
              <SettingsCard className="divide-y divide-slate-100 overflow-hidden dark:divide-slate-800">
                {filteredMemberships.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No users match this search.</p> : filteredMemberships.map((membership) => (
                  <Link key={membership.id} to="/role-permissions" className="flex min-w-0 items-center gap-3 p-4 transition hover:bg-slate-50 dark:hover:bg-slate-800/70">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-black text-white">{(membership.full_name || membership.email || 'U').slice(0, 2).toUpperCase()}</span>
                    <div className="min-w-0 flex-1"><div className="flex min-w-0 flex-wrap items-center gap-2"><p className="max-w-full truncate text-sm font-black text-slate-950 dark:text-white">{membership.full_name || membership.email || 'Unnamed user'}</p><span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold capitalize', STATUS_STYLE[membership.status] || 'bg-slate-100 text-slate-600')}>{membership.status || 'unknown'}</span></div><p className="mt-0.5 break-all text-xs text-slate-500">{ROLE_LABELS[membership.role] || membership.role} · {branchName(membership.branch_id)}</p></div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 rtl:rotate-180" />
                  </Link>
                ))}
              </SettingsCard>
            </SettingsSection>
          )}

          {activeTab === 'Roles' && (
            <SettingsSection title="Role model" description="Four canonical ERP roles; Drivers remain managed records, not login accounts.">
              <div className="grid gap-3 sm:grid-cols-2">
                {Object.entries(ROLE_LABELS).map(([role, label]) => {
                  const count = memberships.filter((item) => item.role === role).length;
                  return <Link key={role} to="/role-permissions" className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200 dark:border-slate-800 dark:bg-slate-900"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300"><Shield className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="font-black text-slate-950 dark:text-white">{label}</p><p className="text-xs text-slate-500">{count} assigned user{count === 1 ? '' : 's'}</p></div><ChevronRight className="h-4 w-4 text-slate-400 rtl:rotate-180" /></Link>;
                })}
              </div>
            </SettingsSection>
          )}

          {activeTab === 'Approvals' && (
            <SettingsSection title="Owner approval control" description="Sensitive changes remain pending until the store owner reviews them.">
              <SettingsCard className="divide-y divide-slate-100 dark:divide-slate-800">
                <SettingRow icon={CheckCircle2} title="Pending ERP approvals" description={`${pendingCount} membership request${pendingCount === 1 ? '' : 's'} waiting`} to="/erp-approval-center" />
                <SettingRow icon={FileClock} title="Invitation management" description="Create, expire and review secure invitations" to="/staff-invitations" />
                <SettingRow icon={Shield} title="Approval policy" description="Configure purchase and expense approval thresholds" to="/approval-policy" />
              </SettingsCard>
            </SettingsSection>
          )}

          {activeTab === 'Audit' && (
            <SettingsSection title="Permission audit" description="Server-recorded role, status and permission changes.">
              <SettingsCard className="divide-y divide-slate-100 dark:divide-slate-800">
                {auditLoading ? <p className="p-8 text-center text-sm text-slate-500">Loading audit events…</p> : auditEvents.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No permission audit events yet.</p> : auditEvents.map((event) => <div key={event.id} className="flex min-w-0 items-start gap-3 p-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><FileClock className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="break-words text-sm font-bold text-slate-900 dark:text-white">{event.target_name || event.target_email || event.action || 'Permission event'}</p><p className="mt-0.5 break-words text-xs text-slate-500">{event.action?.replaceAll('_', ' ') || 'access update'}{event.notes ? ` · ${event.notes}` : ''}</p></div><span className="shrink-0 text-[10px] text-slate-400">{event.created_at ? new Date(event.created_at).toLocaleDateString() : ''}</span></div>)}
              </SettingsCard>
            </SettingsSection>
          )}

          <SettingsSection title="Access safeguards" description="These controls apply across every branch in this organization.">
            <SettingsCard className="divide-y divide-slate-100 dark:divide-slate-800">
              <SettingRow icon={LockKeyhole} title="Require MFA for managers" description="Managers must use multi-factor authentication"><Switch checked={Boolean(access.requireManagerMfa)} onCheckedChange={(value) => patchAccess({ requireManagerMfa: value })} /></SettingRow>
              <SettingRow icon={Shield} title="Owner approval for role changes" description="Role changes cannot bypass owner review"><Switch checked={Boolean(access.ownerApprovalRoleChanges)} onCheckedChange={(value) => patchAccess({ ownerApprovalRoleChanges: value })} /></SettingRow>
              <SettingRow icon={Clock3} title="Auto-expire invitations" description="Unused invitations automatically become invalid"><div className="flex shrink-0 items-center gap-2"><Select value={String(access.invitationExpiryHours || 72)} onValueChange={(value) => patchAccess({ invitationExpiryHours: Number(value) })} disabled={!access.autoExpireInvitations}><SelectTrigger className="h-9 w-28 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="24">24 hours</SelectItem><SelectItem value="48">48 hours</SelectItem><SelectItem value="72">72 hours</SelectItem><SelectItem value="168">7 days</SelectItem></SelectContent></Select><Switch checked={Boolean(access.autoExpireInvitations)} onCheckedChange={(value) => patchAccess({ autoExpireInvitations: value })} /></div></SettingRow>
            </SettingsCard>
          </SettingsSection>

          {highRiskMembers.length > 0 && <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200 sm:flex-row sm:items-center"><ShieldAlert className="h-7 w-7 shrink-0 text-red-600" /><div className="min-w-0 flex-1"><p className="font-black">{highRiskMembers.length} high-risk permission assignment{highRiskMembers.length === 1 ? '' : 's'} detected</p><p className="mt-0.5 text-xs opacity-80">Non-owner users currently hold sensitive administration permissions.</p></div><Button asChild variant="outline" className="rounded-xl border-red-200 bg-white text-red-700 hover:bg-red-100"><Link to="/role-permissions"><AlertTriangle className="mr-2 h-4 w-4" />Review now</Link></Button></div>}
        </div>
      )}
    </SettingsPageFrame>
  );
}
