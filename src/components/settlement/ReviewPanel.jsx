/**
 * ReviewPanel
 * Owner / Sponsor reviews pending settlements, approves or rejects with proof view.
 * Also allows recording Sponsor→Owner and Owner→Branch flows.
 */
import React, { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { readSponsorSettlementRows } from '@/lib/sponsorSettlementStatement';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { formatCurrency } from '@/lib/helpers';
import { createNotification } from '@/lib/notificationEngine';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format } from 'date-fns';
import {
  CheckCircle2, XCircle, ZoomIn, Loader2,
  Clock, Camera, Send, BadgeCheck
} from 'lucide-react';
import BranchSelect from '@/components/shared/BranchSelect';

const FLOW_LABEL = {
  MANAGER_TO_SPONSOR: { label: 'Branch → Sponsor', cls: 'bg-blue-100 text-blue-700' },
  SPONSOR_TO_OWNER:   { label: 'Sponsor → Owner',  cls: 'bg-violet-100 text-violet-700' },
  OWNER_TO_BRANCH:    { label: 'Owner → Branch',   cls: 'bg-emerald-100 text-emerald-700' },
};

const STATUS_BADGE = {
  pending:  { label: 'Pending',  cls: 'bg-amber-100 text-amber-700' },
  verified: { label: 'Verified', cls: 'bg-blue-100 text-blue-700' },
  approved: { label: 'Approved', cls: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'Rejected', cls: 'bg-red-100 text-red-600' },
};

export default function ReviewPanel() {
  const { user } = useAuth();
  const { currency } = useLanguage();
  const { orgId, activeRestaurantId, branches } = useTenant();
  const fmt = v => formatCurrency(v, currency);
  const qc = useQueryClient();

  const [zoomImg, setZoomImg] = useState(null);
  const [rejectDialog, setRejectDialog] = useState(null); // settlement record
  const [rejectReason, setRejectReason] = useState('');
  const [addFlowDialog, setAddFlowDialog] = useState(null); // 'SPONSOR_TO_OWNER' | 'OWNER_TO_BRANCH'
  const [flowForm, setFlowForm] = useState({ date: format(new Date(), 'yyyy-MM-dd'), amount: '', branch: '', notes: '', reference_id: '' });
  const [flowProof, setFlowProof] = useState('');
  const [uploadingProof, setUploadingProof] = useState(false);
  const [saving, setSaving] = useState(false);

  const { ownerFilter } = useTenant();

  const { data: settlements = [], isLoading, isError: settlementReadError } = useQuery({
    queryKey: ['sponsor-settlement-ledger', activeRestaurantId],
    queryFn: () => readSponsorSettlementRows(supabase, activeRestaurantId),
    staleTime: 20000,
    enabled: Boolean(activeRestaurantId),
  });

  const { data: networkAccounts = [] } = useQuery({
    queryKey: ['network_accounts', ownerFilter],
    queryFn: () => base44.entities.NetworkAccount.filter(ownerFilter, '-created_date', 500),
    staleTime: 60000,
    enabled: !!ownerFilter.created_by,
  });
  const accountMap = Object.fromEntries(networkAccounts.map(a => [a.id, a]));

  const pending = settlements.filter(s => s.flow_type === 'MANAGER_TO_SPONSOR' && s.status === 'pending');
  const pendingVerified = settlements.filter(s => s.flow_type === 'MANAGER_TO_SPONSOR' && s.status === 'verified');
  const all = settlements.slice(0, 80);

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.SettlementRecord.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sponsor-settlement-ledger', activeRestaurantId] }); qc.invalidateQueries({ queryKey: ['settlements_all'] }); },
  });

  const handleVerify = async (s) => {
    if(settlementReadError || isLoading) return;
    await updateMut.mutateAsync({
      id: s.id,
      data: { status: 'verified', verified_by: user?.email, verified_at: new Date().toISOString() },
    });
    await createNotification({
      orgId,
      type: 'info',
      severity: 'info',
      targetRole: 'owner',
      title: `🔍 Settlement Verified — ${s.branch}`,
      message: `${currency} ${Number(s.amount).toLocaleString()} settlement verified by accountant ${user?.full_name || user?.email}. Ready for owner approval.`,
      amount: s.amount,
      branch: s.branch,
      actorEmail: user?.email,
      actorName: user?.full_name,
    });
    qc.invalidateQueries({ queryKey: ['settlements_mgr'] });
  };

  const handleApprove = async (s) => {
    if(settlementReadError || isLoading) return;
    await updateMut.mutateAsync({
      id: s.id,
      data: { status: 'approved', reviewed_by: user?.email, reviewed_at: new Date().toISOString(), is_locked: true },
    });
    await createNotification({
      orgId,
      type: 'info',
      severity: 'info',
      targetRole: 'all',
      title: `✅ Settlement Approved — ${s.branch}`,
      message: `${currency} ${Number(s.amount).toLocaleString()} network settlement approved by ${user?.full_name || user?.email}`,
      amount: s.amount,
      branch: s.branch,
      actorEmail: user?.email,
      actorName: user?.full_name,
    });
    qc.invalidateQueries({ queryKey: ['settlements_mgr'] });
    qc.invalidateQueries({ queryKey: ['settlements_dashboard'] });
  };

  const handleReject = async () => {
    if (settlementReadError || isLoading || !rejectReason.trim()) return;
    await updateMut.mutateAsync({
      id: rejectDialog.id,
      data: { status: 'rejected', rejection_reason: rejectReason, reviewed_by: user?.email, reviewed_at: new Date().toISOString() },
    });
    await createNotification({
      orgId,
      type: 'info',
      severity: 'critical',
      targetRole: 'all',
      title: `❌ Settlement REJECTED — ${rejectDialog.branch}`,
      message: `Reason: ${rejectReason}`,
      branch: rejectDialog.branch,
      actorEmail: user?.email,
      actorName: user?.full_name,
    });
    setRejectDialog(null);
    setRejectReason('');
    qc.invalidateQueries({ queryKey: ['settlements_mgr'] });
    qc.invalidateQueries({ queryKey: ['settlements_dashboard'] });
  };

  const handleProofUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingProof(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setFlowProof(file_url);
    setUploadingProof(false);
  };

  const handleAddFlow = async () => {
    const amount = Number(flowForm.amount);
    const chosenBranch = branches.find(b => (b.key || b.branch_key) === flowForm.branch && b.id);
    if (saving) return;
    if (!activeRestaurantId || !chosenBranch || !flowForm.date ||
        !Number.isFinite(amount) || amount <= 0 || Math.abs(amount*100-Math.round(amount*100))>0.00001 ||
        settlementReadError) {
      toast.error('Select a valid branch, date and amount. Complete sponsor ledger must be available.');
      return;
    }
    setSaving(true);
    const record = await base44.entities.SettlementRecord.create({
      flow_type: addFlowDialog,
      restaurant_id: activeRestaurantId,
      branch_id: chosenBranch.id,
      date: flowForm.date,
      amount,
      branch: flowForm.branch,
      notes: flowForm.notes,
      reference_id: flowForm.reference_id,
      proof_url: flowProof || undefined,
      proof_uploaded_at: flowProof ? new Date().toISOString() : undefined,
      submitted_by: user?.email,
      submitted_by_name: user?.full_name || user?.email,
      status: 'approved',
      reviewed_by: user?.email,
      reviewed_at: new Date().toISOString(),
      is_locked: true,
    });

    const msgMap = {
      SPONSOR_TO_OWNER: `Sponsor transferred ${currency} ${Number(flowForm.amount).toLocaleString()} to Owner`,
      OWNER_TO_BRANCH: `Owner allocated ${currency} ${Number(flowForm.amount).toLocaleString()} to branch ${flowForm.branch}`,
    };

    await createNotification({
      orgId,
      type: 'branch_to_owner',
      severity: 'info',
      targetRole: 'all',
      title: addFlowDialog === 'SPONSOR_TO_OWNER' ? '💳 Sponsor → Owner Transfer' : `🏢 Owner → Branch Funding (${flowForm.branch})`,
      message: msgMap[addFlowDialog],
      amount: parseFloat(flowForm.amount),
      branch: flowForm.branch,
      actorEmail: user?.email,
      actorName: user?.full_name,
      restaurantId: activeRestaurantId,
      metadata: { settlement_id: record.id },
    });

    qc.invalidateQueries({ queryKey: ['sponsor-settlement-ledger', activeRestaurantId] });
    qc.invalidateQueries({ queryKey: ['settlements_all'] });
    qc.invalidateQueries({ queryKey: ['settlements_dashboard'] });
    setSaving(false);
    setAddFlowDialog(null);
    setFlowForm({ date: format(new Date(), 'yyyy-MM-dd'), amount: '', branch: '', notes: '', reference_id: '' });
    setFlowProof('');
  };

  return (
    <div className="min-w-0 space-y-4">
      {settlementReadError && <Card role="alert" className="border-rose-300 p-3 text-sm text-rose-700">Complete sponsor settlement history could not be loaded. Approval and transfers are disabled until it is restored.</Card>}
      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant="outline" className="text-violet-700 border-violet-300" onClick={() => setAddFlowDialog('SPONSOR_TO_OWNER')} disabled={settlementReadError || isLoading}>
          + Sponsor → Owner Transfer
        </Button>
        <Button size="sm" variant="outline" className="text-emerald-700 border-emerald-300" onClick={() => setAddFlowDialog('OWNER_TO_BRANCH')} disabled={settlementReadError || isLoading}>
          + Owner → Branch Funding
        </Button>
      </div>

      {/* Pending approvals */}
      {pending.length > 0 && (
        <div>
          <p className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            Pending Approval ({pending.length})
          </p>
          <div className="space-y-2">
            {pending.map(s => (
              <Card key={s.id} className="p-3 border-amber-300 bg-amber-50/30">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold">{fmt(s.amount)}</span>
                      {s.branch && <Badge variant="outline" className="text-xs">{s.branch}</Badge>}
                      <span className="text-xs text-muted-foreground">{s.date}</span>
                    </div>
                    {s.submitted_by_name && <p className="text-xs text-muted-foreground">By: {s.submitted_by_name}</p>}
                    {s.network_account_id && accountMap[s.network_account_id] && (
                      <p className="text-xs text-blue-600 font-medium">📱 {accountMap[s.network_account_id].account_name}</p>
                    )}
                    {s.notes && <p className="text-xs text-muted-foreground">{s.notes}</p>}
                    {s.reference_id && <p className="text-xs text-muted-foreground font-mono">Ref: {s.reference_id}</p>}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {s.proof_url && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setZoomImg(s.proof_url)}>
                        <ZoomIn className="w-3 h-3 mr-1" /> Proof
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-7 text-xs text-blue-700 border-blue-300" onClick={() => handleVerify(s)} disabled={updateMut.isPending}>
                      <BadgeCheck className="w-3 h-3 mr-1" /> Verify
                    </Button>
                    <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={() => handleApprove(s)} disabled={updateMut.isPending}>
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-300" onClick={() => setRejectDialog(s)}>
                      <XCircle className="w-3 h-3 mr-1" /> Reject
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Verified (awaiting owner approval) */}
      {pendingVerified.length > 0 && (
        <div>
          <p className="text-sm font-semibold mb-2 flex items-center gap-2">
            <BadgeCheck className="w-4 h-4 text-blue-500" />
            Verified — Awaiting Owner Approval ({pendingVerified.length})
          </p>
          <div className="space-y-2">
            {pendingVerified.map(s => (
              <Card key={s.id} className="p-3 border-blue-300 bg-blue-50/30">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold">{fmt(s.amount)}</span>
                      {s.branch && <Badge variant="outline" className="text-xs">{s.branch}</Badge>}
                      <Badge className="text-xs border-0 bg-blue-100 text-blue-700"><BadgeCheck className="w-3 h-3 mr-0.5" />Verified by {s.verified_by}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.date} · {s.submitted_by_name}</p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {s.proof_url && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setZoomImg(s.proof_url)}>
                        <ZoomIn className="w-3 h-3 mr-1" /> Proof
                      </Button>
                    )}
                    <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={() => handleApprove(s)} disabled={updateMut.isPending}>
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-300" onClick={() => setRejectDialog(s)}>
                      <XCircle className="w-3 h-3 mr-1" /> Reject
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* All records */}
      <div>
        <p className="text-sm font-semibold mb-2">All Settlement Records</p>
        {isLoading ? (
          <p className="text-xs text-center text-muted-foreground py-6">Loading...</p>
        ) : (
          <div className="space-y-1.5">
            {all.map(s => {
              const flowMeta = FLOW_LABEL[s.flow_type] || { label: s.flow_type, cls: 'bg-muted text-muted-foreground' };
              return (
                <Card key={s.id} className={`p-3 ${s.status === 'rejected' ? 'border-red-200' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={`text-xs border-0 ${flowMeta.cls}`}>{flowMeta.label}</Badge>
                        <span className="text-sm font-bold">{fmt(s.amount)}</span>
                        {s.branch && <span className="text-xs text-muted-foreground">{s.branch}</span>}
                        <span className="text-xs text-muted-foreground">{s.date}</span>
                        {(() => {
                          const sb = STATUS_BADGE[s.status] || STATUS_BADGE.pending;
                          return <Badge className={`text-xs border-0 ${sb.cls}`}>{sb.label}</Badge>;
                        })()}
                      </div>
                      {s.rejection_reason && <p className="text-xs text-red-500 mt-0.5">{s.rejection_reason}</p>}
                    </div>
                    {s.proof_url && (
                      <button onClick={() => setZoomImg(s.proof_url)} className="shrink-0 p-1 border rounded hover:bg-muted">
                        <ZoomIn className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Proof zoom */}
      <Dialog open={!!zoomImg} onOpenChange={() => setZoomImg(null)}>
        <DialogContent className="max-w-sm p-2">
          <img src={zoomImg} alt="Proof" className="w-full rounded-lg" />
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejectDialog} onOpenChange={() => { setRejectDialog(null); setRejectReason(''); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Reject Settlement</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {rejectDialog?.branch} — {fmt(rejectDialog?.amount)}
            </p>
            <div>
              <Label className="text-xs">Rejection Reason *</Label>
              <Input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="e.g. Wrong amount, unclear proof..." />
            </div>
            <div className="flex gap-2">
              <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={handleReject} disabled={!rejectReason.trim() || updateMut.isPending}>
                {updateMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Reject'}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setRejectDialog(null)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add flow dialog */}
      <Dialog open={!!addFlowDialog} onOpenChange={v => { if (!v) { setAddFlowDialog(null); setFlowProof(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {addFlowDialog === 'SPONSOR_TO_OWNER' ? 'Sponsor → Owner Transfer' : 'Owner → Branch Funding'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Date *</Label><Input type="date" value={flowForm.date} onChange={e => setFlowForm(f => ({ ...f, date: e.target.value }))} /></div>
              <div><Label className="text-xs">Amount *</Label><Input type="number" value={flowForm.amount} onChange={e => setFlowForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" /></div>
            </div>
            {/* Branch selector: required for OWNER_TO_BRANCH, optional but important for SPONSOR_TO_OWNER */}
            {(addFlowDialog === 'OWNER_TO_BRANCH' || addFlowDialog === 'SPONSOR_TO_OWNER') && (
              <div>
                <Label className="text-xs">
                  Branch {addFlowDialog === 'OWNER_TO_BRANCH' ? '*' : '(which branch is this settling?)'} 
                </Label>
                <BranchSelect value={flowForm.branch} onChange={v => setFlowForm(f => ({ ...f, branch: v }))} />
                {addFlowDialog === 'SPONSOR_TO_OWNER' && (
                  <p className="text-xs text-muted-foreground mt-1">
                    ⚠️ Select the branch whose money this transfer represents — required for accurate Sponsor Ledger tracking
                  </p>
                )}
              </div>
            )}
            <div><Label className="text-xs">Reference</Label><Input value={flowForm.reference_id} onChange={e => setFlowForm(f => ({ ...f, reference_id: e.target.value }))} placeholder="Bank ref..." /></div>

            {/* Proof */}
            <div>
              <Label className="text-xs mb-1 block">Proof Image (optional)</Label>
              <label className={`flex items-center gap-2 cursor-pointer border-2 border-dashed rounded-lg p-2.5 transition-colors ${flowProof ? 'border-emerald-400 bg-emerald-50' : 'border-border hover:border-primary'}`}>
                {uploadingProof ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4 text-muted-foreground" />}
                <span className="text-xs text-muted-foreground">{uploadingProof ? 'Uploading...' : flowProof ? '✓ Attached' : 'Photo / file'}</span>
                <input type="file" accept="image/*,.pdf" capture="environment" className="hidden" onChange={handleProofUpload} disabled={uploadingProof} />
              </label>
            </div>
            <div><Label className="text-xs">Notes</Label><Input value={flowForm.notes} onChange={e => setFlowForm(f => ({ ...f, notes: e.target.value }))} /></div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={handleAddFlow} disabled={saving || !flowForm.amount}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 mr-1" />} Record
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setAddFlowDialog(null)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}