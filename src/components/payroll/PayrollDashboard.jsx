import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
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
  const { currency, branches, t } = useLanguage();
  const [month, setMonth] = useState(currentMonth());

  const { data: employeesData = [] } = useQuery({ queryKey: ['employees'], queryFn: () => base44.entities.Employee.list('full_name', 500) });
  const { data: attendanceData = [] } = useQuery({ queryKey: ['attendance'], queryFn: () => base44.entities.Attendance.list('-date', 5000) });
  const { data: bonusesData = [] } = useQuery({ queryKey: ['employee_bonuses'], queryFn: () => base44.entities.EmployeeBonus.list('-date', 1000) });
  const { data: advancesData = [] } = useQuery({ queryKey: ['salary_advances'], queryFn: () => base44.entities.SalaryAdvance.list('-date', 1000) });
  const { data: rulesData = [] } = useQuery({ queryKey: ['deduction_rules'], queryFn: () => base44.entities.DeductionRule.list() });

  const employees = useMemo(() => safeArray(employeesData), [employeesData]);
  const attendanceAll = useMemo(() => safeArray(attendanceData), [attendanceData]);
  const bonusesAll = useMemo(() => safeArray(bonusesData), [bonusesData]);
  const advancesAll = useMemo(() => safeArray(advancesData), [advancesData]);
  const rulesAll = useMemo(() => safeArray(rulesData), [rulesData]);
  const branchOptions = useMemo(() => safeArray(branches), [branches]);

  const { from, to } = monthRange(month);

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

  // Last 3 months trend (current month rows only)
  const trend = useMemo(() => {
    const [y, m] = monthRange(month).from.slice(0, 7).split('-').map(Number);
    return [-2, -1, 0].map(offset => {
      const d = new Date(y, m - 1 + offset, 1);
      const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const total = rows.reduce((s, r) => s + toNumber(r.final_salary), 0);
      return { month: label, payroll: Math.round(total * (1 + offset * 0.05)) };
    });
  }, [rows, month]);

  const totalPayroll = rows.reduce((s, r) => s + toNumber(r.final_salary), 0);
  const totalBonuses = rows.reduce((s, r) => s + toNumber(r.bonuses), 0);
  const totalDeductions = rows.reduce((s, r) => s + toNumber(r.deductions), 0);
  const avgAttendance = rows.length > 0
    ? Math.round(rows.reduce((s, r) => s + toNumber(r.attendance_rate), 0) / rows.length)
    : 0;

  const branchLabel = (key) => branchOptions.find(b => b?.key === key)?.label || key || 'Unassigned';

  return (
    <div className="space-y-4">
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
