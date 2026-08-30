/**
 * ExpiryTracking — Retail Mode Exclusive Module
 *
 * Monitors product expiry dates across all batches and stock.
 * Features:
 * - Expiry dashboard with alerts
 * - Expired / expiring soon / valid stock views
 * - Write-off expired stock
 * - Expiry alerts configuration
 *
 * Architecture: Retail Mode only.
 */

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useTenant } from '@/lib/TenantContext';
import { useBusinessMode } from '@/lib/BusinessModeContext';
import PageHeader from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Calendar, AlertTriangle, CheckCircle2, XCircle,
  Clock, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { format, differenceInDays, isPast } from 'date-fns';
import { cn } from '@/lib/utils';

function RetailModeRequired() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Calendar className="w-12 h-12 text-muted-foreground/30 mb-4" />
      <h3 className="text-base font-semibold text-foreground mb-1">Retail Mode Required</h3>
      <p className="text-sm text-muted-foreground max-w-xs">
        Expiry Tracking is only available in Retail Mode.
      </p>
    </div>
  );
}

function ExpiryBadge({ expiryDate }) {
  if (!expiryDate) return <Badge variant="outline" className="text-xs">No Expiry</Badge>;
  const date = new Date(expiryDate);
  const daysLeft = differenceInDays(date, new Date());

  if (isPast(date)) return (
    <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">
      <XCircle className="w-3 h-3 mr-1" /> Expired {Math.abs(daysLeft)}d ago
    </Badge>
  );
  if (daysLeft <= 7) return (
    <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">
      <AlertTriangle className="w-3 h-3 mr-1" /> {daysLeft}d left
    </Badge>
  );
  if (daysLeft <= 30) return (
    <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">
      <Clock className="w-3 h-3 mr-1" /> {daysLeft}d left
    </Badge>
  );
  return (
    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">
      <CheckCircle2 className="w-3 h-3 mr-1" /> {daysLeft}d left
    </Badge>
  );
}

export default function ExpiryTracking() {
  const { activeRestaurantId } = useTenant();
  const { isRetail } = useBusinessMode();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('alerts');

  // ── Fetch all batches with expiry dates ─────────────────────────────────────
  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['expiry-batches', activeRestaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_batches')
        .select(`
          *,
          products(name, unit, category)
        `)
        .not('expiry_date', 'is', null)
        .gt('remaining_quantity', 0)
        .order('expiry_date', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeRestaurantId && isRetail,
  });

  const categorized = useMemo(() => {
    const now = new Date();
    const expired = batches.filter(b => isPast(new Date(b.expiry_date)));
    const critical = batches.filter(b => {
      const d = new Date(b.expiry_date);
      return !isPast(d) && differenceInDays(d, now) <= 7;
    });
    const warning = batches.filter(b => {
      const d = new Date(b.expiry_date);
      const days = differenceInDays(d, now);
      return !isPast(d) && days > 7 && days <= 30;
    });
    const valid = batches.filter(b => {
      const d = new Date(b.expiry_date);
      return !isPast(d) && differenceInDays(d, now) > 30;
    });
    return { expired, critical, warning, valid };
  }, [batches]);

  // ── Write-off expired batch ─────────────────────────────────────────────────
  const writeOffMutation = useMutation({
    mutationFn: async (batch) => {
      const { error } = await supabase
        .from('product_batches')
        .update({ status: 'written_off', remaining_quantity: 0 })
        .eq('id', batch.id);
      if (error) throw error;

      // Log inventory transaction
      await supabase.from('inventory_transactions').insert({
        restaurant_id: activeRestaurantId,
        product_id: batch.product_id,
        transaction_type: 'write_off',
        quantity: batch.remaining_quantity,
        notes: `Expired batch write-off: ${batch.batch_number}`,
        reference_type: 'batch',
        reference_id: batch.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expiry-batches'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      toast.success('Batch written off');
    },
    onError: (err) => toast.error(err.message),
  });

  const renderBatchList = (list, emptyMsg) => {
    if (list.length === 0) return (
      <div className="text-center py-8 text-muted-foreground">
        <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">{emptyMsg}</p>
      </div>
    );
    return (
      <div className="space-y-2">
        {list.map(batch => (
          <Card key={batch.id} className={cn(
            'border',
            isPast(new Date(batch.expiry_date)) && 'border-red-200 bg-red-50/30 dark:bg-red-950/10',
            !isPast(new Date(batch.expiry_date)) && differenceInDays(new Date(batch.expiry_date), new Date()) <= 7 && 'border-red-200 bg-red-50/20',
            !isPast(new Date(batch.expiry_date)) && differenceInDays(new Date(batch.expiry_date), new Date()) <= 30 && differenceInDays(new Date(batch.expiry_date), new Date()) > 7 && 'border-amber-200 bg-amber-50/20',
          )}>
            <CardContent className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="text-sm font-semibold">{batch.products?.name}</p>
                    <ExpiryBadge expiryDate={batch.expiry_date} />
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    <code className="font-mono">{batch.batch_number}</code>
                    <span>Qty: <strong className="text-foreground">{batch.remaining_quantity} {batch.products?.unit}</strong></span>
                    <span>Exp: {format(new Date(batch.expiry_date), 'MMM d, yyyy')}</span>
                    {batch.location && <span>📍 {batch.location}</span>}
                  </div>
                </div>
                {isPast(new Date(batch.expiry_date)) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive border-destructive/30 h-7 text-xs shrink-0"
                    onClick={() => {
                      if (window.confirm(`Write off ${batch.remaining_quantity} units of expired batch ${batch.batch_number}?`)) {
                        writeOffMutation.mutate(batch);
                      }
                    }}
                    disabled={writeOffMutation.isPending}
                  >
                    <Trash2 className="w-3 h-3 mr-1" /> Write Off
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  if (!isRetail) return <RetailModeRequired />;

  return (
    <div>
      <PageHeader
        title="Expiry Tracking"
        subtitle="Monitor product expiry dates and manage expired stock"
      />

      {/* Alert summary */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <Card className="bg-red-50 dark:bg-red-950/20 border-0">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-600" />
              <div>
                <p className="text-xl font-bold text-red-600">{categorized.expired.length}</p>
                <p className="text-xs text-muted-foreground">Expired</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-50 dark:bg-red-950/20 border-0">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <div>
                <p className="text-xl font-bold text-red-500">{categorized.critical.length}</p>
                <p className="text-xs text-muted-foreground">Critical (≤7d)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 dark:bg-amber-950/20 border-0">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-600" />
              <div>
                <p className="text-xl font-bold text-amber-600">{categorized.warning.length}</p>
                <p className="text-xs text-muted-foreground">Warning (≤30d)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50 dark:bg-emerald-950/20 border-0">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <div>
                <p className="text-xl font-bold text-emerald-600">{categorized.valid.length}</p>
                <p className="text-xs text-muted-foreground">Valid</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full mb-4">
          <TabsTrigger value="alerts" className="flex-1 text-xs">
            Alerts {(categorized.expired.length + categorized.critical.length) > 0 && (
              <span className="ml-1 bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded-full">
                {categorized.expired.length + categorized.critical.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="warning" className="flex-1 text-xs">Warning</TabsTrigger>
          <TabsTrigger value="valid" className="flex-1 text-xs">Valid</TabsTrigger>
          <TabsTrigger value="all" className="flex-1 text-xs">All</TabsTrigger>
        </TabsList>

        <TabsContent value="alerts">
          {categorized.expired.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">Expired — Requires Immediate Action</p>
              {renderBatchList(categorized.expired, '')}
            </div>
          )}
          {renderBatchList(categorized.critical, 'No critical expiry alerts')}
        </TabsContent>
        <TabsContent value="warning">
          {renderBatchList(categorized.warning, 'No products expiring within 30 days')}
        </TabsContent>
        <TabsContent value="valid">
          {renderBatchList(categorized.valid, 'No valid batches with expiry dates')}
        </TabsContent>
        <TabsContent value="all">
          {renderBatchList(batches, 'No batches with expiry dates found')}
        </TabsContent>
      </Tabs>
    </div>
  );
}
