import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');

describe('ERP Android/iOS splash isolation and route navigation', () => {
  const html = read('index.html');
  const app = read('src/App.jsx');
  const layout = read('src/components/layout/AppLayout.jsx');
  const tabs = read('src/components/layout/OwnerWorkspaceTabs.jsx');
  const scene = read('src/components/StartupLoadingScene.jsx');
  const route = read('src/components/RouteLoadingFallback.jsx');

  it('renders a real full-viewport branded startup, never a 52svh partial panel', () => {
    expect(html).toContain('.bzc-startup--full{min-height:100vh;min-height:100svh;min-height:100dvh;');
    expect(html).not.toContain('.bzc-startup--inline');
    expect(scene).toContain('className="bzc-startup bzc-startup--full"');
    expect(scene).not.toContain('compact');
    expect(html).toContain('id="bizctrl-preboot"');
  });

  it('displays branded startup only before the authenticated ERP shell has mounted', () => {
    expect(app).toContain('hasERPWorkspaceMounted()');
    expect(app).toContain('return !hasERPWorkspaceMounted()');
    expect(app).toContain('<StartupLoadingScene lang={lang} />');
    expect(app).toContain('<RouteLoadingFallback fullPage />');
    expect(layout).toContain('markERPWorkspaceMounted();');
  });

  it('keeps ERP header, bottom nav and tabs while page chunks suspend', () => {
    expect(layout).toContain('<Suspense fallback={<RouteLoadingFallback />}>');
    expect(layout).toContain('<NotificationRecordLink><OwnerWorkspaceTabs /></NotificationRecordLink>');
    expect(tabs).toContain('<Suspense fallback={<RouteLoadingFallback />}>');
    expect(tabs).toContain('{tab.element}');
    expect(tabs).toContain('if (!ownerWorkspace) return <Suspense');
    expect(route).toContain('data-testid="erp-route-loading"');
    expect(route).not.toContain('StartupLoadingScene');
    expect(route).not.toContain('bzc-startup');
    expect(route).toContain('min-h-dvh');
    expect(route).toContain('min-h-[30vh]');
  });

  it('boot display marker is session-only and one-directional', async () => {
    vi.resetModules();
    const boot = await import('../src/lib/erpBootDisplayState.js');
    expect(boot.hasERPWorkspaceMounted()).toBe(false);
    boot.markERPWorkspaceMounted();
    expect(boot.hasERPWorkspaceMounted()).toBe(true);
    vi.resetModules();
  });

  it('never changes saved data, routes, or ERP permissions to decide whether to display a splash', () => {
    const source = read('src/lib/erpBootDisplayState.js');
    expect(source).not.toMatch(/localStorage|sessionStorage|supabase|auth|fetch\(|\.rpc\(|navigate\(/i);
    expect(route).not.toMatch(/location\.reload|window\.location|supabase|fetch\(/);
  });
});
