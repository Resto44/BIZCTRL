import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Award, Star, Crown, Shield, Gift, Users,
  Plus, Edit2, Trash2, Search,
  CheckCircle2, Tag
} from 'lucide-react';
import { toast } from 'sonner';

const TIER_CONFIG = {
  Bronze:   { icon: Award,  color: 'text-amber-700',   bg: 'bg-amber-100',   border: 'border-amber-300',   minPoints: 0,    multiplier: 1.0 },
  Silver:   { icon: Star,   color: 'text-slate-500',   bg: 'bg-slate-100',   border: 'border-slate-300',   minPoints: 500,  multiplier: 1.25 },
  Gold:     { icon: Crown,  color: 'text-yellow-600',  bg: 'bg-yellow-100',  border: 'border-yellow-300',  minPoints: 1500, multiplier: 1.5 },
  Platinum: { icon: Shield, color: 'text-purple-600',  bg: 'bg-purple-100',  border: 'border-purple-300',  minPoints: 5000, multiplier: 2.0 },
};

function TierBadge({ tier }) {
  const cfg = TIER_CONFIG[tier] || TIER_CONFIG.Bronze;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
      <Icon className="w-3 h-3" />{tier}
    </span>
  );
}

function PromoDialog({ open, onClose, promo, onSave }) {
  const { t } = useLanguage();
  const [form, setForm] = useState({ code: '', type: 'percentage', value: '', min_order_amount: '', max_discount: '', is_active: true, description: '' });
  React.useEffect(() => {
    if (promo) setForm({ code: promo.code || '', type: promo.type || 'percentage', value: promo.value || '', min_order_amount: promo.min_order_amount || '', max_discount: promo.max_discount || '', is_active: promo.is_active !== false, description: promo.description || '' });
    else setForm({ code: '', type: 'percentage', value: '', min_order_amount: '', max_discount: '', is_active: true, description: '' });
  }, [promo, open]);

  const handleSave = () => {
    if (!form.code || !form.value) { toast.error('Code and value required'); return; }
    onSave({ ...form, value: parseFloat(form.value), min_order_amount: form.min_order_amount ? parseFloat(form.min_order_amount) : null, max_discount: form.max_discount ? parseFloat(form.max_discount) : null });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm mx-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">{promo ? 'Edit' : 'New'} Promo Code</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div>
            <Label className="text-xs">Code *</Label>
            <Input className="mt-1 h-9 text-sm uppercase" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="SAVE20" />
          </div>
          <div>
            <Label className="text-xs">Type</Label>
            <div className="flex gap-2 mt-1">
              {['percentage', 'fixed', 'free_delivery'].map(tp => (
                <button key={tp} onClick={() => setForm(f => ({ ...f, type: tp }))}
                  className={`flex-1 py-1.5 text-xs rounded-lg border font-medium transition-all ${form.type === tp ? 'bg-primary text-white border-primary' : 'border-border'}`}>
                  {tp === 'percentage' ? '%' : tp === 'fixed' ? 'Fixed' : 'Free Del.'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs">Value *</Label>
            <Input className="mt-1 h-9 text-sm" type="number" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder={form.type === 'percentage' ? '20' : '10'} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Min Order</Label>
              <Input className="mt-1 h-9 text-sm" type="number" value={form.min_order_amount} onChange={e => setForm(f => ({ ...f, min_order_amount: e.target.value }))} placeholder="50" />
            </div>
            <div>
              <Label className="text-xs">Max Discount</Label>
              <Input className="mt-1 h-9 text-sm" type="number" value={form.max_discount} onChange={e => setForm(f => ({ ...f, max_discount: e.target.value }))} placeholder="30" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Input className="mt-1 h-9 text-sm" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Summer sale..." />
          </div>
          <div className="flex items-center gap-2">
              <input type="checkbox" id="is_active" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="rounded" />
            <Label htmlFor="is_active" className="text-xs cursor-pointer">Active</Label>
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1 h-9" onClick={onClose}>Cancel</Button>
            <Button className="flex-1 h-9" onClick={handleSave}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function LoyaltyProgram() {
  const { t, currency } = useLanguage();
  const { ownerFilter } = useTenant();
  const qc = useQueryClient();
  const [tab, setTab] = useState('overview');
  const [search, setSearch] = useState('');
  const [promoDialog, setPromoDialog] = useState({ open: false, promo: null });

  const { data: customers = [], isLoading: loadingCustomers } = useQuery({
    queryKey: ['loyalty_customers', ownerFilter],
    queryFn: () => base44.entities.Customer.filter({}, '-loyalty_points', 200),
  });

  const { data: promotions = [], isLoading: loadingPromos } = useQuery({
    queryKey: ['promotions_admin', ownerFilter],
    queryFn: () => base44.entities.Promotion.filter(ownerFilter || {}, '-created_at', 50),
    enabled: !!ownerFilter?.created_by,
  });

  const filteredCustomers = useMemo(() => {
    if (!search) return customers;
    return customers.filter(c => (c.name || '').toLowerCase().includes(search.toLowerCase()) || (c.phone || '').includes(search) || (c.email || '').toLowerCase().includes(search.toLowerCase()));
  }, [customers, search]);

  const tierStats = useMemo(() => {
    const stats = { Bronze: 0, Silver: 0, Gold: 0, Platinum: 0 };
    customers.forEach(c => { if (stats[c.loyalty_tier] !== undefined) stats[c.loyalty_tier]++; });
    return stats;
  }, [customers]);

  const totalPoints = customers.reduce((s, c) => s + (c.loyalty_points || 0), 0);
  const avgPoints = customers.length > 0 ? Math.round(totalPoints / customers.length) : 0;

  const savePromo = async (form) => {
    try {
      if (promoDialog.promo?.id) {
        await base44.entities.Promotion.update(promoDialog.promo.id, form);
      } else {
        await base44.entities.Promotion.create({ ...form, ...ownerFilter });
      }
      qc.invalidateQueries(['promotions_admin']);
      toast.success('Promo saved ✓');
    } catch (e) {
      toast.error('Failed to save promo');
    }
  };

  const deletePromo = async (id) => {
    try {
      await base44.entities.Promotion.delete(id);
      qc.invalidateQueries(['promotions_admin']);
      toast.success('Deleted');
    } catch (e) {
      toast.error('Failed to delete');
    }
  };

  const togglePromo = async (promo) => {
    try {
      await base44.entities.Promotion.update(promo.id, { is_active: !promo.is_active });
      qc.invalidateQueries(['promotions_admin']);
    } catch (e) {
      toast.error('Failed to update');
    }
  };

  const adjustPoints = async (customerId, delta) => {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;
    const newPoints = Math.max(0, (customer.loyalty_points || 0) + delta);
    const newTier = newPoints >= 5000 ? 'Platinum' : newPoints >= 1500 ? 'Gold' : newPoints >= 500 ? 'Silver' : 'Bronze';
    try {
      await base44.entities.Customer.update(customerId, { loyalty_points: newPoints, loyalty_tier: newTier });
      qc.invalidateQueries(['loyalty_customers']);
      toast.success(`Points updated: ${delta > 0 ? '+' : ''}${delta}`);
    } catch (e) {
      toast.error('Failed to update points');
    }
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <Gift className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">{t('loyalty_program') || 'Loyalty Program'}</h1>
            <p className="text-xs text-muted-foreground">{customers.length} {t('customers')}</p>
          </div>
        </div>
        <Button size="sm" className="h-8 text-xs" onClick={() => setPromoDialog({ open: true, promo: null })}>
          <Plus className="w-3.5 h-3.5 mr-1" />Promo
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full grid grid-cols-3 h-9">
          <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
          <TabsTrigger value="customers" className="text-xs">Customers</TabsTrigger>
          <TabsTrigger value="promos" className="text-xs">Promos</TabsTrigger>
        </TabsList>

        {/* ── OVERVIEW ── */}
        <TabsContent value="overview" className="mt-3 space-y-3">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-2">
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Total Members</p>
                <p className="text-2xl font-black text-primary">{customers.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Avg Points</p>
                <p className="text-2xl font-black text-amber-600">{avgPoints}</p>
              </CardContent>
            </Card>
          </div>

          {/* Tier Breakdown */}
          <Card>
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm font-bold">Tier Distribution</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {Object.entries(TIER_CONFIG).map(([tierName, cfg]) => {
                const count = tierStats[tierName] || 0;
                const pct = customers.length > 0 ? Math.round((count / customers.length) * 100) : 0;
                const Icon = cfg.icon;
                return (
                  <div key={tierName} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                        <span className="text-xs font-semibold">{tierName}</span>
                        <span className="text-xs text-muted-foreground">({cfg.minPoints}+ pts)</span>
                      </div>
                      <span className="text-xs font-bold">{count} ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${cfg.bg.replace('bg-', 'bg-').replace('-100', '-400')}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Tier Rules */}
          <Card>
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm font-bold">Tier Rules</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-2">
                {Object.entries(TIER_CONFIG).map(([tierName, cfg]) => {
                  const Icon = cfg.icon;
                  return (
                    <div key={tierName} className={`flex items-center justify-between p-2.5 rounded-xl ${cfg.bg} border ${cfg.border}`}>
                      <div className="flex items-center gap-2">
                        <Icon className={`w-4 h-4 ${cfg.color}`} />
                        <div>
                          <p className={`text-xs font-bold ${cfg.color}`}>{tierName}</p>
                          <p className="text-[10px] text-muted-foreground">{cfg.minPoints}+ points</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-xs font-bold ${cfg.color}`}>{cfg.multiplier}x</p>
                        <p className="text-[10px] text-muted-foreground">multiplier</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── CUSTOMERS ── */}
        <TabsContent value="customers" className="mt-3 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customers..." className="pl-9 h-10 text-sm rounded-xl" />
          </div>
          {loadingCustomers ? (
            <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : filteredCustomers.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">{t('no_data')}</p>
            </div>
          ) : (
            filteredCustomers.map(customer => (
              <Card key={customer.id}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-base font-black ${TIER_CONFIG[customer.loyalty_tier]?.bg || 'bg-muted'} ${TIER_CONFIG[customer.loyalty_tier]?.color || ''}`}>
                      {(customer.name || 'U')[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold truncate">{customer.name || '—'}</p>
                        <TierBadge tier={customer.loyalty_tier || 'Bronze'} />
                      </div>
                      <p className="text-xs text-muted-foreground">{customer.phone || customer.email}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-black text-primary">{customer.loyalty_points || 0}</p>
                      <p className="text-[10px] text-muted-foreground">pts</p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => adjustPoints(customer.id, -50)}>-50</Button>
                    <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => adjustPoints(customer.id, 50)}>+50</Button>
                    <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => adjustPoints(customer.id, 100)}>+100</Button>
                    <Button size="sm" className="flex-1 h-7 text-xs" onClick={() => adjustPoints(customer.id, 500)}>+500</Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ── PROMOS ── */}
        <TabsContent value="promos" className="mt-3 space-y-3">
          {loadingPromos ? (
            <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : promotions.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Tag className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No promo codes yet</p>
              <Button size="sm" className="mt-3 h-8 text-xs" onClick={() => setPromoDialog({ open: true, promo: null })}>
                <Plus className="w-3.5 h-3.5 mr-1" />Create First Promo
              </Button>
            </div>
          ) : (
            promotions.map(promo => (
              <Card key={promo.id} className={`border-2 ${promo.is_active ? 'border-primary/20' : 'border-border opacity-60'}`}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-black font-mono">{promo.code}</span>
                        <Badge className={`text-[10px] ${promo.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'} border-0`}>
                          {promo.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {promo.type === 'percentage' ? `${promo.value}%` : promo.type === 'fixed' ? `${currency}${promo.value}` : 'Free Delivery'}
                        </Badge>
                      </div>
                      {promo.description && <p className="text-xs text-muted-foreground mt-0.5">{promo.description}</p>}
                      <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                        {promo.min_order_amount && <span>Min: {currency}{promo.min_order_amount}</span>}
                        {promo.max_discount && <span>Max: {currency}{promo.max_discount}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => togglePromo(promo)} className="p-1.5 rounded-lg hover:bg-muted">
                        {promo.is_active ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <CheckCircle2 className="w-4 h-4 text-muted-foreground" />}
                      </button>
                      <button onClick={() => setPromoDialog({ open: true, promo })} className="p-1.5 rounded-lg hover:bg-muted">
                        <Edit2 className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button onClick={() => deletePromo(promo.id)} className="p-1.5 rounded-lg hover:bg-red-50">
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      <PromoDialog
        open={promoDialog.open}
        onClose={() => setPromoDialog({ open: false, promo: null })}
        promo={promoDialog.promo}
        onSave={savePromo}
      />
    </div>
  );
}
