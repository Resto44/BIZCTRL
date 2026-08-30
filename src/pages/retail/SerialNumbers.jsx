/**
 * SerialNumbers — Retail Mode Exclusive Module (Optional)
 *
 * Tracks individual product units by serial number.
 * Used for high-value items: electronics, appliances, vehicles, etc.
 * Features:
 * - Register serial numbers on purchase/receipt
 * - Assign serial to sale
 * - Warranty tracking
 * - Serial number search and history
 *
 * Architecture: Retail Mode only. Optional per product.
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  ScanLine, Plus, Search, Clock,
  ShoppingBag, Warehouse, AlertTriangle, History,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const STATUS_CONFIG = {
  in_stock:  { label: 'In Stock',  color: 'bg-emerald-100 text-emerald-700', icon: Warehouse },
  sold:      { label: 'Sold',      color: 'bg-blue-100 text-blue-700',       icon: ShoppingBag },
  reserved:  { label: 'Reserved',  color: 'bg-amber-100 text-amber-700',     icon: Clock },
  defective: { label: 'Defective', color: 'bg-red-100 text-red-700',         icon: AlertTriangle },
  returned:  { label: 'Returned',  color: 'bg-purple-100 text-purple-700',   icon: History },
};

function RetailModeRequired() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <ScanLine className="w-12 h-12 text-muted-foreground/30 mb-4" />
      <h3 className="text-base font-semibold text-foreground mb-1">Retail Mode Required</h3>
      <p className="text-sm text-muted-foreground max-w-xs">
        Serial Number Tracking is only available in Retail Mode.
      </p>
    </div>
  );
}

export default function SerialNumbers() {
  const { activeRestaurantId } = useTenant();
  const { isRetail } = useBusinessMode();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterProduct, setFilterProduct] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    product_id: '',
    serial_number: '',
    status: 'in_stock',
    purchase_date: '',
    warranty_expiry: '',
    supplier: '',
    notes: '',
  });

  // ── Fetch serial-tracked products ───────────────────────────────────────────
  const { data: products = [] } = useQuery({
    queryKey: ['serial-products', activeRestaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, unit')
        .eq('serial_tracked', true)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeRestaurantId && isRetail,
  });

  // ── Fetch serial numbers ────────────────────────────────────────────────────
  const { data: serials = [], isLoading } = useQuery({
    queryKey: ['serial-numbers', activeRestaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('serial_numbers')
        .select(`
          *,
          products(name, unit)
        `)
        .order('created_date', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeRestaurantId && isRetail,
  });

  const filtered = useMemo(() => {
    let list = serials;
    if (filterStatus !== 'all') list = list.filter(s => s.status === filterStatus);
    if (filterProduct !== 'all') list = list.filter(s => s.product_id === filterProduct);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.serial_number?.toLowerCase().includes(q) ||
        s.products?.name?.toLowerCase().includes(q) ||
        s.supplier?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [serials, filterStatus, filterProduct, search]);

  const stats = useMemo(() => {
    const byStatus = {};
    serials.forEach(s => {
      byStatus[s.status] = (byStatus[s.status] || 0) + 1;
    });
    return byStatus;
  }, [serials]);

  // ── Create serial ───────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async (data) => {
      // Check uniqueness
      const { data: existing } = await supabase
        .from('serial_numbers')
        .select('id')
        .eq('serial_number', data.serial_number)
        .limit(1);
      if (existing?.length > 0) throw new Error('Serial number already exists');

      const { error } = await supabase.from('serial_numbers').insert({
        restaurant_id: activeRestaurantId,
        product_id: data.product_id,
        serial_number: data.serial_number,
        status: data.status,
        purchase_date: data.purchase_date || null,
        warranty_expiry: data.warranty_expiry || null,
        supplier: data.supplier || null,
        notes: data.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['serial-numbers'] });
      toast.success('Serial number registered');
      setShowForm(false);
      setForm({ product_id: '', serial_number: '', status: 'in_stock', purchase_date: '', warranty_expiry: '', supplier: '', notes: '' });
    },
    onError: (err) => toast.error(err.message),
  });

  // ── Update status ───────────────────────────────────────────────────────────
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }) => {
      const { error } = await supabase.from('serial_numbers').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['serial-numbers'] });
      toast.success('Status updated');
    },
    onError: (err) => toast.error(err.message),
  });

  if (!isRetail) return <RetailModeRequired />;

  return (
    <div>
      <PageHeader
        title="Serial Numbers"
        subtitle={`${serials.length} registered · ${stats.in_stock || 0} in stock`}
        action={
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-1" /> Register
          </Button>
        }
      />

      {/* Stats */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
          const Icon = cfg.icon;
          const count = stats[key] || 0;
          return (
            <button
              key={key}
              onClick={() => setFilterStatus(filterStatus === key ? 'all' : key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors border',
                filterStatus === key ? cfg.color + ' border-current' : 'bg-muted text-muted-foreground border-transparent'
              )}
            >
              <Icon className="w-3 h-3" />
              {cfg.label}: {count}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search serial number, product..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 font-mono"
          />
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

      {/* Serial list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ScanLine className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No serial numbers found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(serial => {
            const statusCfg = STATUS_CONFIG[serial.status] || STATUS_CONFIG.in_stock;
            const StatusIcon = statusCfg.icon;
            return (
              <Card key={serial.id} className="border border-border/60">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <code className="text-sm font-mono font-bold text-foreground">{serial.serial_number}</code>
                        <span className={cn('inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium', statusCfg.color)}>
                          <StatusIcon className="w-3 h-3" />
                          {statusCfg.label}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{serial.products?.name}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                        {serial.purchase_date && <span>Purchased: {format(new Date(serial.purchase_date), 'MMM d, yyyy')}</span>}
                        {serial.warranty_expiry && <span>Warranty: {format(new Date(serial.warranty_expiry), 'MMM d, yyyy')}</span>}
                        {serial.supplier && <span>Supplier: {serial.supplier}</span>}
                      </div>
                    </div>
                    {/* Quick status change */}
                    {serial.status === 'in_stock' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs shrink-0"
                        onClick={() => updateStatusMutation.mutate({ id: serial.id, status: 'sold' })}
                      >
                        <ShoppingBag className="w-3 h-3 mr-1" /> Sell
                      </Button>
                    )}
                    {serial.status === 'sold' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs shrink-0"
                        onClick={() => updateStatusMutation.mutate({ id: serial.id, status: 'returned' })}
                      >
                        <History className="w-3 h-3 mr-1" /> Return
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Register Serial Dialog ──────────────────────────────────────────── */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Register Serial Number</DialogTitle>
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
                  Enable "Serial Number Tracking" in Product Management first.
                </p>
              )}
            </div>
            <div>
              <Label>Serial Number *</Label>
              <Input
                value={form.serial_number}
                onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))}
                className="mt-1 font-mono"
                placeholder="Scan or enter serial number"
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Purchase Date</Label>
                <Input type="date" value={form.purchase_date} onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>Warranty Expiry</Label>
                <Input type="date" value={form.warranty_expiry} onChange={e => setForm(f => ({ ...f, warranty_expiry: e.target.value }))} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Supplier</Label>
              <Input value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1" rows={2} />
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={() => createMutation.mutate(form)}
                disabled={createMutation.isPending || !form.product_id || !form.serial_number}
              >
                {createMutation.isPending ? 'Registering...' : 'Register'}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
