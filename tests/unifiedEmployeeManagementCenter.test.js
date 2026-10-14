import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('Unified Employee Management Center', () => {
  it('replaces separate staff pages in the owner navigation while keeping bookmarked routes', () => {
    const hub = read('../src/pages/EmployeeManagementCenter.jsx');
    const app = read('../src/App.jsx');
    const sidebar = read('../src/components/layout/ERPSidebar.jsx');
    expect(app).toContain('path="/employees" element={<RoleGuard permission="viewEmployees"><EmployeeManagementCenter />');
    expect(app).toContain('path="/payroll"');
    expect(app).toContain('path="/employee-attendance"');
    expect(app).toContain('path="/employee-control"');
    for (const section of ["'records'","'attendance'","'payroll'","'access'"]) expect(hub).toContain(section);
    expect(hub).toContain("can?.viewPayroll");
    expect(hub).toContain("can?.viewAttendance");
    expect(sidebar).toContain("label: 'Employee Management Center'");
    expect(sidebar).not.toContain("path: '/employee-control'");
    expect(sidebar).not.toContain("path: '/employee-attendance'");
  });

  it('loads employee records by immutable ID and selected restaurant and hides financial sections without permission', () => {
    const profile = read('../src/components/employees/EmployeeRecord360.jsx');
    const list = read('../src/pages/Employees.jsx');
    expect(profile).toContain(".eq('restaurant_id', restaurantId).eq('employee_id', employeeId)");
    expect(profile).toContain("enabled: scoped && mayViewPayroll");
    expect(profile).toContain("enabled: scoped && mayViewAttendance");
    expect(list).toContain(".eq('restaurant_id', activeRestaurant.id)");
    expect(list).toContain("can?.manageEmployees");
    expect(list).toContain("mayViewPayroll && e.base_salary");
    expect(list).not.toContain("Employee.delete(");
    expect(list).toContain(".update({ is_active: false })");
  });

  it('keeps employee module in one mobile-friendly hub and preserves scoped announcements', () => {
    const hub = read('../src/pages/EmployeeManagementCenter.jsx');
    const directory = read('../src/pages/Employees.jsx');
    expect(hub).toContain("max-w-full overflow-x-auto");
    expect(hub).toContain("<Employees embedded />");
    expect(hub).toContain("<Payroll embedded />");
    expect(hub).toContain("<EmployeeAttendance />");
    expect(directory).toContain("eq('restaurant_id', activeRestaurant.id).eq('is_active', true)");
    expect(directory).toContain("restaurant_id: activeRestaurant.id");
  });
});
