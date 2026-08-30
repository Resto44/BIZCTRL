import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44, supabase } from '@/api/base44Client';
import { useLanguage } from '@/lib/LanguageContext';
import PageHeader from '@/components/shared/PageHeader';
import BranchSelect from '@/components/shared/BranchSelect';
import EmptyState from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, ScanLine, BarChart3, FolderOpen, Tag } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import ExpenseAnalytics from '@/components/expenses/ExpenseAnalytics';
import ExpenseCategoryManager, { useExpenseCategories } from '@/components/expenses/ExpenseCategoryManager';
import { format } from 'date-fns';
import { formatCurrency } from '@/lib/helpers';
import ReceiptScanner from '@/components/expenses/ReceiptScanner';
import { Dialog as ScanDialog, DialogContent as ScanDialogContent, DialogHeader as ScanDialogHeader, DialogTitle as ScanDialogTitle } from '@/components/ui/dialog';
import { useNotify } from '@/lib/useNotify';
import { useTenant } from '@/lib/TenantContext';
import { useBranchScope } from '@/lib/BranchScopeContext';

function ExpenseForm({ initial, onSubmit, onCancel, categories }) {
  const { t } = useLanguage();
  const { branches, managerBranch } = useTenant();
  const { selectedBranchId, selectedBranchKey, isAllBranches } = useBranchScope();
  const defaultBranch = !isAllBranches ? (selectedBranchKey || '') : (managerBranch || branches[0]?.key || branches[0]?.branch_key || '');
  // Resolve branch_key: use stored value only if it matches a known branch or is 'all';
  // otherwise fall back to defaultBranch to prevent blank dropdown on edit.
  const knownBranchKeys = ['all', ...branches.map(b => b.key)];
  const resolvedBranchKey = (initial?.branch_key && knownBranchKeys.includes(initial.branch_key))
    ? initial.branch_key
    : (initial?.branch_key ? defaultBranch : (defaultBranch || 'all'));
  const [form, setForm] = useState({
    date: initial?.date || format(new Date(), 'yyyy-MM-dd'),
    branch_key: resolvedBranchKey,
    branch_id: initial?.branch_id || (!isAllBranches ? selectedBranchId : (branches.find((branch) => (branch.key || branch.branch_key) === resolvedBranchKey)?.id || null)),
    category_id: initial?.category_id || '',
    description: initial?.description || '',
    amount: initial?.amount || '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const activeCats = categories.filter(c => c.is_active !== false);

  return (
    <div className="space-y-3">
      <div><Label>{t('date')}</Label><Input type="date" value={form.date} onChange={e => set('date', e.target.value)} /></div>
      <div><Label>{t('branch')}</Label>
        <Select value={form.branch_key} onValueChange={v => set('branch_key', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('all_branches')}</SelectItem>
            {branches.map(b => <SelectItem key={b.key} value={b.key}>{b.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>{t('expense_category')}</Label>
        {activeCats.length === 0 ? (
          <div className="mt-1 p-3 rounded-lg border border-dashed text-center">
            <Tag className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">No categories yet. Create them in the Categories tab.</p>
          </div>
        ) : (
          <Select value={form.category_id} onValueChange={v => set('category_id', v)}>
            <SelectTrigger><SelectValue placeholder="Select category..." /></SelectTrigger>
            <SelectContent>
              {activeCats.filter(c => c.is_fixed === true).length > 0 && (
                <>
                  <div className="px-2 py-1 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Fixed Monthly</div>
                  {activeCats.filter(c => c.is_fixed === true).map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color || '#888' }} />
                        <span>{c.name}</span>
                        <span className="text-[10px] text-blue-500">(Fixed)</span>
                      </span>
                    </SelectItem>
                  ))}
                </>
              )}
              {activeCats.filter(c => c.is_fixed !== true).length > 0 && (
                <>
                  <div className="px-2 py-1 text-[10px] font-bold text-amber-600 uppercase tracking-wider">Daily Operating</div>
                  {activeCats.filter(c => c.is_fixed !== true).map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color || '#888' }} />
                        <span>{c.name}</span>
                      </span>
                    </SelectItem>
                  ))}
                </>
              )}
            </SelectContent>
          </Select>
        )}
      </div>
      <div><Label>{t('description')}</Label><Input value={form.description} onChange={e => set('description', e.target.value)} /></div>
      <div><Label>{t('amount')}</Label><Input type="number" value={form.amount} onChange={e => set('amount', e.target.value)} /></div>
      <div className="flex gap-2 pt-2">
        <Button className="flex-1" onClick={() => onSubmit({
          ...form,
          branch_id: branches.find((branch) => (branch.key || branch.branch_key) === form.branch_key)?.id || form.branch_id || null,
          amount: Number(form.amount) || 0,
        })}>{t('save')}</Button>
        {onCancel && <Button variant="outline" onClick={onCancel}>{t('cancel')}</Button>}
      </div>
    </div>
  );
}

export default function Expenses() {
  const { t, currency } = useLanguage();
  const { branches, ownerFilter, activeRestaurant } = useTenant();
  const { selectedBranchId, selectedBranchKey, isAllBranches, setSelectedBranchId } = useBranchScope();
  const qc = useQueryClient();
  const notif = useNotify();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const filterBranch = isAllBranches ? 'all' : (selectedBranchKey || 'all');
  const [showScanner, setShowScanner] = useState(false);
  const [scannedData, setScannedData] = useState(null);

  // Canonical and legacy records are both restricted by restaurant server-side.
  // The legacy path accepts only null-UUID rows of the selected branch key.
  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['expenses', activeRestaurant?.id, selectedBranchId],
    queryFn: async () => {
      if (!activeRestaurant?.id) return [];
      const baseQuery = () => supabase.from('expenses').select('*')
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
        baseQuery().is('branch_id', null).eq('branch_key', selectedBranchKey),
      ]);
      if (canonical.error || legacy.error) throw canonical.error || legacy.error;
      return Array.from(new Map([...(canonical.data || []), ...(legacy.data || [])]
        .map((record) => [record.id, record])).values());
    },
    staleTime: 120000,
    enabled: Boolean(activeRestaurant?.id),
  });

  const { data: categories = [] } = useExpenseCategories();

  const getCatById = (id) => categories.find(c => c.id === id);
  const getCatDisplayName = (categoryId) => {
    const cat = getCatById(categoryId);
    return cat ? cat.name : t('uncategorized');
  };

  const { activeRestaurantId, restaurants: tenantRestaurants } = useTenant();
  // Resolve restaurant_id: prefer the actively selected one, fall back to the first
  // restaurant in the list. This handles the case where localStorage has no saved
  // selection yet (first login / cleared storage) and activeRestaurantId is null.
  const resolvedRestaurantId = activeRestaurant?.id || activeRestaurantId || tenantRestaurants?.[0]?.id || null;
  const createMut = useMutation({
    mutationFn: async (d) => {
      console.log('[Expenses] createMut called with form data:', JSON.stringify(d));
      console.log('[Expenses] resolvedRestaurantId:', resolvedRestaurantId);
      const payload = {
        ...d,
        restaurant_id: resolvedRestaurantId,
        // Use the selected branch key only when a branch is in scope. All-branch
        // creation still requires an explicit form branch, never an unsafe fallback.
        branch_key: d.branch_key || selectedBranchKey || '',
        branch_id: d.branch_id || (selectedBranchId === 'all' ? null : selectedBranchId),
        // category_id must be null (not empty string) when not selected — UUID column
        category_id: d.category_id || null,
      };
      console.log('[Expenses] payload to Expense.create():', JSON.stringify(payload));
      console.log('[Expenses] payload fields check:', {
        restaurant_id: payload.restaurant_id,
        branch_key: payload.branch_key,
        category_id: payload.category_id,
        amount: payload.amount,
        description: payload.description,
        date: payload.date,
      });
      let exp;
      try {
        exp = await base44.entities.Expense.create(payload);
        console.log('[Expenses] Expense.create() SUCCESS:', JSON.stringify(exp));
      } catch (createErr) {
        console.error('[Expenses] Expense.create() THREW:', createErr?.code, createErr?.message, createErr?.details, createErr?.hint, createErr);
        throw createErr;
      }
      try {
        await notif.expense({ branch: d.branch_key, amount: d.amount, category: d.category_id, action: 'create' });
      } catch (notifErr) {
        console.warn('[Expenses] notif.expense() failed (non-fatal):', notifErr?.message);
      }
      return exp;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['expenses_today'] });
      qc.invalidateQueries({ queryKey: ['expenses_yesterday'] });
      qc.invalidateQueries({ queryKey: ['expenses_week'] });
      qc.invalidateQueries({ queryKey: ['expenses_month'] });
      qc.invalidateQueries({ queryKey: ['expenses_year'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setShowForm(false);
    }
  });
  const updateMut = useMutation({
    mutationFn: async ({ id, data }) => {
      const exp = await base44.entities.Expense.update(id, data);
      await notif.expense({ branch: data.branch_key, amount: data.amount, category: data.category_id, action: 'update' });
      return exp;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['expenses_today'] });
      qc.invalidateQueries({ queryKey: ['expenses_yesterday'] });
      qc.invalidateQueries({ queryKey: ['expenses_week'] });
      qc.invalidateQueries({ queryKey: ['expenses_month'] });
      qc.invalidateQueries({ queryKey: ['expenses_year'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setEditing(null);
    }
  });
  const deleteMut = useMutation({
    mutationFn: async (expense) => {
      if (!expense?.id) throw new Error('Cannot delete expense: missing id');
      const expenseId = expense.id;
      console.log('Attempting to delete expense:', expenseId);
      const { data, error, status } = await supabase
        .from("expenses")
        .delete()
        .eq("id", expenseId)
        .select();

      console.log("REAL DELETE RESULT", {
        expenseId,
        data,
        error,
        status
      });

      if (error) {
        console.error('Delete expense error:', error);
        throw error;
      }
      try {
        await notif.expense({ branch: expense.branch_key, amount: expense.amount, category: expense.category_id, action: 'delete' });
      } catch (notifErr) {
        // non-fatal
      }
      return { success: true };
    },
    onSuccess: () => {
      // Invalidate all expense-related query keys
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['expenses_today'] });
      qc.invalidateQueries({ queryKey: ['expenses_yesterday'] });
      qc.invalidateQueries({ queryKey: ['expenses_week'] });
      qc.invalidateQueries({ queryKey: ['expenses_month'] });
      qc.invalidateQueries({ queryKey: ['expenses_year'] });
      // Invalidate dashboard KPI queries that depend on expenses
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['reports'] });
      // Also invalidate sales/profit queries that embed expense data
      qc.invalidateQueries({ queryKey: ['sales_today'] });
      qc.invalidateQueries({ queryKey: ['sales_month'] });
      setDeleting(null);
    },
    onError: (err) => {
      console.error('[Expenses] deleteMut error:', err?.code, err?.message, err?.details, err);
    },
  });

  const filtered = expenses;
  const totalAmt = filtered.reduce((s, e) => s + (e.amount || 0), 0);

  return (
    <div>
      <PageHeader
        title={t('expenses')}
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowScanner(true)}>
              <ScanLine className="w-4 h-4 mr-1" /> Scan
            </Button>
            <Button size="sm" onClick={() => { setShowForm(true); setEditing(null); setScannedData(null); }}>
              <Plus className="w-4 h-4 mr-1" />{t('add_expense')}
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="list">
        <TabsList className="w-full mb-4">
          <TabsTrigger value="list" className="flex-1 text-xs">List</TabsTrigger>
          <TabsTrigger value="analytics" className="flex-1 text-xs">
            <BarChart3 className="w-3.5 h-3.5 mr-1" />Analytics
          </TabsTrigger>
          <TabsTrigger value="categories" className="flex-1 text-xs">
            <FolderOpen className="w-3.5 h-3.5 mr-1" />Categories
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <div className="mb-4">
            <BranchSelect
              value={filterBranch}
              onChange={(branchKey) => setSelectedBranchId(
                branchKey === 'all' ? 'all' : branches.find((branch) => (branch.key || branch.branch_key) === branchKey)?.id || 'all'
              )}
              includeAll
            />
          </div>

          {totalAmt > 0 && (
            <Card className="p-3 mb-4 bg-destructive/10 border-destructive/20">
              <p className="text-sm font-semibold text-destructive">{t('total_expenses')}: {formatCurrency(totalAmt, currency)}</p>
            </Card>
          )}

          {isLoading ? <p className="text-center text-muted-foreground text-sm py-8">{t('loading')}</p>
            : filtered.length === 0 ? <EmptyState />
            : (
              <div className="space-y-2">
                {filtered.map(e => {
                  const cat = getCatById(e.category_id);
                  return (
                    <Card key={e.id} className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {cat && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: cat.color || '#888' }} />}
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">{e.description || getCatDisplayName(e.category_id)}</p>
                            <p className="text-xs text-muted-foreground">{e.date} · {e.branch_key === 'all' ? t('all_branches') : (branches.find(b => b.key === e.branch_key)?.label || e.branch_key)}</p>
                            <p className="text-xs text-muted-foreground italic">{getCatDisplayName(e.category_id)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm font-bold text-destructive">{formatCurrency(e.amount, currency)}</span>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(e)}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleting(e)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
        </TabsContent>

        <TabsContent value="analytics">
          <ExpenseAnalytics expenses={expenses} categories={categories} />
        </TabsContent>

        <TabsContent value="categories">
          <ExpenseCategoryManager />
        </TabsContent>
      </Tabs>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t('add_expense')}</DialogTitle></DialogHeader>
          <ExpenseForm initial={scannedData} categories={categories} onSubmit={d => createMut.mutate(d)} onCancel={() => setShowForm(false)} />
        </DialogContent>
      </Dialog>

      <ScanDialog open={showScanner} onOpenChange={setShowScanner}>
        <ScanDialogContent className="max-w-sm">
          <ScanDialogHeader><ScanDialogTitle>Scan Receipt</ScanDialogTitle></ScanDialogHeader>
          <ReceiptScanner
            onExtracted={(data) => {
              setScannedData({ amount: data.amount, date: data.date, description: data.vendor || data.description, category_id: data.category_id });
              setShowScanner(false);
              setShowForm(true);
            }}
            onClose={() => setShowScanner(false)}
          />
        </ScanDialogContent>
      </ScanDialog>

      <Dialog open={!!editing} onOpenChange={open => { if (!open) setEditing(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t('edit_expense')}</DialogTitle></DialogHeader>
          {editing && <ExpenseForm initial={editing} categories={categories} onSubmit={d => updateMut.mutate({ id: editing.id, data: d })} onCancel={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={open => { if (!open) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t('confirm_delete')}</AlertDialogTitle><AlertDialogDescription /></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMut.mutate(deleting)}>{t('delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
