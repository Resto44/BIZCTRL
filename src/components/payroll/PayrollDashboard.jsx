import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/base44Client';
import { useTenant } from '@/lib/TenantContext';
import { useLanguage } from '@/lib/LanguageContext';
import { Card } from '@/components/ui/card';
import { formatCurrency } from '@/lib/helpers';
import { buildPayrollRow, monthRange, currentMonth } from '@/lib/payrollEngine';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, Legend, Cell } from 'recharts';
import { Users, AlertTriangle, Gift, TrendingDown, Clock } from 'lucide-react';

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function toNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function employeeKey(employee = {}) {
  return employee.id ?? '';
}

function sameEmployee(recordEmployeeId, employeeId) {
  return String(recordEmployeeId ?? '') === String(employeeId ?? '');
}

function inDateRange(date, from, to) {
  return Boolean(date && date >= from && date <= to);
}

export default function PayrollDashboard() {
  const { currency, t } = useLanguage();
  const { activeRestaurant, branches } = useTenant();
  const [month, setMonth] = useState(currentMonth());

  const { from, to } = monthRange(month);
  const selectedRestaurantId = activeRestaurant?.id;
  const scopedRows = async (table, apply = q => q) => {
    const query = apply(supabase.from(table).select('*').eq('restaurant_id', selectedRestaurantId));
    const { data, error } = await query.limit(5000);
    if (error) throw error;
    return data || [];
  };
  const previousTwoMonths = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 3, 1);
  const trendFrom = `${previousTwoMonths.getFullYear()}-${String(previousTwoMonths.getMonth() + 1).padStart(2, '0')}`;
  const { data: employeesData = [], isError: employeeError } = useQuery({
    queryKey: ['payroll-dashboard-employees', selectedRestaurantId],
    queryFn: () => scopedRows('employees', q => q.order('full_name')),
    enabled: !!selectedRestaurantId,
  });
  const { data: attendanceData = [], isError: attendanceError } = useQuery({
    queryKey: ['payroll-dashboard-attendance', selectedRestaurantId, month],
    queryFn: () => scopedRows('attendance', q => q.gte('date', from).lte('date', to)),
    enabled: !!selectedRestaurantId,
  });
  const { data: bonusesData = [], isError: bonusError } = useQuery({
    queryKey: ['payroll-dashboard-bonuses', selectedRestaurantId, month],
    queryFn: () => scopedRows('employee_bonuses', q => q.gte('date', from).lte('date', to)),
    enabled: !!selectedRestaurantId,
  });
  const { data: advancesData = [], isError: advanceError } = useQuery({
    queryKey: ['payroll-dashboard-advances', selectedRestaurantId, month],
    queryFn: () => scopedRows('salary_advances', q => q.eq('month', month)),
    enabled: !!selectedRestaurantId,
  });
  const { data: rulesData = [], isError: ruleError } = useQuery({
    queryKey: ['payroll-dashboard-rules', selectedRestaurantId],
    queryFn: () => scopedRows('deduction_rules'),
    enabled: !!selectedRestaurantId,
  });
  const { data: payrollHistory = [], isError: historyError } = useQuery({
    queryKey: ['payroll-dashboard-history', selectedRestaurantId, trendFrom, month],
    queryFn: () => scopedRows('payroll_runs', q => q.gte('month', trendFrom).lte('month', month)),
    enabled: !!selectedRestaurantId,
  });
  const loadError = employeeError || attendanceError || bonusError || advanceError || ruleError || historyError;

  const employees = useMemo(() => safeArray(employeesData), [employeesData]);
  const attendanceAll = useMemo(() => safeArray(attendanceData), [attendanceData]);
  const bonusesAll = useMemo(() => safeArray(bonusesData), [bonusesData]);
  const advancesAll = useMemo(() => safeArray(advancesData), [advancesData]);
  const rulesAll = useMemo(() => safeArray(rulesData), [rulesData]);
  const branchOptions = useMemo(() => safeArray(branches), [branches]);

  const rows = useMemo(() => {
    return employees.filter(e => e && e.is_active !== false).map(emp => {
      const empId = employeeKey(emp);
      const empAttendance = attendanceAll.filter(r => sameEmployee(r?.employee_id, empId) && inDateRange(r?.date, from, to));
      const empBonuses = bonusesAll.filter(b => sameEmployee(b?.employee_id, empId) && inDateRange(b?.date, from, to));
      const empAdvances = advancesAll.filter(a => sameEmployee(a?.employee_id, empId) && a?.month === month);
      return buildPayrollRow(emp, empAttendance, empBonuses, empAdvances, rulesAll);
    });
  }, [employees, month, attendanceAll, bonusesAll, advancesAll, rulesAll, from, to]);

  // Branch aggregation
  const branchData = useMemo(() => {
    const map = {};
    rows.forEach(r => {
      const branch = r.branch || 'unassigned';
      if (!map[branch]) map[branch] = { branch, payroll: 0, bonuses: 0, deductions: 0, staff: 0 };
      map[branch].payroll += toNumber(r.final_salary);
      map[branch].bonuses += toNumber(r.bonuses);
      map[branch].deductions += toNumber(r.deductions);
      map[branch].staff++;
    });
    return Object.values(map);
  }, [rows]);

  // Attendance rate by branch
  const attendanceByBranch = useMemo(() => {
    return branchData.map(b => {
      const branchRows = rows.filter(r => r.branch === b.branch);
      const avgRate = branchRows.length > 0
        ? Math.round(branchRows.reduce((s, r) => s + toNumber(r.attendance_rate), 0) / branchRows.length)
        : 0;
      return { branch: b.branch, rate: avgRate };
    }).sort((a, b) => a.rate - b.rate);
  }, [branchData, rows]);

  // Historical chart is strictly from persisted finalized/paid payroll runs.
  // Do not estimate or multiply this month's figures for other months.
  const trend = useMemo(() => {
    const [year, monthNumber] = month.split('-').map(Number);
    return [-2, -1, 0].map(offset => {
      const date = new Date(year, monthNumber - 1 + offset, 1);
      const label = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const runs = payrollHistory.filter(run => run.month === label
        && ['finalized', 'paid'].includes(run.status));
      return {
        month: label,
        payroll: Math.round(runs.reduce((sum, run) => sum + toNumber(run.final_salary), 0) * 100) / 100,
      };
    });
  }, [payrollHistory, month]);

  const totalPayroll = rows.reduce((s, r) => s + toNumber(r.final_salary), 0);
  const totalBonuses = rows.reduce((s, r) => s + toNumber(r.bonuses), 0);
  const totalDeductions = rows.reduce((s, r) => s + toNumber(r.deductions), 0);
  const avgAttendance = rows.length > 0
    ? Math.round(rows.reduce((s, r) => s + toNumber(r.attendance_rate), 0) / rows.length)
    : 0;

  const branchLabel = (key) => branchOptions.find(b => b?.key === key)?.label || key || 'Unassigned';

  return (
    <div className="space-y-4">
      {loadError && <div role="alert" className="rounded-lg border border-red-200 p-3 text-sm text-red-700">{t("data_load_error") || "Unable to load payroll analytics."}</div>}
      <div className="flex gap-2 items-center">
        <input type="month" value={month} onChange={e => setMonth(e.target.value || currentMonth())}
          className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm flex-1" />
        <span className="text-xs text-muted-foreground">{rows.length} {t('employees')}</span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-3 text-center">
          <Users className="w-4 h-4 mx-auto mb-1 text-primary" />
          <p className="text-lg font-bold">{formatCurrency(totalPayroll, currency)}</p>
          <p className="text-xs text-muted-foreground">{t('payroll')}</p>
        </Card>
        <Card className="p-3 text-center bg-emerald-50 border-emerald-100">
          <Gift className="w-4 h-4 mx-auto mb-1 text-emerald-600" />
          <p className="text-lg font-bold text-emerald-700">{formatCurrency(totalBonuses, currency)}</p>
          <p className="text-xs text-emerald-600">{t('bonuses')}</p>
        </Card>
        <Card className="p-3 text-center bg-red-50 border-red-100">
          <TrendingDown className="w-4 h-4 mx-auto mb-1 text-red-500" />
          <p className="text-lg font-bold text-red-600">{formatCurrency(totalDeductions, currency)}</p>
          <p className="text-xs text-red-500">{t('deductions')}</p>
        </Card>
        <Card className="p-3 text-center bg-blue-50 border-blue-100">
          <Clock className="w-4 h-4 mx-auto mb-1 text-blue-600" />
          <p className="text-lg font-bold text-blue-700">{avgAttendance}%</p>
          <p className="text-xs text-blue-600">{t('attendance')}</p>
        </Card>
      </div>

      {/* Payroll by branch bar chart */}
      {branchData.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">{t('payroll')} — {t('by_branch')}</h3>
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={branchData.map(b => ({ ...b, branch: branchLabel(b.branch) }))}>
              <XAxis dataKey="branch" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={v => formatCurrency(toNumber(v), currency)} />
              <Bar dataKey="payroll" fill="#3b82f6" radius={[4,4,0,0]} name={t('payroll')} />
              <Bar dataKey="bonuses" fill="#10b981" radius={[4,4,0,0]} name={t('bonuses')} />
              <Bar dataKey="deductions" fill="#ef4444" radius={[4,4,0,0]} name={t('deductions')} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Attendance rate by branch */}
      {attendanceByBranch.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">{t('attendance')} — {t('by_branch')}</h3>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={attendanceByBranch.map(b => ({ ...b, branch: branchLabel(b.branch) }))}>
              <XAxis dataKey="branch" tick={{ fontSize: 10 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
              <Tooltip formatter={v => `${toNumber(v)}%`} />
              <Bar dataKey="rate" radius={[4,4,0,0]} name={`${t('attendance')} %`}>
                {attendanceByBranch.map((entry, i) => (
                  <Cell key={`${entry.branch}-${i}`} fill={entry.rate >= 90 ? '#10b981' : entry.rate >= 75 ? '#f59e0b' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {attendanceByBranch[0]?.rate < 80 && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-red-600">
              <AlertTriangle className="w-3.5 h-3.5" />
              {branchLabel(attendanceByBranch[0].branch)} has highest employee absence rate
            </div>
          )}
        </Card>
      )}

      {/* Payroll trend */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3">{t('payroll')} — {t('profit_trend')}</h3>
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={trend}>
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip formatter={v => formatCurrency(toNumber(v), currency)} />
            <Line type="monotone" dataKey="payroll" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {/* Branch ranking */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3">{t('branch')} {t('summary')}</h3>
        <div className="space-y-2">
          {[...branchData].sort((a, b) => b.payroll - a.payroll).map((b, i) => (
            <div key={b.branch || i} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-4">#{i+1}</span>
                <span>{branchLabel(b.branch)}</span>
                <span className="text-xs text-muted-foreground">{b.staff} {t('employees')}</span>
              </div>
              <span className="font-semibold">{formatCurrency(toNumber(b.payroll), currency)}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
