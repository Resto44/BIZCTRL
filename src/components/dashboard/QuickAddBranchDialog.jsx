import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, Loader2, MapPin, Phone, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/api/supabaseClient';
import { useTenant } from '@/lib/TenantContext';
import { useSubscription } from '@/lib/SubscriptionContext';
import { subscriptionLimitErrorMessage } from '@/lib/subscriptionLimits';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

const EMPTY_FORM = {
  name: '',
  branchCode: '',
  address: '',
  city: '',
  phone: '',
  managerName: '',
  isActive: true,
};

function readableError(error) {
  const value = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ');
  if (/BRANCH_NAME_ALREADY_EXISTS/i.test(value)) return 'Branch name already exists.';
  if (/BRANCH_CODE_ALREADY_EXISTS/i.test(value)) return 'Branch code already exists.';
  if (/BRANCH_CREATE_NOT_AUTHORIZED/i.test(value)) return 'Only an authorized Restaurant Owner or Admin can create a branch.';
  if (/BRANCH_NAME_INVALID/i.test(value)) return 'Enter a valid branch name.';
  if (/BRANCH_CODE_INVALID/i.test(value)) return 'Enter a valid branch code.';
  if (/SUBSCRIPTION_LIMIT_REACHED/i.test(value)) return subscriptionLimitErrorMessage(error, 'Your plan branch limit has been reached.');
  return error?.message || 'Unable to create branch.';
}

export default function QuickAddBranchDialog({ open, onOpenChange }) {
  const queryClient = useQueryClient();
  const { activeRestaurant, refetchRestaurants } = useTenant();
  const { usage, limits, refresh: refreshSubscription } = useSubscription();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(EMPTY_FORM);
  }, [open]);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const branchLimit = Number(limits?.branches);
  const branchUsage = Number(usage?.branches || 0);
  const isAtLimit = Number.isFinite(branchLimit) && branchLimit >= 0 && branchUsage >= branchLimit;

  const close = () => {
    if (!saving) onOpenChange(false);
  };

  const createBranch = async () => {
    const name = form.name.trim();
    if (!name) {
      toast.error('Branch Name is required.');
      return;
    }
    if (!activeRestaurant?.id) {
      toast.error('Select a restaurant before creating a branch.');
      return;
    }
    if (isAtLimit) {
      toast.error(`Your plan allows up to ${branchLimit} branches. Please upgrade your plan to add another branch.`);
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('erp_quick_create_branch', {
        p_restaurant_id: activeRestaurant.id,
        p_name: name,
        p_branch_code: form.branchCode.trim() || null,
        p_address: form.address.trim() || null,
        p_city: form.city.trim() || null,
        p_phone: form.phone.trim() || null,
        p_manager_name: form.managerName.trim() || null,
        p_is_active: form.isActive,
      });
      if (error) throw error;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['branches', activeRestaurant.id] }),
        queryClient.invalidateQueries({ queryKey: ['restaurants'] }),
        queryClient.invalidateQueries({ queryKey: ['sales-dashboard', activeRestaurant.id] }),
        refetchRestaurants(),
        refreshSubscription(),
      ]);
      toast.success('Branch created successfully.');
      onOpenChange(false);
      return data;
    } catch (error) {
      toast.error(readableError(error));
      return null;
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-lg overflow-y-auto rounded-xl p-4 sm:max-h-[calc(100dvh-3rem)] sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg"><Building2 className="h-5 w-5 text-primary" />Add Branch</DialogTitle>
          <DialogDescription>Create a branch for the currently selected restaurant. Optional details can be completed later.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="quick-branch-name">Branch Name *</Label>
            <Input id="quick-branch-name" autoFocus value={form.name} onChange={(event) => set('name', event.target.value)} disabled={saving} maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quick-branch-code">Branch Code</Label>
            <Input id="quick-branch-code" value={form.branchCode} onChange={(event) => set('branchCode', event.target.value)} disabled={saving} maxLength={80} placeholder="Optional unique code" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quick-branch-address"><MapPin className="mr-1 inline h-3.5 w-3.5" />Address</Label>
            <Input id="quick-branch-address" value={form.address} onChange={(event) => set('address', event.target.value)} disabled={saving} maxLength={500} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="quick-branch-city">City</Label>
              <Input id="quick-branch-city" value={form.city} onChange={(event) => set('city', event.target.value)} disabled={saving} maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quick-branch-phone"><Phone className="mr-1 inline h-3.5 w-3.5" />Phone</Label>
              <Input id="quick-branch-phone" inputMode="tel" value={form.phone} onChange={(event) => set('phone', event.target.value)} disabled={saving} maxLength={64} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quick-branch-manager"><UserRound className="mr-1 inline h-3.5 w-3.5" />Manager</Label>
            <Input id="quick-branch-manager" value={form.managerName} onChange={(event) => set('managerName', event.target.value)} disabled={saving} maxLength={160} />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="quick-branch-status">Status</Label>
              <p className="text-xs text-muted-foreground">{form.isActive ? 'Active and available immediately' : 'Inactive until enabled later'}</p>
            </div>
            <Switch id="quick-branch-status" checked={form.isActive} onCheckedChange={(value) => set('isActive', value)} disabled={saving} />
          </div>
          {Number.isFinite(branchLimit) && branchLimit >= 0 && (
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">Branch usage: {branchUsage} / {branchLimit}</p>
          )}
        </div>

        <DialogFooter className="sticky bottom-0 -mx-4 -mb-4 border-t bg-background p-4 sm:-mx-6 sm:-mb-6 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={close} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={createBranch} disabled={saving || !form.name.trim()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create Branch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
