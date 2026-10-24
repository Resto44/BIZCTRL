import { isReportFixedCategory, expenseAllocationFields, invalidateExpenseClosingContext } from '@/lib/expenseConfiguration';
import { useBranchScope } from '@/lib/BranchScopeContext';
import { toast } from 'sonner';
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, Tag, FolderOpen, Lock, Zap } from 'lucide-react';

const COLOR_OPTIONS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16'];

export function CategoryForm({ initial, onSubmit, onCancel, lang, branchId }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    color: initial?.color || '#6366f1',
    is_fixed: initial ? isReportFixedCategory(initial) : null,
    monthly_amount: initial?.monthly_amount ?? 0,
    allocation_days: initial?.allocation_days ?? 30,
    is_active: initial?.is_active !== false,
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const copy = (fa, ar, en) => lang === 'fa' ? fa : lang === 'ar' ? ar : en;
  let valid = Boolean(form.name.trim());
  try { expenseAllocationFields(form, branchId); } catch { valid = false; }
  return (
    <div className="space-y-3">
      <div>
        <Label>Category Name *</Label>
        <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Rent" />
      </div>

      {/* ── Expense Type Toggle ── */}
      <div>
        <Label className="mb-1 block">Expense Type *</Label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => set('is_fixed', true)}
            className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all ${
              form.is_fixed
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40'
                : 'border-border bg-card hover:bg-muted/60'
            }`}
          >
            <Lock className={`w-5 h-5 ${form.is_fixed ? 'text-blue-600' : 'text-muted-foreground'}`} />
            <span className={`text-xs font-bold ${form.is_fixed ? 'text-blue-700 dark:text-blue-300' : 'text-muted-foreground'}`}>
              Fixed Monthly
            </span>
            <span className="text-[10px] text-muted-foreground text-center leading-tight">
              Rent · Salary · Subscription
            </span>
          </button>
          <button
            type="button"
            onClick={() => set('is_fixed', false)}
            className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all ${
              form.is_fixed === false
                ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40'
                : 'border-border bg-card hover:bg-muted/60'
            }`}
          >
            <Zap className={`w-5 h-5 ${form.is_fixed === false ? 'text-amber-600' : 'text-muted-foreground'}`} />
            <span className={`text-xs font-bold ${form.is_fixed === false ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}>
              Daily Operating
            </span>
            <span className="text-[10px] text-muted-foreground text-center leading-tight">
              Fuel · Supplies · Daily costs
            </span>
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">
          {form.is_fixed
            ? copy('سهم روزانه = مبلغ ماهانه ÷ روزهای تخصیص. نام دسته نوع حسابداری را تعیین نمی‌کند.', 'الحصة اليومية = المبلغ الشهري ÷ أيام التوزيع. اسم الفئة لا يحدد نوعها المحاسبي.', 'Daily allocation = monthly amount ÷ allocation days. The category name does not set its accounting type.')
            : '⚡ Daily expenses are counted in full on the day they are entered.'}
        </p>
      </div>

      {form.is_fixed === null && <p role="alert" className="text-xs text-amber-700">{copy('نوع مصرف را صریحاً انتخاب کنید.', 'اختر نوع المصروف صراحةً.', 'Select an expense type explicitly.')}</p>}
      {form.is_fixed === true && <div className="space-y-2 rounded-xl border p-3">
        <Label>{copy('مبلغ ماهانهٔ همین شعبه', 'المبلغ الشهري لهذا الفرع', 'Monthly amount for this branch')}</Label>
        <Input aria-label="Monthly allocation amount" type="number" min="0" step="0.01" disabled={!branchId} value={form.monthly_amount} onChange={e => set('monthly_amount', e.target.value)} />
        <Label>{copy('تعداد روزهای تخصیص', 'عدد أيام التوزيع', 'Allocation days')}</Label>
        <Input aria-label="Allocation days" type="number" min="1" max="366" step="1" value={form.allocation_days} onChange={e => set('allocation_days', e.target.value)} />
        <p className="text-xs text-muted-foreground">{copy('هر هزینهٔ ثابت مثل کرایه یا معاش، دستهٔ جدا داشته باشد. مبلغ تنظیم‌شده جایگزین سند ماهانه می‌شود؛ دوباره جمع نمی‌شود. صفر یعنی استفاده از آخرین سند واجد شرایط همان ماه، تا تاریخ کلوزینگ.', 'أنشئ فئة منفصلة لكل تكلفة ثابتة كالإيجار والرواتب. المبلغ المحدد يحل محل مستند الشهر ولا يضاف إليه. الصفر يستخدم آخر مستند مؤهل للشهر حتى تاريخ الإقفال.', 'Use a separate category for each recurring cost, such as rent or salaries. Configuration replaces the monthly source; it is not added twice. Zero uses the latest eligible monthly record on or before closing.')}</p>
        {!branchId && <p className="text-xs text-amber-700">{copy('برای مبلغ ماهانه، دسته باید مخصوص یک شعبه باشد.', 'يجب تخصيص الفئة لفرع لضبط المبلغ الشهري.', 'A configured monthly amount requires a branch-owned category.')}</p>}
      </div>}
      <div>
        <Label>Color</Label>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {COLOR_OPTIONS.map(c => (
            <button key={c} onClick={() => set('color', c)}
              className={`w-7 h-7 rounded-full border-2 transition-all ${form.color === c ? 'border-foreground scale-110' : 'border-transparent'}`}
              style={{ background: c }} />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="cat_active" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} className="w-4 h-4" />
        <Label htmlFor="cat_active">Active</Label>
      </div>
      <div className="flex gap-2 pt-2">
        <Button className="flex-1" onClick={() => { if (valid) onSubmit(form); }} disabled={!valid}>Save</Button>
        {onCancel && <Button variant="outline" onClick={onCancel}>Cancel</Button>}
      </div>
    </div>
  );
}

export function useExpenseCategories() {
  const { activeRestaurantId } = useTenant();
  
  return useQuery({
    queryKey: ['expense_categories', activeRestaurantId],
    queryFn: () => base44.entities.ExpenseCategory.filter(
      activeRestaurantId ? { restaurant_id: activeRestaurantId } : {},
      'sort_order',
      500
    ),
    enabled: true,
    staleTime: 30000,
  });
}

export default function ExpenseCategoryManager({ onClose }) {
  const { lang } = useLanguage();
  const qc = useQueryClient();
  const { selectedBranchId } = useBranchScope();
  const newCategoryBranchId = selectedBranchId && selectedBranchId !== 'all' ? selectedBranchId : null;
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const { data: categories = [], isLoading } = useExpenseCategories();

  const { activeRestaurantId, isBranchScoped, managerBranchObject, managerBranch } = useTenant();
  const createMut = useMutation({
    mutationFn: async (d) => {
      const payload = { 
        name: d.name,
        color: d.color,
        ...expenseAllocationFields(d, newCategoryBranchId),
        branch_id: newCategoryBranchId,
        is_active: d.is_active,
        restaurant_id: activeRestaurantId,
        ...(isBranchScoped ? { branch_id: managerBranchObject?.id || managerBranch } : {}),
      };
      return base44.entities.ExpenseCategory.create(payload);
    },
    onError: error => toast.error(error.message),
    onSuccess: () => { 
      qc.invalidateQueries({ queryKey: ['expense_categories'] }); 
      qc.invalidateQueries({ queryKey: ['expense_categories_dash'] });
      invalidateExpenseClosingContext(qc);
      setShowForm(false); 
    }
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => {
      return base44.entities.ExpenseCategory.update(id, {
        name: data.name,
        color: data.color,
        ...expenseAllocationFields(data, categories.find(category => category.id === id)?.branch_id),
        is_active: data.is_active
      });
    },
    onError: error => toast.error(error.message),
    onSuccess: () => { 
      qc.invalidateQueries({ queryKey: ['expense_categories'] }); 
      qc.invalidateQueries({ queryKey: ['expense_categories_dash'] });
      invalidateExpenseClosingContext(qc);
      setEditing(null); 
    }
  });
  const deleteMut = useMutation({
    mutationFn: id => base44.entities.ExpenseCategory.delete(id),
    onError: error => toast.error(error.message),
    onSuccess: () => { 
      qc.invalidateQueries({ queryKey: ['expense_categories'] }); 
      qc.invalidateQueries({ queryKey: ['expense_categories_dash'] });
      invalidateExpenseClosingContext(qc);
      setDeleting(null); 
    }
  });

  // Split categories into fixed and variable for display
  const fixedCategories = categories.filter(isReportFixedCategory);
  const variableCategories = categories.filter(c => !isReportFixedCategory(c));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Expense Categories</span>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{categories.length}</span>
        </div>
        <Button size="sm" onClick={() => { setShowForm(true); setEditing(null); }}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add Category
        </Button>
      </div>

      {isLoading ? (
        <p className="text-center text-muted-foreground text-sm py-4">Loading...</p>
      ) : categories.length === 0 ? (
        <Card className="p-6 text-center border-dashed">
          <Tag className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-semibold text-foreground mb-1">No expense categories yet</p>
          <p className="text-xs text-muted-foreground mb-3">Create your first category to start tracking expenses</p>
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Create First Category
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {/* Fixed Monthly Expenses */}
          {fixedCategories.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Lock className="w-3.5 h-3.5 text-blue-600" />
                <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wider">Fixed Monthly</span>
                <span className="text-[10px] text-muted-foreground bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 rounded-full">{fixedCategories.length}</span>
              </div>
              <div className="space-y-1.5">
                {fixedCategories.map(cat => (
                  <div key={cat.id} className={`flex items-center gap-2 p-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 ${!cat.is_active ? 'opacity-50' : ''}`}>
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: cat.color || '#888' }} />
                    <span className="flex-1 text-sm font-medium">{cat.name}</span>
                    <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-700 dark:text-blue-300">Fixed</Badge>
                    {!cat.is_active && <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Inactive</span>}
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(cat)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleting(cat)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Daily Operating Expenses */}
          {variableCategories.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wider">Daily Operating</span>
                <span className="text-[10px] text-muted-foreground bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded-full">{variableCategories.length}</span>
              </div>
              <div className="space-y-1.5">
                {variableCategories.map(cat => (
                  <div key={cat.id} className={`flex items-center gap-2 p-2 rounded-lg border bg-card ${!cat.is_active ? 'opacity-50' : ''}`}>
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: cat.color || '#888' }} />
                    <span className="flex-1 text-sm font-medium">{cat.name}</span>
                    {!cat.is_active && <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Inactive</span>}
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(cat)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleting(cat)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {onClose && (
        <Button variant="outline" className="w-full mt-2" onClick={onClose}>Done</Button>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Expense Category</DialogTitle></DialogHeader>
          <CategoryForm lang={lang} branchId={newCategoryBranchId} onSubmit={d => createMut.mutate(d)} onCancel={() => setShowForm(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={open => { if (!open) setEditing(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Edit Category</DialogTitle></DialogHeader>
          {editing && <CategoryForm lang={lang} branchId={editing.branch_id} initial={editing} onSubmit={d => updateMut.mutate({ id: editing.id, data: d })} onCancel={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={open => { if (!open) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category?</AlertDialogTitle>
            <AlertDialogDescription>This will not delete existing expenses using this category.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMut.mutate(deleting.id)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
