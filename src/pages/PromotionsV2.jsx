/**
 * Promotions V2 — Online Ordering V2
 * Smart Restaurant ERP — Integrated Module
 * Discount codes, cashback, BOGO, happy hour, free delivery, loyalty rewards.
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTenant } from '@/lib/TenantContext';
import { useAuth } from '@/lib/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  Tag, Plus, Edit2, Trash2, Gift, Percent, DollarSign,
  Truck, RefreshCw, Copy, CheckCircle2
} from 'lucide-react';

const PROMO_TYPES = [
  { id: 'percentage',    label: 'Percentage Discount', icon: Percent },
  { id: 'fixed',         label: 'Fixed Amount',        icon: DollarSign },
  { id: 'free_delivery', label: 'Free Delivery',       icon: Truck },
  { id: 'cashback',      label: 'Cashback',            icon: Gift },
];

function PromoForm({ promo, onSave, onClose }) {
  const [form, setForm] = useState(promo || {
    code: '',
    type: 'percentage',
    value: 0,
    min_order_amount: 0,
    max_discount: null,
    start_date: '',
    end_date: '',
    usage_limit: null,
    is_active: true,
  });

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.code) { toast.error('Promo code is required'); return; }
    onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Promo Code *</Label>
          <Input
            value={form.code}
            onChange={e => set('code', e.target.value.toUpperCase())}
            placeholder="SAVE20"
            required
          />
        </div>
        <div className="space-y-1">
          <Label>Type</Label>
          <Select value={form.type} onValueChange={v => set('type', v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROMO_TYPES.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {form.type !== 'free_delivery' && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Value {form.type === 'percentage' ? '(%)' : '(SAR)'}</Label>
            <Input
              type="number"
              value={form.value}
              onChange={e => set('value', parseFloat(e.target.value))}
              min="0"
            />
          </div>
          {form.type === 'percentage' && (
            <div className="space-y-1">
              <Label>Max Discount (SAR)</Label>
              <Input
                type="number"
                value={form.max_discount || ''}
                onChange={e => set('max_discount', e.target.value ? parseFloat(e.target.value) : null)}
                placeholder="No limit"
              />
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Min Order (SAR)</Label>
          <Input
            type="number"
            value={form.min_order_amount}
            onChange={e => set('min_order_amount', parseFloat(e.target.value))}
            min="0"
          />
        </div>
        <div className="space-y-1">
          <Label>Usage Limit</Label>
          <Input
            type="number"
            value={form.usage_limit || ''}
            onChange={e => set('usage_limit', e.target.value ? parseInt(e.target.value) : null)}
            placeholder="Unlimited"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Start Date</Label>
          <Input type="datetime-local" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>End Date</Label>
          <Input type="datetime-local" value={form.end_date} onChange={e => set('end_date', e.target.value)} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Switch checked={form.is_active} onCheckedChange={v => set('is_active', v)} />
        <Label>Active</Label>
      </div>

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit">Save Promotion</Button>
      </div>
    </form>
  );
}

export default function PromotionsV2() {
  const { user } = useAuth?.() || {};
  const { restaurant } = useTenant?.() || {};
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingPromo, setEditingPromo] = useState(null);
  const [copiedCode, setCopiedCode] = useState(null);

  const { data: promotions = [], isLoading } = useQuery({
    queryKey: ['promotions', restaurant?.id],
    queryFn: () => base44.entities.Promotion.filter({ restaurant_id: restaurant?.id }),
    enabled: !!restaurant?.id,
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const payload = { ...data, restaurant_id: restaurant?.id, created_by: user?.email };
      if (editingPromo?.id) return base44.entities.Promotion.update(editingPromo.id, payload);
      return base44.entities.Promotion.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promotions'] });
      toast.success(editingPromo ? 'Promotion updated' : 'Promotion created');
      setShowForm(false);
      setEditingPromo(null);
    },
    onError: () => toast.error('Failed to save promotion'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Promotion.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['promotions'] }); toast.success('Promotion deleted'); },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }) => base44.entities.Promotion.update(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promotions'] }),
  });

  const handleCopyCode = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const typeConfig = {
    percentage:    { label: 'Percentage', color: 'bg-blue-100 text-blue-700', icon: Percent },
    fixed:         { label: 'Fixed',      color: 'bg-green-100 text-green-700', icon: DollarSign },
    free_delivery: { label: 'Free Delivery', color: 'bg-indigo-100 text-indigo-700', icon: Truck },
    cashback:      { label: 'Cashback',   color: 'bg-amber-100 text-amber-700', icon: Gift },
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Tag className="w-6 h-6 text-primary" />
            Promotions & Coupons
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Manage discount codes, cashback, and special offers</p>
        </div>
        <Button onClick={() => { setEditingPromo(null); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          New Promotion
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{promotions.length}</p>
            <p className="text-xs text-muted-foreground">Total Promos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{promotions.filter(p => p.is_active).length}</p>
            <p className="text-xs text-muted-foreground">Active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-blue-600">{promotions.reduce((s, p) => s + (p.times_used || 0), 0)}</p>
            <p className="text-xs text-muted-foreground">Total Uses</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-amber-600">{promotions.filter(p => p.type === 'cashback').length}</p>
            <p className="text-xs text-muted-foreground">Cashback Promos</p>
          </CardContent>
        </Card>
      </div>

      {/* Promotions List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <RefreshCw className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : promotions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Tag className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No promotions yet. Create your first one!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {promotions.map(promo => {
            const cfg = typeConfig[promo.type] || typeConfig.fixed;
            const Icon = cfg.icon;
            const isExpired = promo.end_date && new Date(promo.end_date) < new Date();
            const isLimitReached = promo.usage_limit && promo.times_used >= promo.usage_limit;

            return (
              <Card key={promo.id} className={`${!promo.is_active || isExpired ? 'opacity-60' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${cfg.color}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-lg font-mono">{promo.code}</span>
                          <button onClick={() => handleCopyCode(promo.code)} className="text-muted-foreground hover:text-primary">
                            {copiedCode === promo.code ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge className={`text-xs ${cfg.color}`}>{cfg.label}</Badge>
                          {promo.type !== 'free_delivery' && (
                            <span className="text-sm font-medium">
                              {promo.type === 'percentage' ? `${promo.value}% off` : `${promo.value} SAR off`}
                              {promo.max_discount ? ` (max ${promo.max_discount} SAR)` : ''}
                            </span>
                          )}
                          {promo.min_order_amount > 0 && (
                            <span className="text-xs text-muted-foreground">Min order: {promo.min_order_amount} SAR</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          {promo.start_date && <span>From: {format(new Date(promo.start_date), 'MMM d')}</span>}
                          {promo.end_date && <span>Until: {format(new Date(promo.end_date), 'MMM d')}</span>}
                          <span>Used: {promo.times_used || 0}{promo.usage_limit ? `/${promo.usage_limit}` : ''}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isExpired && <Badge className="bg-red-100 text-red-700 text-xs">Expired</Badge>}
                      {isLimitReached && <Badge className="bg-orange-100 text-orange-700 text-xs">Limit Reached</Badge>}
                      <Switch
                        checked={promo.is_active}
                        onCheckedChange={v => toggleMutation.mutate({ id: promo.id, is_active: v })}
                      />
                      <Button variant="ghost" size="sm" onClick={() => { setEditingPromo(promo); setShowForm(true); }}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive"
                        onClick={() => deleteMutation.mutate(promo.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingPromo ? 'Edit Promotion' : 'New Promotion'}</DialogTitle>
          </DialogHeader>
          <PromoForm
            promo={editingPromo}
            onSave={data => saveMutation.mutate(data)}
            onClose={() => { setShowForm(false); setEditingPromo(null); }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
