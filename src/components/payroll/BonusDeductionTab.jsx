import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44, supabase } from '@/api/base44Client';
import { useTenant } from '@/lib/TenantContext';
import { useRole } from '@/lib/RoleContext';
import { toast } from 'sonner';
import { useLanguage } from '@/lib/LanguageContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus, Trash2, CreditCard, Gift } from 'lucide-react';
import { format } from 'date-fns';
import { formatCurrency } from '@/lib/helpers';
import { useNotify } from '@/lib/useNotify';

const BONUS_TYPES = {
  performance: 'Performance',
  overtime: 'Overtime',
  sales_reward: 'Sales Reward',
  other: 'Other',
};

const emptyBonus = { employee_id: '', employee_name: '', branch: '', date: format(new Date(), 'yyyy-MM-dd'), amount: '', type: 'performance', reason: '', paid_from: 'cash' };
const emptyAdvance = { employee_id: '', employee_name: '', branch: '', date: format(new Date(), 'yyyy-MM-dd'), amount: '', month: format(new Date(), 'yyyy-MM'), notes: '' };

function EmployeeSelect({ employees, value, onChange }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
      <SelectContent>
        {employees.filter(e => e.is_active !== false).map(e => (
          <SelectItem key={e.id} value={String(e.id)}>{e.full_name} — {e.branch}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function BonusDeductionTab() {
  const { currency, translateLiteral } = useLanguage();
  const qc = useQueryClient();
  const { activeRestaurant, branches, managerBranch } = useTenant();
  const { role } = useRole();
  const notif = useNotify();
  const [showBonusForm, setShowBonusForm] = useState(false);
  const [showAdvanceForm, setShowAdvanceForm] = useState(false);
  const [bonusForm, setBonusForm] = useState(emptyBonus);
  const [advanceForm, setAdvanceForm] = useState(emptyAdvance);
  const setB = (k, v) => setBonusForm(f => ({ ...f, [k]: v }));
  const setA = (k, v) => setAdvanceForm(f => ({ ...f, [k]: v }));

  const businessId = activeRestaurant?.id;
  const queryRows = async (table, sort) => {
    const { data, error } = await supabase.from(table).select('*')
      .eq('restaurant_id', businessId).order(sort).limit(2000);
    if (error) throw error;
    return data || [];
  };
  const { data: allEmployees = [], isError: employeesError } = useQuery({
    queryKey: ['payroll-bonus-employees', businessId],
    queryFn: () => queryRows('employees', 'full_name'),
    enabled: !!businessId,
  });
  const assignedBranch = typeof managerBranch === 'string'
    ? managerBranch : (managerBranch?.key || managerBranch?.branch_key || '');
  const employees = allEmployees.filter(employee => role === 'owner'
    || (assignedBranch && employee.branch === assignedBranch));
  const { data: bonuses = [], isError: bonusesError } = useQuery({
    queryKey: ['payroll-bonus-records', businessId],
    queryFn: () => queryRows('employee_bonuses', 'date'),
    enabled: !!businessId,
  });
  const { data: advances = [], isError: advancesError } = useQuery({
    queryKey: ['payroll-advance-records', businessId],
    queryFn: () => queryRows('salary_advances', 'created_date'),
    enabled: !!businessId,
  });
  const employeeIds = new Set(employees.map(employee => String(employee.id)));
  const visibleBonuses = bonuses.filter(row => employeeIds.has(String(row.employee_id)));
  const visibleAdvances = advances.filter(row => employeeIds.has(String(row.employee_id)));
  const loadError = employeesError || bonusesError || advancesError;


  const createBonus = useMutation({
    mutationFn: (d) => {
      return base44.entities.EmployeeBonus.create(d);
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['payroll-bonus-records'] });
      qc.invalidateQueries({ queryKey: ['payroll-bonuses'] });
      qc.invalidateQueries({ queryKey: ['payroll-dashboard-bonuses'] });
      setShowBonusForm(false);
      setBonusForm(emptyBonus);
      // notif.success removed: useNotify does not expose a .success() method
    },
    onError: (error) => {
      toast.error(error?.message || translateLiteral('Unable to save bonus'));
      console.error('BONUS ERROR', error);
      // notif.error removed: useNotify does not expose a .error() method
    },
  });
  const deleteBonus = useMutation({
    mutationFn: id => base44.entities.EmployeeBonus.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payroll-bonus-records'] }); qc.invalidateQueries({ queryKey: ['payroll-bonuses'] }); },
  });
  const createAdvance = useMutation({
    mutationFn: async (d) => {
      const adv = await base44.entities.SalaryAdvance.create(d);
      try { await notif.salaryAdvance({ branch: d.branch, employeeName: d.employee_name, amount: d.amount, action: 'create' }); } catch (error) { console.warn('Advance saved but notification failed', error); }
      return adv;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payroll-advance-records'] }); qc.invalidateQueries({ queryKey: ['payroll-advances'] }); qc.invalidateQueries({ queryKey: ['payroll-dashboard-advances'] }); setShowAdvanceForm(false); setAdvanceForm(emptyAdvance); },
    onError: (error) => { toast.error(error?.message || translateLiteral('Unable to save advance')); console.error('INSERT FAILED', error); },
  });
  const deleteAdvance = useMutation({
    mutationFn: async (advance) => {
      await base44.entities.SalaryAdvance.delete(advance.id);
      try { await notif.salaryAdvance({ branch: advance.branch, employeeName: advance.employee_name, amount: advance.amount, action: 'delete' }); } catch (error) { console.warn('Advance deleted but notification failed', error); }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payroll-advance-records'] }); qc.invalidateQueries({ queryKey: ['payroll-advances'] }); qc.invalidateQueries({ queryKey: ['payroll-dashboard-advances'] }); },
  });

  const totalBonuses = visibleBonuses.reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const totalAdvances = visibleAdvances.reduce((s, a) => s + (Number(a.amount) || 0), 0);

  const submitBonus = () => {
    if (!bonusForm.employee_id || !(Number(bonusForm.amount) > 0)) {
      return;
    }
    const emp = employees.find(e => String(e.id) === String(bonusForm.employee_id));
    if (!businessId || !emp) return toast.error(translateLiteral('Select an employee from this business'));
    const matchingBranch = branches.find(b => b.key === emp.branch || b.branch_key === emp.branch);
    const payload = { 
      ...bonusForm, 
      employee_name: emp?.full_name || '', 
      amount: Number(bonusForm.amount),
      restaurant_id: businessId,
      branch_id: matchingBranch?.id || emp.branch_id || null,
    };
    delete payload.branch;
    createBonus.mutate(payload);
  };

  const submitAdvance = () => {
    if (!advanceForm.employee_id || !(Number(advanceForm.amount) > 0)) return;
    const emp = employees.find(e => String(e.id) === String(advanceForm.employee_id));
    if (!businessId || !emp) return toast.error(translateLiteral('Select an employee from this business'));
    const matchingBranch = branches.find(b => b.key === emp.branch || b.branch_key === emp.branch);
    const payload = { 
      ...advanceForm, 
      employee_name: emp?.full_name || '', 
      amount: Number(advanceForm.amount),
      restaurant_id: businessId,
      branch_id: matchingBranch?.id || emp.branch_id || null,
    };
    delete payload.branch;
    delete payload.date;
    createAdvance.mutate(payload);
  };

  return (
    <div className="space-y-4">
      {loadError && <Card className="border-red-200 p-3 text-sm text-red-700">
        {translateLiteral('Unable to load employee payroll adjustments. Please retry.')}
      </Card>}
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-3 text-center bg-emerald-50 border-emerald-200">
          <Gift className="w-5 h-5 mx-auto mb-1 text-emerald-600" />
          <p className="text-lg font-bold text-emerald-700">{formatCurrency(totalBonuses, currency)}</p>
          <p className="text-xs text-emerald-600">{translateLiteral('Total Bonuses')}</p>
        </Card>
        <Card className="p-3 text-center bg-amber-50 border-amber-200">
          <CreditCard className="w-5 h-5 mx-auto mb-1 text-amber-600" />
          <p className="text-lg font-bold text-amber-700">{formatCurrency(totalAdvances, currency)}</p>
          <p className="text-xs text-amber-600">{translateLiteral('Total Advances')}</p>
        </Card>
      </div>

      <Tabs defaultValue="bonuses">
        <TabsList className="w-full">
          <TabsTrigger value="bonuses" className="flex-1">Bonuses ({visibleBonuses.length})</TabsTrigger>
          <TabsTrigger value="advances" className="flex-1">Advances ({visibleAdvances.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="bonuses" className="space-y-3 mt-3">
          <Button size="sm" onClick={() => setShowBonusForm(true)} className="w-full gap-1">
            <Plus className="w-3.5 h-3.5" /> Add Bonus
          </Button>
          {visibleBonuses.map(b => (
            <Card key={b.id} className="p-3 flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm truncate">{b.employee_name}</p>
                  <Badge variant="secondary" className="text-xs">{BONUS_TYPES[b.type] || b.type}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{b.date} · {employees.find(e => String(e.id) === String(b.employee_id))?.branch || ''}</p>
                {b.reason && <p className="text-xs text-muted-foreground truncate">{b.reason}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-bold text-emerald-600">{formatCurrency(b.amount, currency)}</span>
                <Button size="icon" variant="ghost" className="text-destructive h-7 w-7" onClick={() => deleteBonus.mutate(b.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </Card>
          ))}
          {visibleBonuses.length === 0 && <p className="text-center py-6 text-muted-foreground text-sm">No bonuses recorded</p>}
        </TabsContent>

        <TabsContent value="advances" className="space-y-3 mt-3">
          <Button size="sm" onClick={() => setShowAdvanceForm(true)} className="w-full gap-1">
            <Plus className="w-3.5 h-3.5" /> Add Salary Advance
          </Button>
          {visibleAdvances.map(a => (
            <Card key={a.id} className="p-3 flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{a.employee_name}</p>
                <p className="text-xs text-muted-foreground">{(a.created_date || a.date)?.split('T')[0]} · Month: {a.month}</p>
                {a.notes && <p className="text-xs text-muted-foreground truncate">{a.notes}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-bold text-amber-600">{formatCurrency(a.amount, currency)}</span>
                <Button size="icon" variant="ghost" className="text-destructive h-7 w-7" onClick={() => deleteAdvance.mutate(a)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </Card>
          ))}
          {visibleAdvances.length === 0 && <p className="text-center py-6 text-muted-foreground text-sm">No advances recorded</p>}
        </TabsContent>
      </Tabs>

      {/* Bonus Dialog */}
      <Dialog open={showBonusForm} onOpenChange={setShowBonusForm}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Bonus / Reward</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Employee</Label><EmployeeSelect employees={employees} value={bonusForm.employee_id} onChange={v => setB('employee_id', v)} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Date</Label><Input type="date" value={bonusForm.date} onChange={e => setB('date', e.target.value)} /></div>
              <div>
                <Label className="text-xs">Type</Label>
                <Select value={bonusForm.type} onValueChange={v => setB('type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(BONUS_TYPES).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label className="text-xs">Amount ({currency})</Label><Input type="number" value={bonusForm.amount} onChange={e => setB('amount', e.target.value)} /></div>
            <div><Label className="text-xs">Reason</Label><Input value={bonusForm.reason} onChange={e => setB('reason', e.target.value)} placeholder="Performance, overtime..." /></div>
            <div>
              <Label className="text-xs">Paid From</Label>
              <Select value={bonusForm.paid_from} onValueChange={v => setB('paid_from', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="cash">Cash</SelectItem><SelectItem value="network">Network</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={submitBonus} disabled={createBonus.isPending}>Save</Button>
              <Button variant="outline" className="flex-1" onClick={() => setShowBonusForm(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Advance Dialog */}
      <Dialog open={showAdvanceForm} onOpenChange={setShowAdvanceForm}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Salary Advance</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Employee</Label><EmployeeSelect employees={employees} value={advanceForm.employee_id} onChange={v => setA('employee_id', v)} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Date</Label><Input type="date" value={advanceForm.date} onChange={e => setA('date', e.target.value)} /></div>
              <div><Label className="text-xs">Payroll Month</Label><Input type="month" value={advanceForm.month} onChange={e => setA('month', e.target.value)} /></div>
            </div>
            <div><Label className="text-xs">Amount ({currency})</Label><Input type="number" value={advanceForm.amount} onChange={e => setA('amount', e.target.value)} /></div>
            <div><Label className="text-xs">Notes</Label><Input value={advanceForm.notes} onChange={e => setA('notes', e.target.value)} /></div>
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={submitAdvance} disabled={createAdvance.isPending}>Save</Button>
              <Button variant="outline" className="flex-1" onClick={() => setShowAdvanceForm(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}