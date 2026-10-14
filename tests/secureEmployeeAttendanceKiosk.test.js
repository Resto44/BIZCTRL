import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const read = async path => readFile(new URL(path, import.meta.url), 'utf8');

describe('Secure employee kiosk boundaries', () => {
  it('does not match PIN or calculate check-in times in the browser', async () => {
    const page = await read('../src/pages/EmployeeAttendance.jsx');
    expect(page).toContain("supabase.rpc('erp_attendance_kiosk_event'");
    expect(page).toContain("supabase.rpc('erp_attendance_set_kiosk_pin'");
    expect(page).not.toContain('e.pin === pin');
    expect(page).not.toContain('Math.random()');
    expect(page).not.toContain('base44.entities.Attendance.create(');
    expect(page).not.toContain('base44.entities.Attendance.update(');
    expect(page).toContain("p_restaurant_id: restaurantId");
    expect(page).toContain("p_branch_id: branchId");
  });

  it('enforces scoped server time and serialized attendance transitions', async () => {
    const migration = await read('../supabase/migrations/20261014120000_secure_employee_attendance_kiosk.sql');
    expect(migration).toContain("TIME ZONE 'Asia/Riyadh'");
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain("extensions.crypt(p_pin, extensions.gen_salt('bf', 10))");
    expect(migration).toContain("m.role IN ('owner','manager')");
    expect(migration).toContain('blocked_until');
    expect(migration).toContain("interval '15 minutes'");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.erp_attendance_kiosk_event");
    expect(migration).toContain('attendance_kiosk_audit');
    expect(migration).not.toContain('GRANT SELECT ON TABLE public.attendance_kiosk_pins');
  });

  it('uses six-digit mobile PIN input and bundled QR reader', async () => {
    const pin = await read('../src/components/attendance/KioskPINPad.jsx');
    const scanner = await read('../src/components/attendance/QRScanner.jsx');
    expect(pin).toContain('next.length === 6');
    expect(pin).toContain('max-w-[235px]');
    expect(scanner).toContain("from '@zxing/browser'");
    expect(scanner).not.toContain('cdn.jsdelivr.net');
    expect(scanner).toContain('controlsRef.current?.stop()');
  });
});
