import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import translations from '../src/lib/i18n.js';
import { SUPPORTED_LANGUAGES } from '../src/lib/localization.js';
import { SALES_SOURCE_CATEGORIES, ADDED_SALES_SOURCE_CATEGORIES } from '../src/lib/salesSourceCategories.js';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const LEGACY = ['delivery', 'wholesale', 'counter', 'online', 'corporate', 'credit', 'bank_transfer', 'other'];

describe('Sales Source category expansion and tutorial language choice', () => {
  it('preserves all eight legacy keys and adds exactly ten unique SaaS channels', () => {
    expect(ADDED_SALES_SOURCE_CATEGORIES).toEqual([
      'dine_in', 'takeaway', 'catering', 'marketplace', 'social_media',
      'field_sales', 'subscriptions', 'appointments', 'reseller', 'events',
    ]);
    expect(new Set(SALES_SOURCE_CATEGORIES).size).toBe(18);
    expect(SALES_SOURCE_CATEGORIES).toHaveLength(18);
    for (const key of LEGACY) expect(SALES_SOURCE_CATEGORIES).toContain(key);
    for (const key of ADDED_SALES_SOURCE_CATEGORIES) expect(LEGACY).not.toContain(key);
  });

  it('supports all categories in the guarded creation dialog and EN/AR/FA labels', () => {
    const dialog = source('../src/components/sales/SalesClosingCustomizationDialogs.jsx');
    expect(dialog).toContain("import { SALES_SOURCE_CATEGORIES } from '@/lib/salesSourceCategories'");
    expect(dialog).toContain('SALES_SOURCE_CATEGORIES.map(');
    expect(dialog).toContain("t(`salesSourceManagement.category.${category}`)");
    expect(dialog).toContain("category: String(draft.category || 'other')");
    for (const locale of ['en', 'ar', 'fa']) {
      for (const key of SALES_SOURCE_CATEGORIES) {
        const label = translations[locale][`salesSourceManagement.category.${key}`];
        expect(typeof label, `${locale}.${key}`).toBe('string');
        expect(label?.trim().length, `${locale}.${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the database category check strict but backward-compatible with no user-data rewrites', () => {
    const migration = source('../supabase/migrations/20261105135000_expand_sales_source_categories.sql');
    expect(migration).toContain('ALTER TABLE public.sales_sources');
    expect(migration).toContain('ADD CONSTRAINT sales_sources_category_check');
    expect(migration).toContain('CHECK (category IN (');
    for (const key of SALES_SOURCE_CATEGORIES) expect(migration).toContain(`'${key}'`);
    expect(migration).not.toMatch(/\\b(?:DELETE\\s+FROM|TRUNCATE|UPDATE\\s+public\\.sales_sources|DROP\\s+TABLE|DROP\\s+POLICY|ALTER\\s+POLICY)\\b/i);
  });

  it('offers three explicit language buttons in every onboarding step and switches the existing app locale', () => {
    const tour = source('../src/components/onboarding/NewUserWelcomeTour.jsx');
    const languageContext = source('../src/lib/LanguageContext.jsx');
    expect(SUPPORTED_LANGUAGES.map(x => x.code)).toEqual(['en', 'fa', 'ar']);
    expect(tour).toContain('data-testid="welcome-language-switcher"');
    expect(tour).toContain("data-testid={'welcome-language-' + language.code}");
    expect(tour).toContain('onClick={() => setLang(language.code)}');
    expect(tour).toContain('aria-pressed={lang === language.code}');
    expect(tour).toContain('aria-label={copy.language}');
    expect(tour).toContain("dir={lang === 'en' ? 'ltr' : 'rtl'}");
    expect(tour).toContain("language: 'Guide language'");
    expect(tour).toContain("language: 'زبان راهنما'");
    expect(tour).toContain("language: 'لغة الدليل'");
    expect(languageContext).toContain('localStorage.setItem(LANGUAGE_STORAGE_KEY, lang)');
    expect(languageContext).toContain("document.documentElement.setAttribute('dir', dir)");
    expect(tour).not.toContain('localStorage.clear(');
  });
});
