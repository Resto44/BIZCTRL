import {fetchAlternateSupplierProductIds} from '@/lib/purchaseInvoiceBrands';
import { restaurantMaterialFilter } from '@/lib/restaurantProducts';
import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44, supabase } from '@/api/base44Client';
import { ROLES, useRole } from '@/lib/RoleContext';
import { Link } from 'react-router-dom';
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
    en:{privacy:'Hide prices from supplier',privacyHelp:'Optional. The supplier will see products, quantities and order status, but NOT unit prices or total. Owner keeps prices for accounting.',flow:'The new order appears in the supplier dashboard immediately. The supplier can ship without Owner order approval. Physical receipt still requires Owner confirmation.',create:'Create purchase order',saving:'Saving…'},
    ar:{privacy:'إخفاء الأسعار عن المورّد',privacyHelp:'اختياري. يرى المورّد المنتجات والكميات وحالة الطلب دون سعر الوحدة أو المجموع. يحتفظ المالك بالأسعار للمحاسبة.',flow:'يظهر الطلب فور تسجيله في لوحة المورّد، ويمكن للمورّد شحنه دون موافقة مسبقة من المالك. تأكيد الاستلام الفعلي يبقى للمالك.',create:'إنشاء أمر شراء',saving:'جارٍ الحفظ…'},
    fa:{privacy:'پنهان‌کردن قیمت از سپلایر',privacyHelp:'اختیاری است. سپلایر محصول، مقدار و وضعیت سفارش را می‌بیند، نه قیمت فی واحد یا مبلغ مجموع. قیمت برای حسابداری اونر محفوظ می‌ماند.',flow:'سفارش جدید فوراً در داشبورد سپلایر ظاهر می‌شود؛ سپلایر بدون تأیید قبلی اونر می‌تواند ارسال کند؛ تأیید دریافت فیزیکی همچنان با اونر است.',create:'ایجاد سفارش خرید',saving:'در حال ذخیره…'}
  }[lang]||null;
  const labels=copy||{privacy:'Hide prices from supplier',privacyHelp:'Supplier sees quantities but no prices when enabled.',flow:'New orders appear for supplier immediately; shipment does not require Owner approval.',create:'Create purchase order',saving:'Saving…'};
  const { activeRestaurantId, activeRestaurant, branches } = useTenant();
  const { role } = useRole();
  const queryClient = useQueryClient();
  const [productSearch, setProductSearch] = useState('');
  const [assignmentId, setAssignmentId] = useState('');
  const [assignmentError, setAssignmentError] = useState('');
  const [assignmentNotice, setAssignmentNotice] = useState('');
  const [form, setForm] = useState({
    supplier_id: order?.supplier_id || supplier?.id || '',
    supplier_name: order?.supplier_name || supplier?.name || '',
    supplier_email: order?.supplier_email || '',
    supplier_phone: order?.supplier_phone || '',
    branch: order?.branch || '',
    date: order?.date || (order?.created_date ? String(order.created_date).slice(0,10) : format(new Date(), 'yyyy-MM-dd')),
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
  const supplierRecord = suppliers.find(s => s.id === form.supplier_id);
  const canAssign = role === ROLES.OWNER && Boolean(supplierRecord && supplierRecord.status !== false &&
    (!supplierRecord.branch_id || branches.some(b => b.id === supplierRecord.branch_id)));
  const materialType = restaurantMaterialFilter(activeRestaurant).restaurant_product_type;
  // Unlike the generic adapter, report database errors rather than returning an empty list.
  const loadCatalog = async (supplierId) => {
    const rows = [];
    for (let offset = 0; ; offset += 500) {
      let query = supabase.from('products').select('*').eq('restaurant_id', activeRestaurantId)
        .or('is_active.eq.true,is_active.is.null');
      query = supplierId ? query.eq('supplier_id', supplierId) : query.is('supplier_id', null);
      if (materialType) query = query.eq('restaurant_product_type', materialType);
      const { data, error } = await query.order('name').order('id').range(offset, offset + 499);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < 500) break;
    }
    if(supplierId){
      const ids=await fetchAlternateSupplierProductIds(supabase,activeRestaurantId,supplierId);
      for(let i=0;i<ids.length;i+=100){
        let query=supabase.from('products').select('*').eq('restaurant_id',activeRestaurantId).in('id',ids.slice(i,i+100)).or('is_active.eq.true,is_active.is.null');
        if(materialType)query=query.eq('restaurant_product_type',materialType);
        const {data,error}=await query;
        if(error)throw error;
        rows.push(...(data||[]).map(p=>({...p,alternate_supplier_id:supplierId})));
      }
    }
    return [...new Map(rows.filter(p=>p.product_id&&p.name&&!['inactive','discontinued'].includes(p.status)).map(p=>[p.id,p])).values()];
  };
  const { data: products = [],isLoading:productsLoading,isFetching:productsFetching,isError:productsError,refetch:reloadProducts } = useQuery({
    queryKey:['products',activeRestaurantId,form.supplier_id,'purchase-materials',materialType || 'all'],
    queryFn:()=>loadCatalog(form.supplier_id),
    enabled:Boolean(activeRestaurantId&&form.supplier_id),
  });
  const {data: unassigned = [], isLoading: unassignedLoading, isError: unassignedError, refetch: reloadUnassigned} = useQuery({
    queryKey:['products',activeRestaurantId,'unassigned-purchase-materials',materialType || 'all'],
    queryFn:()=>loadCatalog(null),
    enabled:Boolean(activeRestaurantId&&canAssign),
  });
  const assignment = useMutation({
    mutationFn: async ({productId, supplierId, restaurantId, productType}) => {
      if (!canAssign || supplierId !== form.supplier_id || restaurantId !== activeRestaurantId ||
          !unassigned.some(p => p.id === productId)) throw new Error('Product or supplier is no longer available.');
      let query = supabase.from('products').update({supplier_id:supplierId})
        .eq('id',productId).eq('restaurant_id',restaurantId).is('supplier_id',null)
        .or('is_active.eq.true,is_active.is.null');
      if (productType) query = query.eq('restaurant_product_type',productType);
      const {data,error} = await query.select('id,supplier_id').single();
      if (error || data?.supplier_id !== supplierId) throw new Error('Could not assign product. It may already be assigned or access was denied. Refresh and retry.');
      return data;
    },
    onSuccess: async (_, variables) => {
      setAssignmentId('');
      setAssignmentNotice('Product assigned. Select it in Order Items.');
      setValidationError('');
      await queryClient.invalidateQueries({queryKey:['products',variables.restaurantId]});
    },
    onError: error => {
      setAssignmentError(error.message);
      queryClient.invalidateQueries({queryKey:['products',activeRestaurantId]});
    },
  });
  const matchProduct = p => [p.name,p.name_ar,p.name_en,p.name_fa,p.sku,p.barcode,p.product_id]
    .some(value => String(value || '').toLocaleLowerCase().includes(productSearch.trim().toLocaleLowerCase()));
  const eligibleProducts = products.filter(p=>p.supplier_id===form.supplier_id||p.alternate_supplier_id===form.supplier_id);
  const catalogReady = Boolean(form.supplier_id && !productsLoading && !productsFetching && !productsError && eligibleProducts.length);


  const saveMutation = useMutation({
    mutationFn: (data) => order ? base44.entities.PurchaseOrder.update(order.id, data) : base44.entities.PurchaseOrder.create(data),
    onSuccess: onSaved,
  });

  const handleSupplierChange = (supplierId) => {
    const s = suppliers.find(x => x.id === supplierId);
    setForm(f => ({ ...f, supplier_id: supplierId, supplier_name: s?.name || '', supplier_email: s?.email || '', supplier_phone: s?.phone || '' }));
    setItems([{...emptyItem}]); // Never retain products from a previously selected supplier.
    setProductSearch(''); setAssignmentId(''); setAssignmentError(''); setAssignmentNotice('');
    setValidationError('');
  };

  const handleItemProduct = (idx, productId) => {
    const p = eligibleProducts.find(x => x.product_id === productId);
    if (!p) return;
    setValidationError('');
    setItems(items => items.map((it, i) => i === idx ? { ...it, product_id: productId, product_name: p.name, unit: p.unit || '', unit_price: p.default_cost ?? p.purchase_cost ?? 0 } : it));
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
    if(!catalogReady||assignment.isPending){setValidationError('Supplier products are not ready. Retry after loading.');return;}
    if(!items.length||items.some(i=>!i.product_id||!eligibleProducts.some(p=>p.product_id===i.product_id)||Number(i.qty)<=0||!Number.isFinite(Number(i.qty))||!Number.isFinite(Number(i.unit_price))||Number(i.unit_price)<0)){
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
      status: order ? form.status : 'sent', // New orders are submitted to the linked Supplier immediately.
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
      {productsError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Supplier products could not be loaded. Retry.</p>}
      {suppliersError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Could not load suppliers. Refresh and retry.</p>}
      <div className="space-y-4">
        <Card className="p-4 space-y-3">
          <h3 className="font-semibold text-sm">Supplier & Branch</h3>
          <div>
            <Label>Supplier</Label>
            <Select disabled={Boolean(supplier)||assignment.isPending||saveMutation.isPending} value={form.supplier_id} onValueChange={handleSupplierChange}>
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
            <Button size="sm" variant="outline" disabled={!catalogReady||assignment.isPending||items.length>=100} onClick={() => setItems(i => [...i, { ...emptyItem }])}>
              <Plus className="w-3 h-3 mr-1" /> Add Item
            </Button>
          </div>
          {!form.supplier_id&&<p className="text-xs text-muted-foreground">Select a supplier first to see only their products.</p>}
          {form.supplier_id && (productsLoading||productsFetching) && <p role="status" className="text-sm">Loading supplier products…</p>}
          {productsError && <Button type="button" variant="outline" onClick={()=>reloadProducts()}>Retry loading products</Button>}
          {form.supplier_id&&!productsLoading&&!productsFetching&&!productsError&&eligibleProducts.length===0&&
            <p role="status" className="text-sm text-amber-700">No active purchase products are assigned to this supplier. {canAssign?'Assign an unassigned product below.':'Ask the Owner to assign products.'}</p>}
          {canAssign && <section className="my-3 space-y-2 rounded-lg border p-3" data-testid="supplier-assign-product">
            <h4 className="text-sm font-semibold">Assign product to {supplierRecord.name}</h4>
            <p className="text-xs text-muted-foreground">Only products without a supplier can be assigned here. Existing assignments are never replaced.</p>
            {unassignedLoading && <p role="status">Loading unassigned products…</p>}
            {unassignedError && <Button type="button" variant="outline" onClick={()=>reloadUnassigned()}>Retry unassigned products</Button>}
            {!unassignedLoading&&!unassignedError&&unassigned.length===0&&<p className="text-sm">No unassigned purchase products. <Link className="underline" to="/product-management">Open Product Master</Link></p>}
            {unassigned.length>0 && <>
              <Label htmlFor="po-assign-product">Unassigned product</Label>
              <select id="po-assign-product" className="min-h-11 w-full rounded-md border bg-background px-2 text-base" value={assignmentId} disabled={assignment.isPending||unassignedError} onChange={e=>{setAssignmentId(e.target.value);setAssignmentError('');setAssignmentNotice('');}}>
                <option value="">Select product to assign</option>
                {unassigned.map(p=><option key={p.id} value={p.id}>{p.name}{p.sku?' — '+p.sku:''}</option>)}
              </select>
              <Button type="button" variant="outline" disabled={!assignmentId||assignment.isPending||unassignedError} onClick={()=>{setAssignmentError('');setAssignmentNotice('');assignment.mutate({productId:assignmentId,supplierId:form.supplier_id,restaurantId:activeRestaurantId,productType:materialType});}}> {assignment.isPending?'Assigning…':'Assign to supplier'}</Button>
            </>}
            {assignmentError&&<p role="alert" className="text-sm text-red-700">{assignmentError}</p>}
            {assignmentNotice&&<p role="status" className="text-sm text-green-700">{assignmentNotice}</p>}
          </section>}
          {catalogReady&&<div className="mb-3 space-y-1"><Label htmlFor="po-product-search">Search supplier products ({eligibleProducts.length})</Label><Input id="po-product-search" value={productSearch} onChange={e=>setProductSearch(e.target.value)} placeholder="Name, SKU or barcode" />{!eligibleProducts.some(matchProduct)&&<p role="status" className="text-sm">No matching products. Clear the search.</p>}</div>}
          <div className="space-y-3">
            {items.map((item, idx) => (
              <div key={idx} className="border rounded-lg p-3 space-y-2">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <select aria-label={'Product '+(idx+1)} data-testid="po-product-select" className="min-h-11 w-full rounded-md border bg-background px-2 text-base" disabled={!catalogReady||assignment.isPending} value={item.product_id} onChange={e=>handleItemProduct(idx,e.target.value)}>
                      <option value="" disabled>Select product</option>
                      {item.product_id&&!eligibleProducts.some(p=>p.product_id===item.product_id)&&<option value={item.product_id} disabled>{item.product_name||item.product_id} (unavailable)</option>}
                      {eligibleProducts.filter(p=>p.product_id===item.product_id||matchProduct(p)).map(p => <option key={p.id} value={p.product_id}>{p.name}{p.sku?' — '+p.sku:''}</option>)}
                    </select>
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
          <Button className="min-h-11 flex-1" onClick={handleSave} disabled={saveMutation.isPending||assignment.isPending||!catalogReady||!form.branch||!items.length||items.some(i=>!i.product_id||!eligibleProducts.some(p=>p.product_id===i.product_id)||!Number.isFinite(Number(i.qty))||Number(i.qty)<=0||!Number.isFinite(Number(i.unit_price))||Number(i.unit_price)<0)}>{saveMutation.isPending?labels.saving:order?'Save changes':labels.create}</Button>
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}