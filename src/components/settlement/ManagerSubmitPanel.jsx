/**
 * ManagerSubmitPanel
 * Branch Manager submits nightly network sales to sponsor with proof image.
 */
import React, { useState, useRef } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
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
import { format } from 'date-fns';
import {
  Camera, Upload, CheckCircle2, Clock, XCircle, Eye,
  Loader2, Send, AlertTriangle, ZoomIn, Sparkles
} from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import BranchSelect from '@/components/shared/BranchSelect';
import NetworkAccountSelect from '@/components/network/NetworkAccountSelect';
import { useOcrExtract } from '@/hooks/useOcrExtract';

const STATUS_CFG = {
  pending:  { label: 'Pending Review', cls: 'bg-amber-100 text-amber-700',  icon: Clock },
  verified: { label: 'Verified',       cls: 'bg-blue-100 text-blue-700',    icon: Eye },
  approved: { label: 'Approved',       cls: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  rejected: { label: 'Rejected',       cls: 'bg-red-100 text-red-600',      icon: XCircle },
};

export default function ManagerSubmitPanel() {
  const { user } = useAuth();
  const { currency } = useLanguage();
  const { orgId, activeRestaurantId, branches } = useTenant();
  const fmt = v => formatCurrency(v, currency);
  const qc = useQueryClient();

  const [form, setForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    amount: '',
    branch: '',
    notes: '',
    reference_id: '',
    network_account_id: '',
  });
  const [proofUrl, setProofUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [zoomImg, setZoomImg] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [ocrVendor, setOcrVendor] = useState('');
  const proofRef = useRef();
  const { extractFromFile, ocrLoading } = useOcrExtract();

  const { ownerFilter } = useTenant();

  const { data: allSponsorRows = [], isLoading, isError: settlementReadError } = useQuery({
    queryKey: ['sponsor-settlement-ledger', activeRestaurantId],
    queryFn: () => readSponsorSettlementRows(supabase, activeRestaurantId),
    staleTime: 30000,
    enabled: Boolean(activeRestaurantId),
  });

  const settlements = allSponsorRows.filter(s => s.flow_type === 'MANAGER_TO_SPONSOR');

  const { data: networkAccounts = [] } = useQuery({
    queryKey: ['network_accounts', ownerFilter],
    queryFn: () => base44.entities.NetworkAccount.filter(ownerFilter, '-created_date', 500),
    staleTime: 60000,
    enabled: !!ownerFilter.created_by,
  });
  const accountMap = Object.fromEntries(networkAccounts.map(a => [a.id, a]));

  const handleProofUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url, ocr } = await extractFromFile(file);
    setProofUrl(file_url);
    if (ocr?.total_amount) setForm(f => ({ ...f, amount: String(ocr.total_amount) }));
    if (ocr?.date) setForm(f => ({ ...f, date: ocr.date }));
    if (ocr?.vendor) setOcrVendor(ocr.vendor);
    setUploading(false);
  };

  const handleSubmit = async () => {
    const amount = Number(form.amount);
    const chosenBranch = branches.find(b => (b.key || b.branch_key) === form.branch && b.id);
    if (!activeRestaurantId || !chosenBranch || !Number.isFinite(amount) || amount <= 0 || !Number.isInteger(Math.round(amount * 100)) || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001 || settlementReadError) {
      toast.error('Select a valid business, branch and amount. Complete settlement history must be loaded.');
      return;
    }
    if (!form.amount || !form.date || !form.branch) {
      alert('Date, branch and amount are required.');
      return;
    }
    if (!proofUrl) {
      alert('Please attach a transfer proof image before submitting.');
      return;
    }
    setSubmitting(true);
    try {

    const accName = form.network_account_id && accountMap[form.network_account_id]
      ? accountMap[form.network_account_id].account_name
      : '';

    const record = await base44.entities.SettlementRecord.create({
      flow_type: 'MANAGER_TO_SPONSOR',
      restaurant_id: activeRestaurantId,
      branch_id: chosenBranch.id,
      date: form.date,
      amount,
      branch: form.branch,
      notes: form.notes,
      reference_id: form.reference_id,
      network_account_id: form.network_account_id || undefined,
      proof_url: proofUrl,
      proof_uploaded_at: new Date().toISOString(),
      submitted_by: user?.email,
      submitted_by_name: user?.full_name || user?.email,
      ocr_vendor: ocrVendor || undefined,
      status: 'pending',
    });

    try { await createNotification({
      orgId,
      restaurantId: activeRestaurantId,
      type: 'branch_to_owner',
      severity: 'info',
      targetRole: 'all',
      title: `🏦 Network Settlement — ${form.branch}`,
      message: `${form.branch}${accName ? ` — ${accName}` : ''} submitted ${currency} ${Number(form.amount).toLocaleString()} network transfer. Proof attached. Awaiting approval.`,
      amount: parseFloat(form.amount),
      branch: form.branch,
      actorEmail: user?.email,
      actorName: user?.full_name || user?.email,
      metadata: { settlement_id: record.id, proof_url: proofUrl },
    }); } catch (notificationError) { console.warn('Sponsor submission notification unavailable:', notificationError); }

    qc.invalidateQueries({ queryKey: ['sponsor-settlement-ledger', activeRestaurantId] });
    qc.invalidateQueries({ queryKey: ['settlements_mgr'] });
    qc.invalidateQueries({ queryKey: ['settlements_all'] });
    setForm({ date: format(new Date(), 'yyyy-MM-dd'), amount: '', branch: '', notes: '', reference_id: '', network_account_id: '' });
    setProofUrl('');
    setOcrVendor('');
    } catch (error) {
      toast.error(error?.message || 'Unable to submit sponsor settlement.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-w-0 space-y-4">
      {settlementReadError && <Card role="alert" className="border-rose-300 p-3 text-sm text-rose-700">Complete sponsor settlement history could not be loaded. Do not interpret missing entries as zero.</Card>}
      {/* Submit form */}
      <Card className="p-4 border-blue-200 bg-blue-50/30">
        <p className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Send className="w-4 h-4 text-blue-500" />
          Submit Nightly Network Settlement
        </p>
        <div className="space-y-3">
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <Label className="text-xs">Date *</Label>
              <Input className="w-full min-w-0 max-w-full text-base [min-inline-size:0]" dir="ltr" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="min-w-0">
              <Label className="text-xs">Network Amount *</Label>
              <Input className="w-full min-w-0 max-w-full text-base [min-inline-size:0]" dir="ltr" type="number" inputMode="decimal" step="0.01" min="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
            </div>
          </div>

          <div>
            <Label className="text-xs">Branch *</Label>
            <BranchSelect value={form.branch} onChange={v => setForm(f => ({ ...f, branch: v, network_account_id: '' }))} />
          </div>

          <div>
            <Label className="text-xs">Network Account / Device</Label>
            <NetworkAccountSelect
              branch={form.branch}
              value={form.network_account_id}
              onChange={v => setForm(f => ({ ...f, network_account_id: v }))}
              placeholder="Select which device settled..."
            />
          </div>

          <div>
            <Label className="text-xs">Bank Reference (optional)</Label>
            <Input value={form.reference_id} onChange={e => setForm(f => ({ ...f, reference_id: e.target.value }))} placeholder="e.g. TXN-123456" />
          </div>

          {/* Proof upload */}
          <div>
            <Label className="text-xs mb-1 block">Transfer Proof Image * <span className="text-red-500">(Required)</span></Label>
            <div className="flex gap-2">
              <label className={`flex-1 flex items-center gap-2 cursor-pointer border-2 border-dashed rounded-lg p-3 transition-colors ${proofUrl ? 'border-emerald-400 bg-emerald-50' : 'border-border hover:border-primary'}`}>
                {uploading ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : <Camera className="w-4 h-4 text-muted-foreground" />}
                <span className="text-xs text-muted-foreground">
                  {uploading || ocrLoading ? 'Uploading & scanning...' : proofUrl ? '✓ Proof attached' : 'Photo or file (required)'}
                </span>
                {(uploading || ocrLoading) && <span className="text-xs text-violet-600 flex items-center gap-1 ml-auto"><Sparkles className="w-3 h-3" />OCR</span>}
                <input ref={proofRef} type="file" accept="image/*,.pdf" capture="environment" className="hidden" onChange={handleProofUpload} disabled={uploading} />
              </label>
              {proofUrl && (
                <button onClick={() => setZoomImg(proofUrl)} className="flex items-center gap-1 border rounded-lg px-2 text-xs text-primary hover:bg-muted">
                  <ZoomIn className="w-3.5 h-3.5" /> View
                </button>
              )}
            </div>
            {!proofUrl && <p className="text-xs text-red-500 mt-1">⚠️ Proof image is required before submitting</p>}
            {proofUrl && (ocrVendor || form.amount) && (
              <div className="mt-2 p-2 rounded-lg bg-violet-50 border border-violet-200 flex items-start gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-violet-500 shrink-0 mt-0.5" />
                <div className="text-xs text-violet-700">
                  <span className="font-semibold">OCR auto-filled:</span>{' '}
                  {ocrVendor && <span>Vendor: <b>{ocrVendor}</b>{form.amount ? ', ' : ''}</span>}
                  {form.amount && <span>Amount: <b>{form.amount}</b></span>}
                  <span className="text-violet-500 ml-1">— verify before submitting</span>
                </div>
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs">Notes</Label>
            <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes..." />
          </div>

          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={submitting || !form.amount || !form.branch || !proofUrl}
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
            Submit to Sponsor
          </Button>
        </div>
      </Card>

      {/* My submissions */}
      <div>
        <p className="text-sm font-semibold mb-2">My Submissions</p>
        {isLoading ? (
          <p className="text-xs text-center text-muted-foreground py-6">Loading...</p>
        ) : settlements.length === 0 ? (
          <Card className="p-6 text-center border-dashed">
            <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-40" />
            <p className="text-sm text-muted-foreground">No submissions yet</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {settlements.map(s => {
              const cfg = STATUS_CFG[s.status] || STATUS_CFG.pending;
              const Icon = cfg.icon;
              const acc = s.network_account_id ? accountMap[s.network_account_id] : null;
              return (
                <Card key={s.id} className={`p-3 ${s.status === 'rejected' ? 'border-red-300' : s.status === 'approved' ? 'border-emerald-300' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold">{fmt(s.amount)}</span>
                        <Badge className={`text-xs border-0 ${cfg.cls} flex items-center gap-1`}>
                          <Icon className="w-3 h-3" />{cfg.label}
                        </Badge>
                        {s.branch && <Badge variant="outline" className="text-xs">{s.branch}</Badge>}
                      </div>
                      {acc && <p className="text-xs text-blue-600 font-medium mt-0.5">📱 {acc.account_name}</p>}
                      <p className="text-xs text-muted-foreground mt-0.5">{s.date}</p>
                      {s.rejection_reason && (
                        <div className="flex items-center gap-1 mt-1">
                          <AlertTriangle className="w-3 h-3 text-red-500" />
                          <p className="text-xs text-red-500">{s.rejection_reason}</p>
                        </div>
                      )}
                      {s.notes && <p className="text-xs text-muted-foreground mt-0.5">{s.notes}</p>}
                    </div>
                    {s.proof_url && (
                      <button onClick={() => setZoomImg(s.proof_url)} className="shrink-0 border rounded p-1 hover:bg-muted">
                        <ZoomIn className="w-4 h-4 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Zoom dialog */}
      <Dialog open={!!zoomImg} onOpenChange={() => setZoomImg(null)}>
        <DialogContent className="max-w-sm p-2">
          <img src={zoomImg} alt="Proof" className="w-full rounded-lg" />
        </DialogContent>
      </Dialog>
    </div>
  );
}