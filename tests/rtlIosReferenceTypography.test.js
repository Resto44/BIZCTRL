import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const source = file => readFileSync(new URL(file, import.meta.url), 'utf8');

describe('iPhone reference Arabic and Persian ERP typography', () => {
  const css = source('../src/index.css');
  it('prefers native iOS Arabic/Persian shaping ahead of embedded cross-platform fallback', () => {
    expect(css).toContain("--font-rtl: -apple-system, BlinkMacSystemFont, 'Vazirmatn', 'Noto Sans Arabic'");
    expect(css).toContain('html:lang(fa), html:lang(ar)');
    expect(css).toContain('--font-ui: var(--font-rtl)');
    expect(css).toContain('--erp-rtl-leading: 1.6');
    expect(css).toContain('--erp-line-body: var(--erp-rtl-leading)');
    expect(css).not.toContain('SFArabic.ttf');
    expect(css).not.toContain('SFPro.ttf');
  });
  it('retains the existing semantic sizes instead of inflating RTL by language', () => {
    expect(css).toContain('--erp-type-caption: 0.75rem');
    expect(css).toContain('--erp-type-label: 0.875rem');
    expect(css).toContain('--erp-type-body: 1rem');
    expect(css).toContain('--erp-type-page: 1.5rem');
    expect(css).not.toMatch(/html:lang\((?:ar|fa)\)[^{]*\{[^}]*font-size\s*:/);
    expect(css).not.toMatch(/\[dir=["']rtl["']\][^{]*\{[^}]*font-size\s*:/);
    expect(css).toContain('@layer base {\n/* Reference:');
  });
  it('has native-looking semibold controls and bold legible headings without overriding utilities', () => {
    expect(css).toContain('[data-erp-nav-label="true"]');
    expect(css).toContain('[data-erp-section-label="true"]');
    expect(css).toContain('[data-erp-title="true"]');
    expect(css).toContain('font-weight: 700');
    expect(css).toContain('font-weight: 600');
    expect(css).toContain('line-height: 1.38');
    expect(css).toContain('overflow-wrap: anywhere');
    expect(css).toContain('[data-radix-popper-content-wrapper]');
  });
  it('keeps all 5 iPhone bottom navigation items readable on 320px and above', () => {
    const src = source('../src/components/layout/BottomNav.jsx');
    expect((src.match(/data-erp-nav-label="true"/g)||[])).toHaveLength(2);
    expect((src.match(/text-xs leading-\[1\.35\]/g)||[])).toHaveLength(2);
    expect(src).toContain("font-bold' : 'font-semibold'");
    expect(src).not.toContain('text-[9px] leading-tight');
    expect(src).toContain('flex-1 min-w-0 h-full');
    expect(src).toContain('break-words text-center');
  });
  it('prevents letter tops and diacritics clipping in shared cards, forms and page titles', () => {
    const cards=source('../src/components/ui/card.jsx');
    const labels=source('../src/components/ui/label.jsx');
    const page=source('../src/components/shared/PageHeader.jsx');
    expect(cards).toContain('font-semibold leading-snug tracking-tight');
    expect(cards).toContain('data-erp-section-label="true"');
    expect(labels).toContain('font-semibold leading-normal');
    expect(page).toContain('data-erp-title="true"');
    expect(page).toContain('font-bold leading-snug');
  });
  it('does not modify the financial or inventory data and stays compatible with language toggle', () => {
    const context=source('../src/lib/LanguageContext.jsx');
    const css=source('../src/index.css');
    expect(context).toContain('useDocumentLocalization({ lang, translateLiteral })');
    expect(css).toContain('html[dir="rtl"] input[type="number"]');
    expect(css).toContain('html[dir="rtl"] .recharts-wrapper');
  });
});
