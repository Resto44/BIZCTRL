/**
 * BatchTracking — Retail Mode Exclusive Module
 *
 * Manages batch/lot tracking for retail products.
 * Features:
 * - Create and manage batches/lots
 * - Track batch quantities and locations
 * - Batch-level cost tracking
 * - Integration with Expiry Tracking
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Tags, Plus, Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { format, differenceInDays, isPast } from 'date-fns';
import { cn } from '@/lib/utils';

function RetailModeRequired() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Tags className="w-12 h-12 text-muted-foreground/30 mb-4" />
      <h3 className="text-base font-semibold text-foreground mb-1">Retail Mode Required</h3>
      <p className="text-sm text-muted-foreground max-w-xs">
        Batch/Lot Tracking is only available in Retail Mode.
      </p>
    </div>
  );
}

function BatchStatusBadge({ batch }) {
  if (!batch.expiry_date) return null;
  const daysLeft = differenceInDays(new Date(batch.expiry_date), new Date());
  if (isPast(new Date(batch.expiry_date))) return (
    <Badge className="bg-red-100 text-red-700 text-xs">Expired</Badge>
  );
  if (daysLeft <= 30) return (
    <Badge className="bg-amber-100 text-amber-700 text-xs">Expires in {daysLeft}d</Badge>
  );
  return (
    <Badge className="bg-emerald-100 text-emerald-700 text-xs">Valid</Badge>
  );
}

export default function BatchTracking() {
  const { activeRestaurantId } = useTenant();
  const { isRetail } = useBusinessMode();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [filterProduct, setFilterProduct] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    product_id: '',
    batch_number: '',
    lot_number: '',
    quantity: '',
    unit_cost: '',
    manufacture_date: '',
    expiry_date: '',
    supplier: '',
    location: '',
    notes: '',
  });

  // ── Fetch batch-tracked products ────────────────────────────────────────────
  const { data: products = [] } = useQuery({
    queryKey: ['batch-products', activeRestaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, unit')
        .eq('batch_tracked', true)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeRestaurantId && isRetail,
  });

  // ── Fetch batches ───────────────────────────────────────────────────────────
  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['batches', activeRestaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_batches')
        .select(`
          *,
          products(name, unit)
        `)
        .order('created_date', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeRestaurantId && isRetail,
  });

  const filtered = useMemo(() => {
    let list = batches;
    if (filterProduct !== 'all') list = list.filter(b => b.product_id === filterProduct);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(b =>
        b.batch_number?.toLowerCase().includes(q) ||
        b.lot_number?.toLowerCase().includes(q) ||
        b.products?.name?.toLowerCase().includes(q) ||
        b.supplier?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [batches, filterProduct, search]);

  const stats = useMemo(() => {
    const expired = batches.filter(b => b.expiry_date && isPast(new Date(b.expiry_date))).length;
    const expiringSoon = batches.filter(b => {
      if (!b.expiry_date || isPast(new Date(b.expiry_date))) return false;
      return differenceInDays(new Date(b.expiry_date), new Date()) <= 30;
    }).length;
    return { total: batches.length, expired, expiringSoon };
  }, [batches]);

  const generateBatchNumber = () => {
    const date = format(new Date(), 'yyyyMMdd');
    const rand = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `BATCH-${date}-${rand}`;
  };

  // ── Create batch ────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async (data) => {
      const { error } = await supabase.from('product_batches').insert({
        restaurant_id: activeRestaurantId,
        product_id: data.product_id,
        batch_number: data.batch_number,
        lot_number: data.lot_number || null,
        quantity: parseFloat(data.quantity) || 0,
        remaining_quantity: parseFloat(data.quantity) || 0,
        unit_cost: parseFloat(data.unit_cost) || 0,
        manufacture_date: data.manufacture_date || null,
        expiry_date: data.expiry_date || null,
        supplier: data.supplier || null,
        location: data.location || null,
        notes: data.notes || null,
        status: 'active',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      toast.success('Batch created');
      setShowForm(false);
      setForm({ product_id: '', batch_number: '', lot_number: '', quantity: '', unit_cost: '', manufacture_date: '', expiry_date: '', supplier: '', location: '', notes: '' });
    },
    onError: (err) => toast.error(err.message),
  });

  if (!isRetail) return <RetailModeRequired />;

  return (
    <div>
      <PageHeader
        title="Batch / Lot Tracking"
        subtitle="Track product batches, lot numbers, and expiry dates"
        action={
          <Button size="sm" onClick={() => { setShowForm(true); setForm(f => ({ ...f, batch_number: generateBatchNumber() })); }}>
            <Plus className="w-4 h-4 mr-1" /> New Batch
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Card className="bg-blue-50 dark:bg-blue-950/20 border-0">
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold text-blue-600">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total Batches</p>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 dark:bg-amber-950/20 border-0">
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold text-amber-600">{stats.expiringSoon}</p>
            <p className="text-xs text-muted-foreground">Expiring Soon</p>
          </CardContent>
        </Card>
        <Card className="bg-red-50 dark:bg-red-950/20 border-0">
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold text-red-600">{stats.expired}</p>
            <p className="text-xs text-muted-foreground">Expired</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search batch, lot, product..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterProduct} onValueChange={setFilterProduct}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All products" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Products</SelectItem>
            {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Batch list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Tags className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No batches found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(batch => (
            <Card key={batch.id} className={cn(
              'border',
              batch.expiry_date && isPast(new Date(batch.expiry_date)) && 'border-red-200 bg-red-50/30 dark:bg-red-950/10',
            )}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div>
                    <div className="flex items-center gap-2">
                      <code className="text-xs font-mono font-bold text-foreground">{batch.batch_number}</code>
                      {batch.lot_number && (
                        <code className="text-xs font-mono text-muted-foreground">LOT: {batch.lot_number}</code>
                      )}
                      <BatchStatusBadge batch={batch} />
                    </div>
                    <p className="text-sm font-medium mt-0.5">{batch.products?.name || 'Unknown Product'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold">{batch.remaining_quantity}/{batch.quantity}</p>
                    <p className="text-xs text-muted-foreground">{batch.products?.unit || 'units'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                  {batch.manufacture_date && (
                    <span>Mfg: {format(new Date(batch.manufacture_date), 'MMM d, yyyy')}</span>
                  )}
                  {batch.expiry_date && (
                    <span className={cn(
                      isPast(new Date(batch.expiry_date)) ? 'text-red-600 font-medium' : ''
                    )}>
                      Exp: {format(new Date(batch.expiry_date), 'MMM d, yyyy')}
                    </span>
                  )}
                  {batch.supplier && <span>Supplier: {batch.supplier}</span>}
                  {batch.location && <span>Location: {batch.location}</span>}
                  {batch.unit_cost > 0 && <span>Cost: {batch.unit_cost}/{batch.products?.unit}</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── New Batch Dialog ────────────────────────────────────────────────── */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Batch / Lot</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Product *</Label>
              <Select value={form.product_id} onValueChange={v => setForm(f => ({ ...f, product_id: v }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select product..." />
                </SelectTrigger>
                <SelectContent>
                  {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {products.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  No batch-tracked products. Enable "Batch Tracking" in Product Management first.
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Batch Number *</Label>
                <Input value={form.batch_number} onChange={e => setForm(f => ({ ...f, batch_number: e.target.value }))} className="mt-1 font-mono text-sm" />
              </div>
              <div>
                <Label>Lot Number</Label>
                <Input value={form.lot_number} onChange={e => setForm(f => ({ ...f, lot_number: e.target.value }))} className="mt-1 font-mono text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Quantity *</Label>
                <Input type="number" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>Unit Cost</Label>
                <Input type="number" value={form.unit_cost} onChange={e => setForm(f => ({ ...f, unit_cost: e.target.value }))} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Manufacture Date</Label>
                <Input type="date" value={form.manufacture_date} onChange={e => setForm(f => ({ ...f, manufacture_date: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>Expiry Date</Label>
                <Input type="date" value={form.expiry_date} onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Supplier</Label>
                <Input value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>Storage Location</Label>
                <Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} className="mt-1" placeholder="e.g. Shelf A3" />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1" rows={2} />
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={() => createMutation.mutate(form)}
                disabled={createMutation.isPending || !form.product_id || !form.batch_number || !form.quantity}
              >
                {createMutation.isPending ? 'Creating...' : 'Create Batch'}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
