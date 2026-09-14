import { restaurantMaterialFilter } from '@/lib/restaurantProducts';
import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import BranchSelect from '@/components/shared/BranchSelect';
import PageHeader from '@/components/shared/PageHeader';

const emptyItem = { product_id: '', product_name: '', qty: 1, unit: '', unit_price: 0 };

export default function PurchaseOrderForm({ order, onClose, onSaved }) {
  const { currency } = useLanguage();
  const { activeRestaurantId, activeRestaurant } = useTenant();
  const [form, setForm] = useState({
    supplier_id: order?.supplier_id || '',
    supplier_name: order?.supplier_name || '',
    supplier_email: order?.supplier_email || '',
    supplier_phone: order?.supplier_phone || '',
    branch: order?.branch || '',
    date: order?.date || format(new Date(), 'yyyy-MM-dd'),
    expected_delivery: order?.expected_delivery || '',
    notes: order?.notes || '',
    status: order?.status || 'draft',
  });
  const [items, setItems] = useState(() => {
    try { return JSON.parse(order?.items || '[]'); } catch { return [{ ...emptyItem }]; }
  });

  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: () => base44.entities.Supplier.list('name', 200) });
  const { data: products = [] } = useQuery({ queryKey: ['products', activeRestaurantId, 'purchase-materials'], queryFn: () => base44.entities.Product.filter({ restaurant_id: activeRestaurantId, ...restaurantMaterialFilter(activeRestaurant) }, 'name', 500), enabled: Boolean(activeRestaurantId) });

  const saveMutation = useMutation({
    mutationFn: (data) => order ? base44.entities.PurchaseOrder.update(order.id, data) : base44.entities.PurchaseOrder.create(data),
    onSuccess: onSaved,
  });

  const handleSupplierChange = (supplierId) => {
    const s = suppliers.find(x => x.id === supplierId);
    setForm(f => ({ ...f, supplier_id: supplierId, supplier_name: s?.name || '', supplier_email: s?.email || '', supplier_phone: s?.phone || '' }));
  };

  const handleItemProduct = (idx, productId) => {
    const p = products.find(x => x.product_id === productId);
    setItems(items => items.map((it, i) => i === idx ? { ...it, product_id: productId, product_name: p?.name || '', unit: p?.unit || '', unit_price: p?.default_cost || 0 } : it));
  };

  const total = items.reduce((s, it) => s + ((it.qty || 0) * (it.unit_price || 0)), 0);

  const handleSave = () => {
    if (!form.supplier_id || !form.branch) return;
    
    // Sanitize UUID: ensure "" becomes null for UUID column
    const supplierId = form.supplier_id && form.supplier_id.trim() !== '' ? form.supplier_id : null;
    
    const orderNum = order?.order_number || `PO-${Date.now().toString().slice(-6)}`;
    saveMutation.mutate({ 
      restaurant_id: activeRestaurantId,
      branch: form.branch,
      supplier_id: supplierId,
      supplier_name: form.supplier_name,
      date: form.date,
      expected_date: form.expected_delivery,
      status: form.status,
      items: JSON.stringify(items), 
      total_amount: total, 
      order_number: orderNum,
      notes: form.notes
    });
  };

  return (
    <div>
      <PageHeader
        title={order ? 'Edit Purchase Order' : 'New Purchase Order'}
        action={<Button variant="ghost" size="sm" onClick={onClose}><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>}
      />

      <div className="space-y-4">
        <Card className="p-4 space-y-3">
          <h3 className="font-semibold text-sm">Supplier & Branch</h3>
          <div>
            <Label>Supplier</Label>
            <Select value={form.supplier_id} onValueChange={handleSupplierChange}>
              <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
              <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {form.supplier_email && <p className="text-xs text-muted-foreground">Email: {form.supplier_email}</p>}
          {form.supplier_phone && <p className="text-xs text-muted-foreground">Phone/WhatsApp: {form.supplier_phone}</p>}
          <div><Label>Branch</Label><BranchSelect value={form.branch} onChange={v => setForm(f => ({ ...f, branch: v }))} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Order Date</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
            <div><Label>Expected Delivery</Label><Input type="date" value={form.expected_delivery} onChange={e => setForm(f => ({ ...f, expected_delivery: e.target.value }))} /></div>
          </div>
          <div><Label>Notes</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Order Items</h3>
            <Button size="sm" variant="outline" onClick={() => setItems(i => [...i, { ...emptyItem }])}>
              <Plus className="w-3 h-3 mr-1" /> Add Item
            </Button>
          </div>
          <div className="space-y-3">
            {items.map((item, idx) => (
              <div key={idx} className="border rounded-lg p-3 space-y-2">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Select value={item.product_id} onValueChange={(v) => handleItemProduct(idx, v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Product" /></SelectTrigger>
                      <SelectContent>{products.map(p => <SelectItem key={p.product_id} value={p.product_id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <Button size="icon" variant="ghost" className="text-destructive h-8 w-8" onClick={() => setItems(i => i.filter((_, j) => j !== idx))}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div><Label className="text-xs">Qty</Label><Input className="h-8 text-xs" type="number" value={item.qty} onChange={e => setItems(i => i.map((it, j) => j === idx ? { ...it, qty: parseFloat(e.target.value) || 0 } : it))} /></div>
                  <div><Label className="text-xs">Unit</Label><Input className="h-8 text-xs" value={item.unit} onChange={e => setItems(i => i.map((it, j) => j === idx ? { ...it, unit: e.target.value } : it))} /></div>
                  <div><Label className="text-xs">Unit Price</Label><Input className="h-8 text-xs" type="number" value={item.unit_price} onChange={e => setItems(i => i.map((it, j) => j === idx ? { ...it, unit_price: parseFloat(e.target.value) || 0 } : it))} /></div>
                </div>
                <p className="text-xs text-right font-medium">Subtotal: {currency}{((item.qty || 0) * (item.unit_price || 0)).toFixed(2)}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t flex justify-between items-center">
            <span className="font-semibold">Total</span>
            <span className="font-bold text-lg">{currency}{total.toFixed(2)}</span>
          </div>
        </Card>

        <div className="flex gap-2 pb-4">
          <Button className="flex-1" onClick={handleSave} disabled={saveMutation.isPending}>Save as Draft</Button>
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}