import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const file=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const dashboard=file('../src/pages/EmployeeDashboardERP.jsx');
const attendance=file('../src/components/attendance/EmployeeMobileAttendance.jsx');

describe('Employee ERP responsive workspace: mobile UX and tenant-safe attendance',()=>{
 it('does not force dark portal inside the normal light SaaS shell',()=>{
  expect(dashboard).toContain('data-testid="employee-erp-workspace"');
  expect(dashboard).toContain('bg-slate-50/70');
  expect(dashboard).toContain('dark:bg-slate-950');
  expect(dashboard).not.toContain('from-slate-950 via-slate-900');
  expect(attendance).toContain('bg-white text-slate-900');
  expect(attendance).toContain('dark:bg-slate-900');
  expect(attendance).not.toContain('border-white/15 bg-white/5 text-white');
 });
 it('keeps every available portal tab on one mobile row and preserves navigation targets',()=>{
  expect(dashboard).toContain('data-testid="employee-erp-tabs"');
  expect(dashboard).toContain('grid grid-cols-4');
  expect(dashboard).not.toContain('max-w-5xl flex-wrap gap-2');
  expect(dashboard).toContain("tab === 'tasks' ? '/tasks'");
  expect(dashboard).toContain("tab === 'attendance' ? '/employee-attendance'");
  expect(dashboard).toContain("tab === 'announcements' ? '/employee-dashboard?tab=announcements'");
  expect(dashboard).toContain("aria-current={activeTab===item.id?'page':undefined}");
 });
 it('shows real scoped task and announcement KPIs but never invents attendance numbers',()=>{
  expect(dashboard).toContain('data-testid="employee-erp-kpis"');
  expect(dashboard).toContain('openTasks.length');
  expect(dashboard).toContain('announcements.length');
  expect(dashboard).toContain('myTasksError||myTasksLoading');
  expect(dashboard).toContain('announcementsError||announcementsLoading');
  expect(dashboard).not.toContain("from('attendance')");
  expect(dashboard).not.toContain("from('employees')");
  expect(dashboard).toContain(".eq('branch_id', branchId)");
  expect(dashboard).toContain(".eq('restaurant_id', user.restaurant_id)");
 });
 it('shows attendance only on relevant tabs without duplicate nested <details> shell',()=>{
  expect(dashboard).toContain("['home','attendance'].includes(activeTab)");
  expect(dashboard).toContain("<EmployeeMobileAttendance userId={user?.id}/>");
  expect(dashboard).not.toContain('<details open=');
  expect(dashboard).toContain('data-testid="employee-attendance-section"');
  expect(attendance).toContain('data-testid="employee-attendance-card"');
 });
 it('retains employee-only server OTP, precise GPS, and consent controls',()=>{
  expect(attendance).toContain("supabase.rpc('erp_attendance_code_status')");
  expect(attendance).toContain("supabase.rpc('erp_attendance_email_event'");
  expect(attendance).toContain('p_employee_id: null');
  expect(attendance).toContain('maximumAge: 0');
  expect(attendance).toContain("pin.length !== 6");
  expect(attendance).toContain('checked={shareAfterCheckIn}');
  expect(attendance).toContain('<EmployeeLiveLocation');
  expect(attendance).toContain('<LocationHistory userId={userId}/>');
  expect(attendance).not.toContain("from('attendance').insert");
  expect(attendance).not.toContain("from('attendance').update");
 });
 it('keeps Arabic / Dari RTL strings in the Employee dashboard without mixed fixed-dark labels',()=>{
  expect(dashboard).toContain("dir={isRTL ? 'rtl' : 'ltr'}");
  for(const label of ['الحضور ومشاركة الموقع','حضور و اشتراک موقعیت','وظایف من','المهام المكلّف بها'])
   expect(dashboard).toContain(label);
  expect(attendance).toContain('border-amber-200 bg-amber-50');
  expect(attendance).toContain('border-blue-200 bg-blue-50');
  expect(attendance).toContain('border-emerald-200 bg-emerald-50');
 });
});
