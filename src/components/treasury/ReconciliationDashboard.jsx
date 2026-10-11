/**
 * ReconciliationDashboard
 * - Original: matches DailySales vs auto-generated WalletTransaction deposits
 * - NEW: also compares DailySales network totals vs SponsorTransaction NETWORK_TO_SPONSOR entries
 *   and lets the owner create SPONSOR_FEE_OR_ADJUSTMENT entries inline to balance the ledger.
 */
import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { formatCurrency, formatDate } from '@/lib/helpers';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AlertTriangle, CheckCircle2, Clock, DollarSign, XCircle, PlusCircle, Scale } from 'lucide-react';
import { useTenant } from '@/lib/TenantContext';
import { subDays, format } from 'date-fns';
import {reconcileSalesToTreasury,reconcileExplicitSponsorFlows} from '@/lib/treasuryReconciliation';

export default function ReconciliationDashboard({ transactions, sales, branches, currency }) {
  const { user } = useAuth();
  const fmt = v => formatCurrency(v, currency);
  const qc = useQueryClient();

  const [selectedBranch, setSelectedBranch] = useState('all');
  const [lookbackDays, setLookbackDays] = useState(30);
  const [innerTab, setInnerTab] = useState('wallet');
  const [adjDialog, setAdjDialog] = useState(null); // { date, branch, diff, salesId }
  const [adjForm, setAdjForm] = useState({ amount: '', fee_reason: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const cutoff = format(subDays(new Date(), lookbackDays), 'yyyy-MM-dd');
  const today = format(new Date(), 'yyyy-MM-dd');

  // ── Fetch SponsorTransactions ────────────────────────────────────────────
  // Note: transactions and sales are passed as props (already tenant-filtered by Treasury parent)
  const { ownerFilter } = useTenant();
  const { data: sponsorTxs = [] } = useQuery({
    queryKey: ['sponsor_transactions_recon', ownerFilter],
    queryFn: () => base44.entities.SponsorTransaction.filter({ ...ownerFilter, type: 'NETWORK_TO_SPONSOR' }, '-date', 500),
    staleTime: 30000,
    enabled: !!ownerFilter?.created_by,
  });

  const adjMut = useMutation({
    mutationFn: d => base44.entities.SponsorTransaction.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sponsor_transactions_recon'] }); setAdjDialog(null); setSaving(false); },
  });

  // Compare canonical finalized Closings to ledger postings, never to bank deposits.
  const walletRecon=useMemo(()=>reconcileSalesToTreasury({
    sales,transactions,from:cutoff,to:today,branch:selectedBranch,
  }),[sales,transactions,cutoff,today,selectedBranch]);
  // The Owner's network sales do not automatically belong to the sponsor.
  const sponsorRecon=useMemo(()=>reconcileExplicitSponsorFlows({
    sales,sponsorTransactions:sponsorTxs,from:cutoff,to:today,branch:selectedBranch,
  }),[sales,sponsorTxs,cutoff,today,selectedBranch]);

  const walletSummary = useMemo(() => {
    const byStatus = (s) => walletRecon.filter(r => r.status === s);
    return {
      matched: byStatus('matched').length,
      matchedAmt: byStatus('matched').reduce((s, r) => s + r.expected, 0),
      discrepancy: byStatus('discrepancy').length,
      discrepancyAmt: byStatus('discrepancy').reduce((s, r) => s + Math.abs(r.diff), 0),
      undeposited: byStatus('undeposited').length,
      undepositedAmt: byStatus('undeposited').reduce((s, r) => s + r.expected, 0),
      unaccounted: byStatus('unaccounted').length,
      unaccountedAmt: byStatus('unaccounted').reduce((s, r) => s + r.deposited, 0),
    };
  }, [walletRecon]);

  const sponsorSummary = useMemo(() => ({
    matched: sponsorRecon.filter(r => r.status === 'matched').length,
    discrepancy: sponsorRecon.filter(r => r.status === 'discrepancy').length,
    discrepancyAmt: sponsorRecon.filter(r => r.status === 'discrepancy').reduce((s, r) => s + Math.abs(r.diff), 0),
    unrecorded: sponsorRecon.filter(r => r.status === 'unrecorded').length,
    unrecordedAmt: sponsorRecon.filter(r => r.status === 'unrecorded').reduce((s, r) => s + r.saleNetwork, 0),
  }), [sponsorRecon]);

  const statusConfig = {
    matched:     { label: 'Matched',       icon: CheckCircle2, cls: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
    discrepancy: { label: 'Discrepancy',   icon: AlertTriangle, cls: 'text-amber-600',  bg: 'bg-amber-50 border-amber-200' },
    undeposited: { label: 'Missing ledger posting',   icon: Clock,         cls: 'text-red-500',    bg: 'bg-red-50 border-red-200' },
    unaccounted: { label: 'Orphan ledger posting',   icon: XCircle,       cls: 'text-violet-600', bg: 'bg-violet-50 border-violet-200' },
    unrecorded:  { label: 'Not in Sponsor',icon: AlertTriangle, cls: 'text-orange-600', bg: 'bg-orange-50 border-orange-200' },
  };

  const openAdj = (row) => {
    setAdjDialog(row);
    setAdjForm({ amount: String(Math.abs(row.diff)), fee_reason: '', notes: '' });
  };

  const saveAdj = async () => {
    if (!adjForm.amount || !adjForm.fee_reason) return;
    setSaving(true);
    adjMut.mutate({
      type: 'SPONSOR_FEE_OR_ADJUSTMENT',
      date: adjDialog.date,
      amount: parseFloat(adjForm.amount),
      branch: adjDialog.branch,
      fee_reason: adjForm.fee_reason,
      description: adjForm.notes || `Adjustment for ${adjDialog.date} (diff: ${fmt(adjDialog.diff)})`,
      recorded_by: user?.email,
      status: 'pending',
    });
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-2">
        <Select value={String(lookbackDays)} onValueChange={v => setLookbackDays(Number(v))}>
          <SelectTrigger className="flex-1 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="60">Last 60 days</SelectItem>
          </SelectContent>
        </Select>
        <Select value={selectedBranch} onValueChange={setSelectedBranch}>
          <SelectTrigger className="flex-1 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            {branches.map(b => <SelectItem key={b.key} value={b.key}>{b.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Tabs value={innerTab} onValueChange={setInnerTab}>
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="wallet" className="text-xs">Wallet vs Sales</TabsTrigger>
          <TabsTrigger value="sponsor" className="text-xs flex items-center gap-1">
            <Scale className="w-3 h-3" />Sales vs Sponsor
          </TabsTrigger>
        </TabsList>

        {/* ── TAB 1: Wallet reconciliation ─────────────────────────────── */}
        <TabsContent value="wallet" className="mt-3 space-y-3">
          <p className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">This checks Closing amounts against Treasury ledger postings, not bank deposits or payment-provider settlement. Duplicate postings are flagged as discrepancies.</p>
          <div className="grid grid-cols-2 gap-2">
            {['matched','discrepancy','undeposited','unaccounted'].map(key => {
              const cfg = statusConfig[key];
              const Icon = cfg.icon;
              return (
                <Card key={key} className={`p-3 border ${cfg.bg}`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon className={`w-3.5 h-3.5 ${cfg.cls}`} />
                    <p className={`text-xs font-semibold ${cfg.cls}`}>{cfg.label}</p>
                  </div>
                  <p className={`text-lg font-bold ${cfg.cls}`}>{walletSummary[key]}</p>
                  <p className="text-xs text-muted-foreground">{fmt(walletSummary[`${key}Amt`] || 0)}</p>
                </Card>
              );
            })}
          </div>

          {['discrepancy','undeposited','unaccounted','matched'].map(statusKey => {
            const rows = walletRecon.filter(r => r.status === statusKey);
            if (!rows.length) return null;
            const cfg = statusConfig[statusKey];
            const Icon = cfg.icon;
            return (
              <Card key={statusKey} className="p-3">
                <p className={`text-xs font-semibold mb-2 flex items-center gap-1.5 ${cfg.cls}`}>
                  <Icon className="w-3.5 h-3.5" /> {cfg.label} ({rows.length})
                </p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {rows.map((row, i) => (
                    <div key={i} className={`rounded-lg p-2 flex items-center justify-between text-xs border ${cfg.bg}`}>
                      <div>
                        <p className="font-medium">{row.date} · {row.branch}</p>
                        <p className="text-muted-foreground">{row.type}</p>
                      </div>
                      <div className="text-right">
                        <p>Expected: <span className="font-semibold">{fmt(row.expected)}</span></p>
                        {statusKey !== 'matched' && row.diff !== 0 && (
                          <p className={`font-bold ${row.diff > 0 ? 'text-red-500' : 'text-violet-600'}`}>
                            {row.diff > 0 ? `Missing: ${fmt(row.diff)}` : `Extra: ${fmt(-row.diff)}`}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}

          {walletRecon.length === 0 && (
            <Card className="p-8 text-center">
              <DollarSign className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-30" />
              <p className="text-sm text-muted-foreground">No transactions to reconcile in this period</p>
            </Card>
          )}
        </TabsContent>

        {/* ── TAB 2: Sales vs NETWORK_TO_SPONSOR ───────────────────────── */}
        <TabsContent value="sponsor" className="mt-3 space-y-3">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-2">
            <Card className="p-2.5 bg-emerald-50 border-emerald-200">
              <p className="text-xs font-semibold text-emerald-600">Matched</p>
              <p className="text-xl font-bold text-emerald-700">{sponsorSummary.matched}</p>
            </Card>
            <Card className="p-2.5 bg-amber-50 border-amber-200">
              <p className="text-xs font-semibold text-amber-600">Discrepancy</p>
              <p className="text-xl font-bold text-amber-600">{sponsorSummary.discrepancy}</p>
              <p className="text-xs text-muted-foreground">{fmt(sponsorSummary.discrepancyAmt)}</p>
            </Card>
            <Card className="p-2.5 bg-orange-50 border-orange-200">
              <p className="text-xs font-semibold text-orange-600">Unrecorded</p>
              <p className="text-xl font-bold text-orange-600">{sponsorSummary.unrecorded}</p>
              <p className="text-xs text-muted-foreground">{fmt(sponsorSummary.unrecordedAmt)}</p>
            </Card>
          </div>

          <Card className="p-3 bg-blue-50 border-blue-200">
            <p className="text-xs text-blue-700">
              <span className="font-semibold">How it works:</span> Only days with actual recorded sponsor transfers are compared against <code className="bg-blue-100 px-1 rounded">NETWORK_TO_SPONSOR</code> entries. Do not create an adjustment without evidence; authorized adjustments can be recorded using a <code className="bg-blue-100 px-1 rounded">SPONSOR_FEE_OR_ADJUSTMENT</code> entry inline.
            </p>
          </Card>

          {/* Discrepancy rows first */}
          {['discrepancy','unrecorded','matched'].map(statusKey => {
            const rows = sponsorRecon.filter(r => r.status === statusKey);
            if (!rows.length) return null;
            const cfg = statusConfig[statusKey] || statusConfig.discrepancy;
            const Icon = cfg.icon;
            return (
              <Card key={statusKey} className="p-3">
                <p className={`text-xs font-semibold mb-2 flex items-center gap-1.5 ${cfg.cls}`}>
                  <Icon className="w-3.5 h-3.5" /> {cfg.label} ({rows.length})
                </p>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {rows.map((row, i) => (
                    <div key={i} className={`rounded-lg p-2.5 border ${cfg.bg}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs">
                          <p className="font-semibold">{row.date} · <span className="text-muted-foreground">{row.branch}</span></p>
                          <p className="text-muted-foreground mt-0.5">
                            Sales Network: <span className="font-medium text-foreground">{fmt(row.saleNetwork)}</span>
                            {' · '}
                            Sponsor Recorded: <span className="font-medium text-foreground">{fmt(row.sponsorRecorded)}</span>
                          </p>
                          {row.diff !== 0 && (
                            <p className={`font-bold mt-0.5 ${row.diff > 0 ? 'text-red-500' : 'text-violet-600'}`}>
                              {row.diff > 0 ? `Under by ${fmt(row.diff)}` : `Over by ${fmt(-row.diff)}`}
                            </p>
                          )}
                        </div>
                        {statusKey !== 'matched' && (
                          <Button size="sm" variant="outline" className="h-7 text-xs text-amber-700 border-amber-300 shrink-0" onClick={() => openAdj(row)}>
                            <PlusCircle className="w-3 h-3 mr-1" /> Adjust
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}

          {sponsorRecon.length === 0 && (
            <Card className="p-8 text-center">
              <Scale className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-30" />
              <p className="text-sm text-muted-foreground">No network sales in this period</p>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Adjustment dialog */}
      <Dialog open={!!adjDialog} onOpenChange={v => { if (!v) setAdjDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-amber-500" /> Create Adjustment Entry
            </DialogTitle>
          </DialogHeader>
          {adjDialog && (
            <div className="space-y-3">
              <Card className="p-2.5 bg-amber-50 border-amber-200 text-xs text-amber-800">
                <p><span className="font-semibold">Date:</span> {adjDialog.date} · <span className="font-semibold">Branch:</span> {adjDialog.branch}</p>
                <p className="mt-0.5">Sales Network: {fmt(adjDialog.saleNetwork)} · Sponsor: {fmt(adjDialog.sponsorRecorded)}</p>
                <p className="font-bold mt-0.5">Gap: {fmt(adjDialog.diff)}</p>
              </Card>
              <div>
                <Label className="text-xs">Adjustment Amount *</Label>
                <Input type="number" value={adjForm.amount} onChange={e => setAdjForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Fee / Adjustment Reason *</Label>
                <Input value={adjForm.fee_reason} onChange={e => setAdjForm(f => ({ ...f, fee_reason: e.target.value }))} placeholder="e.g. Sponsor fee, rounding, bank charge..." />
              </div>
              <div>
                <Label className="text-xs">Notes (optional)</Label>
                <Input value={adjForm.notes} onChange={e => setAdjForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={saveAdj} disabled={saving || !adjForm.amount || !adjForm.fee_reason}>
                  {saving ? 'Saving...' : 'Create SPONSOR_FEE_OR_ADJUSTMENT'}
                </Button>
                <Button variant="outline" onClick={() => setAdjDialog(null)}>Cancel</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}