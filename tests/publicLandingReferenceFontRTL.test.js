import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const src = path => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('Public landing iPhone-reference Persian/Arabic typography', () => {
  const landing = src('../src/components/marketing/publicLandingTypography.css');
  const layout = src('../src/components/marketing/PublicLayout.jsx');
  const main = src('../src/pages/LandingPage.jsx');

  it('binds language to the public layout on every language switch, independent of DOM observer timing', () => {
    expect(layout).toContain("import { useLanguage } from '@/lib/LanguageContext'");
    expect(layout).toContain('const { lang } = useLanguage()');
    expect(layout).toContain('data-public-language={lang}');
    expect(landing).toContain('.public-landing[data-public-language="ar"]');
    expect(landing).toContain('.public-landing[data-public-language="fa"]');
  });

  it('uses intentional and visibly different public-site Arabic/Persian fonts, not the old iOS-first fallback', () => {
    expect(landing).toContain('--public-locale-font: "Vazirmatn", -apple-system');
    expect(landing).toContain('--public-locale-font: "Noto Sans Arabic", "Vazirmatn"');
    expect(landing).toContain('font-family: var(--public-locale-font)');
    expect(landing).toContain('font-synthesis: weight');
    expect(landing).not.toContain('--public-locale-font: -apple-system');
  });

  it('uses reference-aligned Bold 700 titles, Semi-Bold 600 controls and Medium 500 reading copy', () => {
    expect(landing).toContain('font-weight: 700');
    expect(landing).toContain('font-weight: 600');
    expect(landing).toContain('font-weight: 500');
    expect(landing).toContain('line-height: 1.4');
    expect(landing).toContain('line-height: 1.75');
    expect(landing).toContain('h1, h2, h3, h4, h5, h6, .public-hero-title, .public-section-heading');
    expect(landing).toContain('.public-hero-description, .public-section-description');
    expect(landing).not.toContain('font-weight: 900');
  });

  it('keeps corporate logo LTR, unclipped and separate from Arabic/Persian typography at mobile widths', () => {
    expect(layout).toContain('<BrandMark compact />');
    expect(layout).toContain('dir="ltr"');
    expect(landing).toContain('.public-brandmark .public-brand-wordmark');
    expect(landing).toContain('direction: ltr');
    expect(landing).toContain('grid-template-columns: minmax(78px, 1fr) minmax(0, auto) minmax(78px, 1fr)');
    expect(landing).toContain('@media (max-width: 350px)');
    expect(landing).toContain('.public-brandmark svg');
  });

  it('limits all overrides to the public landing and preserves English and other ERP screens', () => {
    const fontRules = landing.split(/\n/).filter(line => /^\.[a-z]|^html/.test(line.trim()));
    expect(fontRules.length).toBeGreaterThan(10);
    expect(landing).not.toContain('html:lang(fa) .erp-layout');
    expect(landing).not.toContain('html:lang(ar) button');
    expect(main).toContain('<PublicLayout>');
    expect(main).toContain('Start Free');
  });
});
