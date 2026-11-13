import { restaurantMaterialFilter } from '@/lib/restaurantProducts';
import React, { useEffect, useState } from 'react';
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

export default function PurchaseOrderForm({ order, supplier = null, onClose, onSaved }) {
  const { currency, lang='en' } = useLanguage();
  const copy={
    en:{privacy:'Hide prices from supplier',privacyHelp:'Optional. The supplier will see products, quantities and order status, but NOT unit prices or total. Owner keeps prices for accounting.',flow:'The new order appears in the supplier dashboard immediately. The supplier can ship only after Owner approval.',create:'Create purchase order',saving:'Saving…'},
    ar:{privacy:'إخفاء الأسعار عن المورّد',privacyHelp:'اختياري. يرى المورّد المنتجات والكميات وحالة الطلب دون سعر الوحدة أو المجموع. يحتفظ المالك بالأسعار للمحاسبة.',flow:'يظهر الطلب فور تسجيله في لوحة المورّد، ولا يمكن شحنه إلا بعد موافقة المالك.',create:'إنشاء أمر شراء',saving:'جارٍ الحفظ…'},
    fa:{privacy:'پنهان‌کردن قیمت از سپلایر',privacyHelp:'اختیاری است. سپلایر محصول، مقدار و وضعیت سفارش را می‌بیند، نه قیمت فی واحد یا مبلغ مجموع. قیمت برای حسابداری اونر محفوظ می‌ماند.',flow:'سفارش جدید فوراً در داشبورد سپلایر ظاهر می‌شود؛ ارسال محصول فقط بعد از تأیید اونر ممکن است.',create:'ایجاد سفارش خرید',saving:'در حال ذخیره…'}
  }[lang]||null;
  const labels=copy||{privacy:'Hide prices from supplier',privacyHelp:'Supplier sees quantities but no prices when enabled.',flow:'New orders appear for supplier immediately; shipment requires Owner approval.',create:'Create purchase order',saving:'Saving…'};
  const { activeRestaurantId, activeRestaurant, branches } = useTenant();
  const [form, setForm] = useState({
    supplier_id: order?.supplier_id || supplier?.id || '',
    supplier_name: order?.supplier_name || supplier?.name || '',
    supplier_email: order?.supplier_email || '',
    supplier_phone: order?.supplier_phone || '',
    branch: order?.branch || '',
    date: order?.date || format(new Date(), 'yyyy-MM-dd'),
    expected_delivery: order?.expected_date || '',
    notes: order?.notes || '',
    status: order?.status || 'draft',
    hide_prices_from_supplier: Boolean(order?.hide_prices_from_supplier),
  });
  const [validationError,setValidationError]=useState('');
  useEffect(()=>{if(branches.length===1&&!form.branch)setForm(v=>({...v,branch:branches[0].key||branches[0].branch_key||''}));},[branches,form.branch]);
  const [items, setItems] = useState(() => {
    try { return order?.items ? (Array.isArray(order.items) ? order.items : JSON.parse(order.items)) : [{...emptyItem}]; } catch { return [{ ...emptyItem }]; }
  });

  const { data: suppliers = [], isError:suppliersError } = useQuery({
    queryKey:['suppliers',activeRestaurantId,'po-form'],
    enabled:!!activeRestaurantId,
    queryFn:()=>base44.entities.Supplier.filter({restaurant_id:activeRestaurantId},'name',500),
  });
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
    setValidationError('');
    const branch=branches.find(b=>(b.key===form.branch || b.branch_key===form.branch)&&b.id);
    const selectedSupplier=suppliers.find(s=>s.id===form.supplier_id);
    if(!selectedSupplier||!branch){setValidationError('Select an available supplier and branch of this business.');return;}
    if(selectedSupplier.branch_id && String(selectedSupplier.branch_id)!==String(branch.id)){
      setValidationError('Supplier is linked to a different branch. Select the matching branch.');return;
    }
    if(form.expected_delivery&&form.expected_delivery<form.date){
      setValidationError('Expected delivery cannot be before the order date.');return;
    }
    if(!items.length||items.some(i=>!i.product_id||Number(i.qty)<=0||!Number.isFinite(Number(i.qty))||!Number.isFinite(Number(i.unit_price))||Number(i.unit_price)<0)){
      setValidationError('Add at least one product with a valid quantity and price.');return;
    }
    
    // Sanitize UUID: ensure "" becomes null for UUID column
    const supplierId = form.supplier_id && form.supplier_id.trim() !== '' ? form.supplier_id : null;
    
    const orderNum = order?.order_number || `PO-${Date.now().toString().slice(-6)}`;
    saveMutation.mutate({ 
      restaurant_id: activeRestaurantId,
      branch: form.branch,
      supplier_id: supplierId,
      supplier_name: form.supplier_name,
      branch_id: branch.id,
      expected_date: form.expected_delivery || null,
      hide_prices_from_supplier: Boolean(form.hide_prices_from_supplier),
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

      {saveMutation.isError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{saveMutation.error.message}</p>}
      {validationError && <p role="alert" data-testid="purchase-order-validation-error" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{validationError}</p>}
      {suppliersError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Could not load suppliers. Refresh and retry.</p>}
      <div className="space-y-4">
        <Card className="p-4 space-y-3">
          <h3 className="font-semibold text-sm">Supplier & Branch</h3>
          <div>
            <Label>Supplier</Label>
            <Select disabled={Boolean(supplier)} value={form.supplier_id} onValueChange={handleSupplierChange}>
              <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
              <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {form.supplier_email && <p className="text-xs text-muted-foreground">Email: {form.supplier_email}</p>}
          {form.supplier_phone && <p className="text-xs text-muted-foreground">Phone/WhatsApp: {form.supplier_phone}</p>}
          <div><Label>Branch</Label><BranchSelect value={form.branch} onChange={v => {setValidationError('');setForm(f => ({ ...f, branch: v }));}} /></div>
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2" data-testid="purchase-order-mobile-dates">
            <div className="min-w-0 space-y-1"><Label htmlFor="purchase-order-date">Order Date</Label>
              <Input id="purchase-order-date" className="w-full min-w-0 max-w-full text-sm" type="date" value={form.date} readOnly aria-readonly="true" />
            </div>
            <div className="min-w-0 space-y-1"><Label htmlFor="purchase-order-expected">Expected Delivery</Label>
              <Input id="purchase-order-expected" className="w-full min-w-0 max-w-full text-sm" type="date" min={form.date} value={form.expected_delivery} onChange={e => setForm(f => ({ ...f, expected_delivery: e.target.value }))} />
            </div>
          </div>
          <div><Label>Notes</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
        </Card>

        <Card className="p-4 space-y-2" data-testid="purchase-order-supplier-privacy">
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-blue-600" checked={form.hide_prices_from_supplier}
              onChange={e => setForm(f=>({...f,hide_prices_from_supplier:e.target.checked}))} />
            <span className="min-w-0"><strong className="block text-sm">{labels.privacy}</strong>
              <span className="block text-xs leading-5 text-muted-foreground">{labels.privacyHelp}</span></span>
          </label>
          <p className="text-xs font-medium text-blue-700">{labels.flow}</p>
        </Card>

        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
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
                <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3">
                  <div><Label className="text-xs">Qty</Label><Input className="h-8 text-xs" type="number" value={item.qty} onChange={e => setItems(i => i.map((it, j) => j === idx ? { ...it, qty: parseFloat(e.target.value) || 0 } : it))} /></div>
                  <div><Label className="text-xs">Unit</Label><Input className="h-8 text-xs" value={item.unit} onChange={e => setItems(i => i.map((it, j) => j === idx ? { ...it, unit: e.target.value } : it))} /></div>
                  <div><Label className="text-xs">Unit Price</Label><Input className="h-9 w-full min-w-0 text-xs" type="number" min="0" step="0.01" value={item.unit_price} onChange={e => setItems(i => i.map((it, j) => j === idx ? { ...it, unit_price: parseFloat(e.target.value) || 0 } : it))} /></div>
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
          <Button className="min-h-11 flex-1" onClick={handleSave} disabled={saveMutation.isPending}>{saveMutation.isPending?labels.saving:order?'Save changes':labels.create}</Button>
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}