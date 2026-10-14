import { describe, it, expect } from 'vitest';
import { employeeAttendanceAction } from '../src/lib/employeeAttendancePhase';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');

describe('ERP check-in/out business state invariants', () => {
  it('uses server phase to decide the next action, including overnight checkout', () => {
    expect(employeeAttendanceAction(undefined)).toBe('setup');
    expect(employeeAttendanceAction({ configured: false })).toBe('setup');
    expect(employeeAttendanceAction({ configured: true, phase: 'not_checked_in', can_check_in: true })).toBe('in');
    expect(employeeAttendanceAction({ configured: true, phase: 'checked_in', can_check_out: true, shift_date: '2026-10-13' })).toBe('out');
    expect(employeeAttendanceAction({ configured: true, phase: 'completed', can_check_out: false })).toBe('completed');
  });
  it('blocks incomplete server status and manual absences instead of inventing a new clock-in', () => {
    expect(employeeAttendanceAction({ configured: true, phase: 'review_required' })).toBe('review');
    expect(employeeAttendanceAction({ configured: true, phase: 'checked_in', can_check_out: false })).toBe('review');
    expect(employeeAttendanceAction({ configured: true, phase: 'not_checked_in', can_check_in: false })).toBe('review');
    expect(employeeAttendanceAction({ configured: true })).toBe('review');
  });
  it('does not silently open a new shift if an old one is still open', () => {
    const sql = read('../supabase/migrations/20261014181000_attendance_transition_integrity.sql');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain("'phase',CASE");
    expect(sql).toContain("'review_required'");
    expect(sql).toContain('MANAGER_REVIEW_REQUIRED');
    expect(sql).not.toContain('AND a.date IN(v_today,v_today-1) ORDER BY a.date DESC LIMIT 1 FOR UPDATE;');
    expect(sql).not.toContain('AND date IN (v_today,v_today-1)');
    expect(sql).toContain('IF v_minutes < 2 OR v_minutes > 960 THEN');
  });
  it('keeps worker attendance usable independently of task and notification failures', () => {
    const page = read('../src/pages/EmployeeDashboardERP.jsx');
    const clock = read('../src/components/attendance/EmployeeMobileAttendance.jsx');
    expect(page).toContain('<EmployeeMobileAttendance userId={user?.id} />');
    expect(page).not.toContain('if (empProfileError || myTasksError || announcementsError) return');
    expect(clock).toContain("employeeAttendanceAction(status)");
    expect(clock).toContain("supabase.rpc('erp_attendance_mobile_status')");
    expect(clock).not.toContain("from('attendance').insert");
    expect(clock).not.toContain("from('attendance').update");
  });
  it('shows worker check-in/out stage inside the manager kiosk', () => {
    const kiosk = read('../src/pages/EmployeeAttendance.jsx');
    expect(kiosk).toContain("selectedAttendanceState === 'checked_in'");
    expect(kiosk).toContain("selectedAttendanceState === 'completed'");
    expect(kiosk).toContain("kiosk-employee-open-shift");
    expect(kiosk).toContain("eq('employee_id', selectedEmployee)");
  });
});
