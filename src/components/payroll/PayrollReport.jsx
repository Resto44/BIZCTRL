import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44, supabase } from '@/api/base44Client';
import { useTenant } from '@/lib/TenantContext';
import { toast } from 'sonner';
import { useLanguage } from '@/lib/LanguageContext';
import { useRole } from '@/lib/RoleContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import BranchSelect from '@/components/shared/BranchSelect';
import { formatCurrency } from '@/lib/helpers';
import { buildPayrollRow, monthRange, currentMonth } from '@/lib/payrollEngine';
import { Download, CheckCircle2, AlertTriangle, Users, TrendingDown, Gift } from 'lucide-react';
import { format } from 'date-fns';

const STATUS_COLORS = {
  draft: 'bg-secondary text-secondary-foreground',
  finalized: 'bg-blue-100 text-blue-700 border-blue-200',
  paid: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

function toNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function safeToFixed(value, decimals = 1) {
  const num = toNumber(value);
  return num.toFixed(decimals);
}

export default function PayrollReport() {
  const { currency, translateLiteral } = useLanguage();
  const { activeRestaurant } = useTenant();
  const [confirmPaid, setConfirmPaid] = useState(null);
  const { role } = useRole();
  const qc = useQueryClient();
  const [month, setMonth] = useState(currentMonth());
  const [filterBranch, setFilterBranch] = useState('all');
  const [confirmFinalize, setConfirmFinalize] = useState(null);
  const [generating, setGenerating] = useState(false);

  const { from, to } = monthRange(month);
  const fetchRows = async (table, selectQuery) => {
    const query = selectQuery(supabase.from(table).select('*'));
    const { data, error } = await query.limit(5000);
    if (error) throw error;
    return data || [];
  };
  const { data: employees = [], isLoading: loadingEmployees, isError: employeesError } = useQuery({
    queryKey: ['payroll-employees', activeRestaurant?.id],
    queryFn: () => fetchRows('employees', q => q.eq('restaurant_id', activeRestaurant.id).order('full_name')),
    enabled: !!activeRestaurant?.id,
  });
  const { data: attendanceAll = [], isError: attendanceError } = useQuery({
    queryKey: ['payroll-attendance', activeRestaurant?.id, month],
    queryFn: () => fetchRows('attendance', q => q.eq('restaurant_id', activeRestaurant.id).gte('date', from).lte('date', to)),
    enabled: !!activeRestaurant?.id,
  });
  const { data: bonusesAll = [], isError: bonusesError } = useQuery({
    queryKey: ['payroll-bonuses', activeRestaurant?.id, month],
    queryFn: () => fetchRows('employee_bonuses', q => q.eq('restaurant_id', activeRestaurant.id).gte('date', from).lte('date', to)),
    enabled: !!activeRestaurant?.id,
  });
  const { data: advancesAll = [], isError: advancesError } = useQuery({
    queryKey: ['payroll-advances', activeRestaurant?.id, month],
    queryFn: () => fetchRows('salary_advances', q => q.eq('restaurant_id', activeRestaurant.id).eq('month', month)),
    enabled: !!activeRestaurant?.id,
  });
  const { data: rulesAll = [], isError: rulesError } = useQuery({
    queryKey: ['payroll-rules', activeRestaurant?.id],
    queryFn: () => fetchRows('deduction_rules', q => q.eq('restaurant_id', activeRestaurant.id).order('created_date')),
    enabled: !!activeRestaurant?.id,
  });
  const { data: payrollRuns = [], isError: runsError } = useQuery({
    queryKey: ['payroll_runs', activeRestaurant?.id, month],
    queryFn: () => fetchRows('payroll_runs', q => q.eq('month', month).eq('restaurant_id', activeRestaurant.id)),
    enabled: !!activeRestaurant?.id,
  });
  const loadingError = employeesError || attendanceError || bonusesError || advancesError || rulesError || runsError;
  const invalidRules = rulesAll.filter(rule => rule.deduction_type === 'daily_fraction'
    && !(Number(rule.amount) > 0 && Number(rule.amount) <= 1));

  const rows = useMemo(() => {
    const filteredEmp = (Array.isArray(employees) ? employees : []).filter(e =>
      e && e.is_active !== false &&
      e.restaurant_id === activeRestaurant?.id &&
      (filterBranch === 'all' || e.branch === filterBranch)
    );

    const currentRows = filteredEmp.map(emp => {
      // Check if payroll already finalized for this employee this month
      const existing = (Array.isArray(payrollRuns) ? payrollRuns : []).find(r => r && r.employee_id === emp.id && r.month === month);
      if (existing) return { ...existing, branch: emp.branch || '', _saved: true };

      const empAttendance = (Array.isArray(attendanceAll) ? attendanceAll : []).filter(r => r && r.employee_id === emp.id && r.date >= from && r.date <= to);
      const empBonuses = (Array.isArray(bonusesAll) ? bonusesAll : []).filter(b => b && b.employee_id === emp.id && b.date >= from && b.date <= to);
      const empAdvances = (Array.isArray(advancesAll) ? advancesAll : []).filter(a => a && a.employee_id === emp.id && a.month === month);
      return buildPayrollRow(emp, empAttendance, empBonuses, empAdvances, rulesAll);
    });
    // Preserve financial history if an employee was later deactivated.
    const listedIds = new Set(currentRows.map(r => String(r.employee_id)));
    const archived = payrollRuns.filter(r => !listedIds.has(String(r.employee_id)))
      .filter(r => filterBranch === 'all' || employees.some(e => String(e.id) === String(r.employee_id) && e.branch === filterBranch))
      .map(r => ({ ...r, branch: employees.find(e => String(e.id) === String(r.employee_id))?.branch || '', _saved: true }));
    return [...currentRows, ...archived];
  }, [employees, filterBranch, month, attendanceAll, bonusesAll, advancesAll, rulesAll, payrollRuns, from, to, activeRestaurant?.id]);

  const updateRun = useMutation({
    mutationFn: ({ id, data }) => base44.entities.PayrollRun.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll_runs'] }),
  });

  const createRun = useMutation({
    mutationFn: d => base44.entities.PayrollRun.create(d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll_runs', month] }),
  });

  const saving = createRun.isPending || updateRun.isPending;
  const handleFinalize = async (row) => {
    if (saving || loadingError || invalidRules.length || !activeRestaurant?.id || row.status === 'paid') return;
    try {
      if (row._saved) {
        if (row.status !== 'draft') throw new Error('Only draft payroll can be finalized.');
        const { data: changed, error: updateError } = await supabase.from('payroll_runs')
          .update({ status: 'finalized' }).eq('id', row.id)
          .eq('restaurant_id', activeRestaurant.id).eq('status', 'draft')
          .select('id').maybeSingle();
        if (updateError) throw updateError;
        if (!changed) throw new Error('Payroll status changed. Refresh before retrying.');
        qc.invalidateQueries({ queryKey: ['payroll_runs'] });
      } else {
        // Only fields present in public.payroll_runs may be inserted.
        // Never submit UI-only attendance totals or branch labels to PostgREST.
        const payload = {
          restaurant_id: activeRestaurant.id,
          employee_id: row.employee_id,
          employee_name: row.employee_name,
          month, base_salary: toNumber(row.base_salary),
          bonuses: toNumber(row.bonuses),
          deductions: toNumber(row.deductions),
          advances: toNumber(row.advances),
          final_salary: toNumber(row.final_salary),
          status: 'finalized',
        };
        const { data: duplicates, error: duplicateError } = await supabase.from('payroll_runs')
          .select('id').eq('employee_id', row.employee_id).eq('month', month)
          .eq('restaurant_id', activeRestaurant.id).limit(2);
        if (duplicateError) throw duplicateError;
        if (duplicates.length) throw new Error('Payroll already finalized in another session. Refresh before retrying.');
        await createRun.mutateAsync(payload);
      }
      setConfirmFinalize(null);
      toast.success(translateLiteral('Payroll finalized'));
    } catch (error) {
      toast.error(error?.message || translateLiteral('Unable to finalize payroll'));
    }
  };

  const handleMarkPaid = async (row) => {
    if (!row?._saved || saving || row.status !== 'finalized') return;
    try {
      // Status is a manual payment acknowledgment, not a Treasury transfer.
      // payroll_runs does not have a paid_date column.
      const { data: changed, error: updateError } = await supabase.from('payroll_runs')
        .update({ status: 'paid' }).eq('id', row.id)
        .eq('restaurant_id', activeRestaurant.id).eq('status', 'finalized')
        .select('id').maybeSingle();
      if (updateError) throw updateError;
      if (!changed) throw new Error('Payroll status changed. Refresh before retrying.');
      qc.invalidateQueries({ queryKey: ['payroll_runs'] });
      toast.success(translateLiteral('Payment recorded'));
      setConfirmPaid(null);
    } catch (error) {
      toast.error(error?.message || translateLiteral('Unable to update payroll'));
    }
  };

  const exportCSV = () => {
    const headers = ['Employee','Branch','Base Salary','Bonuses','Deductions','Advances','Final Salary','Status'];
    const csvCell = value => {
      const raw = String(value ?? '');
      const safe = /^[=+@-]/.test(raw) ? `'${raw}` : raw;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const csvRows = rows.map(r => [r.employee_name, r.branch, r.base_salary,
      r.bonuses, r.deductions, r.advances, r.final_salary, r.status || 'draft']);
    const csv = '\uFEFF' + [headers, ...csvRows].map(r => r.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `payroll_${month}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const totals = useMemo(() => ({
    base: rows.reduce((s, r) => s + toNumber(r?.base_salary), 0),
    bonuses: rows.reduce((s, r) => s + toNumber(r?.bonuses), 0),
    deductions: rows.reduce((s, r) => s + toNumber(r?.deductions), 0),
    advances: rows.reduce((s, r) => s + toNumber(r?.advances), 0),
    final: rows.reduce((s, r) => s + toNumber(r?.final_salary), 0),
    unpaid: rows.filter(r => r?.status === 'finalized').reduce((s, r) => s + toNumber(r?.final_salary), 0),
  }), [rows]);

  // Deduction warnings (>20% of base)
  const highDeductions = rows.filter(r => r && toNumber(r.base_salary) > 0 && (toNumber(r.deductions) / toNumber(r.base_salary)) > 0.2);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm flex-1" />
        <div className="min-w-0"><BranchSelect value={filterBranch} onChange={setFilterBranch} includeAll /></div>
        <Button size="sm" variant="outline" onClick={exportCSV}><Download className="w-3.5 h-3.5" /></Button>
      </div>

      {!activeRestaurant?.id && <p className="text-sm text-amber-700">{translateLiteral('Select a business to view payroll')}</p>}
      {loadingEmployees && <p className="text-sm text-muted-foreground">{translateLiteral('Loading...')}</p>}
      {loadingError && <Card className="p-3 border-red-200 text-red-700 text-sm">
        {translateLiteral('Unable to load payroll data. Check access and try again.')}
      </Card>}
      {invalidRules.length > 0 && <Card className="p-3 border-amber-300 text-amber-700 text-sm">
        {translateLiteral('Some deduction rules have invalid daily fractions. Finalization is blocked until these rules are corrected.')}
      </Card>}
      {/* Totals */}
      <div className="grid grid-cols-2 gap-2">
        <Card className="p-3 text-center">
          <Users className="w-4 h-4 mx-auto mb-1 text-primary" />
          <p className="text-base font-bold">{formatCurrency(totals.final, currency)}</p>
          <p className="text-xs text-muted-foreground">Total Payroll</p>
        </Card>
        <Card className="p-3 text-center bg-red-50 border-red-100">
          <AlertTriangle className="w-4 h-4 mx-auto mb-1 text-red-500" />
          <p className="text-base font-bold text-red-600">{formatCurrency(totals.unpaid, currency)}</p>
          <p className="text-xs text-red-500">Unpaid</p>
        </Card>
        <Card className="p-3 text-center bg-emerald-50 border-emerald-100">
          <Gift className="w-4 h-4 mx-auto mb-1 text-emerald-600" />
          <p className="text-sm font-bold text-emerald-700">{formatCurrency(totals.bonuses, currency)}</p>
          <p className="text-xs text-emerald-600">Bonuses</p>
        </Card>
        <Card className="p-3 text-center bg-amber-50 border-amber-100">
          <TrendingDown className="w-4 h-4 mx-auto mb-1 text-amber-600" />
          <p className="text-sm font-bold text-amber-700">{formatCurrency(totals.deductions, currency)}</p>
          <p className="text-xs text-amber-600">Deductions</p>
        </Card>
      </div>

      {/* Deduction warnings */}
      {highDeductions.length > 0 && (
        <Card className="p-3 border-amber-300 bg-amber-50">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-amber-700">High Deduction Warning</p>
              {highDeductions.map(r => (
                <p key={r.employee_id || r.employee_name} className="text-xs text-amber-600">
                  {r.employee_name}: {formatCurrency(r.deductions, currency)} deducted ({toNumber(r.base_salary) > 0 ? Math.round((toNumber(r.deductions) / toNumber(r.base_salary)) * 100) : 0}% of base)
                </p>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Employee rows */}
      <div className="space-y-2">
        {loadingError ? null : rows.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground text-sm">{translateLiteral("No assigned employees found. Assign the restaurant to legacy employee records before finalizing payroll.")}</p>
        ) : rows.map((row, i) => (
          <Card key={row.employee_id || i} className="p-3">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <p className="font-semibold text-sm">{row.employee_name}</p>
                <p className="text-xs text-muted-foreground">{row.branch}</p>
              </div>
              <Badge className={STATUS_COLORS[row.status || 'draft']}>{row.status || 'draft'}</Badge>
            </div>

            {/* Attendance summary */}
            <div className="flex gap-3 text-xs mb-2">
              <span className="text-emerald-600">✓ {toNumber(row.present_days)} present</span>
              <span className="text-red-500">✗ {toNumber(row.absent_days)} absent</span>
              <span className="text-amber-600">⏱ {toNumber(row.late_days)} late</span>
              <span className="text-muted-foreground">{safeToFixed(row.total_hours, 0)}h</span>
            </div>

            {/* Salary breakdown */}
            <div className="bg-muted/40 rounded-lg p-2 space-y-1 text-xs mb-2">
              <div className="flex justify-between"><span>Base Salary</span><span>{formatCurrency(toNumber(row.base_salary), currency)}</span></div>
              {toNumber(row.bonuses) > 0 && <div className="flex justify-between text-emerald-600"><span>+ Bonuses</span><span>{formatCurrency(toNumber(row.bonuses), currency)}</span></div>}
              {toNumber(row.deductions) > 0 && <div className="flex justify-between text-red-500"><span>− Deductions</span><span>{formatCurrency(toNumber(row.deductions), currency)}</span></div>}
              {toNumber(row.advances) > 0 && <div className="flex justify-between text-amber-600"><span>− Advances</span><span>{formatCurrency(toNumber(row.advances), currency)}</span></div>}
              <div className="flex justify-between font-bold border-t border-border pt-1 text-sm">
                <span>= Final Payable</span><span className="text-primary">{formatCurrency(toNumber(row.final_salary), currency)}</span>
              </div>
            </div>

            {/* Actions */}
            {role === 'owner' && (
              <div className="flex gap-2">
                {(!row.status || row.status === 'draft') && (
                  <Button size="sm" variant="outline" className="flex-1 text-xs h-7" onClick={() => setConfirmFinalize(row)} disabled={saving || loadingError || invalidRules.length > 0}>
                    Finalize
                  </Button>
                )}
                {row.status === 'finalized' && (
                  <Button size="sm" variant="outline" className="flex-1 text-xs h-7 text-emerald-600" onClick={() => setConfirmPaid(row)} disabled={saving}>
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Mark Paid
                  </Button>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>

      <AlertDialog open={!!confirmPaid} onOpenChange={v => !v && setConfirmPaid(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{translateLiteral('Confirm salary payment')}</AlertDialogTitle></AlertDialogHeader>
          <p className="text-sm text-muted-foreground">
            {translateLiteral('Verify payment before marking paid. This action does not withdraw from Treasury.')}
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel>{translateLiteral('Cancel')}</AlertDialogCancel>
            <AlertDialogAction disabled={saving} onClick={() => handleMarkPaid(confirmPaid)}>{translateLiteral('Mark Paid')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Confirmation dialog */}
      {confirmFinalize && (
        <AlertDialog open={!!confirmFinalize} onOpenChange={v => !v && setConfirmFinalize(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Finalize Payroll?</AlertDialogTitle>
            </AlertDialogHeader>
            <p className="text-sm text-muted-foreground">
              Finalize payroll for <strong>{confirmFinalize.employee_name}</strong> ({confirmFinalize.month})?
            </p>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction disabled={saving || loadingError || invalidRules.length > 0} onClick={() => handleFinalize(confirmFinalize)}>Finalize</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
