import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenant } from '@/lib/TenantContext';
import { useRole, ROLES } from '@/lib/RoleContext';
import { useLanguage } from '@/lib/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { QrCode, Lock, Users, BarChart2, Camera, Download, RefreshCw, Calendar, ShieldCheck } from 'lucide-react';
import BranchSelect from '@/components/shared/BranchSelect';
import KioskPINPad from '@/components/attendance/KioskPINPad';
import QRScanner from '@/components/attendance/QRScanner';
import AttendanceLiveBoard from '@/components/attendance/AttendanceLiveBoard';
import AttendanceAnalyticsPanel from '@/components/attendance/AttendanceAnalyticsPanel';
import EmployeeQRCard from '@/components/attendance/EmployeeQRCard';

const timeZone = 'Asia/Riyadh';
function businessToday(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function cutoffForToday(days, today) {
  const result = new Date(today + 'T12:00:00Z');
  result.setUTCDate(result.getUTCDate() - days + 1);
  return result.toISOString().slice(0, 10);
}
function safeCsvCell(value) {
  const raw = String(value ?? '');
  const safe = /^[=+@\-\t\r]/.test(raw) ? "'" + raw : raw;
  return '"' + safe.replace(/"/g, '""') + '"';
}

export default function EmployeeAttendance() {
  const { activeRestaurant, branches, managerBranch, isManager } = useTenant();
  const { role } = useRole();
  const { lang, t, translateLiteral: tr } = useLanguage();
  const qc = useQueryClient();
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [tab, setTab] = useState('kiosk');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [result, setResult] = useState(null);
  const [analyticsRange, setAnalyticsRange] = useState(30);
  const [codeTicket, setCodeTicket] = useState(null);

  const restaurantId = activeRestaurant?.id || null;
  const isOwner = role === ROLES.OWNER;
  const canManage = isOwner || role === ROLES.MANAGER;
  const managerBranchKey = typeof managerBranch === 'string'
    ? managerBranch : (managerBranch?.key || managerBranch?.branch_key || '');
  const branch = branches.find(b => b.key === selectedBranch || b.branch_key === selectedBranch);
  const branchId = branch?.id || null;

  useEffect(() => {
    const next = isManager ? managerBranchKey : selectedBranch;
    const valid = branches.some(b => b.key === next || b.branch_key === next);
    if (!valid) setSelectedBranch(isManager ? managerBranchKey : (branches[0]?.key || ''));
    if (isManager && managerBranchKey && selectedBranch !== managerBranchKey) setSelectedBranch(managerBranchKey);
  }, [branches, isManager, managerBranchKey, selectedBranch]);
  useEffect(() => { setSelectedEmployee(''); setCodeTicket(null); setResult(null); }, [restaurantId, selectedBranch]);
  useEffect(() => { setCodeTicket(null); }, [selectedEmployee]);
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const today = businessToday(currentTime);
  const displayTime = currentTime.toLocaleTimeString(
    lang === 'fa' ? 'fa-IR' : lang === 'ar' ? 'ar-SA' : 'en-GB',
    { timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit' },
  );
  const ready = Boolean(restaurantId && branchId);
  const queryRows = async (table, apply) => {
    const { data, error } = await apply(supabase.from(table).select('*')).limit(5000);
    if (error) throw error;
    return data || [];
  };
  // Select only non-sensitive employee fields. Never send PIN hashes or salaries to kiosk.
  const { data: allEmployees = [], isPending: loadingEmp, isError: employeeError } = useQuery({
    queryKey: ['kiosk-employee-list', restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from('employees')
        .select('id,full_name,position,branch,branch_id,restaurant_id,is_active,qr_code')
        .eq('restaurant_id', restaurantId).eq('is_active', true).order('full_name').limit(1000);
      if (error) throw error;
      return data || [];
    },
    enabled: Boolean(restaurantId),
  });
  const employees = useMemo(() => allEmployees.filter(e => e.branch_id === branchId
    || (e.branch_id == null && e.branch === selectedBranch)), [allEmployees, branchId, selectedBranch]);

  const { data: todayAttendance = [], isError: attendanceError, refetch: refetchToday } = useQuery({
    queryKey: ['attendance-today', restaurantId, selectedBranch, today],
    queryFn: () => queryRows('attendance', q => q.eq('restaurant_id', restaurantId)
      .eq('branch', selectedBranch).eq('date', today).order('employee_name')),
    enabled: ready,
    refetchInterval: 30000,
  });
  const { data: selectedOpenShift, isError: openShiftError } = useQuery({
    queryKey: ['kiosk-employee-open-shift', restaurantId, branchId, selectedEmployee],
    queryFn: async () => {
      const { data, error } = await supabase.from('attendance')
        .select('id,date,check_in,check_out')
        .eq('restaurant_id', restaurantId).eq('branch_id', branchId)
        .eq('employee_id', selectedEmployee).not('check_in', 'is', null)
        .is('check_out', null).order('date', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: ready && Boolean(selectedEmployee),
    refetchInterval: 30000,
  });
  const employeeToday = todayAttendance.find(record => String(record.employee_id) === String(selectedEmployee));
  const selectedAttendanceState = selectedOpenShift
    ? 'checked_in' : employeeToday?.check_out ? 'completed'
    : employeeToday?.id ? 'review' : 'not_checked_in';
    const rangeFrom = cutoffForToday(analyticsRange, today);
  const { data: periodRecords = [], isError: analyticsError } = useQuery({
    queryKey: ['attendance-period', restaurantId, selectedBranch, rangeFrom, today],
    queryFn: () => queryRows('attendance', q => q.eq('restaurant_id', restaurantId)
      .eq('branch', selectedBranch).gte('date', rangeFrom).lte('date', today).order('date')),
    enabled: ready && tab === 'analytics',
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['kiosk-employee-list'] });
    qc.invalidateQueries({ queryKey: ['attendance-today'] });
    qc.invalidateQueries({ queryKey: ['attendance-period'] });
    qc.invalidateQueries({ queryKey: ['kiosk-employee-open-shift'] });
  };

  const getOnsitePosition = () => new Promise((resolve,reject)=>{
    if(typeof navigator==='undefined'||!navigator.geolocation){
      reject(new Error('Location is unavailable. Enable precise GPS at your branch.')); return;
    }
    navigator.geolocation.getCurrentPosition(({coords})=>resolve(coords),()=>reject(new Error(
      'Precise branch location permission is required.')),
      {enableHighAccuracy:true,maximumAge:0,timeout:15000});
  });
  const currentPhase=selectedAttendanceState==='checked_in'?'out'
    :selectedAttendanceState==='not_checked_in'?'in':null;
  const emailCodeMutation=useMutation({
    mutationFn:async()=>{
      if(!canManage||!ready||!selectedEmployee||!currentPhase) throw new Error('Select an employee eligible for Check In or Check Out.');
      const {data,error}=await supabase.functions.invoke('attendance-email-otp',{
        body:{action:'issue',employee_id:selectedEmployee,phase:currentPhase},
      });
      if(error)throw error;
      if(!data?.sent||!data?.ok)throw new Error(data?.error||'Email code unavailable.');
      return {...data,phase:currentPhase,employeeId:selectedEmployee};
    },
    onSuccess:data=>{setCodeTicket(data);toast.success(tr('Email provider accepted the attendance code.'));},
    onError:e=>{setCodeTicket(null);toast.error(e.message);},
  });
  const kioskMutation=useMutation({
    mutationFn:async({employeeId,credential})=>{
      if(!ready||!canManage||!codeTicket||codeTicket.employeeId!==employeeId)
        throw new Error('Request a fresh email code for this employee.');
      if(Date.parse(codeTicket.expires_at)<=Date.now())throw new Error('OTP_EXPIRED');
      const position=await getOnsitePosition();
      const {data,error}=await supabase.rpc('erp_attendance_email_event',{
        p_employee_id:employeeId,p_code:credential,
        p_latitude:position.latitude,p_longitude:position.longitude,
        p_accuracy_m:position.accuracy,
      });
      if(error)throw error;
      if(data?.type!=='success')throw new Error(data?.reason||'Attendance not recorded.');
      return { ...data,title: data.action==='in'?'Check In':'Check Out',
        message:'Email code and branch location verified.' };
    },
    onSuccess:data=>{
      setCodeTicket(null);setResult(data);refresh();
      qc.invalidateQueries({queryKey:['attendance-email-summary']});
      qc.invalidateQueries({queryKey:['attendance']});
      qc.invalidateQueries({queryKey:['payroll-attendance']});
      qc.invalidateQueries({queryKey:['payroll-dashboard-attendance']});
    },
    onError:error=>setResult({type:'error',title:tr('Attendance not recorded'),message:error.message}),
  });
  const submitQR=code=>{
    setShowQRScanner(false);
    const emp=employees.find(e=>e.qr_code===code.trim());
    if(!emp){
      setResult({type:'error',title:tr('QR Error'),
        message:tr('This QR badge is not assigned to the selected branch.')});
      return;
    }
    // A printed/stolen QR identifies the employee ONLY. It cannot check
    // anyone in/out without a fresh emailed code and onsite GPS.
    setSelectedEmployee(emp.id);
    setCodeTicket(null);
    toast.success(tr('Employee selected. Send a one-time code to their email.'));
  };

  const { data: emailSummary }=useQuery({
    queryKey:['attendance-email-summary',restaurantId,branchId,today],
    queryFn:async()=>{
      const {data,error}=await supabase.rpc('erp_attendance_email_owner_summary',{
        p_restaurant:restaurantId,p_branch:branchId,
      });
      if(error)throw error;return data;
    },
    enabled:canManage&&ready,
    refetchInterval:60000,
  });

  const qrMutation = useMutation({
    mutationFn: async ({ emp, rotate = false }) => {
      const { data, error } = await supabase.rpc('erp_attendance_issue_kiosk_qr', {
        p_restaurant_id: restaurantId, p_employee_id: emp.id, p_rotate: rotate,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kiosk-employee-list'] }),
    onError: error => toast.error(error.message),
  });
  const generateMissingQRs = async () => {
    const missing = employees.filter(emp => !emp.qr_code);
    for (const employee of missing) {
      try { await qrMutation.mutateAsync({ emp: employee }); } catch { return; }
    }
    toast.success(tr('Missing QR badges generated'));
  };
  const exportCSV = async () => {
    if (!ready) return;
    try {
      const records = await queryRows('attendance', q => q.eq('restaurant_id', restaurantId)
        .eq('branch', selectedBranch).gte('date', rangeFrom).lte('date', today).order('date'));
      const rows = [
        ['Date','Employee','Branch','Status','Check In','Check Out','Hours','Late Mins'],
        ...records.map(r => [r.date, r.employee_name, r.branch, r.status, r.check_in || '',
          r.check_out || '', Number(r.hours_worked || 0).toFixed(2), r.late_minutes || 0]),
      ];
      const csv = '\uFEFF' + rows.map(row => row.map(safeCsvCell).join(',')).join('\r\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url; a.download = `attendance_${selectedBranch}_${today}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (error) { toast.error(error.message); }
  };

  const presentlyIn = todayAttendance.filter(r => r.check_in && !r.check_out).length;
  const done = todayAttendance.filter(r => r.check_out).length;
  const notCheckedIn = employees.filter(e => !todayAttendance.some(r => r.employee_id === e.id && r.check_in)).length;
  const loadError = employeeError || attendanceError;

  return (
    <div className="min-h-[70dvh] min-w-0 bg-background pb-[calc(9rem+env(safe-area-inset-bottom))]">
      {result && (
        <div role="status" className={`fixed inset-0 z-[80] flex items-center justify-center p-5 ${result.type === 'success' ? 'bg-emerald-950/70' : 'bg-red-950/70'}`}>
          <div className="w-full max-w-xs rounded-2xl bg-card p-6 text-center shadow-xl">
            <p className="mb-2 text-xl font-bold">{tr(result.title)}</p>
            <p className="text-sm text-muted-foreground">{result.message}</p>
            {result.time && <p className="mt-3 text-2xl font-semibold">{result.time}</p>}
            <Button className="mt-5 w-full" onClick={() => setResult(null)}>{t('close')}</Button>
          </div>
        </div>
      )}
      <Dialog open={showQRScanner} onOpenChange={setShowQRScanner}>
        <DialogContent className="max-w-sm p-0"><QRScanner onScan={submitQR} onClose={() => setShowQRScanner(false)} /></DialogContent>
      </Dialog>

      <header className="sticky top-0 z-10 border-b bg-background/95 px-3 py-3 backdrop-blur sm:px-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg font-bold">{tr('Employee Attendance')}</h1>
            <p className="text-xs text-muted-foreground">{displayTime} · {today} · {tr('Saudi time')}</p>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button type="button" variant="ghost" size="icon" aria-label={tr('Refresh')} onClick={refresh}><RefreshCw className="h-4 w-4" /></Button>
            {isOwner && <Button type="button" variant="outline" size="icon" aria-label={tr('Export attendance CSV')}
              onClick={exportCSV}><Download className="h-4 w-4" /></Button>}
          </div>
        </div>
        <div className="mx-auto mt-3 max-w-3xl">
          <BranchSelect value={selectedBranch} onChange={setSelectedBranch} includeAll={false} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-3 pt-4 sm:px-4">
        {!ready && <Card className="mb-3 border-amber-300 p-3 text-sm text-amber-700">{tr('Select a registered active branch before recording attendance.')}</Card>}
        {loadError && <Card role="alert" className="mb-3 border-red-300 p-3 text-sm text-red-700">
          {tr('Unable to load employees or attendance. Check permissions and retry.')}
        </Card>}
        {!loadingEmp && !loadError && ready && employees.length === 0 && (
          <Card className="mb-3 border-amber-200 p-3 text-sm text-amber-700">
            {tr('No active employees are assigned to this business and branch. Assign them in Employees before using the kiosk.')}
          </Card>
        )}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-4 grid h-auto w-full grid-cols-4 gap-1 p-1">
            {[
              { id: 'kiosk', label: 'Kiosk', icon: Lock },
              { id: 'live', label: 'Live', icon: Users },
              { id: 'qrcodes', label: 'QR', icon: QrCode },
              { id: 'analytics', label: 'Analytics', icon: BarChart2 },
            ].map(item => {
              const Icon = item.icon;
              return <TabsTrigger key={item.id} value={item.id}
                className="flex min-w-0 flex-col gap-1 px-0.5 py-2 text-[10px] sm:flex-row sm:text-xs">
                <Icon className="h-4 w-4" /><span className="truncate">{tr(item.label)}</span>
              </TabsTrigger>;
            })}
          </TabsList>

          <TabsContent value="kiosk" className="space-y-3">
            <Card>
              <CardContent className="space-y-2 px-4 pb-4 pt-4">
                <div className="text-center">
                  <p className="font-semibold">{tr('Scan QR Code')}</p>
                  <p className="text-xs text-muted-foreground">{tr('Scan employee badge to select them. Email code + onsite GPS are still required.')}</p>
                </div>
                <Button type="button" className="h-12 w-full gap-2"
                  disabled={!ready || !employees.length || loadError || kioskMutation.isPending}
                  onClick={() => setShowQRScanner(true)}>
                  <Camera className="h-5 w-5" />{tr('Scan QR Code')}
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="px-4 pb-2 pt-4">
                <CardTitle className="flex items-center gap-2 text-sm"><Lock className="h-4 w-4" />{tr('Employee email verification (6 digits)')}</CardTitle>
                <p className="text-xs text-muted-foreground">{tr('A fresh one-time code is sent to the employee email for each Check In and Check Out. It expires after 30 minutes and needs accurate onsite GPS.')}</p>
              </CardHeader>
              <CardContent className="space-y-3 px-4 pb-4">
                <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={tr('Select employee')} /></SelectTrigger>
                  <SelectContent>{employees.map(emp => <SelectItem key={emp.id} value={emp.id}>{emp.full_name}</SelectItem>)}</SelectContent>
                </Select>
                {selectedEmployee && <p role="status" className="rounded-lg border bg-muted/50 p-3 text-center text-xs">
                  {selectedAttendanceState === 'checked_in'
                    ? tr('Check In recorded. Request a new email code to Check Out.')
                    : selectedAttendanceState === 'completed'
                      ? tr('Check In and Check Out are already recorded for today.')
                      : selectedAttendanceState === 'review'
                        ? tr('Attendance requires manager review before another scan.')
                        : tr('No Check In yet. Request an email code to record arrival.')}
                  {selectedOpenShift && <span className="block mt-1 text-muted-foreground">
                    {tr('Open shift date')}: {selectedOpenShift.date} · {selectedOpenShift.check_in}
                  </span>}
                </p>}
                {openShiftError && <p role="alert" className="text-sm text-destructive">
                  {tr('Unable to read current employee shift. The server will verify the next action.')}
                </p>}
                <Button type="button" className="w-full h-12" variant="secondary"
                  disabled={!ready || !selectedEmployee || !currentPhase || emailCodeMutation.isPending}
                  onClick={()=>emailCodeMutation.mutate()}>
                  {emailCodeMutation.isPending?tr('Sending email code…'):tr(codeTicket?'Request a new email code':'Send one-time code to employee email')}
                </Button>
                {codeTicket && codeTicket.employeeId===selectedEmployee && <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
                  {tr('Code sent to')}: <strong>{codeTicket.masked_email}</strong> · {tr('Expires after 30 minutes')} · {new Date(codeTicket.expires_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Riyadh'})}
                </p>}
                {codeTicket && codeTicket.employeeId===selectedEmployee &&
                  <KioskPINPad key={`${restaurantId}-${selectedBranch}-${selectedEmployee}-${codeTicket.expires_at}`}
                    loading={kioskMutation.isPending}
                    disabled={!ready || !selectedEmployee || loadError}
                    onSubmit={pin => kioskMutation.mutate({employeeId:selectedEmployee,credential:pin})} />}
                <p className="text-xs text-muted-foreground">{tr('GPS from this device is checked when recording attendance. GPS is not an absolute guarantee of physical presence.')}</p>
              </CardContent>
            </Card>
            {emailSummary && <Card className="border-blue-100 bg-blue-50/50"><CardContent className="p-3">
              <p className="text-xs font-semibold mb-2">{tr('Email OTP & location audit · today')}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  [tr('Email provider accepted'),emailSummary.provider_accepted],
                  [tr('Verified Check In'),emailSummary.verified_in],
                  [tr('Verified Check Out'),emailSummary.verified_out],
                  [tr('Expired unused'),emailSummary.expired_unused],
                ].map(([label,value])=><div key={label} className="rounded-lg border bg-white p-2 text-center">
                  <p className="text-lg font-bold tabular-nums">{value??0}</p>
                  <p className="text-[10px] text-muted-foreground">{label}</p>
                </div>)}
              </div>
            </CardContent></Card>}
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                [tr('Present'), presentlyIn],
                [tr('Done'), done],
                [tr('Not checked in'), notCheckedIn],
              ].map(([label, value]) => <Card key={label}><CardContent className="px-1 pb-3 pt-3">
                <p className="text-xl font-bold">{value}</p><p className="text-[11px] text-muted-foreground">{label}</p>
              </CardContent></Card>)}
            </div>
          </TabsContent>

          <TabsContent value="live">
            {loadingEmp ? <p className="py-8 text-center">{t('loading')}</p> : loadError ? null
              : <AttendanceLiveBoard employees={employees} todayAttendance={todayAttendance} />}
            <p className="mt-3 text-xs text-muted-foreground">{tr('Check-out requires an emailed six-digit code and onsite GPS in Kiosk or Employee Portal.')}</p>
          </TabsContent>

          <TabsContent value="qrcodes" className="space-y-4">
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              {tr('Old permanent PINs and printed QR badges are no longer accepted by this kiosk as stand-alone attendance proof. A fresh emailed code and branch GPS are required.')}
            </p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {employees.filter(e => e.qr_code).length}/{employees.length} {tr('employees have QR codes')}
              </p>
              {canManage && <Button variant="outline" size="sm" disabled={!ready || qrMutation.isPending}
                onClick={generateMissingQRs}><QrCode className="me-1 h-4 w-4" />{tr('Generate Missing')}</Button>}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {employees.map(emp => emp.qr_code
                ? <div key={emp.id} className="flex flex-col items-center gap-1">
                    <EmployeeQRCard employee={emp} />
                    {canManage && <Button type="button" size="sm" variant="outline"
                      disabled={qrMutation.isPending}
                      onClick={() => {
                        if (window.confirm(tr('Rotate QR and invalidate the existing badge?'))) {
                          qrMutation.mutate({ emp, rotate: true });
                        }
                      }}>{tr('Rotate QR')}</Button>}
                  </div>
                : <Card key={emp.id}><CardContent className="space-y-3 p-3 text-center">
                  <QrCode className="mx-auto h-10 w-10 text-muted-foreground/30" />
                  <p className="truncate text-sm font-medium">{emp.full_name}</p>
                  {canManage && <Button type="button" size="sm" variant="outline" disabled={qrMutation.isPending}
                    onClick={() => qrMutation.mutate({ emp })}>{tr('Generate QR')}</Button>}
                </CardContent></Card>)}
            </div>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span className="text-xs">{tr('Last')}</span>
              {[7,14,30,60].map(days => <Button key={days} type="button" size="sm"
                variant={analyticsRange === days ? 'default' : 'outline'}
                onClick={() => setAnalyticsRange(days)}>{days}{tr('d')}</Button>)}
            </div>
            {analyticsError ? <p role="alert" className="text-sm text-red-700">{tr('Attendance history could not be loaded.')}</p>
              : <AttendanceAnalyticsPanel records={periodRecords} employees={employees} />}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
