import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

describe('Owner workspace tab lifecycle contract', () => {
  it('keeps Owner route elements mounted in unique tabs while React Router remains responsible for active history', async () => {
    const [tabs, layout] = await Promise.all([
      source('../src/components/layout/OwnerWorkspaceTabs.jsx'),
      source('../src/components/layout/AppLayout.jsx'),
    ]);

    expect(layout).toContain("import OwnerWorkspaceTabs from './OwnerWorkspaceTabs'");
    expect(layout).toContain('<OwnerWorkspaceTabs />');
    expect(tabs).toContain('const outlet = useOutlet()');
    expect(tabs).toContain('const cacheRef = useRef(new Map())');
    expect(tabs).toContain("const DEFAULT_TAB_PATH = '/owner-command-center'");
    expect(tabs).toContain('permanent: true');
    expect(tabs).toContain('currentTabs.some((tab) => tab.path === activePath)');
    expect(tabs).toContain('cacheRef.current.set(activePath, outlet)');
    expect(tabs).toContain('hidden={tab.path !== activePath}');
    expect(tabs).toContain('navigate(path)');
  });

  it('closes only the selected non-default tab and activates the most recently used remaining tab when necessary', async () => {
    const tabs = await source('../src/components/layout/OwnerWorkspaceTabs.jsx');

    expect(tabs).toContain("if (path === DEFAULT_TAB_PATH) return");
    expect(tabs).toContain('const remainingTabs = tabs.filter((tab) => tab.path !== path)');
    expect(tabs).toContain('const nextPath = nextMruPaths.at(-1) || DEFAULT_TAB_PATH');
    expect(tabs).toContain('navigate(nextPath, { replace: true })');
    expect(tabs).toContain('event.stopPropagation(); onClose(tab.path);');
  });

  it('contains mobile tab overflow within the tab strip and preserves practical page scroll positions', async () => {
    const [tabs, erpLayout] = await Promise.all([
      source('../src/components/layout/OwnerWorkspaceTabs.jsx'),
      source('../src/components/layout/ERPLayout.jsx'),
    ]);

    expect(tabs).toContain('overflow-x-auto overscroll-x-contain');
    expect(tabs).toContain('shrink-0');
    expect(tabs).toContain('data-erp-page-viewport="true"');
    expect(tabs).toContain('scrollPositionsRef.current.set(previousPath, viewport.scrollTop)');
    expect(erpLayout).toContain('data-erp-page-viewport="true"');
  });

  it('activates the canonical Sales Invoices module from the sidebar without a duplicate alias tab', async () => {
    const [tabs, sidebar] = await Promise.all([
      source('../src/components/layout/OwnerWorkspaceTabs.jsx'),
      source('../src/components/layout/ERPSidebar.jsx'),
    ]);

    expect(sidebar).toContain("path: '/sales/invoices'");
    expect(tabs).toContain("'/sales-invoices': '/sales/invoices'");
  });
});
