import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { translateInterface } from '../src/lib/translateInterface';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const header=read('../src/components/layout/ERPHeader.jsx');
const publicLayout=read('../src/components/marketing/PublicLayout.jsx');
const landing=read('../src/pages/LandingPage.jsx');
const css=read('../src/components/marketing/publicLandingTypography.css');
const brand=read('../src/components/BrandLogo.jsx');

describe('BizCTRL cross-app RTL, public marketing and global search quality', () => {
  it.each(['ar','fa'])('renders public hero metadata and core sales copy in %s without English fallback', lang => {
    for(const phrase of [
      'BizCTRL — Multi-Tenant ERP SaaS',
      'BizCTRL is a multi-tenant ERP SaaS built for restaurants, retail stores, pharmacies, warehouses, factories, and more. Manage inventory, sales, purchasing, HR, finance, and suppliers — all in one place.',
      'Run Your Entire Business',
      'From One Platform',
      'Start Free',
      'View Pricing',
      'All rights reserved.',
    ]) {
      const translation=translateInterface(phrase,lang);
      expect(translation, lang+' untranslated '+phrase).not.toEqual(phrase);
      expect(translation).toMatch(/[\u0600-\u06FF]/);
    }
  });
  it('uses React state for public labels, titles and CTA, without depending on DOM observer timing', () => {
    expect(publicLayout).toContain('const { translateLiteral: tr } = useLanguage()');
    expect(publicLayout).toContain('const { lang, translateLiteral: tr } = useLanguage()');
    expect(publicLayout).toContain('{tr(item.label)}');
    expect(publicLayout).toContain(">{tr('Login')}</Link>");
    expect(publicLayout).toContain(">{tr('Contact')}</Link>");
    expect(publicLayout).toContain("{tr('All rights reserved.')}");
    expect(landing).toContain("usePublicPageMetadata(tr('BizCTRL — Multi-Tenant ERP SaaS'), tr(PRODUCT_DESCRIPTION))");
    expect(landing).toContain("{tr('Run Your Entire Business')}");
    expect(landing).toContain("{tr('From One Platform')}");
    expect(landing).toContain("description={tr(PRODUCT_DESCRIPTION)}");
    expect(landing).toContain("{tr('View Pricing')}");
  });
  it('preserves isolated non-mirrored 56px logo across RTL languages and mobile breakpoints', () => {
    expect(publicLayout).toContain('data-testid="public-mobile-header"');
    expect(publicLayout).toContain('grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)]');
    expect(publicLayout).toContain('<BrandMark compact />');
    expect(publicLayout).toContain('dir="ltr"');
    expect(brand).toContain('/icons/bizctrl-icon-192-v3.png');
    expect(css).toContain('unicode-bidi: isolate');
    expect(css).toContain('grid-template-columns: minmax(0,1fr) 56px minmax(0,1fr)');
    expect(css).toContain('--public-locale-font: -apple-system');
    expect(css).toContain('font-weight: 700');
  });
  it('matches global ERP search in localized text or canonical English without changing permissions', () => {
    expect(header).toContain('translateLiteral(item.label).toLocaleLowerCase().includes(q)');
    expect(header).toContain('item.label.toLocaleLowerCase().includes(q)');
    expect(header).toContain('allItems.filter(item =>');
    expect(header).toContain("!item.permission || can[item.permission]");
    expect(header).toContain('translateLiteral(item.label)');
  });
  it('keeps search UI inside viewport and shows full RTL labels without breaking route identifiers', () => {
    expect(header).toContain('w-[calc(100%-2rem)] max-w-lg min-w-0');
    expect(header).toContain('min-w-0 flex-1 bg-transparent text-base md:text-sm');
    expect(header).toContain('whitespace-normal break-words text-foreground');
    expect(header).toContain('dir="ltr" className="max-w-[35%] shrink-0 truncate');
    expect(header).toContain('navigate(path)');
  });
});