import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTenant } from '@/lib/TenantContext';
import { useBranchScope } from '@/lib/BranchScopeContext';
import { buildWastePayload, normalizeWasteRecord, describeWasteError } from '@/lib/inventoryWaste';
import { toast } from 'sonner';
import { useLanguage } from '@/lib/LanguageContext';
import { format } from 'date-fns';
import PageHeader from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, Flame, AlertTriangle, BarChart2, Brain } from 'lucide-react';
import BranchSelect from '@/components/shared/BranchSelect';
import WasteCostReport from '@/components/waste/WasteCostReport';
import AIWasteAnalysis from '@/components/waste/AIWasteAnalysis';

const reasonColors = {
  expired: 'bg-amber-100 text-amber-700',
  spoiled: 'bg-orange-100 text-orange-700',
  damaged: 'bg-red-100 text-red-700',
  theft: 'bg-purple-100 text-purple-700',
  other: 'bg-muted text-muted-foreground',
};

const emptyForm = {
  date: format(new Date(), 'yyyy-MM-dd'),
  branch: '', product_id: '', product_name: '', qty: '', unit_cost: '', reason: 'expired', notes: ''
};

export default function InventoryWaste() {
  const { t, currency, lang } = useLanguage();
  const { activeRestaurant, branches } = useTenant();
  const { selectedBranchKey, isAllBranches } = useBranchScope();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saveError, setSaveError] = useState('');
  const [filterBranch, setFilterBranch] = useState('all');
  const [activeTab, setActiveTab] = useState('log'); // 'log' | 'report'

  const restaurantId = activeRestaurant?.id;

  const { data: wastes = [], isLoading } = useQuery({
    queryKey: ['inventory_waste', restaurantId],
    queryFn: async () => {
      const rows = await base44.entities.InventoryWaste.filter({ restaurant_id: restaurantId }, '-date', 500);
      return rows.map(normalizeWasteRecord);
    },
    enabled: Boolean(restaurantId),
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products', restaurantId, 'inventory-waste'],
    queryFn: () => base44.entities.Product.filter({ restaurant_id: restaurantId }, 'name', 500),
    enabled: Boolean(restaurantId),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.InventoryWaste.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory_waste'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['retail-inventory'] });
      setSaveError('');
      setShowForm(false);
      setForm(emptyForm);
      toast.success(lang === 'ar' ? 'تم تسجيل الهدر بنجاح' : lang === 'fa' ? 'ضایعات با موفقیت ثبت شد' : 'Inventory waste recorded');
    },
    onError: (error) => {
      console.error('[InventoryWaste] Save failed:', error);
      const message = describeWasteError(error, lang);
      setSaveError(message);
      toast.error(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.InventoryWaste.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory_waste'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (error) => toast.error(describeWasteError(error, lang)),
  });

  const openForm = () => {
    setSaveError('');
    setForm({ ...emptyForm, date: format(new Date(), 'yyyy-MM-dd'), branch: isAllBranches ? (branches.length === 1 ? branches[0].key : '') : (selectedBranchKey || '') });
    setShowForm(true);
  };

  const handleProductChange = (productId) => {
    const p = products.find(x => String(x.product_id || x.id) === productId);
    setSaveError('');
    setForm(f => ({ ...f, product_id: productId, product_name: p?.name || '', unit_cost: p?.default_cost ?? p?.purchase_cost ?? 0, unit: p?.unit || '' }));
  };

  const handleSubmit = () => {
    if (createMutation.isPending) return;
    setSaveError('');
    try {
      const branch = branches.find(b => b.key === form.branch && b.id && b.restaurant_id === restaurantId);
      const product = products.find(p => String(p.product_id || p.id) === form.product_id);
      const payload = buildWastePayload({ form, restaurantId, branch, product });
      createMutation.mutate(payload);
    } catch (error) {
      setSaveError(error.message);
    }
  };

  const filtered = useMemo(() =>
    filterBranch === 'all' ? wastes : wastes.filter(w => w.branch === filterBranch),
    [wastes, filterBranch]
  );

  const totalLoss = filtered.reduce((s, w) => s + (w.total_loss || 0), 0);

  return (
    <div>
      <PageHeader
        title="Inventory Waste"
        action={<Button size="sm" onClick={openForm}><Plus className="w-4 h-4 mr-1" /> Log Waste</Button>}
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-muted rounded-lg p-1">
        <button
          onClick={() => setActiveTab('log')}
          className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-1.5 ${activeTab === 'log' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
        >
          <Flame className="w-3.5 h-3.5" /> Waste Log
        </button>
        <button
          onClick={() => setActiveTab('report')}
          className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-1.5 ${activeTab === 'report' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
        >
          <BarChart2 className="w-3.5 h-3.5" /> Cost Report
        </button>
        <button
          onClick={() => setActiveTab('ai')}
          className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-1.5 ${activeTab === 'ai' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
        >
          <Brain className="w-3.5 h-3.5" /> AI Analysis
        </button>
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-3 mb-4">
        <BranchSelect value={filterBranch} onChange={setFilterBranch} includeAll />
        <Card className="flex-1 p-3 flex items-center gap-2 bg-red-50 border-red-200">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          <div>
            <p className="text-xs text-red-600 font-medium">Total Loss</p>
            <p className="text-sm font-bold text-red-700">{currency}{totalLoss.toFixed(2)}</p>
          </div>
        </Card>
      </div>

      {activeTab === 'ai' ? (
        <AIWasteAnalysis />
      ) : activeTab === 'report' ? (
        <WasteCostReport wastes={filtered} currency={currency} />
      ) : (
        <div className="space-y-3">
          {isLoading ? (
            <p className="text-center text-muted-foreground py-10">Loading...</p>
          ) : filtered.length === 0 ? (
            <div className="text-center text-muted-foreground py-16">
              <Flame className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No waste records</p>
            </div>
          ) : (
            filtered.map(w => (
              <Card key={w.id} className="p-3 flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium text-sm">{w.product_name}</p>
                    <Badge className={`text-xs ${reasonColors[w.reason]}`}>{w.reason}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{w.branch} · {w.date}</p>
                  <p className="text-xs text-muted-foreground">Qty: {w.qty} {w.unit} · Loss: {currency}{Number(w.total_loss || 0).toFixed(2)}</p>
                  {w.notes && <p className="text-xs text-muted-foreground italic mt-1">{w.notes}</p>}
                </div>
                <Button size="icon" variant="ghost" className="text-destructive shrink-0" onClick={() => deleteMutation.mutate(w.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Log Waste Form Dialog */}
      <Dialog open={showForm} onOpenChange={open => { if (!createMutation.isPending) setShowForm(open); }}>
        <DialogContent className="max-w-sm max-h-[calc(100dvh-3rem)] overflow-y-auto">
          <DialogHeader><DialogTitle>Log Inventory Waste</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Date</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
            <div><Label>Branch</Label><BranchSelect value={form.branch} onChange={v => { setSaveError(''); setForm(f => ({ ...f, branch: v })); }} /></div>
            <div>
              <Label>Product</Label>
              <Select value={form.product_id} onValueChange={handleProductChange}>
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>
                  {products.filter(p => p.product_id || p.id).map(p => <SelectItem key={p.id} value={String(p.product_id || p.id)}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Quantity</Label><Input type="number" value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} /></div>
              <div><Label>Unit Cost</Label><Input type="number" value={form.unit_cost} onChange={e => setForm(f => ({ ...f, unit_cost: e.target.value }))} /></div>
            </div>
            <div>
              <Label>Reason</Label>
              <Select value={form.reason} onValueChange={v => setForm(f => ({ ...f, reason: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['expired', 'spoiled', 'damaged', 'theft', 'other'].map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Notes (optional)</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
            {form.qty && form.unit_cost && (
              <p className="text-sm font-semibold text-red-600">
                Total Loss: {currency}{(parseFloat(form.qty) * parseFloat(form.unit_cost)).toFixed(2)}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              ⚠️ Logging waste will automatically reduce this product's stock level.
            </p>
            {saveError && <p role="alert" className="text-sm text-red-600 rounded-md bg-red-50 p-2">{saveError}</p>}
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={handleSubmit} disabled={createMutation.isPending || !restaurantId}>
                {createMutation.isPending ? (lang === 'ar' ? 'جارٍ الحفظ…' : lang === 'fa' ? 'در حال ذخیره…' : 'Saving…') : (lang === 'ar' ? 'حفظ' : lang === 'fa' ? 'ذخیره' : 'Save')}
              </Button>
              <Button variant="outline" className="flex-1" disabled={createMutation.isPending} onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}