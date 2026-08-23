import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const sidebarPath = new URL('../src/components/layout/ERPSidebar.jsx', import.meta.url);
const routesPath = new URL('../src/App.jsx', import.meta.url);

describe('Supplier Portal navigation contract', () => {
  it('keeps the supplier self-service portal restricted to the supplier role in the shared ERP sidebar', async () => {
    const sidebar = await readFile(sidebarPath, 'utf8');

    expect(sidebar).toContain("{ path: '/supplier-portal', label: 'Supplier Portal', icon: Globe,      permission: 'viewSuppliers', roles: ['supplier'] }");
    expect(sidebar).toContain('(!item.roles || item.roles.includes(role))');
    expect(sidebar).toContain('role={role}');
  });

  it('retains strict server-independent route access protection for the supplier portal', async () => {
    const routes = await readFile(routesPath, 'utf8');

    expect(routes).toContain("<Route path=\"/supplier-portal\" element={<ERPRoleGuard allowedRoles={['supplier']}><SupplierPortalERP /></ERPRoleGuard>} />");
  });
});
