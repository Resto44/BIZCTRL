import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import PageHeader from '@/components/shared/PageHeader';
import BranchSelect from '@/components/shared/BranchSelect';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, Plus, Package, Pencil, MessageSquare, Bell } from 'lucide-react';
import { format } from 'date-fns';
import { computeLiveStock, sendWhatsAppAlert, groupLowStockByBranch } from '@/lib/stockEngine';
import { useTenant } from '@/lib/TenantContext';
import { useBranchScope } from '@/lib/BranchScopeContext';
import { useNotify } from '@/lib/useNotify';


const ui = {
  en: { inventory: 'Inventory', add_item: 'Add Item', opening_stock: 'Opening Stock', low_threshold: 'Low Stock Alert', edit_item: 'Edit Item', save: 'Save', cancel: 'Cancel', product: 'Product', branch: 'Branch', unit: 'Unit', low_stock: 'Low Stock', ok: 'OK', date: 'Date' },
  ar: { inventory: 'المخزون', add_item: 'إضافة صنف', opening_stock: 'المخزون الافتتاحي', low_threshold: 'تنبيه نقص المخزون', edit_item: 'تعديل الصنف', save: 'حفظ', cancel: 'إلغاء', product: 'المنتج', branch: 'الفرع', unit: 'الوحدة', low_stock: 'مخزون منخفض', ok: 'جيد', date: 'التاريخ' },
  fa: { inventory: 'انبار', add_item: 'افزودن آیتم', opening_stock: 'موجودی اولیه', low_threshold: 'هشدار کمبود موجودی', edit_item: 'ویرایش آیتم', save: 'ذخیره', cancel: 'لغو', product: 'محصول', branch: 'فرع', unit: 'واحد', low_stock: 'موجودی کم', ok: 'خوب', date: 'تاریخ' },
};

const emptyForm = { product_id: '', product_name: '', branch: '', unit: 'kg', opening_stock: 0, low_stock_threshold: 5, date: format(new Date(), 'yyyy-MM-dd') };

export default function Inventory() {
  const { lang } = useLanguage();
  const { branches, ownerFilter, activeRestaurant } = useTenant();
  const { selectedBranchId, selectedBranchKey, isAllBranches, setSelectedBranchId } = useBranchScope();
  const m = ui[lang] || ui.en;
  const qc = useQueryClient();
  const notif = useNotify();
  const branchFilter = isAllBranches ? 'all' : (selectedBranchKey || 'all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const [managerPhone, setManagerPhone] = useState('');
  const [showAlertSetup, setShowAlertSetup] = useState(false);

  const fetchScopedRows = async (table, legacyColumn = 'branch') => {
    if (!activeRestaurant?.id) return [];
    const baseQuery = () => supabase.from(table).select('*')
      .eq('restaurant_id', activeRestaurant.id)
      .order('date', { ascending: false })
      .limit(2000);
    if (isAllBranches) {
      const { data, error } = await baseQuery();
      if (error) throw error;
      return data || [];
    }
    if (!selectedBranchId || !selectedBranchKey) return [];
    const [canonical, legacy] = await Promise.all([
      baseQuery().eq('branch_id', selectedBranchId),
      baseQuery().is('branch_id', null).eq(legacyColumn, selectedBranchKey),
    ]);
    if (canonical.error || legacy.error) throw canonical.error || legacy.error;
    return Array.from(new Map([...(canonical.data || []), ...(legacy.data || [])]
      .map((record) => [record.id, record])).values());
  };
  const { data: items = [] } = useQuery({
    queryKey: ['inventory', activeRestaurant?.id, selectedBranchId],
    queryFn: () => fetchScopedRows('inventory'), staleTime: 120000,
    enabled: Boolean(activeRestaurant?.id),
  });
  const { data: products = [] } = useQuery({
    queryKey: ['products', activeRestaurant?.id, selectedBranchId],
    queryFn: () => base44.entities.Product.filter({ restaurant_id: activeRestaurant.id }, 'name', 500),
    enabled: Boolean(activeRestaurant?.id),
  });
  const { data: purchases = [] } = useQuery({
    queryKey: ['purchases', activeRestaurant?.id, selectedBranchId],
    queryFn: () => fetchScopedRows('purchases'), staleTime: 120000,
    enabled: Boolean(activeRestaurant?.id),
  });
  const { data: wastage = [] } = useQuery({
    queryKey: ['inventory_waste', activeRestaurant?.id, selectedBranchId],
    queryFn: () => fetchScopedRows('inventory_waste'), staleTime: 120000,
    enabled: Boolean(activeRestaurant?.id),
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (!data.product_id || !data.branch) {
        throw new Error('Product and Branch are required');
      }
      if (data.opening_stock < 0 || data.low_stock_threshold < 0) {
        throw new Error('Stock values cannot be negative');
      }
      
      const res = editing 
        ? await base44.entities.Inventory.update(editing.id, data) 
        : await base44.entities.Inventory.create({
          ...data,
          restaurant_id: activeRestaurant?.id,
          branch_id: data.branch_id || (selectedBranchId === 'all' ? null : selectedBranchId),
        });
      
      // Check if current stock is low and notify
      const updatedLiveStock = computeLiveStock([res], [], []);
      const item = updatedLiveStock[0];
      if (item && item.currentStock <= item.low_stock_threshold) {
        await notif.lowStock({
          branch: res.branch,
          productName: res.product_name,
          currentQty: item.currentStock,
          unit: res.unit
        });
      }
      return res;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); closeForm(); },
    onError: (err) => {
      console.error('[Inventory] Save error:', err);
      alert(err.message || 'Failed to save inventory item');
    },
  });

  const openAdd = () => {
    setEditing(null);
    setForm({
      ...emptyForm,
      branch: isAllBranches ? '' : (selectedBranchKey || ''),
      branch_id: isAllBranches ? null : selectedBranchId,
    });
    setShowForm(true);
  };
  const openEdit = (item) => { setEditing(item); setForm({ ...item }); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditing(null); };

  // Compute live stock using stockEngine (includes waste deduction)
  const liveStock = useMemo(() => computeLiveStock(items, purchases, wastage), [items, purchases, wastage]);
  const lowStockByBranch = useMemo(() => groupLowStockByBranch(liveStock), [liveStock]);
  const totalLow = liveStock.filter(i => i.isLow).length;

  const filtered = useMemo(() =>
    liveStock,
    [liveStock]
  );

  const branchLabel = (key) => branches.find(b => b.key === key)?.label || key;

  return (
    <div>
      <PageHeader
        title={m.inventory}
        action={
          <div className="flex gap-2">
            {totalLow > 0 && (
              <Button size="sm" variant="outline" className="gap-1 text-amber-600 border-amber-300" onClick={() => setShowAlertSetup(true)}>
                <Bell className="w-4 h-4" />{totalLow}
              </Button>
            )}
            <Button size="sm" onClick={openAdd} className="gap-1"><Plus className="w-4 h-4" />{m.add_item}</Button>
          </div>
        }
      />

      <div className="mb-4">
        <BranchSelect
          value={branchFilter}
          onChange={(branchKey) => setSelectedBranchId(
            branchKey === 'all' ? 'all' : branches.find((branch) => (branch.key || branch.branch_key) === branchKey)?.id || 'all'
          )}
          includeAll
        />
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-10 text-muted-foreground">
            <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">{lang === 'ar' ? 'لا توجد بيانات مخزون' : lang === 'fa' ? 'داده انباری وجود ندارد' : 'No inventory records'}</p>
          </div>
        )}
        {filtered.map((item) => (
          <Card key={`${item.product_id}_${item.branch}`} className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${item.isLow ? 'bg-red-50' : 'bg-secondary'}`}>
                  {item.isLow ? <AlertTriangle className="w-5 h-5 text-red-500" /> : <Package className="w-5 h-5 text-muted-foreground" />}
                </div>
                <div>
                  <p className="font-medium text-sm">{item.product_name || item.product_id}</p>
                  <p className="text-xs text-muted-foreground">{branchLabel(item.branch)} · {item.unit}</p>
                  {item.wastedQty > 0 && <p className="text-xs text-orange-500">−{item.wastedQty} wasted</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-end">
                  <p className={`font-bold text-sm ${item.isLow ? 'text-red-500' : 'text-emerald-600'}`}>{item.currentStock?.toFixed(1) ?? item.opening_stock}</p>
                  <Badge variant={item.isLow ? 'destructive' : 'secondary'} className="text-[10px]">
                    {item.isLow ? m.low_stock : m.ok}
                  </Badge>
                </div>
                <Button size="icon" variant="ghost" onClick={() => openEdit(item)}><Pencil className="w-4 h-4" /></Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* WhatsApp Alert Setup */}
      <Dialog open={showAlertSetup} onOpenChange={setShowAlertSetup}>
        <DialogContent>
          <DialogHeader><DialogTitle>Send Low-Stock Alerts</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{totalLow} items are at or below minimum threshold. Send WhatsApp alerts to managers per branch.</p>
            <div>
              <Label className="text-xs">Manager WhatsApp Number</Label>
              <Input value={managerPhone} onChange={e => setManagerPhone(e.target.value)} placeholder="+1234567890" />
            </div>
            <div className="space-y-2">
              {Object.entries(lowStockByBranch).map(([branch, items]) => (
                <div key={branch} className="flex items-center justify-between bg-secondary rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{branchLabel(branch)}</p>
                    <p className="text-xs text-muted-foreground">{items.length} low-stock item(s)</p>
                  </div>
                  <Button size="sm" variant="outline" className="gap-1 text-green-600 border-green-300 h-7"
                    onClick={() => sendWhatsAppAlert(managerPhone, items, branchLabel(branch))}
                    disabled={!managerPhone}
                  >
                    <MessageSquare className="w-3 h-3" /> Alert
                  </Button>
                </div>
              ))}
            </div>
            <Button variant="outline" className="w-full" onClick={() => setShowAlertSetup(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? m.edit_item : m.add_item}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">{m.product}</Label>
              <Select value={form.product_id || '__none__'} onValueChange={v => {
                const val = v === '__none__' ? '' : v;
                const p = products.find(x => x.product_id === val);
                setForm(f => ({ ...f, product_id: val, product_name: p?.name || val, unit: p?.unit || 'kg' }));
              }}>
                <SelectTrigger className="w-full"><SelectValue placeholder="--" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">--</SelectItem>
                  {products.map(p => <SelectItem key={p.product_id} value={p.product_id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{m.branch}</Label>
              <BranchSelect value={form.branch} onChange={v => setForm((current) => ({
                ...current,
                branch: v,
                branch_id: branches.find((branch) => (branch.key || branch.branch_key) === v)?.id || null,
              }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">{m.opening_stock}</Label>
                <Input type="number" value={form.opening_stock} onChange={e => setForm(f => ({ ...f, opening_stock: Number(e.target.value) }))} />
              </div>
              <div>
                <Label className="text-xs">{m.low_threshold}</Label>
                <Input type="number" value={form.low_stock_threshold} onChange={e => setForm(f => ({ ...f, low_stock_threshold: Number(e.target.value) }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs">{m.date}</Label>
              <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="flex gap-2 pt-2">
              <Button className="flex-1" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>{m.save}</Button>
              <Button variant="outline" className="flex-1" onClick={closeForm}>{m.cancel}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}