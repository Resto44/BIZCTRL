import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { useTenant } from '@/lib/TenantContext';
import { subscriptionLimitErrorMessage } from '@/lib/subscriptionLimits';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  BriefcaseBusiness, Building2, CheckCircle2, Clock3, Copy, Link2, Loader2,
  Mail, MapPin, Phone, RefreshCw, RotateCw, Share2, ShieldCheck, Truck,
  UserPlus, UserRound, XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const STAFF_ROLES = [
  { value: 'manager', label: 'Branch Manager', short: 'Manager', description: 'Run the assigned branch', icon: BriefcaseBusiness, tone: 'blue' },
  { value: 'employee', label: 'Employee', short: 'Employee', description: 'Daily assigned operations', icon: UserRound, tone: 'violet' },
  { value: 'supplier', label: 'Supplier', short: 'Supplier', description: 'Supplier portal access', icon: Truck, tone: 'emerald' },
];

const ROLE_TONES = {
  blue: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/35 dark:text-blue-300',
  violet: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/35 dark:text-violet-300',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/35 dark:text-emerald-300',
};

const STATUS_STYLES = {
  activated: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/35 dark:text-emerald-300',
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/35 dark:text-amber-300',
  expired: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  revoked: 'bg-red-50 text-red-600 dark:bg-red-950/35 dark:text-red-300',
};

const FILTERS = ['all', 'pending', 'activated', 'expired'];

const normalizeInvitationStatus = (status, expiresAt) => {
  if (status === 'pending' && new Date(expiresAt).getTime() <= Date.now()) return 'expired';
  return status || 'pending';
};

const roleMeta = (role) => STAFF_ROLES.find((item) => item.value === role) || {
  value: role,
  label: role || 'Staff',
  short: role || 'Staff',
  description: 'Assigned ERP access',
  icon: UserRound,
  tone: 'blue',
};

function ScopeField({ icon: Icon, label, children }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300"><Icon className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>{children}</div>
    </div>
  );
}

function InviteMetric({ icon: Icon, label, value, tone }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', tone)}><Icon className="h-4 w-4" /></span>
      <div className="min-w-0"><p className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="text-lg font-black text-slate-950 dark:text-white">{value}</p></div>
    </div>
  );
}

export default function OwnerStaffProvisioning() {
  const { user } = useAuth();
  const { activeRestaurant, setActiveRestaurant } = useTenant();
  const [organizations, setOrganizations] = useState([]);
  const [branches, setBranches] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actionInvitationId, setActionInvitationId] = useState(null);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('');
  const [contactMode, setContactMode] = useState('email');
  const [activeFilter, setActiveFilter] = useState('all');
  const [form, setForm] = useState({ role: 'employee', branchId: '', fullName: '', contact: '' });
  const [generatedInvitation, setGeneratedInvitation] = useState(null);

  const selectedOrganization = useMemo(
    () => organizations.find((organization) => String(organization.id) === String(selectedOrganizationId)) || null,
    [organizations, selectedOrganizationId],
  );
  const selectedBranch = useMemo(
    () => branches.find((branch) => String(branch.id) === String(form.branchId)) || null,
    [branches, form.branchId],
  );

  const invitationCounts = useMemo(() => invitations.reduce((counts, invitation) => {
    const status = normalizeInvitationStatus(invitation.status, invitation.expires_at);
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, { pending: 0, activated: 0, expired: 0, revoked: 0 }), [invitations]);

  const visibleInvitations = useMemo(() => {
    if (activeFilter === 'all') return invitations;
    return invitations.filter((invitation) => normalizeInvitationStatus(invitation.status, invitation.expires_at) === activeFilter);
  }, [activeFilter, invitations]);

  const selectedRole = roleMeta(form.role);
  const contact = form.contact.trim();
  const isFormReady = Boolean(selectedOrganizationId && form.branchId && form.fullName.trim() && contact && form.role);

  const loadOrganizations = useCallback(async () => {
    const { data, error } = await supabase.rpc('list_erp_owned_organizations');
    if (error) throw error;
    const owned = data || [];
    const preferredId = owned.some((organization) => String(organization.id) === String(activeRestaurant?.id))
      ? String(activeRestaurant.id)
      : String(owned[0]?.id || '');
    setOrganizations(owned);
    setSelectedOrganizationId((current) => owned.some((organization) => String(organization.id) === String(current)) ? current : preferredId);
    return owned;
  }, [activeRestaurant?.id]);

  const loadBranches = useCallback(async (organizationId) => {
    if (!organizationId) {
      setBranches([]);
      return;
    }
    const { data, error } = await supabase.rpc('list_erp_owned_branches', { p_restaurant_id: organizationId });
    if (error) throw error;
    const activeBranches = data || [];
    setBranches(activeBranches);
    setForm((current) => ({
      ...current,
      branchId: activeBranches.some((branch) => String(branch.id) === String(current.branchId)) ? current.branchId : String(activeBranches[0]?.id || ''),
    }));
  }, []);

  const loadInvitations = useCallback(async (organizationId) => {
    if (!organizationId) {
      setInvitations([]);
      return;
    }
    const { data, error } = await supabase
      .from('erp_invitations')
      .select('id, full_name, email, phone, role, branch_id, status, expires_at, created_at')
      .eq('restaurant_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    setInvitations(data || []);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await loadOrganizations();
      if (selectedOrganizationId) await Promise.all([loadBranches(selectedOrganizationId), loadInvitations(selectedOrganizationId)]);
    } catch (error) {
      console.error('[OwnerStaffProvisioning] refresh failed', error);
      toast.error('Unable to load secure staff provisioning data. Please refresh and try again.');
    } finally {
      setLoading(false);
    }
  }, [loadBranches, loadInvitations, loadOrganizations, selectedOrganizationId]);

  useEffect(() => {
    loadOrganizations().catch((error) => {
      console.error('[OwnerStaffProvisioning] organization load failed', error);
      toast.error('Unable to load your organizations.');
    }).finally(() => setLoading(false));
  }, [loadOrganizations]);

  useEffect(() => {
    if (!selectedOrganizationId) return;
    setLoading(true);
    Promise.all([loadBranches(selectedOrganizationId), loadInvitations(selectedOrganizationId)])
      .catch((error) => {
        console.error('[OwnerStaffProvisioning] organization-scoped load failed', error);
        toast.error('Unable to load the selected organization.');
      })
      .finally(() => setLoading(false));
  }, [selectedOrganizationId, loadBranches, loadInvitations]);

  const updateForm = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const changeOrganization = (organizationId) => {
    setSelectedOrganizationId(organizationId);
    setGeneratedInvitation(null);
    if (organizationId) setActiveRestaurant(organizationId);
  };
  const changeContactMode = (mode) => {
    setContactMode(mode);
    updateForm('contact', '');
  };

  const issueInvitation = async ({ role, branchId, fullName, email, phone }) => {
    const { data, error } = await supabase.rpc('create_erp_invitation', {
      p_role: role,
      p_restaurant_id: selectedOrganizationId,
      p_branch_id: branchId,
      p_full_name: fullName,
      p_email: email || null,
      p_phone: phone || null,
      p_permissions: {},
    });
    if (error) throw error;
    if (!data?.token) throw new Error('The invitation was created without an activation token.');

    const branch = branches.find((item) => String(item.id) === String(branchId));
    const generated = {
      ...data,
      invitationUrl: `${window.location.origin}/erp-register?token=${encodeURIComponent(data.token)}`,
      fullName,
      recipient: email || phone,
      role: roleMeta(role).label,
      organization: selectedOrganization?.name || 'Selected organization',
      branch: branch?.name || branch?.label || 'Selected branch',
    };
    setGeneratedInvitation(generated);
    try {
      await loadInvitations(selectedOrganizationId);
    } catch (refreshError) {
      console.error('[OwnerStaffProvisioning] invitation list refresh failed after successful issuance', refreshError);
      toast.warning('Invitation created, but the activity list could not refresh.');
    }
    return generated;
  };

  const createInvitation = async (event) => {
    event.preventDefault();
    const fullName = form.fullName.trim();
    const identity = form.contact.trim();
    if (!isFormReady) {
      toast.error('Complete the name, contact, role, store, and branch.');
      return;
    }
    setSubmitting(true);
    try {
      await issueInvitation({
        role: form.role,
        branchId: form.branchId,
        fullName,
        email: contactMode === 'email' ? identity.toLowerCase() : null,
        phone: contactMode === 'phone' ? identity : null,
      });
      setForm((current) => ({ ...current, fullName: '', contact: '' }));
      toast.success('Secure invitation is ready to share.');
    } catch (error) {
      console.error('[OwnerStaffProvisioning] invitation creation failed', error);
      toast.error(subscriptionLimitErrorMessage(error, 'Unable to create the secure invitation.'));
    } finally {
      setSubmitting(false);
    }
  };

  const copyInvitationLink = async () => {
    if (!generatedInvitation?.invitationUrl) return;
    try {
      await navigator.clipboard.writeText(generatedInvitation.invitationUrl);
      toast.success('One-time activation link copied.');
    } catch {
      toast.error('Copy is unavailable. Select the link below and copy it manually.');
    }
  };

  const shareInvitation = async () => {
    if (!generatedInvitation?.invitationUrl) return;
    const shareData = {
      title: 'BizCTRL ERP invitation',
      text: `${generatedInvitation.fullName}, activate your ${generatedInvitation.role} account for ${generatedInvitation.organization}.`,
      url: generatedInvitation.invitationUrl,
    };
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share(shareData);
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return;
      }
    }
    await copyInvitationLink();
  };

  const reissueInvitation = async (invitation) => {
    setActionInvitationId(invitation.id);
    try {
      await issueInvitation({
        role: invitation.role,
        branchId: invitation.branch_id,
        fullName: invitation.full_name,
        email: invitation.email,
        phone: invitation.phone,
      });
      toast.success('A new one-time link replaced the previous invitation.');
    } catch (error) {
      console.error('[OwnerStaffProvisioning] invitation reissue failed', error);
      toast.error(subscriptionLimitErrorMessage(error, 'Unable to renew this invitation.'));
    } finally {
      setActionInvitationId(null);
    }
  };

  const revokeInvitation = async (invitationId) => {
    setActionInvitationId(invitationId);
    try {
      const { error } = await supabase.rpc('revoke_erp_invitation', { p_invitation_id: invitationId });
      if (error) throw error;
      toast.success('Invitation revoked. Its link can no longer be used.');
      await loadInvitations(selectedOrganizationId);
    } catch (error) {
      console.error('[OwnerStaffProvisioning] invitation revoke failed', error);
      toast.error(error.message || 'Unable to revoke the invitation.');
    } finally {
      setActionInvitationId(null);
    }
  };

  return (
    <div className="min-w-0 space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <InviteMetric icon={Clock3} label="Pending" value={invitationCounts.pending} tone="bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300" />
        <InviteMetric icon={CheckCircle2} label="Activated" value={invitationCounts.activated} tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300" />
        <InviteMetric icon={XCircle} label="Expired" value={invitationCounts.expired + invitationCounts.revoked} tone="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" />
      </div>

      <Card className="min-w-0 overflow-hidden border-blue-200/80 bg-gradient-to-br from-blue-50/70 via-white to-white shadow-sm dark:border-blue-900/50 dark:from-blue-950/25 dark:via-slate-950 dark:to-slate-950">
        <CardContent className="space-y-5 p-4 sm:p-6">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="flex min-w-0 gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20"><UserPlus className="h-5 w-5" /></span>
              <div className="min-w-0"><h2 className="text-base font-black text-slate-950 dark:text-white sm:text-lg">Quick user invitation</h2><p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">Choose access, enter one contact, then share the secure link.</p></div>
            </div>
            <Button type="button" size="icon" variant="outline" aria-label="Refresh invitations" onClick={refresh} disabled={loading} className="h-10 w-10 shrink-0 rounded-xl bg-white dark:bg-slate-900"><RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /></Button>
          </div>

          <form onSubmit={createInvitation} className="space-y-5">
            <div className="grid min-w-0 gap-2 sm:grid-cols-2">
              <ScopeField icon={Building2} label="Store">
                <select aria-label="Select invitation store" value={selectedOrganizationId} onChange={(event) => changeOrganization(event.target.value)} className="mt-0.5 h-7 w-full min-w-0 bg-transparent text-sm font-black text-slate-900 outline-none dark:text-white" required>
                  <option value="">Select store</option>
                  {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
                </select>
              </ScopeField>
              <ScopeField icon={MapPin} label="Branch">
                <select aria-label="Select invitation branch" value={form.branchId} onChange={(event) => updateForm('branchId', event.target.value)} className="mt-0.5 h-7 w-full min-w-0 bg-transparent text-sm font-black text-slate-900 outline-none disabled:opacity-50 dark:text-white" disabled={!selectedOrganizationId || branches.length === 0} required>
                  <option value="">Select branch</option>
                  {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name || branch.label || branch.branch_key}</option>)}
                </select>
              </ScopeField>
            </div>

            <fieldset>
              <legend className="mb-2 text-xs font-black text-slate-700 dark:text-slate-200">1. Choose role</legend>
              <div className="grid grid-cols-3 gap-2">
                {STAFF_ROLES.map((role) => {
                  const Icon = role.icon;
                  const active = form.role === role.value;
                  return (
                    <button key={role.value} type="button" aria-pressed={active} onClick={() => updateForm('role', role.value)} className={cn('min-w-0 rounded-2xl border p-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:p-3', active ? `${ROLE_TONES[role.tone]} ring-2 ring-current/10` : 'border-slate-200 bg-white text-slate-500 hover:border-blue-200 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400')}>
                      <Icon className="h-5 w-5" /><p className="mt-2 truncate text-xs font-black sm:text-sm">{role.short}</p><p className="mt-0.5 hidden text-[10px] leading-4 opacity-75 sm:block">{role.description}</p>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div>
              <p className="mb-2 text-xs font-black text-slate-700 dark:text-slate-200">2. Enter user details</p>
              <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <div><Label htmlFor="invite-name" className="sr-only">Full name</Label><Input id="invite-name" value={form.fullName} onChange={(event) => updateForm('fullName', event.target.value)} placeholder="Full name" autoComplete="name" className="h-12 rounded-2xl border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950" required /></div>
                <div className="flex min-w-0 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <div className="grid shrink-0 grid-cols-2 gap-1">
                    <button type="button" aria-label="Invite by email" aria-pressed={contactMode === 'email'} onClick={() => changeContactMode('email')} className={cn('flex h-10 w-10 items-center justify-center rounded-xl transition', contactMode === 'email' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800')}><Mail className="h-4 w-4" /></button>
                    <button type="button" aria-label="Invite by phone" aria-pressed={contactMode === 'phone'} onClick={() => changeContactMode('phone')} className={cn('flex h-10 w-10 items-center justify-center rounded-xl transition', contactMode === 'phone' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800')}><Phone className="h-4 w-4" /></button>
                  </div>
                  <Label htmlFor="invite-contact" className="sr-only">{contactMode === 'email' ? 'Email address' : 'Phone number'}</Label>
                  <Input id="invite-contact" type={contactMode === 'email' ? 'email' : 'tel'} inputMode={contactMode === 'email' ? 'email' : 'tel'} autoComplete={contactMode === 'email' ? 'email' : 'tel'} value={form.contact} onChange={(event) => updateForm('contact', event.target.value)} placeholder={contactMode === 'email' ? 'name@company.com' : '+966 5X XXX XXXX'} className="h-10 min-w-0 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0" required />
                </div>
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-3 dark:border-blue-900/50 dark:bg-blue-950/25 sm:flex-row sm:items-center">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm dark:bg-slate-900"><ShieldCheck className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1"><p className="break-words text-xs font-black text-slate-900 dark:text-white">{selectedRole.label} · {selectedBranch?.name || selectedBranch?.label || 'Select branch'}</p><p className="mt-0.5 text-[11px] leading-4 text-slate-500">Single-use owner-issued link · server-enforced 7-day expiry</p></div>
              <Button type="submit" disabled={submitting || loading || !user?.id || !isFormReady} className="min-h-11 shrink-0 rounded-xl bg-blue-600 px-5 font-black hover:bg-blue-700">
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}Create secure link
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {generatedInvitation && (
        <div role="status" className="overflow-hidden rounded-3xl border border-emerald-200 bg-emerald-50 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/25">
          <div className="flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white"><CheckCircle2 className="h-6 w-6" /></span>
            <div className="min-w-0 flex-1"><p className="font-black text-emerald-950 dark:text-emerald-100">Invitation ready for {generatedInvitation.fullName}</p><p className="mt-0.5 break-all text-xs text-emerald-800/75 dark:text-emerald-200/70">{generatedInvitation.recipient} · {generatedInvitation.role} · {generatedInvitation.branch}</p></div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Button type="button" variant="outline" onClick={copyInvitationLink} className="min-h-11 rounded-xl border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-slate-900 dark:text-emerald-300"><Copy className="mr-2 h-4 w-4" />Copy</Button>
              <Button type="button" onClick={shareInvitation} className="min-h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700"><Share2 className="mr-2 h-4 w-4" />Share now</Button>
            </div>
          </div>
          <div className="border-t border-emerald-200/70 px-4 py-3 dark:border-emerald-900/40 sm:px-5"><Input readOnly aria-label="Generated activation link" value={generatedInvitation.invitationUrl} className="h-10 rounded-xl border-emerald-200 bg-white text-xs dark:border-emerald-900 dark:bg-slate-950" onFocus={(event) => event.target.select()} /><p className="mt-2 text-[10px] text-emerald-800/70 dark:text-emerald-200/60">This readable token is shown only now. Share it privately before leaving the page.</p></div>
        </div>
      )}

      <Card className="min-w-0 overflow-hidden border-slate-200 shadow-sm dark:border-slate-800">
        <CardContent className="p-0">
          <div className="flex min-w-0 flex-col gap-3 border-b border-slate-100 p-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <div><h3 className="font-black text-slate-950 dark:text-white">Invitation activity</h3><p className="mt-0.5 text-xs text-slate-500">Renew creates a new token and invalidates the previous pending link.</p></div>
            <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
              {FILTERS.map((filter) => <button key={filter} type="button" onClick={() => setActiveFilter(filter)} className={cn('min-h-8 shrink-0 rounded-lg px-3 text-[11px] font-bold capitalize transition', activeFilter === filter ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-800 dark:text-blue-300' : 'text-slate-500')}>{filter}</button>)}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading invitations…</div>
          ) : visibleInvitations.length === 0 ? (
            <div className="p-10 text-center"><UserPlus className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-200">No {activeFilter === 'all' ? '' : activeFilter} invitations</p><p className="mt-1 text-xs text-slate-500">Create the first secure link above.</p></div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {visibleInvitations.map((invitation) => {
                const status = normalizeInvitationStatus(invitation.status, invitation.expires_at);
                const branch = branches.find((item) => String(item.id) === String(invitation.branch_id));
                const role = roleMeta(invitation.role);
                const RoleIcon = role.icon;
                const actionLoading = actionInvitationId === invitation.id;
                return (
                  <div key={invitation.id} className="flex min-w-0 flex-col gap-3 p-4 transition hover:bg-slate-50/80 dark:hover:bg-slate-900/50 sm:flex-row sm:items-center">
                    <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border', ROLE_TONES[role.tone])}><RoleIcon className="h-5 w-5" /></span>
                    <div className="min-w-0 flex-1"><div className="flex min-w-0 flex-wrap items-center gap-2"><p className="max-w-full truncate text-sm font-black text-slate-950 dark:text-white">{invitation.full_name}</p><Badge className={cn('capitalize', STATUS_STYLES[status] || STATUS_STYLES.expired)}>{status}</Badge></div><p className="mt-0.5 break-all text-xs text-slate-500">{invitation.email || invitation.phone}</p><p className="mt-1 text-[10px] text-slate-400">{role.label} · {branch?.name || branch?.label || 'Assigned branch'} · {new Date(invitation.expires_at).toLocaleDateString()}</p></div>
                    <div className="flex gap-2 sm:shrink-0">
                      {status !== 'activated' && <Button type="button" size="sm" variant="outline" disabled={actionLoading} onClick={() => reissueInvitation(invitation)} className="h-9 flex-1 rounded-xl sm:flex-none"><RotateCw className={cn('mr-1.5 h-3.5 w-3.5', actionLoading && 'animate-spin')} />Renew link</Button>}
                      {status === 'pending' && <Button type="button" size="sm" variant="ghost" disabled={actionLoading} onClick={() => revokeInvitation(invitation.id)} className="h-9 flex-1 rounded-xl text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30 sm:flex-none"><XCircle className="mr-1.5 h-3.5 w-3.5" />Revoke</Button>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
