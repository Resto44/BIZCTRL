import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const layout = read('../src/components/marketing/PublicLayout.jsx');
const css = read('../src/components/marketing/publicLandingTypography.css');
const brand = read('../src/components/BrandLogo.jsx');

describe('BizCTRL landing RTL logo and iPhone typography', () => {
  it('uses a separate LTR company wordmark and image icon instead of RTL-mirrored SVG text', () => {
    expect(layout).toContain('function BrandMark({ compact = false })');
    expect(layout).toContain('dir="ltr"');
    expect(layout).toContain('translate="no"');
    expect(layout).toContain('<BrandLogo icon');
    expect(layout).toContain('!compact && <span dir="ltr" translate="no"');
    expect(brand).toContain('/icons/bizctrl-icon-192-v3.png');
    expect(css).toContain('unicode-bidi: isolate');
  });
  it('prevents the mobile language switcher and menu from squeezing the centered brand in Persian or Arabic', () => {
    expect(layout).toContain('data-testid="public-mobile-header"');
    expect(layout).toContain('grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)]');
    expect(layout).toContain('<div aria-hidden="true" />');
    expect(layout).toContain('<BrandMark compact />');
    expect(layout).toContain('data-testid="public-desktop-header"');
    expect(layout).toContain('data-testid="public-mobile-brand-icon"');
    expect(layout).toContain('min-h-11 min-w-10 shrink-0');
    expect(layout).not.toContain('<BrandLogo className="h-12 w-auto" />');
  });
  it('applies native bold readable Arabic and Persian landing styles only on public pages', () => {
    expect(layout).toContain('public-landing min-h-screen');
    expect(layout).toContain("import './publicLandingTypography.css'");
    expect(layout).toContain('public-hero-title');
    expect(layout).toContain('public-section-heading');
    expect(layout).toContain('public-hero-description');
    expect(layout).toContain('data-public-language={lang}');
    expect(css).toContain('.public-landing[data-public-language="ar"]');
    expect(css).toContain('.public-landing[data-public-language="fa"]');
    expect(css).toContain('font-weight: 700');
    expect(css).toContain('font-weight: 600');
    expect(css).toContain('font-weight: 600');
    expect(css).toContain('line-height: 1.72');
    expect(css).not.toContain('!important');
    expect(css).not.toContain('@font-face');
  });
  it('uses a real raster image (no SVG text), with an icon-only fixed-width mobile brand', () => {
    expect(brand).toContain('<img src={file}');
    expect(brand).not.toContain('<svg');
    expect(layout).toContain('{!compact && <span');
    expect(layout).toContain('data-testid="public-mobile-brand-icon"');
    expect(css).toContain('width: 3.5rem');
    expect(css).toContain('overflow: visible');
    expect(css).toContain('font-weight: 700');
  });
  it('preserves critical navigation and registration behavior', () => {
    expect(layout).toContain("navigate('/erp-register?owner=1')");
    expect(layout).toContain('handlePublicHashLink(event, item.href)');
    expect(layout).toContain('menuOpen &&');
    expect(layout).toContain('<Link to="/erp-login">{tr(\'Login\')}</Link>');
    expect(layout).toContain('<main>{children}</main>');
  });
});
