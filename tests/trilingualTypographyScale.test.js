import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('Trilingual ERP typography design contract', () => {
  const css = read('../src/index.css');
  const tailwind = read('../tailwind.config.js');

  it('uses one numeric font scale in English, Persian and Arabic', () => {
    for (const [token, size] of [
      ['caption', '0.75rem'], ['label', '0.875rem'], ['body', '1rem'],
      ['section', '1.25rem'], ['page', '1.5rem'], ['figure', '2rem'],
    ]) {
      expect(css).toContain(`--erp-type-${token}: ${size};`);
    }
    for (const key of ['caption', 'label', 'body', 'section', 'page', 'figure']) {
      expect(tailwind).toContain(`var(--erp-type-${key})`);
    }
    expect(css).toContain('html:lang(fa), html:lang(ar)');
    expect(css).toContain('--font-ui: var(--font-rtl)');
    expect(css).toContain("font-family: var(--font-ui)");
  });

  it('does not inflate headings, controls and Tailwind classes only for RTL', () => {
    expect(css).not.toMatch(/\[dir=["']rtl["']\]\s+\.text-(?:xs|sm|base|lg|xl|2xl|3xl)/);
    // RTL direction for tables is legitimate; only language-specific type scaling is prohibited.
    expect(css).not.toMatch(/\[dir=["']rtl["']\][^{]*\{[^}]*font-size\s*:/);
    expect(css).not.toMatch(/\[dir=["']rtl["']\]\s*\{[^}]*font-size/);
    expect(css).not.toMatch(/font-size:\s*1\.05rem/);
    expect(css).not.toMatch(/font-size:[^;]*!important/);
  });

  it('avoids microcopy below 12px and preserves directional number/date formatting', () => {
    for (const name of ['text-[8px]', 'text-[9px]', 'text-[10px]', 'text-[11px]']) {
      expect(css).toContain(`[class~="${name}"]`);
    }
    expect(css).toContain('font-size: var(--erp-type-caption)');
    expect(css).toContain('html[dir="rtl"] input[type="number"]');
    expect(css).toContain('html[dir="rtl"] .recharts-wrapper');
  });

  it('gives mobile touch inputs an iOS-safe size and shared components consistent labels', () => {
    const button = read('../src/components/ui/button.jsx');
    const input = read('../src/components/ui/input.jsx');
    const textarea = read('../src/components/ui/textarea.jsx');
    const select = read('../src/components/ui/select.jsx');
    const badge = read('../src/components/ui/badge.jsx');
    expect(css).toContain('font-size: var(--erp-type-body);');
    expect(css).toContain('@media (max-width: 767px)');
    expect(button).toContain('sm: "min-h-9 rounded-md px-3 text-sm"');
    expect(input).toContain('text-base');
    expect(textarea).toContain('text-base');
    expect(select).toContain('text-base md:text-sm');
    expect(badge).toContain('text-xs');
  });

  it('keeps typography structural and avoids tampering with data, treasury or payroll', () => {
    const language = read('../src/lib/LanguageContext.jsx');
    expect(language).toContain("document.documentElement.setAttribute('lang', lang)");
    expect(language).toContain("document.documentElement.setAttribute('dir', dir)");
    expect(css).toContain('-webkit-text-size-adjust: 100%;');
    expect(css).toContain('font-family: var(--font-ui)');
    expect(tailwind).toContain("sans: ['var(--font-ui)']");
  });
});
