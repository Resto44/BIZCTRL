import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('Native iOS-style bold fonts for trilingual ERP', () => {
  const css = read('../src/index.css');
  const body = css.slice(css.indexOf('  body {', css.indexOf('@layer base {', css.indexOf(':root'))),
    css.indexOf('/* ─── Dark surface consistency'));
  it('prefers native iPhone font glyphs for English, Arabic and Persian with safe cross-platform fallback', () => {
    expect(css).toContain("--font-ui: -apple-system, BlinkMacSystemFont, 'Inter'");
    expect(css).toContain("--font-rtl: -apple-system, BlinkMacSystemFont, 'Vazirmatn', 'Noto Sans Arabic'");
    expect(css).toContain('html:lang(fa), html:lang(ar)');
    expect(css).toContain('--font-ui: var(--font-rtl)');
    expect(css).toContain('font-family: var(--font-ui)');
    expect(css).not.toContain('@font-face');
    expect(css).not.toContain('SFPro');
  });
  it('uses bold headings, semibold controls and moderately weighted body text', () => {
    expect(css).toContain('--erp-weight-heading: 700;');
    expect(css).toContain('--erp-weight-control: 600;');
    expect(css).toContain('--erp-weight-body: 500;');
    expect(body).toContain('font-weight: var(--erp-weight-heading)');
    expect(body).toContain('font-weight: var(--erp-weight-control)');
    expect(body).toContain('font-weight: var(--erp-weight-body)');
    expect(read('../src/components/ui/button.jsx')).toContain('rounded-md text-sm font-semibold transition-colors');
    expect(read('../src/components/ui/tabs.jsx')).toContain('text-sm font-semibold ring-offset-background');
    expect(read('../src/components/ui/label.jsx')).toContain('text-sm font-semibold leading-none');
    expect(read('../src/components/help/HelpCenter.jsx')).toContain('className="block text-sm font-semibold"');
  });
  it('does not reintroduce unequal per-language text sizes or iPhone input zoom', () => {
    expect(css).toContain('--erp-type-caption: 0.75rem;');
    expect(css).toContain('--erp-type-label: 0.875rem;');
    expect(css).toContain('--erp-type-body: 1rem;');
    expect(css).toContain('--erp-type-page: 1.5rem;');
    expect(css).toContain('font-size: var(--erp-type-body)');
    expect(css).not.toMatch(/\[dir=["']rtl["']\]\s+\.text-(?:xs|sm|base|lg|xl)/);
    expect(css).not.toMatch(/\[dir=["']rtl["']\]\s*\{[^}]*font-size/);
    expect(css).toContain('html[dir="rtl"] .recharts-wrapper');
  });
  it('does not modify any business calculation or server record to apply typography', () => {
    expect(read('../src/lib/LanguageContext.jsx')).toContain("document.documentElement.setAttribute('lang', lang)");
    expect(read('../src/lib/LanguageContext.jsx')).toContain("document.documentElement.setAttribute('dir', dir)");
    expect(read('../tailwind.config.js')).toContain("sans: ['var(--font-ui)']");
    expect(css).toContain('-webkit-text-size-adjust: 100%');
  });
});
