import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const salesDashboardPath = new URL('../src/pages/SalesDashboard.jsx', import.meta.url);
const languageContextPath = new URL('../src/lib/LanguageContext.jsx', import.meta.url);
const sidebarPath = new URL('../src/components/layout/ERPSidebar.jsx', import.meta.url);

describe('Sales Analytics sidebar navigation runtime', () => {
  it('keeps sidebar navigation on the registered Sales Dashboard route', async () => {
    const sidebar = await readFile(sidebarPath, 'utf8');
    expect(sidebar).toContain("{ path: '/sales-dashboard',      label: 'Sales Analytics'");
  });

  it('does not assume branch data is supplied by LanguageContext when the menu mounts Sales Analytics', async () => {
    const [dashboard, languageContext] = await Promise.all([
      readFile(salesDashboardPath, 'utf8'),
      readFile(languageContextPath, 'utf8'),
    ]);
    expect(languageContext).not.toContain('branches,');
    expect(dashboard).toContain('branches: contextBranches');
    expect(dashboard).toContain('const branches = Array.isArray(contextBranches) ? contextBranches : [];');
    expect(dashboard).toContain('branches.find');
    expect(dashboard).toContain('branches.map');
  });
});
