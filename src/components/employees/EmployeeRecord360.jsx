import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/base44Client';
import { useTenant } from '@/lib/TenantContext';
import { useRole } from '@/lib/RoleContext';
import { useLanguage } from '@/lib/LanguageContext';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, CalendarCheck, CircleDollarSign, Clock3, UserRound, Wallet } from 'lucide-react';

const formatMoney = amount => (Number(amount) || 0).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const formatDate = value => value ? String(value).slice(0, 10) : '—';
const recentDate = () => {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return d.toISOString().slice(0, 10);
};

function History({ rows, empty, renderRow }) {
  return rows.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>
    : <div className="max-h-[47dvh] space-y-2 overflow-y-auto pe-1">
      {rows.map(row => <div key={row.id} className="rounded-xl border p-3 text-sm">{renderRow(row)}</div>)}
    </div>;
}

/** Read-only individual employee ledger. Every query uses canonical UUID + restaurant scope.
 * RLS is authoritative; the UI additionally restricts salary details to payroll readers.
 * Changes to attendance/bonuses/advances/payroll remain in their specialized transactional tabs.
 */
export default function EmployeeRecord360({ employee }) {
  const { activeRestaurant } = useTenant();
  const { can, role } = useRole();
  const { currency, translateLiteral: tr } = useLanguage();
  const [section, setSection] = useState('overview');
  const restaurantId = activeRestaurant?.id;
  const employeeId = employee?.id;
  const scoped = Boolean(employeeId && restaurantId && employee?.restaurant_id === restaurantId);
  const mayViewPayroll = role === 'owner' || can?.viewPayroll === true;
  const mayViewAttendance = role === 'owner' || can?.viewAttendance === true || can?.viewStaffAttendance === true || can?.recordAttendance === true;
  const fetchRows = async (table, dateField, after, limit = 100) => {
    let query = supabase.from(table).select('*')
      .eq('restaurant_id', restaurantId).eq('employee_id', employeeId);
    if (after) query = query.gte(dateField, after);
    const { data, error } = await query.order(dateField, { ascending: false }).limit(limit);
    if (error) throw error;
    return data || [];
  };
  const attendance = useQuery({
    queryKey: ['employee-360-attendance', restaurantId, employeeId],
    queryFn: () => fetchRows('attendance', 'date', recentDate()),
    enabled: scoped && mayViewAttendance,
  });
  const bonuses = useQuery({
    queryKey: ['employee-360-bonuses', restaurantId, employeeId],
    queryFn: () => fetchRows('employee_bonuses', 'date', null),
    enabled: scoped && mayViewPayroll,
  });
  const advances = useQuery({
    queryKey: ['employee-360-advances', restaurantId, employeeId],
    queryFn: () => fetchRows('salary_advances', 'created_date', null),
    enabled: scoped && mayViewPayroll,
  });
  const payroll = useQuery({
    queryKey: ['employee-360-payroll', restaurantId, employeeId],
    queryFn: () => fetchRows('payroll_runs', 'month', null),
    enabled: scoped && mayViewPayroll,
  });
  const records = attendance.data || [];
  const totals = useMemo(() => ({
    days: records.filter(r => r.check_in).length,
    hours: records.reduce((sum, r) => sum + (Number(r.hours_worked) || 0), 0),
    late: records.filter(r => r.status === 'late').length,
    bonuses: (bonuses.data || []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
    advances: (advances.data || []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
  }), [records, bonuses.data, advances.data]);
  const error = attendance.isError || bonuses.isError || advances.isError || payroll.isError;
  const stats = [
    ...(mayViewAttendance ? [
      { icon: CalendarCheck, label: 'Recorded days (90d)', value: totals.days },
      { icon: Clock3, label: 'Recorded hours (90d)', value: totals.hours.toFixed(1) },
      { icon: AlertTriangle, label: 'Late entries (90d)', value: totals.late },
    ] : []),
    ...(mayViewPayroll ? [
      { icon: CircleDollarSign, label: 'Bonuses on record', value: formatMoney(totals.bonuses) + ' ' + currency },
      { icon: Wallet, label: 'Advances on record', value: formatMoney(totals.advances) + ' ' + currency },
    ] : []),
  ];
  if (!scoped) return <p role="alert" className="p-4 text-sm text-destructive">{tr('Employee does not belong to the selected business.')}</p>;
  return <div className="min-w-0 space-y-4">
    <div className="flex min-w-0 items-center gap-3">
      <div className="rounded-xl bg-primary/10 p-3"><UserRound className="h-6 w-6 text-primary" /></div>
      <div className="min-w-0">
        <h3 className="truncate text-lg font-semibold">{employee.full_name}</h3>
        <p className="text-xs text-muted-foreground">{employee.employee_id || '—'} · {employee.position || '—'} · {employee.branch || '—'}</p>
      </div>
      <Badge variant={employee.is_active === false ? 'secondary' : 'outline'} className="ms-auto shrink-0">
        {tr(employee.is_active === false ? 'Inactive' : 'Active')}
      </Badge>
    </div>
    {error && <Card role="alert" className="border-destructive/50 p-3 text-sm text-destructive">
      {tr('Some employee records could not be loaded. Check access and retry.')}
    </Card>}
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {stats.map(({ icon: Icon, label, value }) => <Card key={label} className="min-w-0 p-3">
        <Icon className="mb-1 h-4 w-4 text-muted-foreground" />
        <p className="break-words text-base font-semibold tabular-nums">{value}</p>
        <p className="text-[11px] text-muted-foreground">{tr(label)}</p>
      </Card>)}
    </div>
    <Tabs value={section} onValueChange={setSection}>
      <div className="max-w-full overflow-x-auto pb-2">
        <TabsList className="flex h-auto w-max min-w-full justify-start gap-1">
          {[
            ['overview', 'Profile'],
            ...(mayViewAttendance ? [['attendance', 'Attendance']] : []),
            ...(mayViewPayroll ? [['bonuses', 'Bonuses'], ['advances', 'Advances'], ['payroll', 'Payroll']] : []),
          ].map(([key, label]) => <TabsTrigger key={key} value={key} className="shrink-0 text-xs">{tr(label)}</TabsTrigger>)}
        </TabsList>
      </div>
      <TabsContent value="overview" className="space-y-2">
        {[
          ['Employee ID', employee.employee_id || '—'],
          ['Position', employee.position || '—'],
          ['Branch', employee.branch || '—'],
          ['Phone', employee.phone || '—'],
          ['Email', employee.email || '—'],
          ['Joining Date', formatDate(employee.joining_date || employee.hire_date)],
          ...(mayViewPayroll ? [['Base Salary', formatMoney(employee.base_salary ?? employee.salary) + ' ' + currency]] : []),
          ['Notes', employee.notes || '—'],
        ].map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-2 border-b py-2 text-sm">
          <span className="text-muted-foreground">{tr(label)}</span><span className="break-words font-medium">{value}</span>
        </div>)}
      </TabsContent>
      <TabsContent value="attendance">
        {attendance.isLoading ? <p className="text-sm">{tr('Loading...')}</p> :
          <History rows={records} empty={tr('No attendance records in the last 90 days.')}
            renderRow={r => <div className="flex flex-wrap justify-between gap-2">
              <div><b>{formatDate(r.date)}</b> · {tr(r.status || 'Not checked in')}</div>
              <div className="tabular-nums">{r.check_in || '—'} → {r.check_out || '—'} · {Number(r.hours_worked || 0).toFixed(1)}h</div>
            </div>} />}
      </TabsContent>
      <TabsContent value="bonuses">
        <History rows={bonuses.data || []} empty={tr('No bonus records found.')}
          renderRow={r => <div className="flex flex-wrap justify-between gap-2">
            <span>{formatDate(r.date)} · {r.reason || r.type || tr('Bonus')}</span>
            <b>{formatMoney(r.amount)} {currency}</b>
          </div>} />
      </TabsContent>
      <TabsContent value="advances">
        <History rows={advances.data || []} empty={tr('No advance records found.')}
          renderRow={r => <div className="flex flex-wrap justify-between gap-2">
            <span>{r.month || formatDate(r.created_date)} · {r.notes || tr('Advance')}</span>
            <b>{formatMoney(r.amount)} {currency}</b>
          </div>} />
      </TabsContent>
      <TabsContent value="payroll">
        <History rows={payroll.data || []} empty={tr('No payroll runs found.')}
          renderRow={r => <div className="flex flex-wrap justify-between gap-2">
            <span>{r.month} · <Badge variant="outline">{tr(r.status || 'draft')}</Badge></span>
            <b>{formatMoney(r.final_salary)} {currency}</b>
          </div>} />
      </TabsContent>
    </Tabs>
    <p className="text-xs text-muted-foreground">{tr('Historical records are read-only here. Use the relevant section in this center to make changes.')}</p>
  </div>;
}
