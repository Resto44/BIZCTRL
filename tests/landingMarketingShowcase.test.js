import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PORTAL_SHOWCASE_IMAGE, ERP_SHOWCASE_IMAGE } from '../src/assets/landingMarketingImages.js';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('BizCTRL public landing marketing art import', () => {
  it('embeds both real optimized WebP images, independent of expiring third-party URLs', () => {
    for (const illustration of [PORTAL_SHOWCASE_IMAGE, ERP_SHOWCASE_IMAGE]) {
      const decoded = Buffer.from(illustration, 'base64');
      expect(decoded.subarray(0,4).toString('ascii')).toBe('RIFF');
      expect(decoded.subarray(8,12).toString('ascii')).toBe('WEBP');
      expect(decoded.length).toBeGreaterThan(15000);
      expect(decoded.length).toBeLessThan(30000);
    }
  });

  it('keeps real app signup and pricing workflows intact', () => {
    const page = source('../src/pages/LandingPage.jsx');
    const showcase = source('../src/components/marketing/LandingMarketingShowcase.jsx');
    expect(page).toContain('<LandingMarketingShowcase />');
    expect(page.indexOf('<LandingMarketingShowcase />')).toBeGreaterThan(page.indexOf('</PublicHero>'));
    expect(page.indexOf('<LandingMarketingShowcase />')).toBeLessThan(page.indexOf('id="industries"'));
    expect(page).toContain('PublicPricingCards');
    expect(page).toContain('beginPlanCheckout');
    expect(showcase).toContain('to="/erp-register?owner=1"');
    expect(showcase).toContain('href="/#features"');
  });

  it('is accessible and responsive in English, Persian, and Arabic', () => {
    const content = source('../src/components/marketing/LandingMarketingShowcase.jsx');
    expect(content).toContain("lang === 'en' ? 'ltr' : 'rtl'");
    expect(content).toContain("const t = TEXT[lang] || TEXT.en");
    expect(content).toContain('id="product-preview"');
    expect(content).toContain('lg:grid-cols-2');
    expect(content).toContain('min-w-0');
    expect(content).toContain('width="540"');
    expect(content).toContain('height="405"');
    expect(content).toContain('Illustrative concept artwork');
    expect(content).toContain('صور تصورية للتوضيح فقط');
    expect(content).toContain('این تصاویر طرح نمایشی هستند');
    expect(content).not.toContain('SAR 99');
  });
});
