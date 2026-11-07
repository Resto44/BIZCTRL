import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin, ShieldCheck, Clock3, Loader2 } from 'lucide-react';
import { employeeAttendanceAction } from '@/lib/employeeAttendancePhase';
import EmployeeMobileAttendanceLegacy from './EmployeeMobileAttendanceLegacy';

const messages = {
  APPROVED_EMPLOYEE_LINK_REQUIRED: 'Your employee account needs Owner approval and an Employee record link.',
  ASSIGNMENT_INVALID: 'Your employee record must be assigned to an active branch.',
  BRANCH_GEOFENCE_REQUIRED: 'Owner must configure the attendance location for this branch.',
  GPS_ACCURACY_REQUIRED: 'GPS is not accurate enough. Move outdoors and retry with precise location enabled.',
  OUTSIDE_BRANCH: 'You are outside the configured branch attendance area.',
  INVALID_PIN: 'Invalid six-digit employee PIN. Ask the manager to set/reset your PIN.',
  OTP_INVALID: 'The email code is incorrect.',
  OTP_EXPIRED: 'The email code expired after 30 minutes. Request a new code.',
  OTP_NOT_REQUESTED: 'Request an email code before recording attendance.',
  OTP_LOCKED: 'Too many incorrect attempts. Request a new code.',
  OTP_ACTION_CHANGED: 'Your shift state changed. Request another email code.',
  PIN_RATE_LIMITED: 'Too many PIN attempts. Wait 15 minutes before retrying.',
  SHIFT_REVIEW_REQUIRED: 'Shift needs manager review (too short or more than 16 hours).',
  ALREADY_RECORDED: 'Attendance already recorded for this date. Ask the manager to review.',
  MANAGER_REVIEW_REQUIRED: 'Attendance for this date requires manager review before check-in.',
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

/** Employee-owned device check-in. Only employee session + 30-minute email OTP + branch GPS,
 * never a client-provided employee UUID or device timestamp.
 */
export default function EmployeeMobileAttendance({ userId }) {
  const { translateLiteral: tr, lang } = useLanguage();
  const words = {
    en:{issue:'Email my 6-digit code',verify:'Verify code and GPS',prompt:'One-time code sent to your registered email. Expires in 30 minutes.',pending:'Sending code…',expiry:'Expires',request:'Request a new code',notice:'The email service accepted your message; delivery to the inbox is not guaranteed.',invalid:'A fresh code is needed before every Check In and Check Out.'},
    ar:{issue:'أرسل الرمز المكون من ٦ أرقام إلى بريدي',verify:'تحقق من الرمز والموقع',prompt:'رمز لمرة واحدة يُرسل لبريدك المسجل، صالح لمدة ٣٠ دقيقة.',pending:'جارٍ إرسال الرمز…',expiry:'تنتهي الصلاحية',request:'اطلب رمزًا جديدًا',notice:'قبلت خدمة البريد الرسالة، لكن وصولها إلى صندوق الوارد ليس مضمونًا.',invalid:'يلزم رمز جديد لكل دخول وخروج.'},
    fa:{issue:'کد ۶ رقمی را به ایمیلم بفرست',verify:'تأیید کد و موقعیت',prompt:'کد یک‌بارمصرف به ایمیل ثبت‌شده می‌رود و ۳۰ دقیقه اعتبار دارد.',pending:'در حال ارسال کد…',expiry:'انقضا',request:'درخواست کد جدید',notice:'سرویس ایمیل پیام را پذیرفته؛ رسیدن به صندوق ورودی هنوز قطعی نیست.',invalid:'برای هر ورود و خروج کد جدید لازم است.'},
  }[lang] || null;
  const copy = words || {
    issue:'Email my 6-digit code',verify:'Verify code and GPS',prompt:'One-time code valid for 30 minutes.',pending:'Sending code…',expiry:'Expires',request:'Request a new code',notice:'Email provider accepted the message.',invalid:'A fresh code is required for every action.'
  };
  const qc = useQueryClient();
  const { data: emailCapability, isPending: emailCapabilityPending, isError: emailCapabilityError } = useQuery({
    queryKey: ['attendance-email-capability',userId],
    queryFn: async () => {
      const {data,error} = await supabase.functions.invoke('attendance-email-otp',{body:{action:'status'}});
      if(error) throw error;
      if(!data?.ok) throw new Error(data?.error || 'Attendance email status unavailable');
      return data;
    },
    enabled: Boolean(userId), staleTime: 60000, retry: 1,
  });
  const [pin, setPin] = useState('');
  const [codeTicket, setCodeTicket] = useState(null);
  const [success, setSuccess] = useState(null);
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
  const emailCode = useMutation({
    mutationFn: async () => {
      const latest=await supabase.rpc('erp_attendance_mobile_status');
      if(latest.error)throw latest.error;
      const phase=employeeAttendanceAction(latest.data);
      if(!['in','out'].includes(phase)) throw new Error('Attendance state changed; refresh first.');
      const {data,error}=await supabase.functions.invoke('attendance-email-otp',{
        body:{action:'issue',phase},
      });
      if(error)throw error;
      if(!data?.ok || !data?.sent)throw new Error(data?.error || 'EMAIL_UNAVAILABLE');
      return {...data,phase};
    },
    onSuccess: data => { setCodeTicket(data);setPin(''); },
    onError: () => { setPin('');setCodeTicket(null); },
  });
  const attendance = useMutation({
    mutationFn: async () => {
      if (!codeTicket || !/^[0-9]{6}$/.test(pin))
        throw new Error('Request the six-digit email code first.');
      if(Date.parse(codeTicket.expires_at) <= Date.now())
        throw new Error('OTP_EXPIRED');
      const latest = await supabase.rpc('erp_attendance_mobile_status');
      if (latest.error) throw latest.error;
      if (employeeAttendanceAction(latest.data) !== codeTicket.phase) {
        throw new Error('Attendance state changed. Refresh before retrying.');
      }
      const coords = await location();
      const { data, error } = await supabase.rpc('erp_attendance_email_event', {
        p_employee_id: null, p_code: pin,
        p_latitude: coords.latitude, p_longitude: coords.longitude,
        p_accuracy_m: coords.accuracy,
      });
      if (error) throw error;
      if (data?.type !== 'success') throw new Error(messages[data?.reason] || data?.reason || 'Attendance not recorded.');
      return data;
    },
    onSuccess: async data => {
      setPin('');
      setCodeTicket(null);
      setSuccess({ action: data.action, time: data.server_time });
      await qc.invalidateQueries({ queryKey: ['employee-mobile-attendance', userId] });
      await qc.invalidateQueries({ queryKey: ['emp-attendance'] });
      await qc.invalidateQueries({ queryKey: ['attendance-today'] });
      await qc.invalidateQueries({ queryKey: ['payroll-attendance'] });
      await qc.invalidateQueries({ queryKey: ['employee-360-attendance'] });
    },
    onError: async () => { setPin(''); await qc.invalidateQueries({ queryKey: ['employee-mobile-attendance', userId] }); },
  });
  const errorText = attendance.error?.message;
  const ready = Boolean(status?.configured && status?.branch_id);
  const action = employeeAttendanceAction(status);
  const checkedIn = action === 'out';
  const done = action === 'completed';
  const needsReview = action === 'review';
  const allowAction = action === 'in' || action === 'out';
  // During rollout, unenrolled employees retain their original authenticated
  // PIN+GPS path instead of being locked out by missing email, mapping or
  // provider configuration. This fallback is explicit, not a success claim.
  if (!emailCapabilityPending && (emailCapabilityError || !emailCapability?.configured || !emailCapability?.eligible)) {
    return <>
      <p role="status" className="mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
        {tr(emailCapabilityError ? 'Email verification is temporarily unavailable. Existing GPS + PIN attendance remains available.'
          : !emailCapability?.configured ? 'Email verification has not been configured by the Owner yet. Existing GPS + PIN remains available.'
          : 'Your verified employee email, branch assignment or GPS setup needs Owner review. Existing GPS + PIN remains available until enrollment is complete.')}
      </p>
      <EmployeeMobileAttendanceLegacy userId={userId} />
    </>;
  }
  return <Card className="border-white/15 bg-white/5 text-white">
    <CardHeader className="pb-2">
      <CardTitle className="flex items-center gap-2 text-sm">
        <ShieldCheck className="h-4 w-4 text-emerald-400" />
        {tr('My attendance — personal phone')}
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-3">
      <p className="text-xs text-slate-300">{copy.prompt} {copy.invalid}
        {tr('Accurate branch GPS is checked when you confirm. GPS alone can be spoofed and is not absolute proof of presence.')}
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
        {needsReview && <p role="alert" className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-200">
          {tr(messages[status?.reason] || 'This attendance entry requires manager review before another check-in or check-out.')}
        </p>}
        {allowAction && <>
          <Button type="button" className="h-11 w-full border border-cyan-300/30 bg-cyan-700 text-white hover:bg-cyan-600"
            disabled={emailCode.isPending || attendance.isPending}
            onClick={() => {setSuccess(null);emailCode.mutate();}}>
            {emailCode.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin"/>}
            {emailCode.isPending ? copy.pending : codeTicket ? copy.request : copy.issue}
          </Button>
          {codeTicket?.phase === action && <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-700/10 p-3 text-xs text-emerald-100">
            {copy.prompt} <strong>{codeTicket.masked_email}</strong>.
            <span className="mt-1 block">{copy.expiry}: {new Date(codeTicket.expires_at).toLocaleTimeString(lang==='ar'?'ar-SA':lang==='fa'?'fa-IR':'en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Riyadh'})} (Asia/Riyadh)</span>
            <span className="mt-1 block">{copy.notice}</span>
          </div>}
          {codeTicket?.phase === action && <>
            <label htmlFor="employee-mobile-pin" className="block text-xs text-slate-200">{tr('Email verification code (6 digits)')}</label>
            <Input id="employee-mobile-pin" type="password" inputMode="numeric" autoComplete="one-time-code"
              pattern="[0-9]{6}" maxLength={6} value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g,'').slice(0,6))}
              className="border-white/25 bg-slate-900 text-white"
              placeholder={tr('Enter code from employee email')} />
            <Button className="h-12 w-full bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={attendance.isPending || pin.length !== 6 || !allowAction}
              onClick={() => {setSuccess(null);attendance.mutate();}}>
              {attendance.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin"/> : <Clock3 className="me-2 h-4 w-4"/>}
              {attendance.isPending ? tr('Verifying location...') : copy.verify + ' · ' + tr(checkedIn ? 'Check Out' : 'Check In')}
            </Button>
          </>}
        </>}
        {emailCode.isError && <p role="alert" className="rounded-lg bg-red-500/10 p-2 text-sm text-red-300">{tr(emailCode.error?.message || 'Unable to send email code.')}</p>}
        {done && <p className="rounded-lg bg-emerald-500/15 p-3 text-sm text-emerald-200">
          {tr('Today’s Check In and Check Out are already saved. Another check-in today requires a separate authorized shift, not a new email code. This record remains preserved.')}
        </p>}
      </>}
      {success && <p role="status" className="rounded-lg bg-emerald-500/15 p-2 text-sm text-emerald-200">{tr(success.action === 'in' ? 'Check-in saved' : 'Check-out saved')} {success.time}</p>}
      {errorText && <p role="alert" className="rounded-lg bg-red-500/10 p-2 text-sm text-red-300">{tr(messages[errorText] || errorText)}</p>}
      <p className="text-xs text-slate-400">{tr('Location is requested only when you tap Check In or Check Out. Raw GPS coordinates are not stored in the attendance history.')}</p>
    </CardContent>
  </Card>;
}
