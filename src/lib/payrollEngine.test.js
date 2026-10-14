import { describe, expect, it } from 'vitest';
import { buildPayrollRow, calcDeductions, calcHours, summariseAttendance } from './payrollEngine';

describe('Payroll ERP calculation invariants', () => {
  it('uses employees.id UUID instead of a human-readable employee code', () => {
    const employee = {
      id: 'a1111111-1111-4111-8111-111111111111',
      employee_id: 'EMP-42',
      base_salary: 3500,
      full_name: 'Test Employee',
    };
    const row = buildPayrollRow(employee);
    expect(row.employee_id).toBe(employee.id);
    expect(row.final_salary).toBe(3500);
  });

  it('uses the legacy salary only when base_salary is missing', () => {
    expect(buildPayrollRow({ id: 'x', salary: 3200 }).base_salary).toBe(3200);
    expect(buildPayrollRow({ id: 'x', salary: 3200, base_salary: 3000 }).base_salary).toBe(3000);
  });

  it('accepts overnight work but rejects bad times and implausibly long shifts', () => {
    expect(calcHours('22:30', '06:00')).toBe(7.5);
    expect(calcHours('09:00', '17:15')).toBe(8.25);
    expect(calcHours('08:00', '08:00')).toBe(0);
    expect(calcHours('24:00', '05:00')).toBe(0);
    expect(calcHours('06:00', '23:00')).toBe(0);
  });

  it('does not deduct for late arrivals below the configured threshold', () => {
    const attendance = [
      { status: 'late', late_minutes: 10 },
      { status: 'late', late_minutes: 25 },
    ];
    const summary = summariseAttendance(attendance);
    expect(calcDeductions(summary, 2600, 26,
      [{ applies_to: 'late', deduction_type: 'fixed', amount: 50, late_threshold: 15 }],
      attendance)).toBe(50);
  });

  it('ignores unsafe daily fractions and never deducts more than salary', () => {
    const summary = { absent: 5 };
    expect(calcDeductions(summary, 2600, 26,
      [{ applies_to: 'absent', deduction_type: 'daily_fraction', amount: 50 }])).toBe(0);
    expect(calcDeductions(summary, 2600, 26,
      [{ applies_to: 'absent', deduction_type: 'daily_fraction', amount: 0.5 }])).toBe(250);
    expect(calcDeductions(summary, 2600, 26,
      [{ applies_to: 'absent', deduction_type: 'fixed', amount: 9999 }])).toBe(2600);
  });

  it('applies only rules for the employee restaurant and branch', () => {
    const emp = { id: 'uuid', restaurant_id: 'restaurant-a', branch_id: 'branch-a', base_salary: 2600 };
    const attendance = [{ status: 'absent' }];
    const rules = [
      { applies_to: 'absent', deduction_type: 'fixed', amount: 100, restaurant_id: 'restaurant-a', branch_id: 'branch-a' },
      { applies_to: 'absent', deduction_type: 'fixed', amount: 800, restaurant_id: 'restaurant-b' },
    ];
    expect(buildPayrollRow(emp, attendance, [], [], rules).deductions).toBe(100);
  });
});
