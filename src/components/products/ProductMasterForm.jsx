import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, ArrowRight, Barcode, Boxes, Building2, Calculator, Check,
  CheckCircle2, ChevronRight, CircleDollarSign, ClipboardCheck, ImagePlus,
  Layers3, Package, Percent, Plus, Save, ScanLine, ShieldCheck, Store,
  Tag, Trash2, TriangleAlert, X,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { useWorkspaceCustomization } from '@/lib/WorkspaceCustomizationContext';
import { cn } from '@/lib/utils';
import {
  PRODUCT_MASTER_STEPS, buildProductMasterPayload, calculateProductPricing,
  mergeErpMaster, toFiniteNumber, validateBranchStocks,
} from '@/lib/productMaster';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

function nanoid8() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function draftKey(restaurantId) {
  return restaurantId ? `bizctrl_product_master_draft_${restaurantId}` : null;
}

function readDraft(restaurantId) {
  const key = draftKey(restaurantId);
  if (!key) return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function SectionCard({ icon: Icon, title, description, children, className }) {
  return (
    <section className={cn('rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-950', className)}>
      <div className="mb-4 flex items-start gap-3">
        {Icon && <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300"><Icon className="h-4 w-4" /></span>}
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-950 sm:text-base dark:text-slate-50">{title}</h3>
          {description && <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({ label, required, hint, children, className }) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">{label}{required ? ' *' : ''}</Label>
      {children}
      {hint && <p className="mt-1.5 text-[11px] leading-4 text-slate-500">{hint}</p>}
    </div>
  );
}

function ToggleRow({ label, description, checked, onCheckedChange, disabled }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 border-b border-slate-100 py-2.5 last:border-0 dark:border-slate-800">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{label}</p>
        {description && <p className="mt-0.5 text-xs leading-4 text-slate-500">{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} aria-label={label} />
    </div>
  );
}

function CustomAttributeControl({ field, value, onChange }) {
  const label = field.label || field.id;
  if (field.type === 'boolean') return <ToggleRow label={label} checked={Boolean(value)} onCheckedChange={onChange} />;
  if (field.type === 'long_text') return <Field label={label} required={field.required}><Textarea value={value ?? ''} onChange={(event) => onChange(event.target.value)} required={field.required} placeholder={field.placeholder || undefined} rows={3} /></Field>;
  if (field.type === 'select') return <Field label={label} required={field.required}><Select value={value ?? '__none__'} onValueChange={(nextValue) => onChange(nextValue === '__none__' ? '' : nextValue)}><SelectTrigger><SelectValue placeholder={`Select ${label}`} /></SelectTrigger><SelectContent><SelectItem value="__none__">— Select —</SelectItem>{(field.options || []).map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select></Field>;
  if (field.type === 'multiselect') return <Field label={label} required={field.required} hint="Separate multiple values with commas."><Input value={Array.isArray(value) ? value.join(', ') : value || ''} onChange={(event) => onChange(event.target.value.split(',').map((entry) => entry.trim()).filter(Boolean))} required={field.required} placeholder={field.options?.join(', ') || field.placeholder || undefined} /></Field>;
  const inputType = ({ number: 'number', decimal: 'number', currency: 'number', date: 'date', datetime: 'datetime-local', email: 'email', phone: 'tel', url: 'url' })[field.type] || 'text';
  return <Field label={label} required={field.required}><Input type={inputType} step={['decimal', 'currency'].includes(field.type) ? '0.01' : undefined} value={value ?? ''} onChange={(event) => onChange(event.target.value)} required={field.required} placeholder={field.placeholder || undefined} /></Field>;
}

function Stepper({ step, onStepChange }) {
  return (
    <nav aria-label="Product creation progress" className="border-y border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-950 sm:px-6">
      <ol className="mx-auto grid max-w-3xl grid-cols-4">
        {PRODUCT_MASTER_STEPS.map((item, index) => {
          const complete = index < step;
          const active = index === step;
          return (
            <li key={item.id} className="relative flex justify-center">
              {index > 0 && <span className={cn('absolute right-1/2 top-4 h-0.5 w-full', index <= step ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700')} />}
              <button type="button" onClick={() => onStepChange(index)} className="relative z-10 flex min-w-0 flex-col items-center gap-1.5" aria-current={active ? 'step' : undefined}>
                <span className={cn('grid h-8 w-8 place-items-center rounded-full border-2 bg-white text-xs font-bold transition-colors dark:bg-slate-950', complete && 'border-emerald-500 bg-emerald-500 text-white dark:bg-emerald-500', active && 'border-blue-600 bg-blue-600 text-white dark:bg-blue-600', !complete && !active && 'border-slate-300 text-slate-500 dark:border-slate-700')}>{complete ? <Check className="h-4 w-4" /> : index + 1}</span>
                <span className={cn('max-w-full truncate text-[10px] font-semibold sm:text-xs', active ? 'text-blue-600' : complete ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500')}>{item.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function ProductContext({ form, erp, onEdit }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60">
        {form.image_url ? <img src={form.image_url} alt="" className="h-full w-full object-cover" /> : <Package className="h-6 w-6" />}
      </div>
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-950 dark:text-slate-50">{form.name || 'Untitled product'}</p><p className="mt-0.5 truncate text-xs text-slate-500">{form.sku || form.product_id} · {erp.product_type}</p></div>
      {onEdit && <Button type="button" variant="ghost" size="sm" onClick={onEdit} className="shrink-0 text-blue-600">Edit</Button>}
    </div>
  );
}

export default function ProductMasterForm({ initial, onSubmit, onCancel }) {
  const { activeRestaurant, branches } = useTenant();
  const { t, currency } = useLanguage();
  const { isProductFieldVisible, isProductFieldRequired, productCustomFields } = useWorkspaceCustomization();
  const barcodeInputRef = useRef(null);
  const stockSeedRef = useRef('');
  const [localDraft] = useState(() => (!initial ? readDraft(activeRestaurant?.id) : null));

  const [step, setStep] = useState(() => Math.min(3, Math.max(0, Number(localDraft?.step) || 0)));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState(() => ({
    name: '', name_ar: '', name_en: '', name_fa: '', product_id: nanoid8(), sku: '', barcode: '',
    category_id: '', category: '', brand: '', supplier_id: '', unit: '', purchase_cost: '', selling_price: '',
    default_price: '', default_cost: '', tax_rate: '', min_stock: '', max_stock: '', current_stock: '',
    description: '', image_url: '', status: 'active', is_active: true, subcategory_id: '',
    restaurant_id: activeRestaurant?.id, custom_attributes: {}, ...(localDraft?.form || {}), ...(initial || {}),
  }));
  const [erp, setErp] = useState(() => ({ ...mergeErpMaster(initial), ...(!initial && localDraft?.erp ? localDraft.erp : {}) }));
  const [branchStocks, setBranchStocks] = useState(() => (!initial && Array.isArray(localDraft?.branchStocks) ? localDraft.branchStocks : []));

  const { data: categories = [] } = useQuery({
    queryKey: ['product_categories', activeRestaurant?.id],
    queryFn: () => base44.entities.ProductCategory.filter({ restaurant_id: activeRestaurant.id }, 'sort_order', 500),
    enabled: Boolean(activeRestaurant?.id), staleTime: 30000,
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers', activeRestaurant?.id],
    queryFn: () => base44.entities.Supplier.filter({ restaurant_id: activeRestaurant.id }, 'name', 500),
    enabled: Boolean(activeRestaurant?.id), staleTime: 30000,
  });
  const { data: units = [] } = useQuery({
    queryKey: ['product_units', activeRestaurant?.id],
    queryFn: () => base44.entities.ProductUnit.list('sort_order', 200),
    enabled: Boolean(activeRestaurant?.id), staleTime: 60000,
  });
  const { data: existingInventory = [], isFetched: inventoryFetched } = useQuery({
    queryKey: ['product-master-inventory', activeRestaurant?.id, initial?.product_id],
    queryFn: () => base44.entities.Inventory.filter({ restaurant_id: activeRestaurant.id, product_id: initial.product_id }, '-created_date', 500),
    enabled: Boolean(activeRestaurant?.id && initial?.product_id), staleTime: 30000,
  });

  const parentCategories = useMemo(() => categories.filter((category) => !category.parent_id), [categories]);
  const subCategories = useMemo(() => categories.filter((category) => category.parent_id === form.category_id), [categories, form.category_id]);
  const childCategories = useMemo(() => categories.filter((category) => category.parent_id === form.subcategory_id), [categories, form.subcategory_id]);
  const pricing = useMemo(() => calculateProductPricing(form.purchase_cost, form.selling_price), [form.purchase_cost, form.selling_price]);

  useEffect(() => {
    if (!branches.length || (initial?.product_id && !inventoryFetched)) return;
    const seed = `${initial?.id || 'new'}:${branches.map((branch) => branch.id || branch.key).join(',')}:${existingInventory.map((row) => `${row.id}:${row.updated_date || ''}`).join(',')}`;
    if (stockSeedRef.current === seed) return;
    setBranchStocks((current) => branches.map((branch) => {
      const branchKey = branch.branch_key || branch.key || branch.name;
      const saved = existingInventory.find((row) => row.branch_id === branch.id || row.branch === branchKey || row.branch === branch.name);
      const draft = current.find((row) => row.branch_id === branch.id || row.branch === branchKey);
      return {
        id: saved?.id || draft?.id || null, branch_id: branch.id || null, branch: branchKey,
        branch_name: branch.name || branch.label || branchKey,
        opening_stock: saved?.opening_stock ?? draft?.opening_stock ?? '',
        reorder_point: saved?.low_stock_threshold ?? draft?.reorder_point ?? '',
        par_level: erp.branch_par_levels?.[branchKey] ?? draft?.par_level ?? '',
      };
    }));
    stockSeedRef.current = seed;
  }, [branches, erp.branch_par_levels, existingInventory, initial?.id, initial?.product_id, inventoryFetched]);

  const set = (field, value) => setForm((previous) => ({ ...previous, [field]: value }));
  const setErpValue = (field, value) => setErp((previous) => ({ ...previous, [field]: value }));
  const setCustomAttribute = (field, value) => setForm((previous) => ({ ...previous, custom_attributes: { ...(previous.custom_attributes || {}), [field]: value } }));
  const setStockValue = (index, field, value) => setBranchStocks((previous) => previous.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row));

  const saveDraft = () => {
    const key = draftKey(activeRestaurant?.id);
    if (!key) return toast.error('Select a business before saving a draft.');
    localStorage.setItem(key, JSON.stringify({ version: 1, form, erp, branchStocks, step, saved_at: new Date().toISOString() }));
    toast.success('Product draft saved on this device.');
  };

  const validateStep = (index) => {
    if (index === 0) {
      if (!(form.name || form.name_en || form.name_ar)) return 'Product name is required.';
      if (form.category_id && !categories.some((category) => category.id === form.category_id)) return 'Select a valid product category.';
      const requiredFields = ['sku', 'barcode', 'brand', 'description', 'status'];
      const missing = requiredFields.find((field) => isProductFieldRequired(field) && !form[field]);
      if (missing) return `Complete the required ${missing.replaceAll('_', ' ')}.`;
    }
    if (index === 1) {
      if ([form.purchase_cost, form.selling_price, form.tax_rate, erp.wholesale_price, erp.minimum_selling_price].some((value) => value !== '' && toFiniteNumber(value, -1) < 0)) return 'Prices and tax values cannot be negative.';
      if (toFiniteNumber(erp.maximum_discount) < 0 || toFiniteNumber(erp.maximum_discount) > 100) return 'Maximum discount must be between 0 and 100.';
      if (toFiniteNumber(erp.minimum_selling_price) > 0 && toFiniteNumber(form.selling_price) < toFiniteNumber(erp.minimum_selling_price)) return 'Selling price cannot be below the minimum selling price.';
    }
    if (index === 2) {
      if (!validateBranchStocks(branchStocks)) return 'Branch stock values cannot be negative.';
      if ((erp.unit_conversions || []).some((conversion) => !conversion.to_unit || toFiniteNumber(conversion.factor) <= 0)) return 'Complete every unit conversion with a valid factor and target unit.';
    }
    if (index === 3) {
      const missingCustom = productCustomFields.find((field) => field.required && (form.custom_attributes?.[field.id] === '' || form.custom_attributes?.[field.id] === null || form.custom_attributes?.[field.id] === undefined));
      if (missingCustom) return `Complete the required ${missingCustom.label}.`;
    }
    return null;
  };

  const goNext = () => {
    const error = validateStep(step);
    if (error) return toast.error(error);
    setStep((current) => Math.min(3, current + 1));
  };

  const scanBarcodeImage = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!('BarcodeDetector' in window)) return toast.error('Barcode scanning is not supported by this browser. Enter it manually.');
    try {
      const bitmap = await createImageBitmap(file);
      const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'upc_a', 'upc_e', 'qr_code'] });
      const results = await detector.detect(bitmap);
      bitmap.close?.();
      if (!results.length) return toast.error('No barcode was detected. Try a clearer photo.');
      set('barcode', results[0].rawValue);
      toast.success('Barcode captured.');
    } catch (error) {
      console.error('[ProductMaster] Barcode scan failed:', error);
      toast.error('Unable to scan this image. Enter the barcode manually.');
    }
  };

  const addConversion = () => setErpValue('unit_conversions', [...(erp.unit_conversions || []), { from_unit: form.unit || '', factor: '1', to_unit: '', barcode: '' }]);
  const updateConversion = (index, field, value) => setErpValue('unit_conversions', erp.unit_conversions.map((conversion, conversionIndex) => conversionIndex === index ? { ...conversion, [field]: value } : conversion));
  const removeConversion = (index) => setErpValue('unit_conversions', erp.unit_conversions.filter((_, conversionIndex) => conversionIndex !== index));

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (step < 3) return goNext();
    for (let index = 0; index < PRODUCT_MASTER_STEPS.length; index += 1) {
      const error = validateStep(index);
      if (error) { setStep(index); toast.error(error); return; }
    }
    const productId = form.product_id || nanoid8();
    const parLevels = Object.fromEntries(branchStocks.map((row) => [row.branch, Math.max(0, toFiniteNumber(row.par_level))]));
    const erpForSave = { ...erp, branch_par_levels: parLevels };
    const stockTotal = branchStocks.reduce((total, row) => total + Math.max(0, toFiniteNumber(row.opening_stock)), 0);
    const reorderMaximum = Math.max(0, ...branchStocks.map((row) => toFiniteNumber(row.reorder_point)));
    const parTotal = branchStocks.reduce((total, row) => total + Math.max(0, toFiniteNumber(row.par_level)), 0);
    const customAttributes = { ...(form.custom_attributes || {}) };
    productCustomFields.forEach((field) => {
      if (field.type === 'boolean' && customAttributes[field.id] === undefined) {
        customAttributes[field.id] = Boolean(field.default_value);
      }
    });
    const payload = buildProductMasterPayload({
      form: {
        ...form,
        product_id: productId,
        current_stock: erp.track_inventory ? stockTotal : form.current_stock,
        min_stock: reorderMaximum,
        max_stock: parTotal,
        custom_attributes: customAttributes,
      },
      erp: erpForSave, categories, restaurantId: activeRestaurant?.id, customFields: productCustomFields,
    });
    setIsSubmitting(true);
    try {
      await onSubmit({ ...payload, _inventoryEnabled: erp.track_inventory, _inventoryRows: branchStocks.map((row) => ({ ...row, product_id: productId, product_name: payload.name, unit: payload.unit })) });
      const key = draftKey(activeRestaurant?.id);
      if (key) localStorage.removeItem(key);
    } catch {
      // Mutation feedback is displayed by the owning page.
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderIdentity = () => (
    <div className="space-y-4">
      <SectionCard icon={Package} title="Core identity" description="Names, codes and lifecycle status used across ERP documents.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('product_name')} required className="sm:col-span-2"><Input value={form.name} onChange={(event) => set('name', event.target.value)} placeholder="Main display name" autoFocus /></Field>
          <Field label={t('name_ar')}><Input value={form.name_ar || ''} onChange={(event) => set('name_ar', event.target.value)} placeholder="اسم المنتج" dir="rtl" /></Field>
          <Field label={t('name_fa')}><Input value={form.name_fa || ''} onChange={(event) => set('name_fa', event.target.value)} placeholder="نام محصول" dir="rtl" /></Field>
          <Field label={t('name_en')} className="sm:col-span-2"><Input value={form.name_en || ''} onChange={(event) => set('name_en', event.target.value)} placeholder="English product name" /></Field>
          {isProductFieldVisible('sku') && <Field label={t('sku')} required={isProductFieldRequired('sku')}><div className="flex gap-2"><Input value={form.sku || ''} onChange={(event) => set('sku', event.target.value)} placeholder="SKU-001" /><Button type="button" variant="outline" size="icon" onClick={() => set('sku', `SKU-${nanoid8()}`)} aria-label="Generate SKU"><Calculator className="h-4 w-4" /></Button></div></Field>}
          {isProductFieldVisible('barcode') && <Field label={t('barcode')} required={isProductFieldRequired('barcode')}><div className="flex gap-2"><Input value={form.barcode || ''} onChange={(event) => set('barcode', event.target.value)} inputMode="numeric" placeholder="1234567890" /><Button type="button" variant="outline" size="icon" onClick={() => barcodeInputRef.current?.click()} aria-label="Scan barcode"><ScanLine className="h-4 w-4" /></Button><input ref={barcodeInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={scanBarcodeImage} /></div></Field>}
          <Field label="Product image URL" className="sm:col-span-2"><div className="relative"><ImagePlus className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="pl-9" value={form.image_url || ''} onChange={(event) => set('image_url', event.target.value)} placeholder="https://…" /></div></Field>
        </div>
      </SectionCard>
      <SectionCard icon={Layers3} title="Classification" description="Control where this product appears and how it behaves.">
        <Field label="Product type"><div className="grid grid-cols-3 rounded-xl border border-slate-200 p-1 dark:border-slate-700">{['stock', 'service', 'recipe'].map((type) => <Button key={type} type="button" variant="ghost" className={cn('h-9 capitalize', erp.product_type === type && 'bg-blue-50 text-blue-700 hover:bg-blue-50 dark:bg-blue-950/60 dark:text-blue-300')} onClick={() => setErpValue('product_type', type)}>{type}</Button>)}</div></Field>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label={`${t('category')} (Level 1)`} className="sm:col-span-2"><Select value={form.category_id || '__none__'} onValueChange={(value) => { set('category_id', value === '__none__' ? '' : value); set('subcategory_id', ''); setErpValue('child_category_id', ''); }}><SelectTrigger><SelectValue placeholder="Select main category" /></SelectTrigger><SelectContent><SelectItem value="__none__">— None —</SelectItem>{parentCategories.map((category) => <SelectItem key={category.id} value={category.id}>{category.icon ? `${category.icon} ` : ''}{category.name}</SelectItem>)}</SelectContent></Select></Field>
          {subCategories.length > 0 && <Field label="Sub-category"><Select value={form.subcategory_id || '__none__'} onValueChange={(value) => { set('subcategory_id', value === '__none__' ? '' : value); setErpValue('child_category_id', ''); }}><SelectTrigger><SelectValue placeholder="Select sub-category" /></SelectTrigger><SelectContent><SelectItem value="__none__">— None —</SelectItem>{subCategories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent></Select></Field>}
          {childCategories.length > 0 && <Field label="Child category"><Select value={erp.child_category_id || '__none__'} onValueChange={(value) => setErpValue('child_category_id', value === '__none__' ? '' : value)}><SelectTrigger><SelectValue placeholder="Select child category" /></SelectTrigger><SelectContent><SelectItem value="__none__">— None —</SelectItem>{childCategories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent></Select></Field>}
          <Field label={t('unit')}><Select value={form.unit || '__none__'} onValueChange={(value) => set('unit', value === '__none__' ? '' : value)}><SelectTrigger><SelectValue placeholder={t('select')} /></SelectTrigger><SelectContent><SelectItem value="__none__">— Select —</SelectItem>{units.map((unit) => <SelectItem key={unit.id} value={unit.abbreviation || unit.name || unit.id}>{unit.name}{unit.abbreviation ? ` (${unit.abbreviation})` : ''}</SelectItem>)}</SelectContent></Select></Field>
          {isProductFieldVisible('brand') && <Field label={t('brand')} required={isProductFieldRequired('brand')}><Input value={form.brand || ''} onChange={(event) => set('brand', event.target.value)} placeholder={t('optional')} /></Field>}
          <Field label="Primary supplier"><Select value={form.supplier_id || '__none__'} onValueChange={(value) => set('supplier_id', value === '__none__' ? '' : value)}><SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger><SelectContent><SelectItem value="__none__">— None —</SelectItem>{suppliers.map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>)}</SelectContent></Select></Field>
          {isProductFieldVisible('status') && <Field label={t('status')} required={isProductFieldRequired('status')}><Select value={form.status || 'active'} onValueChange={(value) => set('status', value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">{t('active')}</SelectItem><SelectItem value="inactive">{t('inactive')}</SelectItem><SelectItem value="discontinued">{t('discontinued')}</SelectItem></SelectContent></Select></Field>}
          {isProductFieldVisible('description') && <Field label={t('description')} required={isProductFieldRequired('description')} className="sm:col-span-2"><Textarea value={form.description || ''} onChange={(event) => set('description', event.target.value)} rows={3} placeholder={t('optional')} /></Field>}
        </div>
      </SectionCard>
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"><CheckCircle2 className="h-5 w-5 shrink-0" /><div><p className="text-sm font-bold">Identity structure ready</p><p className="text-xs">Required values are checked before continuing.</p></div></div>
    </div>
  );

  const renderPricing = () => (
    <div className="space-y-4">
      <ProductContext form={form} erp={erp} onEdit={() => setStep(0)} />
      <SectionCard icon={CircleDollarSign} title="Purchase & cost" description="Set the financial source used for purchasing and valuation.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t('purchase_cost')}><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">{currency}</span><Input className="pl-12" type="number" min="0" step="0.01" value={form.purchase_cost || ''} onChange={(event) => set('purchase_cost', event.target.value)} placeholder="0.00" /></div></Field>
          <Field label="Costing method"><Select value={erp.costing_method} onValueChange={(value) => setErpValue('costing_method', value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="weighted_average">Weighted average</SelectItem><SelectItem value="fifo">FIFO</SelectItem><SelectItem value="standard">Standard cost</SelectItem></SelectContent></Select></Field>
          <Field label="Price-control threshold"><div className="relative"><Input className="pr-9" type="number" min="0" max="100" value={erp.price_change_alert_percent} onChange={(event) => setErpValue('price_change_alert_percent', event.target.value)} /><Percent className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /></div></Field>
        </div>
      </SectionCard>
      <SectionCard icon={Tag} title="Sales pricing" description="Retail, wholesale and protected minimum price.">
        <div className="grid gap-4 sm:grid-cols-3"><Field label={t('selling_price')}><Input type="number" min="0" step="0.01" value={form.selling_price || ''} onChange={(event) => set('selling_price', event.target.value)} placeholder="0.00" /></Field><Field label="Wholesale price"><Input type="number" min="0" step="0.01" value={erp.wholesale_price} onChange={(event) => setErpValue('wholesale_price', event.target.value)} placeholder="0.00" /></Field><Field label="Minimum selling price"><Input type="number" min="0" step="0.01" value={erp.minimum_selling_price} onChange={(event) => setErpValue('minimum_selling_price', event.target.value)} placeholder="0.00" /></Field></div>
        <div className="mt-4 grid grid-cols-3 divide-x divide-slate-200 rounded-xl border border-slate-200 bg-slate-50 p-3 text-center dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-900"><div><p className="text-[10px] uppercase tracking-wide text-slate-500">Gross profit</p><p className={cn('mt-1 text-sm font-bold', pricing.profit >= 0 ? 'text-emerald-600' : 'text-red-600')}>{currency}{pricing.profit.toFixed(2)}</p></div><div><p className="text-[10px] uppercase tracking-wide text-slate-500">Margin</p><p className="mt-1 text-sm font-bold text-blue-600">{pricing.margin.toFixed(1)}%</p></div><div><p className="text-[10px] uppercase tracking-wide text-slate-500">Markup</p><p className="mt-1 text-sm font-bold text-violet-600">{pricing.markup.toFixed(1)}%</p></div></div>
      </SectionCard>
      <SectionCard icon={Percent} title="Tax & commercial rules">
        <div className="grid gap-x-6 sm:grid-cols-2">
          <Field label={t('tax_rate')} className="mb-3"><div className="relative"><Input className="pr-9" type="number" min="0" max="100" step="0.01" value={form.tax_rate || ''} onChange={(event) => set('tax_rate', event.target.value)} placeholder="15" /><Percent className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /></div></Field>
          <Field label="Maximum discount" className="mb-3"><div className="relative"><Input className="pr-9" type="number" min="0" max="100" value={erp.maximum_discount} onChange={(event) => setErpValue('maximum_discount', event.target.value)} placeholder="0" /><Percent className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /></div></Field>
          <ToggleRow label="Price includes VAT" checked={erp.price_includes_tax} onCheckedChange={(value) => setErpValue('price_includes_tax', value)} /><ToggleRow label="Discount allowed" checked={erp.discount_allowed} onCheckedChange={(value) => setErpValue('discount_allowed', value)} /><ToggleRow label="Branch price override" description="Permit authorized branches to use a local price." checked={erp.branch_price_override} onCheckedChange={(value) => setErpValue('branch_price_override', value)} /><ToggleRow label="Owner approval for price changes" checked={erp.price_change_requires_approval} onCheckedChange={(value) => setErpValue('price_change_requires_approval', value)} />
        </div>
      </SectionCard>
      {erp.price_change_requires_approval && <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"><div className="flex items-center gap-2"><TriangleAlert className="h-5 w-5" /><span className="text-sm font-semibold">Price changes above ±{erp.price_change_alert_percent || 0}% require owner review.</span></div><span className="hidden rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold sm:block dark:bg-amber-900/60">CONTROLLED</span></div>}
    </div>
  );

  const renderInventory = () => {
    const totalStock = branchStocks.reduce((sum, row) => sum + Math.max(0, toFiniteNumber(row.opening_stock)), 0);
    const lowBranches = branchStocks.filter((row) => toFiniteNumber(row.opening_stock) <= toFiniteNumber(row.reorder_point) && toFiniteNumber(row.reorder_point) > 0).length;
    return (
      <div className="space-y-4">
        <ProductContext form={form} erp={erp} onEdit={() => setStep(0)} />
        <SectionCard icon={Boxes} title="Inventory policy" description="Configure stock behavior without mixing it with sales totals."><div className="grid gap-x-6 sm:grid-cols-2"><ToggleRow label="Track inventory" checked={erp.track_inventory} onCheckedChange={(value) => setErpValue('track_inventory', value)} /><ToggleRow label="Allow negative stock" checked={erp.allow_negative_stock} onCheckedChange={(value) => setErpValue('allow_negative_stock', value)} disabled={!erp.track_inventory} /><ToggleRow label="Batch tracking" checked={erp.batch_tracking} onCheckedChange={(value) => setErpValue('batch_tracking', value)} disabled={!erp.track_inventory} /><ToggleRow label="Expiry tracking" checked={erp.expiry_tracking} onCheckedChange={(value) => setErpValue('expiry_tracking', value)} disabled={!erp.track_inventory} /><ToggleRow label="Serial tracking" checked={erp.serial_tracking} onCheckedChange={(value) => setErpValue('serial_tracking', value)} disabled={!erp.track_inventory} /></div></SectionCard>
        <SectionCard icon={Barcode} title="Units & conversions" description="One base unit with optional purchasing or selling conversions.">
          <div className="mb-4 inline-flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">Base unit <span className="rounded-lg bg-white px-2 py-1 dark:bg-slate-900">{form.unit || 'Not selected'}</span></div>
          <div className="space-y-3">{(erp.unit_conversions || []).map((conversion, index) => <div key={`${index}-${conversion.to_unit}`} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr_90px_1fr_1fr_auto] dark:border-slate-700"><Input value={conversion.from_unit || form.unit || ''} onChange={(event) => updateConversion(index, 'from_unit', event.target.value)} placeholder="From unit" aria-label="From unit" /><Input type="number" min="0.0001" step="0.0001" value={conversion.factor} onChange={(event) => updateConversion(index, 'factor', event.target.value)} placeholder="Qty" aria-label="Conversion factor" /><Input value={conversion.to_unit} onChange={(event) => updateConversion(index, 'to_unit', event.target.value)} placeholder="To unit" aria-label="To unit" /><Input value={conversion.barcode || ''} onChange={(event) => updateConversion(index, 'barcode', event.target.value)} placeholder="Unit barcode" aria-label="Unit barcode" /><Button type="button" variant="ghost" size="icon" className="text-red-600" onClick={() => removeConversion(index)} aria-label="Remove conversion"><Trash2 className="h-4 w-4" /></Button></div>)}<Button type="button" variant="outline" className="w-full border-dashed text-blue-600" onClick={addConversion}><Plus className="mr-2 h-4 w-4" />Add unit conversion</Button></div>
        </SectionCard>
        <SectionCard icon={Building2} title="Branch opening stock" description="Opening quantities are synchronized with the ERP Inventory ledger when the product is saved.">
          {!branches.length && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-900">No active branch is available. Create a branch before setting opening stock.</p>}
          <div className="space-y-3">{branchStocks.map((row, index) => <div key={row.branch_id || row.branch} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"><div className="mb-3 flex items-center gap-2"><Store className="h-4 w-4 text-blue-600" /><p className="min-w-0 flex-1 truncate text-sm font-bold">{row.branch_name}</p>{toFiniteNumber(row.reorder_point) > 0 && toFiniteNumber(row.opening_stock) <= toFiniteNumber(row.reorder_point) ? <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-700">LOW</span> : <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700">HEALTHY</span>}</div><div className="grid grid-cols-3 gap-2"><Field label="Opening"><Input type="number" min="0" step="0.001" value={row.opening_stock} onChange={(event) => setStockValue(index, 'opening_stock', event.target.value)} disabled={!erp.track_inventory} /></Field><Field label="Reorder"><Input type="number" min="0" step="0.001" value={row.reorder_point} onChange={(event) => setStockValue(index, 'reorder_point', event.target.value)} disabled={!erp.track_inventory} /></Field><Field label="Par level"><Input type="number" min="0" step="0.001" value={row.par_level} onChange={(event) => setStockValue(index, 'par_level', event.target.value)} disabled={!erp.track_inventory} /></Field></div></div>)}</div>
        </SectionCard>
        <SectionCard icon={ClipboardCheck} title="Replenishment"><div className="grid gap-4 sm:grid-cols-3"><Field label="Preferred supplier"><Select value={form.supplier_id || '__none__'} onValueChange={(value) => set('supplier_id', value === '__none__' ? '' : value)}><SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger><SelectContent><SelectItem value="__none__">— None —</SelectItem>{suppliers.map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>)}</SelectContent></Select></Field><Field label="Lead time (days)"><Input type="number" min="0" value={erp.lead_time_days} onChange={(event) => setErpValue('lead_time_days', event.target.value)} /></Field><Field label="Minimum order"><Input type="number" min="0" step="0.001" value={erp.minimum_order_qty} onChange={(event) => setErpValue('minimum_order_qty', event.target.value)} /></Field></div><div className="mt-3"><ToggleRow label="Automatic purchase suggestion" checked={erp.automatic_purchase_suggestion} onCheckedChange={(value) => setErpValue('automatic_purchase_suggestion', value)} /></div></SectionCard>
        <div className="grid grid-cols-3 divide-x divide-slate-200 rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm dark:divide-slate-700 dark:border-slate-800 dark:bg-slate-950"><div><p className="text-[10px] text-slate-500">ON HAND</p><p className="mt-1 text-sm font-bold">{totalStock} {form.unit}</p></div><div><p className="text-[10px] text-slate-500">STOCK VALUE</p><p className="mt-1 text-sm font-bold text-emerald-600">{currency}{(totalStock * pricing.cost).toFixed(2)}</p></div><div><p className="text-[10px] text-slate-500">LOW BRANCHES</p><p className={cn('mt-1 text-sm font-bold', lowBranches ? 'text-amber-600' : 'text-emerald-600')}>{lowBranches}</p></div></div>
      </div>
    );
  };

  const renderAdvanced = () => (
    <div className="space-y-4">
      <ProductContext form={form} erp={erp} onEdit={() => setStep(0)} />
      <SectionCard icon={Layers3} title="Custom fields" description="Organization-specific fields configured in Customize Workspace.">{productCustomFields.length ? <div className="grid gap-4 sm:grid-cols-2">{productCustomFields.map((field) => <CustomAttributeControl key={field.id} field={field} value={form.custom_attributes?.[field.id] ?? field.default_value} onChange={(value) => setCustomAttribute(field.id, value)} />)}</div> : <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center dark:border-slate-700"><p className="text-sm font-semibold">No custom product fields</p><p className="mt-1 text-xs text-slate-500">Owners can add templates from Customize Workspace.</p></div>}</SectionCard>
      <SectionCard icon={ClipboardCheck} title="Sales & procurement rules"><div className="grid gap-x-6 sm:grid-cols-2"><ToggleRow label="Sellable" checked={erp.sellable} onCheckedChange={(value) => setErpValue('sellable', value)} /><ToggleRow label="Purchasable" checked={erp.purchasable} onCheckedChange={(value) => setErpValue('purchasable', value)} /><ToggleRow label="Returnable" checked={erp.returnable} onCheckedChange={(value) => setErpValue('returnable', value)} /><ToggleRow label="Manager approval required" checked={erp.requires_manager_approval} onCheckedChange={(value) => setErpValue('requires_manager_approval', value)} /></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="POS visibility"><Select value={erp.pos_visibility} onValueChange={(value) => setErpValue('pos_visibility', value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All branches</SelectItem><SelectItem value="selected">Selected branches</SelectItem><SelectItem value="hidden">Hidden from POS</SelectItem></SelectContent></Select></Field><Field label="Purchase limit per order"><Input type="number" min="0" value={erp.purchase_limit} onChange={(event) => setErpValue('purchase_limit', event.target.value)} placeholder="No limit" /></Field></div></SectionCard>
      <SectionCard icon={Calculator} title="Accounting mapping" description="Map operational activity to the chart of accounts."><div className="grid gap-4 sm:grid-cols-2"><Field label="Sales account"><Input value={erp.sales_account} onChange={(event) => setErpValue('sales_account', event.target.value)} /></Field><Field label="Inventory account"><Input value={erp.inventory_account} onChange={(event) => setErpValue('inventory_account', event.target.value)} /></Field><Field label="COGS account"><Input value={erp.cogs_account} onChange={(event) => setErpValue('cogs_account', event.target.value)} /></Field><Field label="Stock variance account"><Input value={erp.stock_variance_account} onChange={(event) => setErpValue('stock_variance_account', event.target.value)} /></Field></div></SectionCard>
      <SectionCard icon={ShieldCheck} title="Access & audit" description="These product-level rules remain subordinate to the owner's central RBAC policy."><div className="grid gap-3 sm:grid-cols-3"><Field label="Owner"><Select value={erp.owner_access} onValueChange={(value) => setErpValue('owner_access', value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="edit">Full edit</SelectItem><SelectItem value="view">View only</SelectItem></SelectContent></Select></Field><Field label="Manager"><Select value={erp.manager_access} onValueChange={(value) => setErpValue('manager_access', value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="edit">Full edit</SelectItem><SelectItem value="stock">Update stock</SelectItem><SelectItem value="view">View only</SelectItem></SelectContent></Select></Field><Field label="Employee"><Select value={erp.employee_access} onValueChange={(value) => setErpValue('employee_access', value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="stock">Update stock</SelectItem><SelectItem value="view">View only</SelectItem><SelectItem value="none">No access</SelectItem></SelectContent></Select></Field></div></SectionCard>
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/40"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white"><ShieldCheck className="h-5 w-5" /></span><div className="min-w-0"><p className="font-bold text-emerald-900 dark:text-emerald-200">Ready to {initial ? 'update' : 'create'}</p><p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-400">Review the summary before saving this ERP product master.</p></div></div><div className="mt-4 flex flex-wrap gap-2"><span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-emerald-700">4 sections complete</span><span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-blue-700">{branches.length} branches</span><span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-violet-700">VAT {toFiniteNumber(form.tax_rate)}%</span>{erp.price_change_requires_approval && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700">1 approval rule active</span>}</div></div>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="flex h-full min-h-0 flex-col bg-slate-50 dark:bg-slate-900">
      <header className="flex shrink-0 items-center gap-3 bg-white px-4 py-3 dark:bg-slate-950 sm:px-6 sm:py-4"><Button type="button" variant="ghost" size="icon" onClick={onCancel} aria-label="Close product form"><X className="h-5 w-5" /></Button><div className="min-w-0 flex-1"><h2 className="truncate text-lg font-black text-slate-950 sm:text-xl dark:text-white">{initial ? 'Edit Product' : 'New Product'}</h2><p className="text-xs text-slate-500">Step {step + 1} of {PRODUCT_MASTER_STEPS.length} · Product Master</p></div><span className={cn('rounded-full px-3 py-1 text-xs font-bold', initial ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300')}>{initial ? 'Editing' : 'Draft'}</span></header>
      <Stepper step={step} onStepChange={setStep} />
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-6 sm:py-5"><div className="mx-auto max-w-4xl">{step === 0 ? renderIdentity() : step === 1 ? renderPricing() : step === 2 ? renderInventory() : renderAdvanced()}</div></main>
      <footer className="shrink-0 border-t border-slate-200 bg-white px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 dark:border-slate-800 dark:bg-slate-950 sm:px-6"><div className="mx-auto flex max-w-4xl gap-2">{step > 0 && <Button type="button" variant="outline" className="h-11 px-3 sm:px-5" onClick={() => setStep((current) => current - 1)}><ArrowLeft className="mr-1.5 h-4 w-4" /><span className="hidden sm:inline">Back</span></Button>}<Button type="button" variant="outline" className="h-11 flex-1 sm:flex-none sm:px-6" onClick={saveDraft}><Save className="mr-2 h-4 w-4" />Save draft</Button>{step < 3 ? <Button type="button" className="h-11 flex-[1.35] sm:ml-auto sm:flex-none sm:px-7" onClick={goNext}>Continue <ArrowRight className="ml-2 h-4 w-4" /></Button> : <Button type="submit" className="h-11 flex-[1.35] sm:ml-auto sm:flex-none sm:px-7" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : initial ? 'Update Product' : 'Create Product'}{!isSubmitting && <ChevronRight className="ml-1.5 h-4 w-4" />}</Button>}</div></footer>
    </form>
  );
}
