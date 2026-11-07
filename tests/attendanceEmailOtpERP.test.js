import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const sql=read('../supabase/migrations/20261107014500_employee_email_otp_attendance.sql');
const edge=read('../supabase/functions/attendance-email-otp/index.ts');
const mobile=read('../src/components/attendance/EmployeeMobileAttendance.jsx');
const kiosk=read('../src/pages/EmployeeAttendance.jsx');
describe('ERP six-digit email attendance OTP',()=>{
 it('stores only salted OTP hashes with server-verified 30-minute TTL and one-use consumption',()=>{
  expect(sql).toContain('extensions.crypt(p_code,extensions.gen_salt(');
  expect(sql).toContain("interval '30 minutes'");
  expect(sql).toContain('c.expires_at <= clock_timestamp()');
  expect(sql).toContain('c.tries>=5');
  expect(sql).toContain('used_at=v_t,verified_at=v_t');
  expect(sql).toContain('p_code !~');
  expect(sql).toContain('FOR UPDATE');
  expect(sql).toContain('pg_advisory_xact_lock');
  expect(sql).toContain("c.action<>'out'");
  expect(sql).toContain("c.action<>'in'");
 });
 it('never exposes codes, raw geolocation, or privileges to browser clients',()=>{
  expect(sql).toContain('REVOKE ALL ON public.attendance_email_codes FROM PUBLIC, anon, authenticated');
  expect(sql).toContain('TO service_role;');
  expect(sql).toContain('ATTENDANCE_FORBIDDEN');
  expect(sql).toContain("m.status='approved'");
  expect(sql).toContain('m.linked_entity_id=e.id');
  expect(sql).toContain('v_distance+p_accuracy_m>g.radius_m');
  expect(sql).toContain('p_accuracy_m>80');
  expect(sql).not.toContain('GRANT SELECT ON public.attendance_email_codes TO authenticated');
  expect(edge).toContain("await caller.auth.getUser()");
  expect(edge).toContain("crypto.getRandomValues(buffer)");
  expect(edge).toContain('Idempotency-Key');
  expect(edge).toContain("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')");
  expect(edge).toContain('erp_attendance_email_delivery_admin');
  expect(edge).not.toContain('console.log(code)');
  expect(edge).not.toContain('otp:code');
 });
 it('enforces one emailed code per check-in and check-out in both portals',()=>{
  for(const client of [mobile,kiosk]){
   expect(client).toContain("supabase.functions.invoke('attendance-email-otp'");
   expect(client).toContain("supabase.rpc('erp_attendance_email_event'");
   expect(client).toContain('enableHighAccuracy:');
   expect(client).toContain('maximumAge:');
   expect(client).toContain("supabase.rpc('erp_attendance_email_event'");
  }
  expect(mobile).toContain("p_employee_id: null");
  expect(kiosk).toContain("p_employee_id:employeeId");
  expect(kiosk).toContain('QR identifies the employee ONLY');
  expect(kiosk).toContain("supabase.rpc('erp_attendance_kiosk_event'");
  expect(kiosk).toContain("!canUseEmailOtp");
  expect(mobile).toContain('<EmployeeMobileAttendanceLegacy userId={userId} />');
  expect(mobile).toContain("emailCapability?.eligible");
 });
 it('provides non-sensitive, tenant-scoped owner and manager audit counts',()=>{
  expect(sql).toContain('erp_attendance_email_owner_summary');
  expect(sql).toContain("m.role='owner'");
  expect(sql).toContain("m.role='manager' AND p_branch IS NOT NULL");
  expect(sql).toContain('verified_in');
  expect(sql).toContain('verified_out');
  expect(kiosk).toContain('attendance-email-summary');
 });
});
