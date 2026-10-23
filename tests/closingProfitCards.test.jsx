// @vitest-environment jsdom
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { dailySalesProfitSummary, toDailySalesCardRecord } from '../src/lib/dailySalesPresentation';
const context = vi.hoisted(() => ({ lang: 'en' }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ currency: 'SAR', lang: context.lang }) }));
vi.mock('@/lib/TenantContext', () => ({ useTenant: () => ({ branches: [] }) }));
import SalesListItem from '@/components/sales/SalesListItem';
const sale = { restaurant_cash: 100, restaurant_network: 400, credit: 100, custom_sources_total: 50, approved_purchases_total: 200, expenses_total: 150 };
describe('Closing profit cards', () => {
  it('separates purchases and operating costs from revenue without counting funding or cash variance as profit', () => {
    expect(dailySalesProfitSummary(toDailySalesCardRecord({ ...sale, actual_cash: 95, owner_funding: 247, cash_difference: -5 }))).toMatchObject({ purchases: 200, operatingExpenses: 150, totalCosts: 350, grossProfit: 450, netProfit: 300 });
  });
  it('retains losses and exact cents', () => {
    expect(dailySalesProfitSummary({ restaurant_cash: '0.30', approved_purchases_total: '0.10', expenses_total: '0.25' })).toMatchObject({ grossProfit: 0.2, netProfit: -0.05, totalCosts: 0.35 });
  });
  it.each([null, undefined, '', 'bad', Infinity])('does not turn missing or invalid costs (%s) into zero', (value) => {
    expect(dailySalesProfitSummary({ ...sale, expenses_total: value })).toMatchObject({ grossProfit: 450, netProfit: null, totalCosts: null, costsMissing: true });
    expect(dailySalesProfitSummary({ ...sale, approved_purchases_total: value })).toMatchObject({ grossProfit: null, netProfit: null, costsMissing: true });
  });
  it('distinguishes recorded zero from missing costs and excludes source snapshots already in revenue', () => {
    expect(dailySalesProfitSummary({ ...sale, approved_purchases_total: 0, expenses_total: '0', sales_sources_json: [{ amount: 500 }] })).toMatchObject({ grossProfit: 650, netProfit: 650, noRecordedCosts: true, costsMissing: false });
  });
  it.each(['en', 'fa', 'ar'])('renders all four metrics in %s without hiding them in expanded details', (lang) => {
    context.lang = lang;
    const html = renderToStaticMarkup(<SalesListItem sale={sale} />);
    expect(html).toContain('SAR 200');
    expect(html).toContain('SAR 150');
    expect(html).toContain('+SAR 450');
    expect(html).toContain('+SAR 300');
    expect(html).toContain('grid-cols-2');
    expect(html).not.toContain('100.0%');
  });
  it('shows missing-cost and zero-cost warnings instead of a certified margin', () => {
    context.lang = 'en';
    expect(renderToStaticMarkup(<SalesListItem sale={{ ...sale, expenses_total: null }} />)).toContain('Cost data incomplete');
    expect(renderToStaticMarkup(<SalesListItem sale={{ ...sale, expenses_total: 0, approved_purchases_total: 0 }} />)).toContain('profit unverified');
  });
});
