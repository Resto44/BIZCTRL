import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44, supabase } from '@/api/base44Client';
import { useTenant } from '@/lib/TenantContext';
import { toast } from 'sonner';
import { useLanguage } from '@/lib/LanguageContext';
import { useRole } from '@/lib/RoleContext';
import { useAuth } from '@/lib/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, Clock, CheckCircle2, XCircle, AlertCircle, Coffee, Palmtree, Download } from 'lucide-react';
import BranchSelect from '@/components/shared/BranchSelect';
import { format } from 'date-fns';
import { calcHours } from '@/lib/payrollEngine';

const STATUS_CONFIG = {
  present:  { key: 'present',  icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
  late:     { key: 'late',     icon: AlertCircle,  color: 'text-amber-600',   bg: 'bg-amber-50 border-amber-200' },
  absent:   { key: 'absent',   icon: XCircle,      color: 'text-red-600',     bg: 'bg-red-50 border-red-200' },
  half_day: { key: 'half_day', icon: Coffee,       color: 'text-blue-600',    bg: 'bg-blue-50 border-blue-200' },
  vacation: { key: 'vacation', icon: Palmtree,     color: 'text-violet-600',  bg: 'bg-violet-50 border-violet-200' },
};

const emptyForm = {
  employee_id: '',
  employee_name: '',
  branch: '',
  date: format(new Date(), 'yyyy-MM-dd'),
  check_in: '',
  check_out: '',
  status: 'present',
  late_minutes: 0,
  notes: '',
};

export default function AttendanceTab() {
  const { user } = useAuth();
  const { role } = useRole();
  const { t, translateLiteral } = useLanguage();
  const { activeRestaurant, branches: tenantBranches, managerBranch } = useTenant();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [filterBranch, setFilterBranch] = useState('all');
  const [filterDate, setFilterDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [confirmDelete, setConfirmDelete] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data: employees = [], isError: employeesError } = useQuery({
    queryKey: ['payroll-attendance-employees', activeRestaurant?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('employees').select('*')
        .eq('restaurant_id', activeRestaurant.id).order('full_name').limit(500);
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeRestaurant?.id,
  });

  // Date scoped fetch (instead of loading 5,000 historical records) and explicit
  // SELECT errors, so permission/network failures are not mislabeled "No data".
  const { data: records = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['attendance', activeRestaurant?.id, filterDate],
    queryFn: async () => {
      const { data, error } = await supabase.from('attendance').select('*')
        .eq('restaurant_id', activeRestaurant.id).eq('date', filterDate).order('employee_name').limit(5000);
      if (error) throw error;
      return data || [];
    },
    enabled: Boolean(activeRestaurant?.id && filterDate),
  });

  const createMut = useMutation({
    mutationFn: async data => {
      const { data: existing, error } = await supabase.from('attendance').select('id')
        .eq('restaurant_id', data.restaurant_id).eq('employee_id', data.employee_id).eq('date', data.date).limit(3);
      if (error) throw error;
      if (existing.length > 1) throw new Error('Duplicate attendance entries need administrator review.');
      if (existing.length === 1) return base44.entities.Attendance.update(existing[0].id, data);
      return base44.entities.Attendance.create(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance'] });
      qc.invalidateQueries({ queryKey: ['payroll-attendance'] });
      setShowForm(false);
      setForm({ ...emptyForm, date: filterDate });
      toast.success(translateLiteral('Attendance saved'));
    },
    onError: error => toast.error(error?.message || translateLiteral('Unable to save attendance')),
  });
  const deleteMut = useMutation({
    mutationFn: id => base44.entities.Attendance.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance'] });
      qc.invalidateQueries({ queryKey: ['payroll-attendance'] });
      setConfirmDelete(null);
      toast.success(translateLiteral('Attendance deleted'));
    },
    onError: error => toast.error(error?.message || translateLiteral('Unable to delete attendance')),
  });

  const filtered = useMemo(() => records.filter(r =>
    r.restaurant_id === activeRestaurant?.id &&
    (filterBranch === 'all' || r.branch === filterBranch)
  ), [records, filterBranch, activeRestaurant?.id]);

  // Employees available to manager (by branch)
  const availableEmployees = useMemo(() => {
    const scoped = employees.filter(e => e.is_active !== false && e.restaurant_id === activeRestaurant?.id);
    if (role === 'owner') return scoped;
    const key = typeof managerBranch === 'string' ? managerBranch
      : (managerBranch?.key || managerBranch?.branch_key || user?.branch || '');
    return scoped.filter(e => !key || e.branch === key);
  }, [employees, role, user, activeRestaurant?.id, managerBranch]);

  const handleSubmit = () => {
    if (!form.employee_id || !form.date || !form.status) return;
    const emp = employees.find(e => e.id === form.employee_id);
    if (!emp || !availableEmployees.some(e => e.id === emp.id) || !activeRestaurant?.id) {
      toast.error(translateLiteral('Select an active employee in the current business'));
      return;
    }
    const hours = calcHours(form.check_in, form.check_out);
    const branchRecord = tenantBranches.find(branch => (branch.key || branch.branch_key) === emp.branch);
    const payload = {
      ...form,
      employee_name: emp?.full_name || form.employee_name,
      branch: emp?.branch || form.branch,
      hours_worked: hours,
      late_minutes: form.status === 'late' ? Math.max(0, Number(form.late_minutes) || 0) : 0,
      restaurant_id: activeRestaurant.id,
      branch_id: branchRecord?.id || null,
    };
    delete payload.notes;
    createMut.mutate(payload);
  };

  const exportCSV = () => {
    const rows = [
      ['Date', 'Employee', 'Branch', 'Status', 'Check In', 'Check Out', 'Hours', 'Late Mins'],
      ...filtered.map(r => [r.date, r.employee_name, r.branch, r.status, r.check_in || '', r.check_out || '', (Number(r.hours_worked) || 0).toFixed(1), r.late_minutes || 0])
    ];
    const safeCell = value => {
      const raw = String(value ?? '');
      const safe = /^[=+@-]/.test(raw) ? `'${raw}` : raw;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const csv = '\uFEFF' + rows.map(r => r.map(safeCell).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `attendance_${filterDate}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // Summary counts for the displayed day
  const summary = useMemo(() => {
    const counts = { present: 0, late: 0, absent: 0, half_day: 0, vacation: 0 };
    filtered.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });
    return counts;
  }, [filtered]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] gap-2">
        <Input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="flex-1" />
        <div className="min-w-0"><BranchSelect value={filterBranch} onChange={setFilterBranch} includeAll /></div>
        <Button size="sm" variant="outline" aria-label="Export attendance CSV" onClick={exportCSV}><Download className="w-3.5 h-3.5" /></Button>
        <Button size="sm" aria-label="Record attendance" onClick={() => { setForm({ ...emptyForm, date: filterDate }); setShowForm(true); }}><Plus className="w-3.5 h-3.5" /></Button>
      </div>

      {/* Day summary pills */}
      <div className="flex gap-2 flex-wrap">
        {Object.entries(summary).map(([status, count]) => {
          const cfg = STATUS_CONFIG[status];
          const Icon = cfg.icon;
          return (
            <div key={status} className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${cfg.bg} ${cfg.color}`}>
              <Icon className="w-3 h-3" /> {t(cfg.key)}: {count}
            </div>
          );
        })}
      </div>

      {(isError || employeesError) && (
        <Card className="p-3 border-red-200 text-red-700 text-sm">
          {translateLiteral('Attendance could not be loaded. Check connection and permissions.')}
          <Button size="sm" variant="outline" className="ms-2" onClick={() => refetch()}>{translateLiteral('Retry')}</Button>
        </Card>
      )}
      {/* Records */}
      <div className="space-y-2">
        {isLoading ? <p className="text-center py-8 text-muted-foreground text-sm">{t('loading')}</p> :
          (isError || employeesError) ? null : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">{availableEmployees.length === 0
                  ? translateLiteral('No active employees available. Add employees first.')
                  : translateLiteral('No attendance recorded for the selected date.')}</p>
              <Button size="sm" className="mt-3" onClick={() => setShowForm(true)}>{t('attendance')}</Button>
            </div>
          ) : filtered.map(r => {
            const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.present;
            const Icon = cfg.icon;
            const hrs = r.hours_worked || calcHours(r.check_in, r.check_out);
            return (
              <Card key={r.id} className="p-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${cfg.bg}`}>
                    <Icon className={`w-4 h-4 ${cfg.color}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{r.employee_name}</p>
                    <div className="flex gap-2 text-xs text-muted-foreground">
                      <span>{r.branch}</span>
                      {r.check_in && <span>↦ {r.check_in}</span>}
                      {r.check_out && <span>↤ {r.check_out}</span>}
                      {hrs > 0 && <span className="text-primary font-semibold">{hrs.toFixed(1)}h</span>}
                      {r.late_minutes > 0 && <span className="text-amber-600">{r.late_minutes}m late</span>}
                    </div>
                  </div>
                </div>
                <Button size="icon" variant="ghost" className="text-destructive shrink-0 h-7 w-7"
                  onClick={() => setConfirmDelete(r)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </Card>
            );
          })}
      </div>

      <Dialog open={!!confirmDelete} onOpenChange={open => !open && setConfirmDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{translateLiteral('Delete attendance?')}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            {translateLiteral('Deleting this entry may change the monthly payroll calculation.')}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>{t('cancel')}</Button>
            <Button variant="destructive" disabled={deleteMut.isPending}
              onClick={() => confirmDelete && deleteMut.mutate(confirmDelete.id)}>{t('delete')}</Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Add Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t('attendance')}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">{t('employees')}</Label>
              <Select value={form.employee_id} onValueChange={v => {
                const emp = employees.find(e => e.id === v);
                set('employee_id', v);
                set('employee_name', emp?.full_name || '');
                set('branch', emp?.branch || '');
              }}>
                <SelectTrigger><SelectValue placeholder={t('select')} /></SelectTrigger>
                <SelectContent>
                  {availableEmployees.filter(e => e.is_active !== false).map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.full_name} — {e.branch}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t('date')}</Label>
              <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">{t('status')}</Label>
              <Select value={form.status} onValueChange={v => set('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_CONFIG).map(([v, c]) => (
                    <SelectItem key={v} value={v}>{t(c.key)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(form.status === 'present' || form.status === 'late' || form.status === 'half_day') && (
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">{t('check_in')}</Label><Input type="time" value={form.check_in} onChange={e => set('check_in', e.target.value)} /></div>
                <div><Label className="text-xs">{t('check_out')}</Label><Input type="time" value={form.check_out} onChange={e => set('check_out', e.target.value)} /></div>
              </div>
            )}
            {form.status === 'late' && (
              <div>
                <Label className="text-xs">{t('late_minutes')}</Label>
                <Input type="number" value={form.late_minutes} onChange={e => set('late_minutes', e.target.value)} />
              </div>
            )}
            <div><Label className="text-xs">{t('notes')}</Label><Input value={form.notes} onChange={e => set('notes', e.target.value)} /></div>
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={handleSubmit} disabled={createMut.isPending || !form.employee_id || !activeRestaurant?.id}>{t('save')}</Button>
              <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>{t('cancel')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}