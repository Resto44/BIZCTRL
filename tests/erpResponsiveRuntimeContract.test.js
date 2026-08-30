import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

describe('ERP responsive runtime contract', () => {
  it('keeps the authenticated shell within one viewport and delegates vertical scrolling to the page surface', async () => {
    const layout = await source('../src/components/layout/ERPLayout.jsx');

    expect(layout).toContain('flex h-dvh min-h-0 w-full min-w-0 max-w-full overflow-hidden');
    expect(layout).toContain('flex h-dvh min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden');
    expect(layout).toContain('flex-1 min-w-0 max-w-full overflow-y-auto min-h-0 overflow-x-hidden overscroll-y-contain');
  });

  it('keeps fixed notifications inside narrow phone viewports and respects the document direction', async () => {
    const popups = await source('../src/components/notifications/NotificationPopups.jsx');

    expect(popups).toContain('end-3');
    expect(popups).toContain('w-[min(320px,calc(100vw-1.5rem))]');
    expect(popups).not.toContain('right-3');
  });

  it('uses readable wrapped tabs for dense ERP modules on mobile', async () => {
    const [inventory, sponsor, approvals] = await Promise.all([
      source('../src/pages/InventoryCommandCenter.jsx'),
      source('../src/pages/SponsorTreasury.jsx'),
      source('../src/pages/OwnerApprovalCenter.jsx'),
    ]);

    expect(inventory).toContain('grid h-auto w-full grid-cols-2 gap-1 p-1 sm:grid-cols-4');
    expect(inventory).toContain('min-h-10 whitespace-normal');
    expect(sponsor).toContain('grid h-auto w-full grid-cols-2 gap-1 p-1 sm:grid-cols-5');
    expect(sponsor).toContain('col-span-2 flex min-h-10');
    expect(approvals).toContain('grid grid-cols-2 gap-2 sm:grid-cols-4');
  });

  it('keeps Staff Upload hooks unconditional and routes actions to canonical ERP workspaces', async () => {
    const page = await source('../src/pages/StaffUpload.jsx');

    expect(page).not.toContain('activeTab');
    expect(page).not.toContain('{useEffect(');
    expect(page).toContain("navigate('/sales')");
    expect(page).toContain("navigate('/purchases')");
    expect(page).toContain('grid grid-cols-1 gap-4 sm:grid-cols-2');
  });

  it('registers the Notification entity exactly once', async () => {
    const client = await source('../src/api/supabaseClient.js');
    const matches = client.match(/Notification:\s*createEntity\('notifications'\)/g) || [];

    expect(matches).toHaveLength(1);
  });

  it('does not load Base44 development hooks during the default Vite serve path', async () => {
    const config = await source('../vite.config.js');

    expect(config).not.toContain('import base44 from');
    expect(config).toContain("command === 'build' || process.env.BASE44_DEV_PLUGIN === 'true'");
    expect(config).toContain("await import('@base44/vite-plugin')");
  });
});
