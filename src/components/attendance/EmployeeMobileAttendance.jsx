import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin, ShieldCheck, Clock3, Loader2 } from 'lucide-react';

const messages = {
  APPROVED_EMPLOYEE_LINK_REQUIRED: 'Your employee account needs Owner approval and an Employee record link.',
  ASSIGNMENT_INVALID: 'Your employee record must be assigned to an active branch.',
  BRANCH_GEOFENCE_REQUIRED: 'Owner must configure the attendance location for this branch.',
  GPS_ACCURACY_REQUIRED: 'GPS is not accurate enough. Move outdoors and retry with precise location enabled.',
  OUTSIDE_BRANCH: 'You are outside the configured branch attendance area.',
  INVALID_PIN: 'Invalid six-digit employee PIN. Ask the manager to set/reset your PIN.',
  PIN_RATE_LIMITED: 'Too many PIN attempts. Wait 15 minutes before retrying.',
  SHIFT_REVIEW_REQUIRED: 'Shift needs manager review (too short or more than 16 hours).',
  ALREADY_RECORDED: 'Attendance already recorded for this date. Ask the manager to review.',
};
const location = () => new Promise((resolve, reject) => {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    reject(new Error('Location is unavailable on this device.')); return;
  }
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy }),
    error => reject(new Error(error?.code === 1
      ? 'Location permission is required. Allow precise location in your browser settings.'
      : 'Unable to determine location. Turn on GPS and retry.')),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
  );
});

/** Employee-owned device check-in. Only employee session + own PIN + branch GPS,
 * never a client-provided employee UUID or device timestamp.
 */
export default function EmployeeMobileAttendance({ userId }) {
  const { translateLiteral: tr } = useLanguage();
  const qc = useQueryClient();
  const [pin, setPin] = useState('');
  const [success, setSuccess] = useState('');
  const { data: status, isPending, isError, refetch } = useQuery({
    queryKey: ['employee-mobile-attendance', userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('erp_attendance_mobile_status');
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
    refetchInterval: 30000,
    retry: 1,
  });
  const attendance = useMutation({
    mutationFn: async () => {
      if (!/^[0-9]{6}$/.test(pin)) throw new Error('Enter your six-digit PIN.');
      const coords = await location();
      const { data, error } = await supabase.rpc('erp_attendance_mobile_event', {
        p_pin: pin, p_latitude: coords.latitude, p_longitude: coords.longitude,
        p_accuracy_m: coords.accuracy,
      });
      if (error) throw error;
      if (data?.type !== 'success') throw new Error(messages[data?.reason] || data?.reason || 'Attendance not recorded.');
      return data;
    },
    onSuccess: async data => {
      setPin('');
      setSuccess({ action: data.action, time: data.server_time });
      await qc.invalidateQueries({ queryKey: ['employee-mobile-attendance', userId] });
      await qc.invalidateQueries({ queryKey: ['emp-attendance'] });
      await qc.invalidateQueries({ queryKey: ['attendance-today'] });
      await qc.invalidateQueries({ queryKey: ['payroll-attendance'] });
      await qc.invalidateQueries({ queryKey: ['employee-360-attendance'] });
    },
    onError: () => setPin(''),
  });
  const errorText = attendance.error?.message;
  const ready = Boolean(status?.configured && status?.branch_id);
  const done = status?.check_out != null && status?.check_out !== '';
  const checkedIn = Boolean(status?.check_in);
  return <Card className="border-white/15 bg-white/5 text-white">
    <CardHeader className="pb-2">
      <CardTitle className="flex items-center gap-2 text-sm">
        <ShieldCheck className="h-4 w-4 text-emerald-400" />
        {tr('My attendance — personal phone')}
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-3">
      <p className="text-xs text-slate-300">
        {tr('Only your approved employee account can record attendance. GPS and your six-digit PIN are required.')}
      </p>
      {isPending && <p role="status" className="text-sm">{tr('Loading attendance...')}</p>}
      {isError && <p role="alert" className="text-sm text-red-300">{tr('Attendance status unavailable.')} <Button variant="ghost" size="sm" onClick={() => refetch()}>{tr('Retry')}</Button></p>}
      {!isPending && !isError && !ready && <p role="alert" className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-200">
        {tr(messages[status?.reason] || 'Your branch attendance location is not configured.')}
      </p>}
      {ready && <>
        <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 p-3 text-sm">
          <span className="min-w-0 truncate">{status.branch_name}</span>
          <span className="flex shrink-0 items-center gap-1 text-xs text-slate-300">
            <MapPin className="h-3 w-3" /> {tr('GPS verified at check-in/out')}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg bg-white/5 p-3">
            <p className="text-xs text-slate-400">{tr('Check In')}</p>
            <p className="mt-1 font-semibold tabular-nums">{status.check_in || '—'}</p>
          </div>
          <div className="rounded-lg bg-white/5 p-3">
            <p className="text-xs text-slate-400">{tr('Check Out')}</p>
            <p className="mt-1 font-semibold tabular-nums">{status.check_out || '—'}</p>
          </div>
        </div>
        {!done && <>
          <label htmlFor="employee-mobile-pin" className="block text-xs text-slate-200">{tr('Employee PIN (6 digits)')}</label>
          <Input id="employee-mobile-pin" type="password" inputMode="numeric"
            autoComplete="off" pattern="[0-9]{6}" maxLength={6}
            value={pin} onChange={e => setPin(e.target.value.replace(/\D/g,'').slice(0,6))}
            className="border-white/25 bg-slate-900 text-white"
            placeholder={tr('Enter your six-digit PIN')} />
          <Button className="h-12 w-full bg-emerald-600 text-white hover:bg-emerald-700"
            disabled={attendance.isPending || pin.length !== 6}
            onClick={() => { setSuccess(''); attendance.mutate(); }}>
            {attendance.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Clock3 className="me-2 h-4 w-4" />}
            {attendance.isPending ? tr('Verifying location...') : tr(checkedIn ? 'Check Out' : 'Check In')}
          </Button>
        </>}
        {done && <p className="rounded-lg bg-emerald-500/15 p-3 text-sm text-emerald-200">
          {tr('Today’s attendance is complete.')}
        </p>}
      </>}
      {success && <p role="status" className="rounded-lg bg-emerald-500/15 p-2 text-sm text-emerald-200">{tr(success.action === 'in' ? 'Check-in saved' : 'Check-out saved')} {success.time}</p>}
      {errorText && <p role="alert" className="rounded-lg bg-red-500/10 p-2 text-sm text-red-300">{tr(errorText)}</p>}
      <p className="text-xs text-slate-400">{tr('Location is requested only when you tap Check In or Check Out. Raw GPS coordinates are not stored in the attendance history.')}</p>
    </CardContent>
  </Card>;
}
