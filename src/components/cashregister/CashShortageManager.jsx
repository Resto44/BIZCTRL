import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import { useNotify } from '@/lib/useNotify';
import { approveShortage, investigateShortage } from '@/services/cashRegisterService';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, Search, Loader2,
  TrendingDown, TrendingUp, Banknote, Clock
} from 'lucide-react';
import { format } from 'date-fns';
import OwnerCashInjectionForm from './OwnerCashInjectionForm';

const STATUS_CONFIG = {
  Pending:      { color: 'bg-amber-100 text-amber-700 border-amber-200',    icon: Clock },
  Investigating:{ color: 'bg-blue-100 text-blue-700 border-blue-200',       icon: Search },
  Approved:     { color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  Resolved:     { color: 'bg-gray-100 text-gray-700 border-gray-200',       icon: CheckCircle2 },
};

function ShortageStatusBadge({ status }) {
  const c = STATUS_CONFIG[status] || STATUS_CONFIG.Pending;
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${c.color}`}>
      <Icon className="w-3 h-3" />{status}
    </span>
  );
}

function ShortageCard({ shortage, onAction }) {
  const { currency } = useLanguage();
  const { user } = useAuth();
  const notif = useNotify();
  const qc = useQueryClient();
  const isOwner = user?.role === 'owner';
  const fmt = (n) => `${currency}${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  const [ownerNotes, setOwnerNotes] = useState('');
  const [showInjection, setShowInjection] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const approveMutation = useMutation({
    mutationFn: () => approveShortage({ shortageId: shortage.id, ownerNotes, reviewedBy: user?.email }),
    onSuccess: () => {
      notif.success('Shortage approved.');
      qc.invalidateQueries({ queryKey: ['cash_shortages'] });
      if (onAction) onAction();
    },
    onError: (err) => notif.error('Failed: ' + (err?.message || 'Unknown')),
  });

  const investigateMutation = useMutation({
    mutationFn: () => investigateShortage({ shortageId: shortage.id, ownerNotes, reviewedBy: user?.email }),
    onSuccess: () => {
      notif.success('Marked for investigation.');
      qc.invalidateQueries({ queryKey: ['cash_shortages'] });
    },
    onError: (err) => notif.error('Failed: ' + (err?.message || 'Unknown')),
  });

  const isShortage = shortage.type === 'Shortage';
  const amount = isShortage ? shortage.shortage_amount : shortage.overage_amount;

  return (
    <Card className={`border ${isShortage ? 'border-red-200' : 'border-amber-200'}`}>
      <CardContent className="px-4 py-3">
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            {isShortage ? (
              <TrendingDown className="w-4 h-4 text-red-600 flex-shrink-0" />
            ) : (
              <TrendingUp className="w-4 h-4 text-amber-600 flex-shrink-0" />
            )}
            <div>
              <p className="text-sm font-semibold">
                {isShortage ? 'Cash Shortage' : 'Cash Overage'}: {fmt(amount)}
              </p>
              <p className="text-xs text-muted-foreground">
                {shortage.branch} · {format(new Date(shortage.date), 'MMM d, yyyy')}
              </p>
            </div>
          </div>
          <ShortageStatusBadge status={shortage.status} />
        </div>

        {/* Details */}
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mb-2">
          <div>Expected: <span className="font-medium text-foreground">{fmt(shortage.expected_amount)}</span></div>
          <div>Counted: <span className="font-medium text-foreground">{fmt(shortage.actual_amount)}</span></div>
          <div>Reported by: <span className="font-medium text-foreground">{shortage.reported_by || '—'}</span></div>
          <div>Date: <span className="font-medium text-foreground">{format(new Date(shortage.date), 'MMM d')}</span></div>
        </div>

        {/* Manager Notes */}
        {shortage.manager_notes && (
          <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground mb-2">
            <span className="font-medium">Manager: </span>{shortage.manager_notes}
          </div>
        )}

        {/* Owner Notes (if already reviewed) */}
        {shortage.owner_notes && (
          <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-700 mb-2">
            <span className="font-medium">Owner: </span>{shortage.owner_notes}
          </div>
        )}

        {/* Owner Actions */}
        {isOwner && (shortage.status === 'Pending' || shortage.status === 'Investigating') && (
          <div className="space-y-2 mt-2">
            <Textarea
              value={ownerNotes}
              onChange={e => setOwnerNotes(e.target.value)}
              className="text-xs min-h-[50px] resize-none"
              placeholder="Owner notes / explanation..."
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 h-8 text-xs bg-emerald-600 hover:bg-emerald-700"
                onClick={() => approveMutation.mutate()}
                disabled={approveMutation.isPending}
              >
                {approveMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-8 text-xs border-blue-200 text-blue-700 hover:bg-blue-50"
                onClick={() => investigateMutation.mutate()}
                disabled={investigateMutation.isPending}
              >
                {investigateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3 mr-1" />}
                Investigate
              </Button>
            </div>
            {isShortage && (
              <Button
                size="sm"
                variant="outline"
                className="w-full h-8 text-xs border-green-200 text-green-700 hover:bg-green-50"
                onClick={() => setShowInjection(!showInjection)}
              >
                <Banknote className="w-3 h-3 mr-1" />
                Inject Cash to Resolve
              </Button>
            )}
          </div>
        )}

        {/* Injection Form */}
        {showInjection && (
          <div className="mt-2">
            <OwnerCashInjectionForm
              defaultBranch={shortage.branch}
              shortageId={shortage.id}
              shortageAmount={shortage.shortage_amount}
              onSuccess={() => {
                setShowInjection(false);
                qc.invalidateQueries({ queryKey: ['cash_shortages'] });
              }}
              onCancel={() => setShowInjection(false)}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function CashShortageManager({ branch, dateFrom, dateTo }) {
  const { user } = useAuth();
  const { currency } = useLanguage();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('Pending');

  const { data: shortages = [], isLoading } = useQuery({
    queryKey: ['cash_shortages', branch, user?.email, statusFilter],
    queryFn: () => base44.entities.CashShortage.filter({
      created_by: user?.email,
      ...(branch && branch !== 'all' ? { branch } : {}),
      ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
    }, '-date', 100),
    enabled: !!user?.email,
    staleTime: 30000,
  });

  const statusCounts = {
    Pending: shortages.filter(s => s.status === 'Pending').length,
    Investigating: shortages.filter(s => s.status === 'Investigating').length,
    Approved: shortages.filter(s => s.status === 'Approved').length,
    Resolved: shortages.filter(s => s.status === 'Resolved').length,
  };

  return (
    <div className="space-y-3">
      {/* Status Filter Tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {['all', 'Pending', 'Investigating', 'Approved', 'Resolved'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              statusFilter === s
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {s === 'all' ? 'All' : s}
            {s !== 'all' && statusCounts[s] > 0 && (
              <span className="ml-1 bg-white/20 rounded-full px-1">{statusCounts[s]}</span>
            )}
          </button>
        ))}
      </div>

      {/* Shortage List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : shortages.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-400" />
          <p className="text-sm font-medium">No {statusFilter !== 'all' ? statusFilter.toLowerCase() : ''} shortages</p>
          <p className="text-xs mt-1">All cash settlements are balanced.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {shortages.map(s => (
            <ShortageCard
              key={s.id}
              shortage={s}
              onAction={() => qc.invalidateQueries({ queryKey: ['cash_shortages'] })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
