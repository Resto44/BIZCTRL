import React, { useState, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useLanguage } from '@/lib/LanguageContext';
import { useNotify } from '@/lib/useNotify';
import { useTenant } from '@/lib/TenantContext';
import { usePurchaseCategories } from '@/hooks/usePurchaseCategories';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import BranchSelect from '@/components/shared/BranchSelect';
import { format } from 'date-fns';
import { Package, Plus, Tag, PlusCircle, Check, X, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

const UI = {
  en: {
    title: 'Daily Purchase',
    date: 'Date', branch: 'Branch',
    category: 'Category', product: 'Product',
    quantity: 'Qty', price: 'Price',
    payment: 'Payment Method', notes: 'Notes',
    cash: 'Cash', network: 'Network', credit: 'Credit',
    total: 'Total Cost',
    save: 'Save', save_add: 'Save & Add',
    select_category: 'Select category...',
    no_categories: 'No categories yet',
    add_category: '+ New Category',
    new_cat_placeholder: 'Category name...',
    create: 'Create',
    cancel: 'Cancel',
    saving: 'Saving...',
    saved: '✓ Saved!',
    select_product: 'Select product',
    def: 'def',
    optional: 'optional',
  },
  ar: {
    title: 'مشتريات يومية',
    date: 'التاريخ', branch: 'الفرع',
    category: 'الفئة', product: 'المنتج',
    quantity: 'الكمية', price: 'السعر',
    payment: 'طريقة الدفع', notes: 'ملاحظات',
    cash: 'نقداً', network: 'شبكة', credit: 'آجل',
    total: 'إجمالي التكلفة',
    save: 'حفظ', save_add: 'حفظ وإضافة',
    select_category: 'اختر الفئة...',
    no_categories: 'لا توجد فئات بعد',
    add_category: '+ فئة جديدة',
    new_cat_placeholder: 'اسم الفئة...',
    create: 'إنشاء',
    cancel: 'إلغاء',
    saving: 'جاري الحفظ...',
    saved: '✓ تم الحفظ!',
    select_product: 'اختر المنتج',
    def: 'افتراضي',
    optional: 'اختياري',
  },
  fa: {
    title: 'خرید روزانه',
    date: 'تاریخ', branch: 'فرع',
    category: 'دسته‌بندی', product: 'محصول',
    quantity: 'مقدار', price: 'قیمت',
    payment: 'روش پرداخت', notes: 'یادداشت',
    cash: 'نقد', network: 'شبکه', credit: 'نسیه',
    total: 'جمع هزینه',
    save: 'ذخیره', save_add: 'ذخیره و افزودن',
    select_category: 'انتخاب دسته...',
    no_categories: 'هنوز دسته‌ای ندارید',
    add_category: '+ دسته جدید',
    new_cat_placeholder: 'نام دسته...',
    create: 'ایجاد',
    cancel: 'لغو',
    saving: 'در حال ذخیره...',
    saved: '✓ ذخیره شد!',
    select_product: 'انتخاب محصول',
    def: 'پیش‌فرض',
    optional: 'اختیاری',
  },
};

const defaultForm = () => ({
  date: format(new Date(), 'yyyy-MM-dd'),
  branch: localStorage.getItem('qa_last_branch') || 'branch_1',
  category: localStorage.getItem('qa_last_category') || '',
  product_id: localStorage.getItem('qa_last_product') || '',
  qty: '',
  current_price: '',
  payment_method: 'cash',
  notes: '',
});

export default function QuickPurchaseModal({ open, onOpenChange }) {
  const { lang, currency } = useLanguage();
  const u = UI[lang] || UI.en;
  const qc = useQueryClient();
  const notif = useNotify();
  const { ownerFilter, activeRestaurantId, branches } = useTenant();
  const qtyRef = useRef(null);

  const [form, setForm] = useState(defaultForm());
  const [saved, setSaved] = useState(false);

  // Inline quick-create category state
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [creatingCat, setCreatingCat] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list('name', 10000),
    staleTime: 300000,
  });

  const { options: categoryOptions, isLoading: loadingCats } = usePurchaseCategories();

  useEffect(() => {
    if (open) { setForm(defaultForm()); setSaved(false); setShowNewCat(false); setNewCatName(''); }
  }, [open]);

  useEffect(() => {
    if (form.product_id && open) setTimeout(() => qtyRef.current?.focus(), 80);
  }, [form.product_id]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const selectedProduct = products.find(p => p.product_id === form.product_id);

  // Inline quick category creation disabled — use ProductCategory instead
  const handleCreateCategory = async () => {
    // This feature is deprecated. Categories should be managed through CategoryManager.
  };

  const saveMut = useMutation({
    mutationFn: async (data) => {
      const purchase = await base44.entities.Purchase.create(data);
      const total = (data.qty || 0) * (data.used_price || 0);
      await notif.purchase({ branch: data.branch, amount: total, action: 'create' });
      localStorage.setItem('qa_last_branch', data.branch);
      localStorage.setItem('qa_last_product', data.product_id);
      if (data.category_id) localStorage.setItem('qa_last_category', data.category_id);
      return purchase;
    },
    onSuccess: () => {
  
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    },
  });

  const buildData = () => {
    const usedPrice = form.current_price
      ? Number(form.current_price)
      : (selectedProduct?.default_cost || selectedProduct?.default_price || 0);
    const selectedCat = categoryOptions.find(c => c.value === form.category);
    // Resolve branch_id UUID from branch key string for RLS scope
    const selectedBranch = branches.find(b => b.key === form.branch || b.branch_key === form.branch);
    const branchId = selectedBranch?.id || null;
    return {
      date: form.date,
      branch: form.branch,
      product_id: form.product_id,
      product_name: selectedProduct?.name || '',
      qty: Number(form.qty) || 0,
      current_price: form.current_price ? Number(form.current_price) : null,
      used_price: usedPrice,
      payment_method: form.payment_method,
      notes: form.notes,
      category: selectedCat ? (selectedCat.cat.name_en || selectedCat.cat.name_ar || selectedCat.cat.name_fa) : '',
      category_id: form.category,
      // RLS required scope fields
      restaurant_id: activeRestaurantId || null,
      branch_id: branchId,
    };
  };

  const canSave = form.branch && form.product_id && Number(form.qty) > 0;
  const busy = saveMut.isPending;

  const handleSave = async (e) => {
    e?.preventDefault();
    if (!canSave) return;
    await saveMut.mutateAsync(buildData());
    onOpenChange(false);
  };

  const handleSaveAndAdd = async (e) => {
    e?.preventDefault();
    if (!canSave) return;
    const { branch, date, payment_method, category } = form;
    await saveMut.mutateAsync(buildData());
    setForm({ ...defaultForm(), branch, date, payment_method, category, product_id: form.product_id });
    setTimeout(() => qtyRef.current?.focus(), 80);
  };

  const total = (Number(form.qty) || 0) * (
    form.current_price
      ? Number(form.current_price)
      : (selectedProduct?.default_cost || selectedProduct?.default_price || 0)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Package className="w-4 h-4 text-amber-500" />
            {u.title}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-3">
          {/* Row 1: Date + Branch */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">{u.date}</Label>
              <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">{u.branch}</Label>
              <BranchSelect value={form.branch} onChange={v => set('branch', v)} />
            </div>
          </div>

          {/* Row 2: Category */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs flex items-center gap-1">
                <Tag className="w-3 h-3" /> {u.category}
              </Label>
              {!showNewCat && (
                <button
                  type="button"
                  onClick={() => setShowNewCat(true)}
                  className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                >
                  <PlusCircle className="w-3 h-3" /> {u.add_category}
                </button>
              )}
            </div>

            {/* Inline quick-create */}
            {showNewCat && (
              <div className="flex gap-1.5 mb-1.5">
                <Input
                  autoFocus
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  placeholder={u.new_cat_placeholder}
                  className="h-8 text-sm"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateCategory(); } }}
                />
                <Button type="button" size="sm" className="h-8 px-2" onClick={handleCreateCategory} disabled={creatingCat || !newCatName.trim()}>
                  {creatingCat ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-8 px-2" onClick={() => { setShowNewCat(false); setNewCatName(''); }}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}

            {loadingCats ? (
              <div className="h-9 bg-muted animate-pulse rounded-md" />
            ) : categoryOptions.length === 0 ? (
              <div className="flex items-center justify-center p-2 rounded-lg border border-dashed border-border bg-muted/30">
                <span className="text-xs text-muted-foreground">{u.no_categories}</span>
              </div>
            ) : (
              <Select value={form.category} onValueChange={v => { set('category', v); localStorage.setItem('qa_last_category', v); }}>
                <SelectTrigger>
                  <SelectValue placeholder={u.select_category} />
                </SelectTrigger>
                <SelectContent>
                  {/* Favorites first */}
                  {categoryOptions.filter(c => c.cat.is_favorite).map(c => (
                    <SelectItem key={c.value} value={c.value}>
                      ⭐ {c.label}
                    </SelectItem>
                  ))}
                  {categoryOptions.filter(c => !c.cat.is_favorite).map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Row 3: Product */}
          <div>
            <Label className="text-xs">{u.product}</Label>
            <Select value={form.product_id} onValueChange={v => set('product_id', v)}>
              <SelectTrigger>
                <SelectValue placeholder={u.select_product} />
              </SelectTrigger>
              <SelectContent>
                {products.map(p => (
                  <SelectItem key={p.product_id} value={p.product_id}>
                    {p.name} · {p.unit}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Row 4: Qty + Price */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">{u.quantity} ({selectedProduct?.unit || '—'})</Label>
              <Input
                ref={qtyRef}
                type="number" inputMode="decimal" step="0.01" min="0.01"
                value={form.qty} onChange={e => set('qty', e.target.value)}
                placeholder="0" className="text-center font-semibold"
              />
            </div>
            <div>
              <Label className="text-xs">
                {u.price}
                {selectedProduct && (
                  <span className="text-muted-foreground ms-1 text-[10px]">
                    ({u.def}: {selectedProduct.default_cost || selectedProduct.default_price})
                  </span>
                )}
              </Label>
              <Input
                type="number" inputMode="decimal" step="0.01"
                value={form.current_price} onChange={e => set('current_price', e.target.value)}
                placeholder={String(selectedProduct?.default_cost || selectedProduct?.default_price || '')}
                className="text-center"
              />
            </div>
          </div>

          {/* Row 5: Payment Method */}
          <div>
            <Label className="text-xs">{u.payment}</Label>
            <Select value={form.payment_method} onValueChange={v => set('payment_method', v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">{u.cash}</SelectItem>
                <SelectItem value="network">{u.network}</SelectItem>
                <SelectItem value="credit">{u.credit}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Total */}
          {total > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-2.5 text-center">
              <p className="text-xs text-muted-foreground">{u.total}</p>
              <p className="text-xl font-bold text-amber-600">{currency}{total.toLocaleString()}</p>
            </div>
          )}

          {/* Notes */}
          <div>
            <Label className="text-xs">{u.notes} ({u.optional})</Label>
            <Input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="..." />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button type="submit" className="flex-1 h-11 text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-white" disabled={busy || !canSave}>
              {busy ? u.saving : saved ? u.saved : u.save}
            </Button>
            <Button type="button" variant="outline" className="flex-1 h-11 text-sm" disabled={busy || !canSave} onClick={handleSaveAndAdd}>
              <Plus className="w-3.5 h-3.5 me-1" /> {u.save_add}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}