import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationPath = new URL('../src/supabase/20260817_bizctrl_launch_pricing.sql', import.meta.url);
const landingPath = new URL('../src/pages/LandingPage.jsx', import.meta.url);
const pricingPath = new URL('../src/pages/PublicPages.jsx', import.meta.url);
const catalogPath = new URL('../src/lib/pricingCatalog.js', import.meta.url);
const appUrlPath = new URL('../src/lib/appUrl.js', import.meta.url);

describe('BizCTRL launch pricing contract', () => {
  it('centralizes Starter, Growth, and Enterprise launch pricing with a configured Starter trial', async () => {
    const migration = await readFile(migrationPath, 'utf8');
    expect(migration).toContain("WHEN 'starter_20' THEN 1000");
    expect(migration).toContain("WHEN 'starter_20' THEN 4000");
    expect(migration).toContain("WHEN 'growth_40' THEN 2000");
    expect(migration).toContain("WHEN 'growth_40' THEN 8000");
    expect(migration).toContain("WHEN 'enterprise_100' THEN 5000");
    expect(migration).toContain("WHEN 'starter_20' THEN 30");
    expect(migration).toContain("'starter_monthly'");
    expect(migration).toContain("'growth_monthly'");
    expect(migration).toContain("'enterprise_monthly'");
    expect(migration).toContain('paddle_price_id = NULL');
  });

  it('uses the same public plan fields and pricing-card component on the landing and pricing pages', async () => {
    const [landing, pricing, catalog] = await Promise.all([
      readFile(landingPath, 'utf8'),
      readFile(pricingPath, 'utf8'),
      readFile(catalogPath, 'utf8'),
    ]);
    expect(landing).toContain('PUBLIC_PLAN_FIELDS');
    expect(pricing).toContain('PUBLIC_PLAN_FIELDS');
    expect(landing).toContain('<PublicPricingCards');
    expect(pricing).toContain('<PublicPricingCards');
    expect(catalog).toContain('First month free (${days}-day trial)');
    expect(catalog).toContain('paddle_price_id');
  });

  it('does not retain the legacy Vercel URL as a hardcoded production recovery origin', async () => {
    const appUrl = await readFile(appUrlPath, 'utf8');
    expect(appUrl).not.toContain('base44-rest-ctrl.vercel.app');
    expect(appUrl).toContain("import.meta.env.VITE_PUBLIC_APP_URL || 'https://mybizctrl.site'");
  });
});
