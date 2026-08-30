/**
 * Loyalty Program V2 — Online Ordering V2
 * Smart Restaurant ERP — Integrated Module
 * Points, cashback, VIP tiers, referrals, redemption rules.
 */
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTenant } from '@/lib/TenantContext';
import { useAuth } from '@/lib/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  Award, Gift,
  RefreshCw, Search, Zap
} from 'lucide-react';

// ── VIP Tier Config ────────────────────────────────────────────────────────
const VIP_TIERS = [
  { id: 'bronze',   label: 'Bronze',   minPoints: 0,    color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200', icon: '🥉' },
  { id: 'silver',   label: 'Silver',   minPoints: 500,  color: 'text-slate-500',  bg: 'bg-slate-50',  border: 'border-slate-200', icon: '🥈' },
  { id: 'gold',     label: 'Gold',     minPoints: 1500, color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200', icon: '🥇' },
  { id: 'platinum', label: 'Platinum', minPoints: 5000, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200', icon: '💎' },
  { id: 'vip',      label: 'VIP',      minPoints: 15000, color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200', icon: '👑' },
];

function getTier(points) {
  return [...VIP_TIERS].reverse().find(t => points >= t.minPoints) || VIP_TIERS[0];
}

// ── Customer Loyalty Card ──────────────────────────────────────────────────
function CustomerLoyaltyCard({ customer, onAdjustPoints }) {
  const tier = getTier(customer.loyalty_points || 0);
  const nextTier = VIP_TIERS.find(t => t.minPoints > (customer.loyalty_points || 0));
  const progressToNext = nextTier
    ? ((customer.loyalty_points || 0) - tier.minPoints) / (nextTier.minPoints - tier.minPoints) * 100
    : 100;

  return (
    <Card className={`${tier.border} border-2`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="font-bold">{customer.name}</p>
            <p className="text-xs text-muted-foreground">{customer.phone}</p>
          </div>
          <div className={`flex items-center gap-1 px-2 py-1 rounded-full ${tier.bg} ${tier.color} text-xs font-bold`}>
            <span>{tier.icon}</span>
            {tier.label}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="text-center p-2 bg-muted/50 rounded-lg">
            <p className="text-xl font-bold text-primary">{customer.loyalty_points || 0}</p>
            <p className="text-xs text-muted-foreground">Points</p>
          </div>
          <div className="text-center p-2 bg-muted/50 rounded-lg">
            <p className="text-xl font-bold text-green-600">{(customer.cashback_wallet || 0).toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Wallet (SAR)</p>
          </div>
        </div>

        {nextTier && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{tier.label}</span>
              <span>{nextTier.label} ({nextTier.minPoints - (customer.loyalty_points || 0)} pts away)</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${progressToNext}%` }} />
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-3">
          <Button size="sm" variant="outline" onClick={() => onAdjustPoints(customer, 'add')}>
            <Zap className="w-3.5 h-3.5 mr-1" /> Add Points
          </Button>
          <Button size="sm" variant="outline" onClick={() => onAdjustPoints(customer, 'redeem')}>
            <Gift className="w-3.5 h-3.5 mr-1" /> Redeem
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Loyalty Program V2 ────────────────────────────────────────────────
export default function LoyaltyProgramV2() {
  const { user } = useAuth?.() || {};
  const { restaurant } = useTenant?.() || {};
  const qc = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [adjustTarget, setAdjustTarget] = useState(null);
  const [adjustType, setAdjustType] = useState('add');
  const [adjustAmount, setAdjustAmount] = useState(0);

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['loyalty_customers', restaurant?.id],
    queryFn: () => base44.entities.Customer.filter({ restaurant_id: restaurant?.id }),
    enabled: !!restaurant?.id,
  });

  const { data: loyaltyTxns = [] } = useQuery({
    queryKey: ['loyalty_transactions', restaurant?.id],
    queryFn: () => base44.entities.LoyaltyTransaction.filter({ restaurant_id: restaurant?.id }),
    enabled: !!restaurant?.id,
  });

  const adjustMutation = useMutation({
    mutationFn: async ({ customer, type, amount }) => {
      const newPoints = type === 'add'
        ? (customer.loyalty_points || 0) + amount
        : Math.max(0, (customer.loyalty_points || 0) - amount);
      await base44.entities.Customer.update(customer.id, { loyalty_points: newPoints });
      await base44.entities.LoyaltyTransaction.create({
        customer_id: customer.id,
        type: type === 'add' ? 'bonus' : 'redeemed',
        points: type === 'add' ? amount : -amount,
        description: `Manual adjustment by ${user?.email}`,
        created_at: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loyalty_customers'] });
      qc.invalidateQueries({ queryKey: ['loyalty_transactions'] });
      toast.success('Points adjusted');
      setAdjustTarget(null);
      setAdjustAmount(0);
    },
    onError: () => toast.error('Failed to adjust points'),
  });

  const filteredCustomers = useMemo(() => {
    if (!searchQuery) return customers;
    const q = searchQuery.toLowerCase();
    return customers.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(q) ||
      (c.email || '').toLowerCase().includes(q)
    );
  }, [customers, searchQuery]);

  // Stats
  const totalPoints = customers.reduce((s, c) => s + (c.loyalty_points || 0), 0);
  const totalWallet = customers.reduce((s, c) => s + (c.cashback_wallet || 0), 0);
  const vipCustomers = customers.filter(c => getTier(c.loyalty_points || 0).id !== 'bronze').length;
  const tierBreakdown = VIP_TIERS.map(tier => ({
    ...tier,
    count: customers.filter(c => getTier(c.loyalty_points || 0).id === tier.id).length,
  }));

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Award className="w-6 h-6 text-primary" />
            Loyalty Program V2
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Manage points, cashback, VIP tiers, and referrals</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">{customers.length}</p>
            <p className="text-xs text-muted-foreground">Total Members</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{totalPoints.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Total Points</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{totalWallet.toFixed(0)} SAR</p>
            <p className="text-xs text-muted-foreground">Wallet Balance</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-purple-600">{vipCustomers}</p>
            <p className="text-xs text-muted-foreground">VIP+ Members</p>
          </CardContent>
        </Card>
      </div>

      {/* Tier Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">VIP Tier Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 flex-wrap">
            {tierBreakdown.map(tier => (
              <div key={tier.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg ${tier.bg} ${tier.border} border`}>
                <span className="text-lg">{tier.icon}</span>
                <div>
                  <p className={`text-sm font-bold ${tier.color}`}>{tier.label}</p>
                  <p className="text-xs text-muted-foreground">{tier.count} members</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="space-y-4 mt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search customers..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <RefreshCw className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCustomers.map(customer => (
                <CustomerLoyaltyCard
                  key={customer.id}
                  customer={customer}
                  onAdjustPoints={(c, type) => { setAdjustTarget(c); setAdjustType(type); }}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="transactions" className="mt-4">
          <div className="space-y-2">
            {loyaltyTxns.slice(0, 50).map(txn => (
              <div key={txn.id} className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <p className="text-sm font-medium">{txn.description || txn.type}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(txn.created_at), 'MMM d, HH:mm')}</p>
                </div>
                <span className={`font-bold text-sm ${txn.points > 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {txn.points > 0 ? '+' : ''}{txn.points} pts
                </span>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Adjust Points Dialog */}
      {adjustTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <Card className="w-80">
            <CardHeader>
              <CardTitle className="text-base">
                {adjustType === 'add' ? 'Add Points' : 'Redeem Points'} — {adjustTarget.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Current Points: {adjustTarget.loyalty_points || 0}</p>
                <Input
                  type="number"
                  placeholder="Points amount"
                  value={adjustAmount}
                  onChange={e => setAdjustAmount(parseInt(e.target.value) || 0)}
                  min="1"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setAdjustTarget(null)}>Cancel</Button>
                <Button
                  className="flex-1"
                  onClick={() => adjustMutation.mutate({ customer: adjustTarget, type: adjustType, amount: adjustAmount })}
                  disabled={adjustAmount <= 0 || adjustMutation.isPending}
                >
                  {adjustMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Confirm'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
