/**
 * SettlementAuditLog
 * Immutable audit trail of all settlement events.
 */
import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { readSponsorSettlementRows } from '@/lib/sponsorSettlementStatement';
import { useLanguage } from '@/lib/LanguageContext';
import { formatCurrency } from '@/lib/helpers';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  CheckCircle2, XCircle, Clock, Lock, ZoomIn, ShieldCheck, Send
} from 'lucide-react';
import { useTenant } from '@/lib/TenantContext';

const EVENT_ICON = {
  pending:  <Clock className="w-3.5 h-3.5 text-amber-500" />,
  approved: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />,
  rejected: <XCircle className="w-3.5 h-3.5 text-red-500" />,
  locked:   <Lock className="w-3.5 h-3.5 text-blue-500" />,
  submitted: <Send className="w-3.5 h-3.5 text-blue-500" />,
};

const FLOW_LABEL = {
  MANAGER_TO_SPONSOR: 'Branch → Sponsor',
  SPONSOR_TO_OWNER:   'Sponsor → Owner',
  OWNER_TO_BRANCH:    'Owner → Branch',
};

const FLOW_COLOR = {
  MANAGER_TO_SPONSOR: 'bg-blue-100 text-blue-700',
  SPONSOR_TO_OWNER:   'bg-violet-100 text-violet-700',
  OWNER_TO_BRANCH:    'bg-emerald-100 text-emerald-700',
};

export default function SettlementAuditLog() {
  const { currency } = useLanguage();
  const { activeRestaurantId } = useTenant();
  const fmt = v => formatCurrency(v, currency);
  const [search, setSearch] = useState('');
  const [zoomImg, setZoomImg] = useState(null);

  const { data: settlements = [], isLoading, isError } = useQuery({
    queryKey: ['sponsor-settlement-ledger', activeRestaurantId],
    queryFn: () => readSponsorSettlementRows(supabase, activeRestaurantId),
    staleTime: 30000,
    enabled: Boolean(activeRestaurantId),
  });

  const stats = useMemo(() => ({
    total: settlements.length,
    approved: settlements.filter(s => s.status === 'approved').length,
    pending: settlements.filter(s => s.status === 'pending').length,
    rejected: settlements.filter(s => s.status === 'rejected').length,
    withProof: settlements.filter(s => s.proof_url).length,
  }), [settlements]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return settlements.filter(s =>
      !q ||
      s.branch?.toLowerCase().includes(q) ||
      s.submitted_by_name?.toLowerCase().includes(q) ||
      s.submitted_by?.toLowerCase().includes(q) ||
      s.reviewed_by?.toLowerCase().includes(q) ||
      s.reference_id?.toLowerCase().includes(q) ||
      FLOW_LABEL[s.flow_type]?.toLowerCase().includes(q)
    );
  }, [settlements, search]);

  if (isError) return <div role="alert" className="rounded-xl border border-rose-300 p-4 text-sm text-rose-700">Complete sponsor audit history could not be loaded. No partial report is shown.</div>;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        <Card className="p-2.5 text-center">
          <p className="text-base font-bold">{stats.total}</p>
          <p className="text-xs text-muted-foreground">Total</p>
        </Card>
        <Card className="p-2.5 text-center">
          <p className="text-base font-bold text-emerald-600">{stats.approved}</p>
          <p className="text-xs text-muted-foreground">Approved</p>
        </Card>
        <Card className="p-2.5 text-center">
          <p className="text-base font-bold text-amber-500">{stats.pending}</p>
          <p className="text-xs text-muted-foreground">Pending</p>
        </Card>
        <Card className="p-2.5 text-center">
          <p className="text-base font-bold text-red-500">{stats.rejected}</p>
          <p className="text-xs text-muted-foreground">Rejected</p>
        </Card>
      </div>

      {/* Anti-fraud notice */}
      <Card className="p-3 bg-blue-50 border-blue-200 flex items-start gap-2">
        <ShieldCheck className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
        <div>
          <p className="text-xs font-semibold text-blue-700">Anti-Fraud Protection Active</p>
          <p className="text-xs text-blue-600">Approved records are locked and cannot be altered. All uploads include submitter identity and timestamps.</p>
        </div>
      </Card>

      <Input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search by branch, user, reference..."
        className="h-8 text-xs"
      />

      {isLoading ? (
        <p className="text-xs text-center text-muted-foreground py-6">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-center text-muted-foreground py-8">No records found</p>
      ) : (
        <div className="space-y-1.5">
          {filtered.map(s => (
            <div key={s.id} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
              <div className="mt-0.5 shrink-0">
                {s.is_locked ? EVENT_ICON.locked : EVENT_ICON[s.status] || EVENT_ICON.pending}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={`text-xs border-0 ${FLOW_COLOR[s.flow_type] || 'bg-muted text-muted-foreground'}`}>
                    {FLOW_LABEL[s.flow_type] || s.flow_type}
                  </Badge>
                  <span className="text-xs font-bold">{fmt(s.amount)}</span>
                  {s.branch && <span className="text-xs text-muted-foreground">{s.branch}</span>}
                  {s.is_locked && <Lock className="w-3 h-3 text-blue-500" />}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-2">
                  <span>{s.date}</span>
                  {s.submitted_by_name && <span>By: {s.submitted_by_name}</span>}
                  {s.reviewed_by && <span>Reviewed by: {s.reviewed_by}</span>}
                  {s.reference_id && <span className="font-mono">Ref: {s.reference_id}</span>}
                </div>
                {s.rejection_reason && (
                  <p className="text-xs text-red-500 mt-0.5">Rejected: {s.rejection_reason}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {s.proof_url && (
                  <button
                    onClick={() => setZoomImg(s.proof_url)}
                    className="p-1 border rounded hover:bg-muted"
                    title="View proof"
                  >
                    <ZoomIn className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                )}
                <span className="text-xs text-muted-foreground tabular-nums">
                  {s.created_date?.slice(0, 10) || ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!zoomImg} onOpenChange={() => setZoomImg(null)}>
        <DialogContent className="max-w-sm p-2">
          <img src={zoomImg} alt="Proof" className="w-full rounded-lg" />
        </DialogContent>
      </Dialog>
    </div>
  );
}