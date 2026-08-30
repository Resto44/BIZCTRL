import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Building2, UserCheck, User, Package,
  CheckCircle2, XCircle, Clock, ShieldCheck, ShieldOff,
  RefreshCw, Search, Eye, Phone, Mail, Calendar, GitBranch,
  AlertCircle, Loader2, ArrowLeft, Link2
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import OwnerStaffProvisioning from '@/components/owner/OwnerStaffProvisioning';

const ROLE_META = {
  owner:           { label: 'Owner',           color: 'bg-violet-500/20 text-violet-300 border-violet-500/30', icon: Building2 },
  manager:         { label: 'Branch Manager',  color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', icon: UserCheck },
  employee:        { label: 'Employee',        color: 'bg-amber-500/20 text-amber-300 border-amber-500/30',   icon: User },
  supplier:        { label: 'Supplier',        color: 'bg-slate-500/20 text-slate-300 border-slate-500/30',   icon: Package },
};

const STATUS_META = {
  pending:   { label: 'Pending',   color: 'bg-amber-500/20 text-amber-300 border-amber-500/30',   icon: Clock },
  approved:  { label: 'Approved',  color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', icon: CheckCircle2 },
  rejected:  { label: 'Rejected',  color: 'bg-red-500/20 text-red-300 border-red-500/30',         icon: XCircle },
  suspended: { label: 'Suspended', color: 'bg-orange-500/20 text-orange-300 border-orange-500/30', icon: ShieldOff },
};

function RoleBadge({ role }) {
  const meta = ROLE_META[role] || { label: role, color: 'bg-slate-500/20 text-slate-300 border-slate-500/30', icon: User };
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold border ${meta.color}`}>
      <Icon className="w-3 h-3" />{meta.label}
    </span>
  );
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { label: status, color: 'bg-slate-500/20 text-slate-300 border-slate-500/30', icon: Clock };
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold border ${meta.color}`}>
      <Icon className="w-3 h-3" />{meta.label}
    </span>
  );
}

function ActionModal({ membership, action, branches, onConfirm, onClose, loading }) {
  const [reason, setReason] = useState('');
  const [branchId, setBranchId] = useState(membership?.branch_id || '');

  const actionMeta = {
    approved:  { label: 'Approve',  color: 'bg-emerald-600 hover:bg-emerald-700', icon: CheckCircle2 },
    rejected:  { label: 'Reject',   color: 'bg-red-600 hover:bg-red-700',         icon: XCircle },
    suspended: { label: 'Suspend',  color: 'bg-orange-600 hover:bg-orange-700',   icon: ShieldOff },
  };
  const meta = actionMeta[action] || actionMeta.approved;
  const Icon = meta.icon;
  const needsBranch = action === 'approved' && ['manager', 'employee', 'supplier'].includes(membership?.role);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center gap-3 mb-5">
          <div className={`w-10 h-10 rounded-xl ${meta.color} flex items-center justify-center`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-white font-bold text-lg">{meta.label} Request</h3>
            <p className="text-slate-400 text-sm">{membership?.full_name} · {membership?.email}</p>
          </div>
        </div>
        <div className="space-y-4">
          {needsBranch && (
            <div>
              <label className="text-slate-300 text-sm block mb-1.5">Assign Branch *</label>
              <select value={branchId} onChange={e => setBranchId(e.target.value)}
                className="w-full bg-slate-800 border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500">
                <option value="">— Select Branch —</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}{b.location ? ` · ${b.location}` : ''}</option>
                ))}
              </select>
            </div>
          )}
          {(action === 'rejected' || action === 'suspended') && (
            <div>
              <label className="text-slate-300 text-sm block mb-1.5">Reason (optional)</label>
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
                placeholder="Provide a reason..."
                className="w-full bg-slate-800 border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500 resize-none" />
            </div>
          )}
          <div className="bg-slate-800/50 rounded-xl p-3 space-y-1.5">
            <div className="flex items-center gap-2 text-slate-400 text-xs">
              <Mail className="w-3.5 h-3.5" />{membership?.email}
            </div>
            {membership?.phone && (
              <div className="flex items-center gap-2 text-slate-400 text-xs">
                <Phone className="w-3.5 h-3.5" />{membership?.phone}
              </div>
            )}
            <div className="flex items-center gap-2 text-slate-400 text-xs">
              <Calendar className="w-3.5 h-3.5" />
              {membership?.created_at ? format(new Date(membership.created_at), 'MMM d, yyyy HH:mm') : '—'}
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <Button variant="outline" onClick={onClose} disabled={loading} className="flex-1 border-white/10 text-slate-300">
            Cancel
          </Button>
          <Button onClick={() => onConfirm({ branchId, reason })}
            disabled={loading || (needsBranch && !branchId)}
            className={`flex-1 ${meta.color} text-white`}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Icon className="w-4 h-4 mr-2" />{meta.label}</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

function DetailModal({ membership, branches, onClose }) {
  const branchName = branches.find(b => b.id === membership?.branch_id)?.name || '—';
  const regData = membership?.registration_data || {};
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-white font-bold text-lg">Registration Details</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center text-white font-bold text-lg">
              {membership?.full_name?.[0]?.toUpperCase() || '?'}
            </div>
            <div>
              <p className="text-white font-bold">{membership?.full_name}</p>
              <div className="flex items-center gap-2 mt-1">
                <RoleBadge role={membership?.role} />
                <StatusBadge status={membership?.status} />
              </div>
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Mail className="w-4 h-4 text-slate-400 shrink-0" />
              <div><p className="text-slate-500 text-xs">Email</p><p className="text-white text-sm">{membership?.email}</p></div>
            </div>
            {membership?.phone && (
              <div className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                <div><p className="text-slate-500 text-xs">Phone</p><p className="text-white text-sm">{membership?.phone}</p></div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <GitBranch className="w-4 h-4 text-slate-400 shrink-0" />
              <div><p className="text-slate-500 text-xs">Requested Branch</p><p className="text-white text-sm">{branchName}</p></div>
            </div>
            <div className="flex items-center gap-3">
              <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
              <div>
                <p className="text-slate-500 text-xs">Submitted</p>
                <p className="text-white text-sm">{membership?.created_at ? format(new Date(membership.created_at), 'MMM d, yyyy HH:mm') : '—'}</p>
              </div>
            </div>
            {membership?.approved_at && (
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <div><p className="text-slate-500 text-xs">Approved At</p><p className="text-white text-sm">{format(new Date(membership.approved_at), 'MMM d, yyyy HH:mm')}</p></div>
              </div>
            )}
            {membership?.rejection_reason && (
              <div className="flex items-start gap-3">
                <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div><p className="text-slate-500 text-xs">Rejection Reason</p><p className="text-white text-sm">{membership.rejection_reason}</p></div>
              </div>
            )}
          </div>
          {(regData.supplier_company || regData.categories || regData.license_number) && (
            <div className="bg-slate-800/50 rounded-xl p-4 space-y-2">
              <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Additional Info</p>
              {regData.supplier_company && <p className="text-white text-sm"><span className="text-slate-400">Company:</span> {regData.supplier_company}</p>}
              {regData.categories && <p className="text-white text-sm"><span className="text-slate-400">Categories:</span> {regData.categories}</p>}
              {regData.license_number && <p className="text-white text-sm"><span className="text-slate-400">License:</span> {regData.license_number}</p>}
              {regData.vehicle_type && <p className="text-white text-sm"><span className="text-slate-400">Vehicle:</span> {regData.vehicle_type} {regData.vehicle_plate || ''}</p>}
            </div>
          )}
        </div>
        <Button onClick={onClose} className="w-full mt-5 bg-slate-700 hover:bg-slate-600 text-white">Close</Button>
      </div>
    </div>
  );
}

// ── Approval Center Tab ────────────────────────────────────────────────────────
function ApprovalCenterTab() {
  const [memberships, setMemberships] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionModal, setActionModal] = useState(null);
  const [detailModal, setDetailModal] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('pending');
  const [filterRole, setFilterRole] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0, suspended: 0 });

  const loadData = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    else setLoading(true);
    try {
      const { data: mems, error } = await supabase
        .from('erp_memberships')
        .select('*')
        .neq('role', 'owner')
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) {
        console.error('[ApprovalCenter] Load error:', error);
        toast.error('Failed to load registrations: ' + error.message);
      } else {
        setMemberships(mems || []);
        const counts = { pending: 0, approved: 0, rejected: 0, suspended: 0 };
        (mems || []).forEach(m => { if (counts[m.status] !== undefined) counts[m.status]++; });
        setStats(counts);
      }
      const { data: branchData } = await supabase
        .from('branches')
        .select('id, name, location, restaurant_id')
        .eq('is_active', true)
        .order('name');
      setBranches(branchData || []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAction = async ({ branchId, reason }) => {
    if (!actionModal) return;
    const { membership, action } = actionModal;
    setActionLoading(true);
    try {
      if (action === 'suspended') {
        const suspendReason = reason || 'Account suspended by owner';
        const { error: memErr } = await supabase
          .from('erp_memberships')
          .update({
            status: 'suspended',
            rejection_reason: suspendReason,
            updated_at: new Date().toISOString(),
          })
          .eq('id', membership.id);
        if (memErr) throw memErr;
        await supabase
          .from('profiles')
          .update({
            approval_status: 'suspended',
            rejection_reason: suspendReason,
            updated_date: new Date().toISOString(),
          })
          .eq('id', membership.user_id);
        toast.success('User suspended successfully');
        setActionModal(null);
        await loadData(true);
      } else {
        const { error } = await supabase.rpc('erp_decide_membership', {
          p_membership_id: membership.id,
          p_decision: action,
          p_branch_id: branchId || null,
          p_reason: reason || null,
        });
        if (error) {
          console.error('[ApprovalCenter] Action error:', error);
          toast.error('Action failed: ' + error.message);
        } else {
          toast.success(`User ${action} successfully`);
          setActionModal(null);
          await loadData(true);
        }
      }
    } catch (err) {
      console.error('[ApprovalCenter]', err);
      toast.error('Action failed: ' + (err.message || 'Please try again.'));
    } finally {
      setActionLoading(false);
    }
  };

  const filtered = memberships.filter(m => {
    if (filterStatus !== 'all' && m.status !== filterStatus) return false;
    if (filterRole !== 'all' && m.role !== filterRole) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        m.full_name?.toLowerCase().includes(q) ||
        m.email?.toLowerCase().includes(q) ||
        m.role?.toLowerCase().includes(q) ||
        m.phone?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const pendingCount = stats.pending;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Review and manage staff registration requests</p>
        <Button onClick={() => loadData(true)} disabled={refreshing} variant="outline" size="sm"
          className="border-white/10 text-slate-300 hover:text-white gap-2">
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { key: 'pending',   label: 'Pending',   color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/20' },
          { key: 'approved',  label: 'Approved',  color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
          { key: 'rejected',  label: 'Rejected',  color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/20' },
          { key: 'suspended', label: 'Suspended', color: 'text-orange-400',  bg: 'bg-orange-500/10 border-orange-500/20' },
        ].map(s => (
          <button key={s.key} onClick={() => setFilterStatus(s.key === filterStatus ? 'all' : s.key)}
            className={`rounded-xl border p-3 text-center transition-all ${s.bg} ${filterStatus === s.key ? 'ring-2 ring-violet-500/50' : ''}`}>
            <p className={`text-xl font-black ${s.color}`}>{stats[s.key]}</p>
            <p className="text-slate-500 text-xs mt-0.5">{s.label}</p>
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, phone, role..."
            className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-slate-600" />
        </div>
        <div className="flex gap-2">
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="flex-1 bg-slate-800 border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500">
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="suspended">Suspended</option>
          </select>
          <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
            className="flex-1 bg-slate-800 border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500">
            <option value="all">All Roles</option>
            <option value="manager">Branch Manager</option>
            <option value="employee">Employee</option>
            <option value="supplier">Supplier</option>
          </select>
        </div>
      </div>

      {pendingCount > 0 && filterStatus !== 'pending' && (
        <button onClick={() => setFilterStatus('pending')}
          className="w-full bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-center gap-3 text-left hover:bg-amber-500/20 transition-colors">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
          <div>
            <p className="text-amber-300 text-sm font-semibold">{pendingCount} pending request{pendingCount !== 1 ? 's' : ''} awaiting approval</p>
            <p className="text-amber-400/70 text-xs">Tap to view pending requests</p>
          </div>
        </button>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <ShieldCheck className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No registrations found</p>
          <p className="text-slate-600 text-sm mt-1">
            {filterStatus === 'pending' ? 'No pending requests at this time' : 'Try adjusting your filters'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(m => {
            const branchName = branches.find(b => b.id === m.branch_id)?.name;
            return (
              <div key={m.id} className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {m.full_name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm truncate">{m.full_name}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <RoleBadge role={m.role} />
                      <StatusBadge status={m.status} />
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5 pl-1">
                  <div className="flex items-center gap-2 text-slate-400 text-xs">
                    <Mail className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{m.email}</span>
                  </div>
                  {m.phone && (
                    <div className="flex items-center gap-2 text-slate-400 text-xs">
                      <Phone className="w-3.5 h-3.5 shrink-0" />{m.phone}
                    </div>
                  )}
                  {branchName && (
                    <div className="flex items-center gap-2 text-slate-400 text-xs">
                      <GitBranch className="w-3.5 h-3.5 shrink-0" />{branchName}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-slate-400 text-xs">
                    <Calendar className="w-3.5 h-3.5 shrink-0" />
                    {m.created_at ? format(new Date(m.created_at), 'MMM d, yyyy HH:mm') : '—'}
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => setDetailModal(m)}
                    className="flex-1 border-white/10 text-slate-300 hover:text-white gap-1.5 text-xs h-8">
                    <Eye className="w-3.5 h-3.5" /> View
                  </Button>
                  {m.status === 'pending' && (
                    <>
                      <Button size="sm" onClick={() => setActionModal({ membership: m, action: 'approved' })}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs h-8">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                      </Button>
                      <Button size="sm" onClick={() => setActionModal({ membership: m, action: 'rejected' })}
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white gap-1.5 text-xs h-8">
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </Button>
                    </>
                  )}
                  {m.status === 'approved' && (
                    <Button size="sm" onClick={() => setActionModal({ membership: m, action: 'suspended' })}
                      className="flex-1 bg-orange-600 hover:bg-orange-700 text-white gap-1.5 text-xs h-8">
                      <ShieldOff className="w-3.5 h-3.5" /> Suspend
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {actionModal && (
        <ActionModal
          membership={actionModal.membership}
          action={actionModal.action}
          branches={branches}
          onConfirm={handleAction}
          onClose={() => setActionModal(null)}
          loading={actionLoading}
        />
      )}
      {detailModal && (
        <DetailModal
          membership={detailModal}
          branches={branches}
          onClose={() => setDetailModal(null)}
        />
      )}
    </div>
  );
}

// ── Request Center Tab ─────────────────────────────────────────────────────────
function RequestCenterTab() {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Create and manage secure one-time invitations for your organization staff.
      </p>
      <OwnerStaffProvisioning />
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function OwnerApprovalCenter() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('approvals');

  const tabs = [
    { id: 'approvals',       label: 'Approval Center', icon: ShieldCheck },
    { id: 'request_center',  label: 'Request Center',  icon: Link2 },
  ];

  return (
    <div className="space-y-5 pb-28 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 pt-2">
        <button onClick={() => navigate('/owner-command-center')} className="text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-violet-400" />
            <h1 className="text-xl font-black text-foreground tracking-tight">Approval Center</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 ml-7">Manage approvals and staff invitations</p>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 bg-white/5 border border-white/10 rounded-xl p-1">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-semibold transition-all ${
                activeTab === tab.id
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'approvals' && <ApprovalCenterTab />}
      {activeTab === 'request_center' && <RequestCenterTab />}
    </div>
  );
}
