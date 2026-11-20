import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { analyticsPage, createAnalytics, readAnalyticsConsent } from '../src/lib/googleAnalytics';
function setup(options = {}, stored = null) {
  const win = { location: { hostname: 'mybizctrl.site' }, navigator: {}, localStorage: { getItem: () => stored, setItem: vi.fn() } };
  const writes = [];
  const doc = { createElement: () => ({}), head: { appendChild: vi.fn() }, get cookie() { return '_ga=legacy; session=keep'; }, set cookie(value) { writes.push(value); } };
  const analytics = createAnalytics({ window: win, document: doc, production: true, measurementId: 'G-TEST123', ...options });
  return { win, doc, writes, analytics, commands: () => (win.dataLayer || []).map(args => Array.from(args)) };
}
describe('background cookieless analytics', () => {
  it('sets all consent to denied before initialization and never grants it', () => {
    const { analytics, commands, doc } = setup(); analytics.update('/'); analytics.update('/reports');
    expect(commands()[0]).toEqual(['consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }]);
    expect(JSON.stringify(commands())).not.toContain('granted');
    expect(doc.head.appendChild).toHaveBeenCalledTimes(1);
  });
  it('honors a previously declined choice without loading Google', () => {
    const { analytics, doc } = setup({}, 'denied'); analytics.update('/'); expect(doc.head.appendChild).not.toHaveBeenCalled();
  });
  it('honors GPC and Do Not Track', () => {
    for (const signal of [{globalPrivacyControl: true}, {doNotTrack: '1'}]) {
      const { analytics, win, doc } = setup(); win.navigator = signal; analytics.update('/'); expect(doc.head.appendChild).not.toHaveBeenCalled();
    }
  });
  it('removes legacy analytics cookies without creating cookies or saving consent', () => {
    const { analytics, writes, win, commands } = setup({}, 'granted'); analytics.update('/');
    expect(writes).toHaveLength(3); expect(writes.every(w => w.startsWith('_ga=;Max-Age=0;'))).toBe(true);
    expect(win.localStorage.setItem).not.toHaveBeenCalled(); expect(commands()[0][2].analytics_storage).toBe('denied');
  });
  it('deduplicates SPA views and updates safe defaults', () => {
    const { analytics, commands } = setup(); analytics.update('/'); analytics.update('/'); analytics.update('/reports');
    expect(commands().filter(c => c[0] === 'event')).toHaveLength(2);
    expect(commands().filter(c => c[0] === 'config').at(-1)[2]).toMatchObject({page_location:'https://mybizctrl.site/reports',send_page_view:false});
  });
  it('excludes private routes and strips query strings/fragments', () => {
    expect(analyticsPage('/reports?email=private@example.com#token')).toEqual({page_location:'https://mybizctrl.site/reports',page_title:'BizCTRL | Reports',page_referrer:''});
    const { analytics, win, commands } = setup(); analytics.update('/reports'); analytics.update('/platform-owner/users');
    expect(win['ga-disable-G-TEST123']).toBe(true); expect(commands().filter(c => c[0] === 'event')).toHaveLength(1);
    for (const path of ['/customer-portal','/auth/invite','/reset-password','/reports/private-id','/unknown']) expect(analyticsPage(path)).toBeNull();
  });
  it('does not load in development, previews or without a valid measurement ID', () => {
    for (const options of [{production:false},{measurementId:''},{measurementId:'invalid'},{window:{location:{hostname:'preview.vercel.app'}}}]) {
      const {analytics,doc}=setup(options); analytics.update('/'); expect(doc.head.appendChild).not.toHaveBeenCalled();
    }
  });
  it('tolerates unavailable storage and renders no user interface', () => {
    expect(readAnalyticsConsent({getItem:()=>{throw Error('blocked');}})).toBeNull();
    const component = readFileSync(new URL('../src/components/AnalyticsConsent.jsx', import.meta.url),'utf8');
    expect(component).toContain('return null;'); expect(component).not.toContain('<button'); expect(component).not.toContain('granted');
  });
});
