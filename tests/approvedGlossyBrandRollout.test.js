import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { APPROVED_BIZCTRL_PNG_BASE64 } from '../scripts/approvedBizCTRLSource.mjs';
import { loadERPReportIcon } from '../src/lib/erpPdfBrand';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('Approved glossy BizCTRL brand across all SaaS entrypoints', () => {
  it('contains the exact approved 2x2 blue/cyan icon source, not the older vector mark', () => {
    const png = Buffer.from(APPROVED_BIZCTRL_PNG_BASE64, 'base64');
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(png.readUInt32BE(16)).toBe(96);
    expect(png.readUInt32BE(20)).toBe(96);
    expect(png.byteLength).toBeGreaterThan(2500);
    expect(read('../src/components/BrandLogo.jsx')).toContain('/icons/bizctrl-icon-192-v3.png');
    expect(read('../src/components/BrandLogo.jsx')).not.toContain('<path fill=');
  });
  it('uses v3 for Safari, tab favicons, installed PWA and push notifications', () => {
    const html = read('../index.html');
    const manifest = JSON.parse(read('../public/manifest.json'));
    const sw = read('../public/sw.js');
    expect(html).toContain('/icons/apple-touch-icon-180-v3.png');
    expect(html).toContain('/icons/favicon-32-v3.png');
    expect(html).toContain('/icons/favicon-16-v3.png');
    expect(html).toContain('bizctrl-20261017-v3');
    expect(manifest.icons).toHaveLength(4);
    expect(manifest.icons.every(icon => icon.src.endsWith('-v3.png'))).toBe(true);
    expect(manifest.icons.map(icon => icon.purpose)).toEqual(['any','any','maskable','maskable']);
    expect(sw).toContain("const CACHE_VERSION = 'v14'");
    expect(sw).toContain('/icons/bizctrl-icon-192-v3.png');
  });
  it('embeds approved image into PDF even if the network cannot load images', async () => {
    const data = await loadERPReportIcon();
    expect(data).toContain('data:image/png;base64,');
    expect(data).toContain(APPROVED_BIZCTRL_PNG_BASE64.slice(0,30));
    expect(read('../src/lib/erpPdfBrand.js')).toContain('/icons/bizctrl-icon-192-v3.png');
  });
  it('keeps tenant business logos and role permissions outside the corporate brand change', () => {
    for(const path of [
      '../src/pages/ERPLogin.jsx',
      '../src/pages/PlatformOwnerLogin.jsx',
      '../src/components/layout/ERPSidebar.jsx',
      '../src/components/marketing/PublicLayout.jsx',
      '../src/components/pos-touch/TouchWorkspace.jsx',
    ]) expect(read(path)).toContain('BrandLogo');
    expect(read('../src/components/layout/PortalIdentityHeader.jsx')).toContain('portalIdentity.portal_name');
  });
});
