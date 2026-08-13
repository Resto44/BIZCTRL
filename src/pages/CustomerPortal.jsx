import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { useAuth } from '@/lib/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  User, MapPin, Star, Phone, Mail, Edit2, Plus, Trash2,
  Home, Briefcase, Award, Gift, Check,
  Crown, Shield, Zap
} from 'lucide-react';
import { toast } from 'sonner';

const TIER_CONFIG = {
  Bronze:   { icon: Award,  color: 'text-amber-700',   bg: 'bg-amber-100',   border: 'border-amber-300',   points: 0    },
  Silver:   { icon: Star,   color: 'text-slate-500',   bg: 'bg-slate-100',   border: 'border-slate-300',   points: 500  },
  Gold:     { icon: Crown,  color: 'text-yellow-600',  bg: 'bg-yellow-100',  border: 'border-yellow-300',  points: 1500 },
  Platinum: { icon: Shield, color: 'text-purple-600',  bg: 'bg-purple-100',  border: 'border-purple-300',  points: 5000 },
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

function AddressCard({ address, onEdit, onDelete, onSetDefault }) {
  const { t } = useLanguage();
  const icons = { Home: Home, Work: Briefcase };
  const Icon = icons[address.label] || MapPin;
  return (
    <div className={`p-3 rounded-xl border-2 ${address.is_default ? 'border-primary bg-primary/5' : 'border-border'} transition-all`}>
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${address.is_default ? 'bg-primary text-white' : 'bg-muted'}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">{address.label || t('address')}</p>
            {address.is_default && <Badge className="text-[10px] h-4 px-1 bg-primary/10 text-primary border-0">{t('default')}</Badge>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{address.address_line1}</p>
          {address.city && <p className="text-xs text-muted-foreground">{address.city}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!address.is_default && (
            <button onClick={() => onSetDefault(address.id)} className="p-1.5 rounded-lg hover:bg-muted">
              <Check className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
          <button onClick={() => onEdit(address)} className="p-1.5 rounded-lg hover:bg-muted">
            <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <button onClick={() => onDelete(address.id)} className="p-1.5 rounded-lg hover:bg-red-50">
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
          </button>
        </div>
      </div>
    </div>
  );
}

function AddressDialog({ open, onClose, address, onSave }) {
  const { t } = useLanguage();
  const [form, setForm] = useState({ label: 'Home', address_line1: '', address_line2: '', city: '' });

  useEffect(() => {
    if (address) setForm({ label: address.label || 'Home', address_line1: address.address_line1 || '', address_line2: address.address_line2 || '', city: address.city || '' });
    else setForm({ label: 'Home', address_line1: '', address_line2: '', city: '' });
  }, [address, open]);

  const handleSave = () => {
    if (!form.address_line1) { toast.error(t('address') + ' ' + t('required')); return; }
    onSave(form);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm mx-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">{address ? t('edit') : t('add')} {t('address')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div>
            <Label className="text-xs">{t('type')}</Label>
            <div className="flex gap-2 mt-1">
              {['Home', 'Work', 'Other'].map(l => (
                <button key={l} onClick={() => setForm(f => ({ ...f, label: l }))}
                  className={`flex-1 py-1.5 text-xs rounded-lg border font-medium transition-all ${form.label === l ? 'bg-primary text-white border-primary' : 'border-border'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs">{t('address')} *</Label>
            <Input className="mt-1 h-9 text-sm" value={form.address_line1} onChange={e => setForm(f => ({ ...f, address_line1: e.target.value }))} placeholder="Street, Building..." />
          </div>
          <div>
            <Label className="text-xs">{t('address')} 2</Label>
            <Input className="mt-1 h-9 text-sm" value={form.address_line2} onChange={e => setForm(f => ({ ...f, address_line2: e.target.value }))} placeholder="Apartment, Floor..." />
          </div>
          <div>
            <Label className="text-xs">{t('city')}</Label>
            <Input className="mt-1 h-9 text-sm" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="City" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1 h-9" onClick={onClose}>{t('cancel')}</Button>
            <Button className="flex-1 h-9" onClick={handleSave}>{t('save')}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function CustomerPortal() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { ownerFilter } = useTenant();
  const qc = useQueryClient();
  const [tab, setTab] = useState('profile');
  const [editProfile, setEditProfile] = useState(false);
  const [addressDialog, setAddressDialog] = useState({ open: false, address: null });
  const [profileForm, setProfileForm] = useState({ name: '', phone: '', email: '' });

  // Load customer record
  const { data: customer, isLoading } = useQuery({
    queryKey: ['customer_profile', user?.email],
    queryFn: async () => {
      const results = await base44.entities.Customer.filter({ email: user?.email }, '-created_date', 1);
      return results?.[0] || null;
    },
    enabled: !!user?.email,
  });

  // Load customer addresses
  const { data: addresses = [] } = useQuery({
    queryKey: ['customer_addresses', customer?.id],
    queryFn: () => base44.entities.CustomerAddress.filter({ customer_id: customer.id }, '-created_at', 20),
    enabled: !!customer?.id,
  });

  useEffect(() => {
    if (customer) {
      setProfileForm({ name: customer.name || '', phone: customer.phone || '', email: customer.email || '' });
    } else if (user) {
      setProfileForm({ name: user.full_name || '', phone: '', email: user.email || '' });
    }
  }, [customer, user]);

  const saveProfile = async () => {
    try {
      if (customer?.id) {
        await base44.entities.Customer.update(customer.id, profileForm);
      } else {
        await base44.entities.Customer.create({ ...profileForm, loyalty_points: 0, loyalty_tier: 'Bronze', wallet_balance: 0 });
      }
      qc.invalidateQueries(['customer_profile']);
      setEditProfile(false);
      toast.success(t('save') + ' ✓');
    } catch (e) {
      toast.error('Failed to save profile');
    }
  };

  const saveAddress = async (form) => {
    try {
      if (addressDialog.address?.id) {
        await base44.entities.CustomerAddress.update(addressDialog.address.id, form);
      } else {
        await base44.entities.CustomerAddress.create({ ...form, customer_id: customer.id });
      }
      qc.invalidateQueries(['customer_addresses']);
      toast.success(t('save') + ' ✓');
    } catch (e) {
      toast.error('Failed to save address');
    }
  };

  const deleteAddress = async (id) => {
    try {
      await base44.entities.CustomerAddress.delete(id);
      qc.invalidateQueries(['customer_addresses']);
      toast.success(t('delete') + ' ✓');
    } catch (e) {
      toast.error('Failed to delete address');
    }
  };

  const setDefaultAddress = async (id) => {
    try {
      // Unset all defaults
      for (const addr of addresses) {
        if (addr.is_default) await base44.entities.CustomerAddress.update(addr.id, { is_default: false });
      }
      await base44.entities.CustomerAddress.update(id, { is_default: true });
      qc.invalidateQueries(['customer_addresses']);
      toast.success('Default address updated');
    } catch (e) {
      toast.error('Failed to update default address');
    }
  };

  const tier = customer?.loyalty_tier || 'Bronze';
  const tierCfg = TIER_CONFIG[tier] || TIER_CONFIG.Bronze;
  const nextTier = Object.keys(TIER_CONFIG).find(k => TIER_CONFIG[k].points > (customer?.loyalty_points || 0));
  const nextTierPoints = nextTier ? TIER_CONFIG[nextTier].points : null;
  const progressPct = nextTierPoints ? Math.min(100, Math.round(((customer?.loyalty_points || 0) / nextTierPoints) * 100)) : 100;

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-xl font-bold">{t('customer_portal') || 'My Account'}</h1>
          <p className="text-xs text-muted-foreground">{customer?.email || user?.email}</p>
        </div>
        <TierBadge tier={tier} />
      </div>

      {/* Profile Card */}
      <Card className="overflow-hidden">
        <div className={`h-2 ${tier === 'Platinum' ? 'bg-purple-500' : tier === 'Gold' ? 'bg-yellow-500' : tier === 'Silver' ? 'bg-slate-400' : 'bg-amber-600'}`} />
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-black ${tierCfg.bg} ${tierCfg.color}`}>
              {(customer?.name || user?.full_name || 'U')[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-base">{customer?.name || user?.full_name || t('customer')}</p>
              <p className="text-xs text-muted-foreground">{customer?.phone || t('phone')}</p>
              <div className="flex items-center gap-2 mt-1">
                <TierBadge tier={tier} />
                <span className="text-xs text-muted-foreground">{customer?.loyalty_points || 0} pts</span>
              </div>
            </div>
            <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => setEditProfile(true)}>
              <Edit2 className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* Loyalty Progress */}
          {nextTier && (
            <div className="mt-3 pt-3 border-t border-border">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">{t('loyalty_progress') || 'Progress to'} {nextTier}</span>
                <span className="text-xs font-semibold">{customer?.loyalty_points || 0} / {nextTierPoints} pts</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full grid grid-cols-3 h-9">
          <TabsTrigger value="profile" className="text-xs"><User className="w-3 h-3" /></TabsTrigger>
          <TabsTrigger value="addresses" className="text-xs"><MapPin className="w-3 h-3" /></TabsTrigger>
          <TabsTrigger value="loyalty" className="text-xs"><Gift className="w-3 h-3" /></TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="mt-3 space-y-3">
          {editProfile ? (
            <Card>
              <CardContent className="p-4 space-y-3">
                <div>
                  <Label className="text-xs">{t('name')}</Label>
                  <Input className="mt-1 h-9 text-sm" value={profileForm.name} onChange={e => setProfileForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">{t('phone')}</Label>
                  <Input className="mt-1 h-9 text-sm" value={profileForm.phone} onChange={e => setProfileForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">{t('email')}</Label>
                  <Input className="mt-1 h-9 text-sm" value={profileForm.email} onChange={e => setProfileForm(f => ({ ...f, email: e.target.value }))} disabled />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 h-9" onClick={() => setEditProfile(false)}>{t('cancel')}</Button>
                  <Button className="flex-1 h-9" onClick={saveProfile}>{t('save')}</Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-4 space-y-3">
                {[
                  { icon: User, label: t('name'), value: customer?.name || user?.full_name },
                  { icon: Phone, label: t('phone'), value: customer?.phone },
                  { icon: Mail, label: t('email'), value: customer?.email || user?.email },
                ].map(row => (
                  <div key={row.label} className="flex items-center gap-3 py-1.5 border-b border-border last:border-0">
                    <row.icon className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-muted-foreground">{row.label}</p>
                      <p className="text-sm font-medium truncate">{row.value || '—'}</p>
                    </div>
                  </div>
                ))}
                <Button className="w-full h-9 mt-2" onClick={() => setEditProfile(true)}>
                  <Edit2 className="w-3.5 h-3.5 mr-1.5" />{t('edit')} {t('profile') || 'Profile'}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Wallet */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{t('wallet_balance') || 'Wallet Balance'}</p>
                  <p className="text-2xl font-black text-primary">{customer?.wallet_balance?.toFixed(2) || '0.00'}</p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Zap className="w-6 h-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Addresses Tab */}
        <TabsContent value="addresses" className="mt-3 space-y-3">
          {addresses.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <MapPin className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">{t('no_data')}</p>
            </div>
          ) : (
            addresses.map(addr => (
              <AddressCard
                key={addr.id}
                address={addr}
                onEdit={a => setAddressDialog({ open: true, address: a })}
                onDelete={deleteAddress}
                onSetDefault={setDefaultAddress}
              />
            ))
          )}
          {customer?.id && (
            <Button className="w-full h-10" variant="outline" onClick={() => setAddressDialog({ open: true, address: null })}>
              <Plus className="w-4 h-4 mr-1.5" />{t('add')} {t('address')}
            </Button>
          )}
        </TabsContent>

        {/* Loyalty Tab */}
        <TabsContent value="loyalty" className="mt-3 space-y-3">
          {/* Tier Cards */}
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(TIER_CONFIG).map(([tierName, cfg]) => {
              const Icon = cfg.icon;
              const isActive = tier === tierName;
              return (
                <div key={tierName} className={`p-3 rounded-xl border-2 ${isActive ? `${cfg.border} ${cfg.bg}` : 'border-border bg-muted/30'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={`w-4 h-4 ${isActive ? cfg.color : 'text-muted-foreground'}`} />
                    <span className={`text-sm font-bold ${isActive ? cfg.color : 'text-muted-foreground'}`}>{tierName}</span>
                    {isActive && <Badge className="text-[9px] h-3.5 px-1 bg-primary text-white ml-auto">Active</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{cfg.points}+ pts</p>
                </div>
              );
            })}
          </div>

          {/* Points Summary */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold">{t('loyalty_points') || 'Loyalty Points'}</p>
                <p className="text-2xl font-black text-primary">{customer?.loyalty_points || 0}</p>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{t('current_tier') || 'Current Tier'}</span>
                  <TierBadge tier={tier} />
                </div>
                {nextTier && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{t('next_tier') || 'Next Tier'}</span>
                    <span className="font-semibold">{nextTierPoints - (customer?.loyalty_points || 0)} pts needed</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AddressDialog
        open={addressDialog.open}
        onClose={() => setAddressDialog({ open: false, address: null })}
        address={addressDialog.address}
        onSave={saveAddress}
      />
    </div>
  );
}
