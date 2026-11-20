import { describe, it, expect, vi } from 'vitest';
import { analyticsPage, createAnalytics, readAnalyticsConsent } from '../src/lib/googleAnalytics';
function setup(options = {}) {
  const win = { location: { hostname: 'mybizctrl.site' }, localStorage: { setItem: vi.fn() } };
  const doc = { createElement: () => ({}), head: { appendChild: vi.fn() }, cookie: '' };
  const analytics = createAnalytics({ window: win, document: doc, production: true, measurementId: 'G-TEST123', ...options });
  const commands = () => (win.dataLayer || []).map(args => Array.from(args));
  return { win, doc, analytics, commands };
}
describe('consent-gated GA4', () => {
  it('sends nothing and loads no Google script before consent or after rejection', () => {
    const { analytics, win, doc } = setup();
    analytics.update(null, '/'); analytics.choose('denied'); analytics.update('denied', '/reports');
    expect(doc.head.appendChild).not.toHaveBeenCalled(); expect(win.dataLayer).toBeUndefined();
  });
  it('initializes once, suppresses default pageviews and deduplicates SPA renders', () => {
    const { analytics, doc, commands } = setup();
    analytics.update('granted', '/'); analytics.update('granted', '/'); analytics.update('granted', '/reports');
    expect(doc.head.appendChild).toHaveBeenCalledTimes(1);
    expect(commands().find(c => c[0] === 'config')[2]).toMatchObject({ send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
    expect(commands().filter(c => c[0] === 'event')).toHaveLength(2);
  });
  it('removes queries/fragments and never forwards document titles, IDs or referrers', () => {
    expect(analyticsPage('/reports?email=private@example.com#token')).toEqual({ page_location: 'https://mybizctrl.site/reports', page_title: 'BizCTRL | Reports', page_referrer: '' });
    for (const path of ['/platform-owner/users', '/customer-portal', '/auth/invite', '/reset-password', '/reports/private-id', '/unknown']) expect(analyticsPage(path)).toBeNull();
  });
  it('disables collection on excluded routes and resumes on supported routes', () => {
    const { analytics, win, commands } = setup();
    analytics.update('granted', '/reports'); analytics.update('granted', '/platform-owner/users');
    expect(win['ga-disable-G-TEST123']).toBe(true);
    expect(commands().filter(c => c[0] === 'event')).toHaveLength(1);
    analytics.update('granted', '/reports'); expect(win['ga-disable-G-TEST123']).toBe(false);
    expect(commands().filter(c => c[0] === 'event')).toHaveLength(2);
  });
  it('revokes consent immediately and can grant it again without adding another script', () => {
    const { analytics, win, doc, commands } = setup();
    analytics.update('granted', '/'); analytics.choose('denied'); analytics.update('denied', '/reports');
    expect(win['ga-disable-G-TEST123']).toBe(true);
    expect(commands()).toContainEqual(['consent', 'update', { analytics_storage: 'denied' }]);
    analytics.choose('granted'); analytics.update('granted', '/reports');
    expect(commands()).toContainEqual(['consent', 'update', { analytics_storage: 'granted' }]);
    expect(doc.head.appendChild).toHaveBeenCalledTimes(1);
  });
  it('does not initialize on preview hosts, development or invalid configuration', () => {
    for (const options of [{ production: false }, { measurementId: '' }, { measurementId: 'invalid' }, { window: { location: { hostname: 'preview.vercel.app' } } }]) {
      const { analytics, doc } = setup(options); analytics.update('granted', '/'); expect(doc.head.appendChild).not.toHaveBeenCalled();
    }
  });
  it('handles unavailable or invalid stored consent', () => {
    expect(readAnalyticsConsent({ getItem: () => { throw Error('blocked'); } })).toBeNull();
    expect(readAnalyticsConsent({ getItem: () => 'yes' })).toBeNull();
    expect(readAnalyticsConsent({ getItem: () => 'granted' })).toBe('granted');
  });
});
