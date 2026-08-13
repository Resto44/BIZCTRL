import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Copy, Link2, Loader2, RefreshCw, ShieldCheck, UserPlus, XCircle } from 'lucide-react';

const STAFF_ROLES = [
  { value: 'general_manager', label: 'General Manager' },
  { value: 'manager', label: 'Branch Manager' },
  { value: 'employee', label: 'Employee' },
  { value: 'supplier', label: 'Supplier' },
];

const formatInvitationStatus = (status, expiresAt) => {
  if (status === 'pending' && new Date(expiresAt).getTime() <= Date.now()) return 'expired';
  return status;
};

export default function OwnerStaffProvisioning() {
  const { user } = useAuth();
  const [organizations, setOrganizations] = useState([]);
  const [branches, setBranches] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('');
  const [form, setForm] = useState({
    role: 'employee',
    branchId: '',
    fullName: '',
    email: '',
    phone: '',
  });
  const [generatedInvitation, setGeneratedInvitation] = useState(null);

  const selectedOrganization = useMemo(
    () => organizations.find((organization) => organization.id === selectedOrganizationId) || null,
    [organizations, selectedOrganizationId],
  );

  const loadOrganizations = useCallback(async () => {
    const { data, error } = await supabase.rpc('list_erp_owned_organizations');
    if (error) throw error;
    const owned = data || [];
    setOrganizations(owned);
    setSelectedOrganizationId((current) => current || owned[0]?.id || '');
  }, []);

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
      branchId: activeBranches.some((branch) => branch.id === current.branchId) ? current.branchId : activeBranches[0]?.id || '',
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
      .limit(20);
    if (error) throw error;
    setInvitations(data || []);
  }, []);

  const refresh = useCallback(async (organizationId = selectedOrganizationId) => {
    setLoading(true);
    try {
      await Promise.all([loadOrganizations(), loadBranches(organizationId), loadInvitations(organizationId)]);
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
    Promise.all([loadBranches(selectedOrganizationId), loadInvitations(selectedOrganizationId)])
      .catch((error) => {
        console.error('[OwnerStaffProvisioning] organization-scoped load failed', error);
        toast.error('Unable to load the selected organization.');
      });
  }, [selectedOrganizationId, loadBranches, loadInvitations]);

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const createInvitation = async (event) => {
    event.preventDefault();
    const fullName = form.fullName.trim();
    const email = form.email.trim().toLowerCase();
    const phone = form.phone.trim();

    if (!selectedOrganizationId || !form.branchId || !fullName || !form.role) {
      toast.error('Select an organization, branch, role, and enter the staff member’s name.');
      return;
    }
    if ((email && phone) || (!email && !phone)) {
      toast.error('Provide exactly one identity channel: an email address or a phone number.');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('create_erp_invitation', {
        p_role: form.role,
        p_restaurant_id: selectedOrganizationId,
        p_branch_id: form.branchId,
        p_full_name: fullName,
        p_email: email || null,
        p_phone: phone || null,
        p_permissions: {},
      });
      if (error) throw error;
      if (!data?.token) throw new Error('The invitation was created without an activation token.');

      const invitationUrl = `${window.location.origin}/erp-register?token=${encodeURIComponent(data.token)}`;
      setGeneratedInvitation({
        ...data,
        invitationUrl,
        recipient: email || phone,
        role: STAFF_ROLES.find((role) => role.value === form.role)?.label || form.role,
        organization: selectedOrganization?.name || 'Selected organization',
        branch: branches.find((branch) => branch.id === form.branchId)?.name || branches.find((branch) => branch.id === form.branchId)?.label || 'Selected branch',
      });
      setForm((current) => ({ ...current, fullName: '', email: '', phone: '' }));
      toast.success('Secure invitation created. Copy the one-time activation link now.');
      await loadInvitations(selectedOrganizationId);
    } catch (error) {
      console.error('[OwnerStaffProvisioning] invitation creation failed', error);
      toast.error(error.message || 'Unable to create the secure invitation.');
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
      toast.error('Copy is unavailable in this browser. Select the link below to copy it manually.');
    }
  };

  const revokeInvitation = async (invitationId) => {
    try {
      const { error } = await supabase.rpc('revoke_erp_invitation', { p_invitation_id: invitationId });
      if (error) throw error;
      toast.success('Invitation revoked. Its activation link can no longer be used.');
      await loadInvitations(selectedOrganizationId);
    } catch (error) {
      console.error('[OwnerStaffProvisioning] invitation revoke failed', error);
      toast.error(error.message || 'Unable to revoke the invitation.');
    }
  };

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.06] to-background shadow-sm">
      <CardContent className="p-4 sm:p-5 space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Create a secure staff invitation</h2>
              <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                Only organization owners can provision staff. Organization, branch, role, and role permissions are locked into a single-use invitation and assigned automatically after verified activation.
              </p>
            </div>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => refresh()} disabled={loading} className="self-start">
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        <form onSubmit={createInvitation} className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="invite-organization">Organization</Label>
            <select
              id="invite-organization"
              value={selectedOrganizationId}
              onChange={(event) => setSelectedOrganizationId(event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              required
            >
              <option value="">Select an owned organization</option>
              {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-branch">Branch</Label>
            <select
              id="invite-branch"
              value={form.branchId}
              onChange={(event) => updateForm('branchId', event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              disabled={!selectedOrganizationId || branches.length === 0}
              required
            >
              <option value="">Select an active branch</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name || branch.label || branch.branch_key}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-role">Role</Label>
            <select
              id="invite-role"
              value={form.role}
              onChange={(event) => updateForm('role', event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              required
            >
              {STAFF_ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-name">Full name</Label>
            <Input id="invite-name" value={form.fullName} onChange={(event) => updateForm('fullName', event.target.value)} placeholder="Staff member name" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email address <span className="text-muted-foreground">or phone below</span></Label>
            <Input id="invite-email" type="email" value={form.email} onChange={(event) => updateForm('email', event.target.value)} placeholder="person@company.com" disabled={Boolean(form.phone)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-phone">Phone number <span className="text-muted-foreground">or email above</span></Label>
            <Input id="invite-phone" type="tel" value={form.phone} onChange={(event) => updateForm('phone', event.target.value)} placeholder="+1 555 0100" disabled={Boolean(form.email)} />
          </div>
          <div className="md:col-span-2 xl:col-span-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pt-1">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              The activation link expires after seven days and can be used once only.
            </div>
            <Button type="submit" disabled={submitting || loading || !user?.id}>
              {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Link2 className="mr-1.5 h-4 w-4" />}
              Create invitation
            </Button>
          </div>
        </form>

        {generatedInvitation && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Invitation ready for {generatedInvitation.recipient}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{generatedInvitation.role} · {generatedInvitation.organization} · {generatedInvitation.branch}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Share this link privately. It expires {new Date(generatedInvitation.expires_at).toLocaleString()} and is not stored in readable form.</p>
              </div>
              <Button type="button" size="sm" onClick={copyInvitationLink}>
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy link
              </Button>
            </div>
            <Input readOnly value={generatedInvitation.invitationUrl} className="mt-3 bg-background text-xs" onFocus={(event) => event.target.select()} />
          </div>
        )}

        <div className="border-t border-border/70 pt-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Recent invitations</h3>
              <p className="text-[11px] text-muted-foreground">Only invitations for the selected organization are visible here.</p>
            </div>
            <Badge variant="secondary">{invitations.length}</Badge>
          </div>
          {loading ? (
            <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading owner-scoped invitations…</div>
          ) : invitations.length === 0 ? (
            <p className="py-4 text-xs text-muted-foreground">No secure invitations have been issued for this organization.</p>
          ) : (
            <div className="space-y-2">
              {invitations.map((invitation) => {
                const status = formatInvitationStatus(invitation.status, invitation.expires_at);
                const branch = branches.find((item) => item.id === invitation.branch_id);
                const statusClass = status === 'activated'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/35 dark:text-emerald-300'
                  : status === 'pending'
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/35 dark:text-amber-300'
                    : 'bg-muted text-muted-foreground';
                return (
                  <div key={invitation.id} className="flex flex-col gap-2 rounded-lg border border-border/70 bg-background/60 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-foreground">{invitation.full_name} <span className="font-normal text-muted-foreground">· {invitation.email || invitation.phone}</span></p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{STAFF_ROLES.find((role) => role.value === invitation.role)?.label || invitation.role} · {branch?.name || branch?.label || 'Assigned branch'} · expires {new Date(invitation.expires_at).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`capitalize ${statusClass}`}>{status}</Badge>
                      {status === 'pending' && (
                        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => revokeInvitation(invitation.id)}>
                          <XCircle className="mr-1 h-3.5 w-3.5" /> Revoke
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
