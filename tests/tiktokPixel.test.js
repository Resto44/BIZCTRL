import { describe, it, expect } from 'vitest';
import { createTikTokPixel, TIKTOK_MARKETING_CONSENT_KEY } from '../src/lib/tiktokPixel';

function setup(initial = null, options = {}) {
  let stored = initial;
  const win = {
    location: { hostname: 'mybizctrl.site' },
    navigator: {},
    localStorage: { getItem: key => key === TIKTOK_MARKETING_CONSENT_KEY ? stored : null },
  };
  const scripts = [];
  const doc = {
    createElement: () => ({}),
    head: { appendChild: script => scripts.push(script) },
  };
  const pixel = createTikTokPixel({ window: win, document: doc, pixelId: 'C0123456789ABCDEFGHI', production: true, ...options });
  return { win, scripts, pixel, consent: next => { stored = next; } };
}

describe('TikTok marketing pixel opt-in protection', () => {
  it('never loads without explicit marketing consent', () => {
    const s = setup();
    expect(s.pixel.update('/')).toBe(false);
    expect(s.scripts).toHaveLength(0);
  });
  it('loads once after grant, queues only a public PageView', () => {
    const s = setup('granted');
    expect(s.pixel.update('/')).toBe(true);
    expect(s.pixel.update('/')).toBe(true);
    expect(s.scripts).toHaveLength(1);
    expect(s.win.ttq.filter(e => e[0] === 'page')).toHaveLength(1);
    expect(s.win.ttq.filter(e => e[0] === 'identify' || e[0] === 'track')).toHaveLength(0);
  });
  it('does not track private routes or query-bearing private pages', () => {
    const s = setup('granted');
    expect(s.pixel.update('/erp-register?email=someone@example.com')).toBe(false);
    expect(s.pixel.update('/owner-command-center')).toBe(false);
    expect(s.scripts).toHaveLength(0);
  });
  it('revoke consent stops subsequent page events', () => {
    const s = setup('granted');
    s.pixel.update('/');
    s.consent('denied');
    s.pixel.update('/');
    expect(s.win.ttq.some(e => e[0] === 'revokeConsent')).toBe(true);
    expect(s.pixel.update('/')).toBe(false);
    expect(s.win.ttq.filter(e => e[0] === 'page')).toHaveLength(1);
  });
  it('honors browser privacy signals', () => {
    for (const privacy of [{globalPrivacyControl:true},{doNotTrack:'1'}]) {
      const s = setup('granted');
      s.win.navigator = privacy;
      expect(s.pixel.update('/')).toBe(false);
      expect(s.scripts).toHaveLength(0);
    }
  });
  it('disables entirely in previews, non-production and missing IDs', () => {
    const scenarios = [
      {production:false},
      {pixelId:'UNSET'},
      {window:{location:{hostname:'preview.vercel.app'},navigator:{},localStorage:{getItem:()=> 'granted'}}},
    ];
    for (const scenario of scenarios) {
      const s = setup('granted', scenario);
      expect(s.pixel.update('/')).toBe(false);
      expect(s.scripts).toHaveLength(0);
    }
  });
});

describe('TikTok marketing preferences UI', () => {
  it('provides explicit equal-weight allow/decline actions and a withdrawal control', async () => {
    const { readFileSync } = await import('node:fs');
    const jsx = readFileSync(new URL('../src/components/TikTokPixel.jsx', import.meta.url), 'utf8');
    expect(jsx).toContain("choose('granted')");
    expect(jsx).toContain("choose('denied')");
    expect(jsx).toContain("setShowChoices(true)");
    expect(jsx).toContain('aria-label="Change marketing tracking preferences"');
    expect(jsx).toContain('window.dispatchEvent(new Event(');
    expect(jsx).toContain("if (!showChoices && (pathname !== '/' || choice !== null)) return null;");
    expect(jsx).toContain('href="/privacy"');
  });
});

 describe('TikTok SDK privacy boundaries', () => {
  it('disables SDK history observation before any page is sent', () => {
    const s = setup('granted'); s.pixel.update('/');
    expect(s.win.ttq._o.C0123456789ABCDEFGHI.historyObserver).toBe(false);
    expect(s.win.ttq[0][0]).toBe('holdConsent');
  });
  it('revokes on private-route navigation and cannot replay buffered data', () => {
    const s = setup('granted'); s.pixel.update('/');
    expect(s.pixel.update('/dashboard')).toBe(false);
    expect(s.win.ttq.some(e => e[0] === 'revokeConsent')).toBe(true);
    expect(s.pixel.update('/')).toBe(false);
    expect(s.win.ttq.filter(e => e[0] === 'page')).toHaveLength(1);
  });
  it('blocks sensitive landing query strings and fragments', () => {
    for (const data of [{search:'?email=private@example.com'}, {hash:'#access_token=secret'}]) {
      const s = setup('granted'); Object.assign(s.win.location, data);
      expect(s.pixel.update('/')).toBe(false); expect(s.scripts).toHaveLength(0);
    }
  });
  it('allows only a bounded TikTok click ID for campaign attribution', () => {
    const s = setup('granted'); s.win.location.search = '?ttclid=TEST_click-id.123';
    expect(s.pixel.update('/')).toBe(true);
  });
});
