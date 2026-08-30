/**
 * RestaurantManager — Tenant & Branch Management with Business Type Selection
 *
 * At tenant (restaurant) creation, the owner MUST select a Business Type:
 *   - Restaurant Mode: Menu, Recipes, Delivery, Table Service
 *   - Retail Mode: Barcode, SKU, Variants, Batch/Lot, Expiry, Serials
 *
 * The selected Business Type is stored in the `business_mode` field and
 * drives all module availability via BusinessModeContext.
 */

import React, { useState } from 'react';
import { useTenant } from '@/lib/TenantContext';
import { useRole } from '@/lib/RoleContext';
import { useSubscription } from '@/lib/SubscriptionContext';
import { subscriptionLimitErrorMessage, subscriptionLimitMessage } from '@/lib/subscriptionLimits';
import PageHeader from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, Building2, GitBranch, Star, UtensilsCrossed, ShoppingBag, AlertCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';
import BusinessTypeSelector from '@/components/shared/BusinessTypeSelector';
import { supabase } from '@/api/supabaseClient';
import { cn } from '@/lib/utils';

export default function RestaurantManager() {
  const { user } = useAuth();
  const { restaurants, activeRestaurant, setActiveRestaurant, allBranches, updateRestaurantBranches, createRestaurant, refetchRestaurants } = useTenant();
  const { role } = useRole();
  const { withinLimit, usage, limits, planName } = useSubscription();
  const queryClient = useQueryClient();

  const [showNewRestaurant, setShowNewRestaurant] = useState(false);
  const [showBranchManager, setShowBranchManager] = useState(false);
  const [restForm, setRestForm] = useState({
    name: '',
    address: '',
    currency: '$',
    business_mode: '', // REQUIRED — must be selected
  });
  const [branchForm, setBranchForm] = useState({ key: '', label: '', manager_email: '' });
  const [saving, setSaving] = useState(false);

  if (role !== 'owner') {
    return <div className="p-8 text-center text-muted-foreground">Owner access required.</div>;
  }

  const handleCreateRestaurant = async () => {
    if (!restForm.name) { toast.error('Restaurant name is required'); return; }
    if (!restForm.business_mode) { toast.error('Please select a Business Type'); return; }
    setSaving(true);
    try {
      await createRestaurant(restForm);
      // Also update the business_mode in Supabase restaurants table
      const { data: created } = await supabase
        .from('restaurants')
        .select('id')
        .eq('created_by', user?.email)
        .order('created_date', { ascending: false })
        .limit(1)
        .single();

      if (created?.id) {
        await supabase
          .from('restaurants')
          .update({ business_mode: restForm.business_mode })
          .eq('id', created.id);
      }

      setRestForm({ name: '', address: '', currency: '$', business_mode: '' });
      setShowNewRestaurant(false);
      toast.success(`${restForm.business_mode === 'retail' ? '🏪 Retail' : '🍽️ Restaurant'} business created!`);
    } catch (err) {
      toast.error('Failed to create business: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddBranch = async () => {
    if (!branchForm.label) { toast.error('Branch name is required'); return; }
    setSaving(true);
    try {
      const key = branchForm.key || branchForm.label.toLowerCase().replace(/\s+/g, '_');
      if (Number(limits?.branches || 0) > 0 && !withinLimit('branches')) {
        toast.error(subscriptionLimitMessage({
          resource: 'branches',
          used: usage?.branches,
          limit: limits?.branches,
          planName,
        }));
        return;
      }
      const updated = [...allBranches, { ...branchForm, key, is_active: true }];
      await updateRestaurantBranches(updated);
      setBranchForm({ key: '', label: '', manager_email: '' });
      setShowBranchManager(false);
      toast.success('Branch added!');
    } catch (error) {
      console.error('[RestaurantManager] branch create failed', error);
      toast.error(subscriptionLimitErrorMessage(error, 'Unable to add this branch.'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleBranch = async (branchKey) => {
    try {
      const updated = allBranches.map(b => b.key === branchKey ? { ...b, is_active: !b.is_active } : b);
      await updateRestaurantBranches(updated);
    } catch (error) {
      console.error('[RestaurantManager] branch status update failed', error);
      toast.error(error.message || 'Unable to update this branch.');
    }
  };

  const handleDeleteBranch = async (branchKey) => {
    setSaving(true);
    try {
      const updated = allBranches.filter(b => b.key !== branchKey);
      await updateRestaurantBranches(updated);
      toast.success('Branch removed!');
    } catch (error) {
      console.error('[RestaurantManager] branch delete failed', error);
      toast.error(error.message || 'Unable to remove this branch.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRestaurant = async (id) => {
    if (!window.confirm('Delete this business? This cannot be undone.')) return;
    await base44.entities.Restaurant.delete(id);
    refetchRestaurants();
    queryClient.invalidateQueries({ queryKey: ['restaurants'] });
    toast.success('Business deleted');
  };

  const getBusinessModeIcon = (mode) => {
    if (mode === 'retail') return <ShoppingBag className="w-4 h-4 text-blue-500" />;
    return <UtensilsCrossed className="w-4 h-4 text-orange-500" />;
  };

  const getBusinessModeBadge = (mode) => {
    if (mode === 'retail') return (
      <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 text-xs">
        <ShoppingBag className="w-3 h-3 mr-1" /> Retail
      </Badge>
    );
    return (
      <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 text-xs">
        <UtensilsCrossed className="w-3 h-3 mr-1" /> Restaurant
      </Badge>
    );
  };

  return (
    <div>
      <PageHeader
        title="Businesses & Branches"
        subtitle="Manage your tenants and branches. Each business has a fixed Business Type."
        action={
          restaurants.length < 15 && (
            <Button size="sm" onClick={() => setShowNewRestaurant(true)}>
              <Plus className="w-4 h-4 mr-1" /> Add Business
            </Button>
          )
        }
      />

      <div className="space-y-4">
        {restaurants.map(r => (
          <Card key={r.id} className={cn('p-4', r.id === activeRestaurant?.id && 'ring-2 ring-primary')}>
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                {getBusinessModeIcon(r.business_mode)}
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{r.name}</p>
                    {getBusinessModeBadge(r.business_mode)}
                  </div>
                  {r.address && <p className="text-xs text-muted-foreground">{r.address}</p>}
                </div>
              </div>
              <div className="flex gap-1.5 items-center">
                {r.id !== activeRestaurant?.id && (
                  <Button size="sm" variant="outline" onClick={() => setActiveRestaurant(r.id)}>
                    <Star className="w-3 h-3 mr-1" /> Select
                  </Button>
                )}
                {r.id === activeRestaurant?.id && (
                  <Badge className="bg-primary/10 text-primary text-xs">Active</Badge>
                )}
                <Button size="icon" variant="ghost" className="text-destructive h-8 w-8" onClick={() => handleDeleteRestaurant(r.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {r.id === activeRestaurant?.id && (
              <>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <GitBranch className="w-3 h-3" /> Branches
                  </p>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowBranchManager(true)}>
                    <Plus className="w-3 h-3 mr-0.5" /> Add Branch
                  </Button>
                </div>
                <div className="space-y-2">
                  {allBranches.length === 0 && <p className="text-xs text-muted-foreground italic">No branches yet</p>}
                  {allBranches.map(b => (
                    <div key={b.key} className="flex items-center justify-between bg-muted/40 rounded-lg px-3 py-2">
                      <div>
                        <p className="text-sm font-medium">{b.label}</p>
                        {b.manager_email && <p className="text-xs text-muted-foreground">{b.manager_email}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch checked={b.is_active !== false} onCheckedChange={() => handleToggleBranch(b.key)} />
                        <Button size="icon" variant="ghost" className="text-destructive h-7 w-7" onClick={() => handleDeleteBranch(b.key)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        ))}

        {restaurants.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No businesses yet.</p>
            <p className="text-sm mt-1">Add your first Restaurant or Retail business to get started.</p>
          </div>
        )}
      </div>

      {/* ── New Business Dialog ─────────────────────────────────────────────── */}
      <Dialog open={showNewRestaurant} onOpenChange={setShowNewRestaurant}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Business</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">

            {/* Business Type Selection — REQUIRED */}
            <BusinessTypeSelector
              value={restForm.business_mode}
              onChange={(mode) => setRestForm(f => ({ ...f, business_mode: mode }))}
            />

            {/* Business Details */}
            {restForm.business_mode && (
              <div className="space-y-3 pt-2 border-t border-border">
                <h4 className="text-sm font-semibold text-foreground">Business Details</h4>
                <div>
                  <Label>Business Name *</Label>
                  <Input
                    value={restForm.name}
                    onChange={e => setRestForm(f => ({ ...f, name: e.target.value }))}
                    placeholder={restForm.business_mode === 'retail' ? 'e.g. My Retail Store' : 'e.g. My Restaurant'}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Address</Label>
                  <Input
                    value={restForm.address}
                    onChange={e => setRestForm(f => ({ ...f, address: e.target.value }))}
                    placeholder="Business address"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Currency</Label>
                  <div className="flex gap-2 flex-wrap mt-1">
                    {['$', '€', '£', 'SAR', 'ر.س', 'AED', 'KWD', '؋'].map(c => (
                      <Button
                        key={c}
                        size="sm"
                        variant={restForm.currency === c ? 'default' : 'outline'}
                        onClick={() => setRestForm(f => ({ ...f, currency: c }))}
                      >
                        {c}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Warning if no mode selected */}
            {!restForm.business_mode && (
              <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/20 rounded-lg px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Please select a Business Type above to continue.</span>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                className="flex-1"
                onClick={handleCreateRestaurant}
                disabled={saving || !restForm.business_mode || !restForm.name}
              >
                {saving ? 'Creating...' : 'Create Business'}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setShowNewRestaurant(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Add Branch Dialog ───────────────────────────────────────────────── */}
      <Dialog open={showBranchManager} onOpenChange={setShowBranchManager}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Branch</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {activeRestaurant && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                {getBusinessModeIcon(activeRestaurant.business_mode)}
                <span>Branch inherits <strong>{activeRestaurant.business_mode === 'retail' ? 'Retail' : 'Restaurant'} Mode</strong> from parent business.</span>
              </div>
            )}
            <div>
              <Label>Branch Name *</Label>
              <Input
                value={branchForm.label}
                onChange={e => setBranchForm(f => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Main Branch, Downtown"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Manager Email (optional)</Label>
              <Input
                type="email"
                value={branchForm.manager_email}
                onChange={e => setBranchForm(f => ({ ...f, manager_email: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={handleAddBranch} disabled={saving || !branchForm.label}>Add Branch</Button>
              <Button variant="outline" className="flex-1" onClick={() => setShowBranchManager(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
