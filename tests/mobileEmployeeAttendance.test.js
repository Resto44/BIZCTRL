import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url),'utf8');

describe('Employee personal-phone attendance integrity', () => {
  it('never lets the employee portal directly write attendance or time', () => {
    const portal = read('../src/pages/EmployeeDashboardERP.jsx');
    const control = read('../src/components/attendance/EmployeeMobileAttendance.jsx');
    expect(portal).toContain('<EmployeeMobileAttendance userId={user?.id} />');
    expect(portal).not.toContain(".from('attendance').insert(");
    expect(portal).not.toContain(".from('attendance').update(");
    expect(control).toContain("supabase.rpc('erp_attendance_mobile_event'");
    expect(control).toContain("supabase.rpc('erp_attendance_mobile_status'");
    expect(control).toContain("navigator.geolocation.getCurrentPosition");
    expect(control).toContain('maximumAge: 0');
    expect(control).not.toContain('employee_id:');
    expect(control).not.toContain('new Date().toISOString()');
    expect(control).toContain("pin.length !== 6");
  });
  it('requires server-linked employee identity, hashed PIN and precise location', () => {
    const sql = read('../supabase/migrations/20261014173000_employee_mobile_attendance.sql');
    expect(sql).toContain("m.user_id=auth.uid() AND m.status='approved' AND lower(m.role)='employee'");
    expect(sql).toContain('m.linked_entity_id IS NOT NULL AND m.branch_id IS NOT NULL');
    expect(sql).toContain('e.id=v_mem.linked_entity_id');
    expect(sql).toContain("attendance_kiosk_pins");
    expect(sql).toContain("extensions.crypt(p_pin");
    expect(sql).toContain("v_distance + p_accuracy_m > v_geo.radius_m");
    expect(sql).toContain("AT TIME ZONE 'Asia/Riyadh'");
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.erp_attendance_mobile_event");
    expect(sql).toContain('attendance_mobile_audit');
    expect(sql).not.toContain('GRANT SELECT ON TABLE public.attendance_branch_geofences');
  });
  it('makes geofence setup owner-only and opt-in', () => {
    const setup = read('../src/components/attendance/BranchAttendanceGeofence.jsx');
    const sql = read('../supabase/migrations/20261014173000_employee_mobile_attendance.sql');
    expect(setup).toContain("role !== 'owner'");
    expect(setup).toContain('onSite');
    expect(setup).toContain("navigator.geolocation.getCurrentPosition");
    expect(setup).toContain("p_branch_id: chosen.id");
    expect(sql).toContain("lower(m.role)='owner'");
    expect(sql).toContain('p_radius_m BETWEEN 50 AND 500');
  });
});
