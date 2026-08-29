import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

describe('Dark theme surface consistency', () => {
  it('maps legacy white and light Tailwind surfaces to dark surfaces when a component lacks a dark variant', async () => {
    const css = await source('../src/index.css');
    expect(css).toContain('Dark surface consistency');
    for (const utility of ['bg-white', 'bg-slate-50', 'bg-slate-100', 'bg-blue-50', 'bg-emerald-50', 'bg-amber-50', 'bg-red-50', 'bg-purple-50', 'bg-cyan-50']) {
      expect(css).toContain(utility);
    }
    expect(css).toContain(':not([class*="dark:bg-"])');
    expect(css).toContain('background-color: hsl(222 47% 9%) !important;');
  });

  it('uses explicit dark surfaces for ERP Sales Analytics KPI cards, alerts, and recommendations', async () => {
    const reports = await source('../src/pages/Reports.jsx');
    for (const variant of [
      'dark:bg-blue-950/40',
      'dark:bg-emerald-950/40',
      'dark:bg-amber-950/40',
      'dark:bg-red-950/40',
      'dark:bg-purple-950/40',
      'dark:bg-cyan-950/40',
      'dark:bg-slate-900/60',
    ]) {
      expect(reports).toContain(variant);
    }
  });

  it('keeps the Owner Dashboard reference design on explicit dark variants instead of overriding it globally', async () => {
    const [css, owner] = await Promise.all([
      source('../src/index.css'),
      source('../src/pages/OwnerDashboard.jsx'),
    ]);
    expect(css).toContain('preserving intentionally themed Owner Dashboard widgets');
    expect(owner).toContain('dark:from-slate-950');
    expect(owner).toContain('dark:bg-blue-950/60');
    expect(owner).toContain('dark:bg-emerald-950/40');
  });
});
