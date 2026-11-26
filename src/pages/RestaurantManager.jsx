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

import React, { useState, useRef } from 'react';
import { useTenant } from '@/lib/TenantContext';
import { useRole } from '@/lib/RoleContext';
import { useLanguage } from '@/lib/LanguageContext';
import { useSubscription } from '@/lib/SubscriptionContext';
import { subscriptionLimitErrorMessage, subscriptionLimitMessage } from '@/lib/subscriptionLimits';
import PageHeader from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Trash2, Building2, GitBranch, Star, UtensilsCrossed, ShoppingBag, AlertCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';
import BusinessTypeSelector from '@/components/shared/BusinessTypeSelector';
import { supabase } from '@/api/supabaseClient';
import { cn } from '@/lib/utils';

export const businessRenameCopy = lang => ({
 en:{title:'Edit business name',label:'Business name',hint:'Change the display name only. Business type, branches and existing records stay unchanged.',invalid:'Enter a name of 1–150 characters.',unavailable:'Business is no longer available. Refresh and try again.',failed:'Name change could not be confirmed.',success:'Business name updated',save:'Save name',saving:'Saving…',cancel:'Cancel'},
 ar:{title:'تعديل اسم النشاط التجاري',label:'اسم النشاط التجاري',hint:'غيّر الاسم فقط. يبقى نوع النشاط والفروع والسجلات الحالية دون تغيير.',invalid:'أدخل اسماً من 1 إلى 150 حرفاً.',unavailable:'النشاط غير متاح. حدّث الصفحة وحاول مجدداً.',failed:'تعذر تأكيد تغيير الاسم.',success:'تم تحديث اسم النشاط',save:'حفظ الاسم',saving:'جارٍ الحفظ…',cancel:'إلغاء'},
 fa:{title:'ویرایش نام کسب‌وکار',label:'نام کسب‌وکار',hint:'فقط نام تغییر می‌کند. نوع کسب‌وکار، شعبه‌ها و سوابق موجود بدون تغییر می‌مانند.',invalid:'نامی بین ۱ تا ۱۵۰ حرف وارد کنید.',unavailable:'کسب‌وکار در دسترس نیست. صفحه را تازه کنید.',failed:'تغییر نام تأیید نشد.',success:'نام کسب‌وکار به‌روزرسانی شد',save:'ذخیره نام',saving:'در حال ذخیره…',cancel:'لغو'}
}[lang] || businessRenameCopy('en'));

export default function RestaurantManager() {
  const { user } = useAuth();
  const { restaurants, activeRestaurant, setActiveRestaurant, allBranches, updateRestaurantBranches, createRestaurant, updateRestaurant, refetchRestaurants } = useTenant();
  const { role } = useRole();
  const { lang,dir } = useLanguage();
  const rename = businessRenameCopy(lang);
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
  const [editingBusiness, setEditingBusiness] = useState(null);
  const [businessName, setBusinessName] = useState('');
  const [renameError, setRenameError] = useState('');
  const [renaming, setRenaming] = useState(false);
  const renameLock = useRef(false);

  if (role !== 'owner') {
    return <div className="p-8 text-center text-muted-foreground">Owner access required.</div>;
  }

  const openRename = (business) => {
    setEditingBusiness({ id: business.id, name: business.name });
    setBusinessName(business.name || '');
    setRenameError('');
  };
  const closeRename = () => {
    if (renameLock.current) return;
    setEditingBusiness(null);
    setRenameError('');
  };
  const handleRename = async (event) => {
    event.preventDefault();
    if (renameLock.current || !editingBusiness || role !== 'owner') return;
    const name = businessName.trim();
    if (!name || name.length > 150) { setRenameError(rename.invalid); return; }
    if (!restaurants.some(r => r.id === editingBusiness.id)) { setRenameError(rename.unavailable); return; }
    if (name === editingBusiness.name) { closeRename(); return; }
    renameLock.current = true;
    setRenaming(true);
    setRenameError('');
    try {
      const result = await updateRestaurant(editingBusiness.id, { name });
      if (result?.id !== editingBusiness.id || result?.name !== name) throw Error(rename.failed);
      queryClient.setQueriesData({queryKey:['restaurants']}, old => Array.isArray(old) ? old.map(r => r.id === result.id ? {...r,name:result.name} : r) : old);
      await Promise.allSettled([
        queryClient.invalidateQueries({queryKey:['restaurants']}),
        queryClient.invalidateQueries({queryKey:['portal-identity']})
      ]);
      setEditingBusiness(null);
      toast.success(rename.success);
    } catch (err) {
      setRenameError(rename.failed + (err?.message ? ' — ' + err.message : ''));
    } finally {
      renameLock.current = false;
      setRenaming(false);
    }
  };

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
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {getBusinessModeIcon(r.business_mode)}
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold break-words min-w-0">{r.name}</p>
                    {getBusinessModeBadge(r.business_mode)}
                  </div>
                  {r.address && <p className="text-xs text-muted-foreground">{r.address}</p>}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-1 items-center">
                {r.id !== activeRestaurant?.id && (
                  <Button size="sm" variant="outline" onClick={() => setActiveRestaurant(r.id)}>
                    <Star className="w-3 h-3 mr-1" /> Select
                  </Button>
                )}
                {r.id === activeRestaurant?.id && (
                  <Badge className="bg-primary/10 text-primary text-xs">Active</Badge>
                )}
                <Button type="button" size="icon" variant="outline" className="h-10 w-10" aria-label={rename.title + ": " + r.name} title={rename.title} data-testid="edit-business-name" disabled={saving || renaming} onClick={() => openRename(r)}>
                  <Pencil className="h-4 w-4" />
                </Button>
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

      <Dialog open={!!editingBusiness} onOpenChange={open => { if (!open) closeRename(); }}>
        <DialogContent className="max-w-sm max-h-[90dvh] overflow-y-auto" dir={dir}>
          <DialogHeader>
            <DialogTitle>{rename.title}</DialogTitle>
            <DialogDescription>{rename.hint}</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleRename}>
            <div>
              <Label htmlFor="business-edit-name">{rename.label}</Label>
              <Input id="business-edit-name" className="mt-1 min-h-11" value={businessName} maxLength={150} required disabled={renaming} onChange={e => {setBusinessName(e.target.value);setRenameError('');}} />
            </div>
            {renameError && <p role="alert" className="text-sm text-destructive">{renameError}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" className="min-h-11 flex-1" disabled={renaming || !businessName.trim() || businessName.trim() === editingBusiness?.name}>{renaming ? rename.saving : rename.save}</Button>
              <Button type="button" variant="outline" className="min-h-11 flex-1" disabled={renaming} onClick={closeRename}>{rename.cancel}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

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
