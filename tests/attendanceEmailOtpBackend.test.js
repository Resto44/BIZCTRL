import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const sql=read('../supabase/migrations/20261107014500_employee_email_otp_attendance.sql');
const edge=read('../supabase/functions/attendance-email-otp/index.ts');
describe('Staged ERP email attendance backend security',()=>{
 it('uses bcrypt hashed six-digit challenges, server 30-minute expiration and atomic one-use verification',()=>{
  expect(sql).toContain("interval '30 minutes'");
  expect(sql).toContain("extensions.crypt(p_code,extensions.gen_salt('bf',10))");
  expect(sql).toContain('c.expires_at <= clock_timestamp()');
  expect(sql).toContain('c.tries>=5');
  expect(sql).toContain('used_at=v_t,verified_at=v_t,attendance_id=a.id');
  expect(sql).toContain('FOR UPDATE');
  expect(sql).toContain('pg_advisory_xact_lock');
 });
 it('requires approved tenant/branch membership and accurate onsite GPS',()=>{
  expect(sql).toContain("m.status='approved'");
  expect(sql).toContain('m.linked_entity_id=e.id');
  expect(sql).toContain("v_distance+p_accuracy_m>g.radius_m");
  expect(sql).toContain("p_accuracy_m>80");
  expect(sql).toContain("AT TIME ZONE 'Asia/Riyadh'");
  expect(sql).toContain('OTP_ACTION_CHANGED');
 });
 it('never exposes OTP storage or privileged issuance to client JWT role',()=>{
  expect(sql).toContain('REVOKE ALL ON public.attendance_email_codes FROM PUBLIC, anon, authenticated');
  expect(sql).toContain('TO service_role');
  expect(sql).not.toContain('GRANT SELECT ON public.attendance_email_codes TO authenticated');
  expect(edge).toContain('await caller.auth.getUser()');
  expect(edge).toContain('crypto.getRandomValues(buffer)');
  expect(edge).toContain('erp_attendance_email_issue_admin');
  expect(edge).toContain('erp_attendance_email_delivery_admin');
  expect(edge).not.toContain('console.log(code)');
 });
 it('uses server-side email verification in the opt-in portal UI',()=>{
  const employee=read('../src/components/attendance/EmployeeMobileAttendance.jsx');
  const owner=read('../src/pages/EmployeeAttendance.jsx');
  expect(employee).toContain("erp_attendance_email_event");
  expect(owner).toContain("erp_attendance_email_event");
  expect(employee).not.toContain("supabase.rpc('erp_attendance_mobile_event'");
  expect(owner).not.toContain("supabase.rpc('erp_attendance_kiosk_event'");
 });
});
