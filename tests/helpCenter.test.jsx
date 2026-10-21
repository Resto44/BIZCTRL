import React from 'react';
import { act, create } from 'react-test-renderer';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { helpArticles, searchHelpArticles, normalizeHelpSearch } from '../src/lib/helpArticles';
const locale = vi.hoisted(() => ({ lang: 'en' }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => locale }));
import HelpCenter from '../src/components/help/HelpCenter';
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="help-location" data-path={location.pathname} data-search={location.search} />;
}
let tree;
afterEach(() => { if (tree) act(() => tree.unmount()); tree = null; locale.lang = 'en'; });
const mount = (path = '/help', dashboardPath = null) => act(() => {
  tree = create(<MemoryRouter initialEntries={[path]}><HelpCenter dashboardPath={dashboardPath} /><LocationProbe /></MemoryRouter>);
});

describe('Help Center guide integrity', () => {
  it('provides complete three-language steps, notes, real source files and registered routes', () => {
    const app = readFileSync('src/App.jsx', 'utf8');
    expect(new Set(helpArticles.map(a => a.id)).size).toBe(helpArticles.length);
    for (const article of helpArticles) {
      expect(existsSync(article.source), article.id).toBe(true);
      expect(app.includes(`path="${article.route}"`) || app.includes(`path="${article.route}/*"`), article.route).toBe(true);
      for (const lang of ['en', 'fa', 'ar']) {
        expect(article.content[lang].title.length).toBeGreaterThan(5);
        expect(article.content[lang].steps).toHaveLength(3);
        expect(article.content[lang].steps.every(step => step.length > 30)).toBe(true);
        expect(article.content[lang].note.length).toBeGreaterThan(30);
      }
    }
  });
  it('normalizes Arabic/Persian letter variants and searches all translations', () => {
    expect(normalizeHelpSearch('كِتاب ي')).toBe('کتاب ی');
    expect(searchHelpArticles({ query: 'پرداخت سپلاير' }).map(a => a.id)).toContain('supplier-payments');
    expect(searchHelpArticles({ query: 'shipment confirmation' }).map(a => a.id)).toContain('supplier-portal');
    expect(searchHelpArticles({ query: 'zzzz-no-results' })).toEqual([]);
  });
  it('includes role-scoped wallet onboarding, transfer, approvals, history and notification guides in all languages', () => {
    const walletIds = [
      'wallet-enrollment', 'wallet-user-transfer', 'wallet-owner-transfers',
      'wallet-history-analytics', 'wallet-notifications', 'wallet-owner-history-alerts',
    ];
    const guides = helpArticles.filter(article => walletIds.includes(article.id));
    expect(guides).toHaveLength(walletIds.length);
    for (const guide of guides) {
      expect(guide.category).toBe('money');
      expect(['/wallet-portal', '/sponsor-treasury']).toContain(guide.route);
      for (const lang of ['en', 'ar', 'fa']) {
        expect(guide.content[lang].steps).toHaveLength(3);
        expect(guide.content[lang].note.length).toBeGreaterThan(30);
      }
    }
    expect(searchHelpArticles({ query: 'wallet', category: 'money' }).length).toBeGreaterThanOrEqual(5);
    expect(searchHelpArticles({ query: 'والت', category: 'money' }).map(a => a.id)).toContain('wallet-user-transfer');
    expect(searchHelpArticles({ query: 'المحفظة', category: 'money' }).map(a => a.id)).toContain('wallet-enrollment');
    expect(searchHelpArticles({ role: 'owner', category: 'money' }).map(a => a.id)).toContain('wallet-owner-transfers');
    expect(searchHelpArticles({ role: 'owner', category: 'money' }).map(a => a.id)).not.toContain('wallet-user-transfer');
    expect(searchHelpArticles({ role: 'employee', category: 'money' }).map(a => a.id)).toContain('wallet-notifications');
    expect(searchHelpArticles({ role: 'employee', category: 'money' }).map(a => a.id)).not.toContain('wallet-owner-history-alerts');
  });
  it('documents all eight Sales Closing tabs, four Product Master steps and restaurant POS item fields', () => {
    const closingIds = ['closing-field-builder-reference', 'closing-source-reference', 'closing-payment-reference', 'closing-configuration-reference'];
    const productIds = ['product-identity-reference', 'product-pricing-reference', 'product-inventory-reference', 'product-advanced-reference', 'restaurant-menu-product-fields', 'product-management-tabs'];
    const guides = helpArticles.filter(article => [...closingIds, ...productIds].includes(article.id));
    expect(guides).toHaveLength(10);
    expect(guides.flatMap(article => article.fields || []).length).toBeGreaterThanOrEqual(125);
    for (const article of guides) {
      expect(article.route).toMatch(/^\/(sales-closing-customization|product-management)$/);
      for (const field of article.fields || []) {
        expect(['required','optional','conditional','system']).toContain(field.status);
        expect(field.key.length).toBeGreaterThan(1);
        for (const lang of ['en','ar','fa']) {
          expect(field.content[lang].label.length).toBeGreaterThan(1);
          expect(field.content[lang].description.length).toBeGreaterThan(10);
        }
      }
    }
    const source = helpArticles.find(article => article.id === 'closing-source-reference');
    expect(source.fields.map(field => field.key)).toEqual(expect.arrayContaining([
      'name_en','is_global','branch_ids','included_in_revenue',
      'included_in_cash_register','included_in_profit_calc','requires_wallet',
    ]));
    const menu = helpArticles.find(article => article.id === 'restaurant-menu-product-fields');
    expect(menu.fields.map(field => field.key)).toEqual(expect.arrayContaining([
      'name','price','tax_rate','station','stock_mode','inventory_id','recipe_quantity','confirm_untracked',
    ]));
    expect(helpArticles.find(article => article.id === 'product-identity-reference').fields.find(field => field.key === 'name').status).toBe('required');
    expect(helpArticles.find(article => article.id === 'product-identity-reference').fields.find(field => field.key === 'barcode').status).toBe('conditional');
  });

  it('covers installation on iPhone, Android and desktop with separate troubleshooting', () => {
    for (const id of ['pwa-install-ios','pwa-install-android','pwa-install-desktop','pwa-install-push-fixes','new-user-essentials']) {
      const guide = helpArticles.find(article => article.id === id);
      expect(guide, id).toBeDefined();
      expect(guide.category).toMatch(/^(start|trouble)$/);
      for (const lang of ['en','ar','fa']) expect(guide.content[lang].steps).toHaveLength(3);
    }
  });

  it('indexes individual field keys and translated field names', () => {
    expect(searchHelpArticles({ query: 'included_in_cash_register' }).map(article => article.id)).toContain('closing-source-reference');
    expect(searchHelpArticles({ query: 'موجودی آغاز' }).map(article => article.id)).toContain('product-inventory-reference');
    expect(searchHelpArticles({ query: 'تخصيص إقفال' }).map(article => article.id)).toContain('closing-field-builder-reference');
    expect(searchHelpArticles({ query: 'Add to Home Screen' }).map(article => article.id)).toContain('pwa-install-ios');
    expect(searchHelpArticles({ role: 'employee' }).map(article => article.id)).not.toContain('closing-field-builder-reference');
  });
  it('combines role and topic filters without implying permissions', () => {
    const found = searchHelpArticles({ role: 'supplier', category: 'portals' });
    expect(found.map(a => a.id)).toEqual(['supplier-portal']);
  });
});
describe('Help Center interactions', () => {
  it('opens a linked Persian guide and lets the user collapse it', () => {
    locale.lang = 'fa'; mount('/help?guide=supplier-payments');
    expect(tree.root.findByType('section').props.dir).toBe('rtl');
    const toggle = tree.root.findAllByType('button').find(b => b.props['aria-controls'] === 'help-body-supplier-payments');
    expect(toggle.props['aria-expanded']).toBe(true);
    expect(tree.root.findByProps({ id: 'help-body-supplier-payments' }).props.hidden).toBe(false);
    act(() => toggle.props.onClick());
    expect(tree.root.findByProps({ id: 'help-body-supplier-payments' }).props.hidden).toBe(true);
  });
  it('shows and clears an empty search while preserving support tab state', () => {
    mount('/support?tab=guides&q=nonexistentzz');
    expect(tree.root.findAllByType('article')).toHaveLength(0);
    act(() => tree.root.findAllByType('button').find(b => b.children.includes('Clear filters')).props.onClick());
    expect(tree.root.findAllByType('article')).toHaveLength(helpArticles.length);
    act(() => tree.root.findByProps({ id: 'help-search' }).props.onChange({ target: { value: 'reconciliation' } }));
    expect(tree.root.findAllByType('article').length).toBeLessThan(helpArticles.length);
  });
  it('opens a deep-linked field guide and shows required-status labels in Persian', () => {
    locale.lang = 'fa';
    mount('/help?guide=product-identity-reference');
    expect(tree.root.findAllByProps({ 'data-help-field': 'name' })).toHaveLength(1);
    expect(tree.root.findAllByProps({ 'data-help-field': 'barcode' })).toHaveLength(1);
    const article = tree.root.findAllByType('article')[0];
    expect(article.props.id).toBe('guide-product-identity-reference');
    const fields = tree.root.findAllByProps({ 'data-help-field': 'name' });
    expect(JSON.stringify(fields[0].toJSON?.() || fields[0].props)).toContain('name');
    const toggle = tree.root.findAllByType('button').find(button => button.props['aria-controls'] === 'help-body-product-identity-reference');
    act(() => toggle.props.onClick());
    expect(tree.root.findAllByProps({ 'data-help-field': 'name' })).toHaveLength(0);
  });
  it('opens Quick Start inside authenticated Support rather than escaping to public /help', () => {
    locale.lang = 'fa';
    mount('/support?tab=guides', '/owner-command-center');
    const shortcut = tree.root.findByProps({ 'data-help-quick-guide': 'product-identity-reference' });
    act(() => shortcut.props.onClick());
    const location = tree.root.findByProps({ 'data-testid': 'help-location' });
    expect(location.props['data-path']).toBe('/support');
    expect(location.props['data-search']).toContain('tab=guides');
    expect(location.props['data-search']).toContain('guide=product-identity-reference');
    expect(tree.root.findAllByType('article')).toHaveLength(1);
    expect(tree.root.findByProps({ id: 'guide-product-identity-reference' })).toBeTruthy();
    const dashboard = tree.root.findByProps({ 'data-testid': 'help-go-dashboard' });
    expect(dashboard.props.to).toBe('/owner-command-center');
    act(() => tree.root.findByProps({ 'data-testid': 'help-back-to-guides' }).props.onClick());
    const returned = tree.root.findByProps({ 'data-testid': 'help-location' });
    expect(returned.props['data-path']).toBe('/support');
    expect(returned.props['data-search']).not.toContain('guide=');
    expect(tree.root.findAllByType('article')).toHaveLength(helpArticles.length);
  });

  it('keeps sales-closing, iPhone and Android quick guides inside the current workspace URL', () => {
    mount('/support?tab=guides');
    for (const id of ['closing-field-builder-reference', 'pwa-install-ios', 'pwa-install-android']) {
      act(() => tree.root.findByProps({ 'data-help-quick-guide': id }).props.onClick());
      expect(tree.root.findByProps({ 'data-testid': 'help-location' }).props['data-path']).toBe('/support');
      expect(tree.root.findByProps({ 'data-testid': 'help-location' }).props['data-search']).toContain(`guide=${id}`);
      expect(tree.root.findAllByType('article')).toHaveLength(1);
      act(() => tree.root.findByProps({ 'data-testid': 'help-back-to-guides' }).props.onClick());
    }
  });

  it('offers an ERP return path from standalone public Help and avoids internal /help loops', () => {
    mount('/help?guide=pwa-install-ios');
    expect(tree.root.findAllByType('article')).toHaveLength(1);
    const supportReturn = tree.root.findAllByType('a').find(item => item.props.to === '/support?tab=guides');
    expect(supportReturn).toBeTruthy();
    expect(tree.root.findAllByType('a').some(item => item.props.to === '/help')).toBe(false);
    act(() => tree.root.findByProps({ 'data-testid': 'help-back-to-guides' }).props.onClick());
    expect(tree.root.findByProps({ 'data-testid': 'help-location' }).props['data-path']).toBe('/help');
    expect(tree.root.findAllByType('article')).toHaveLength(helpArticles.length);
  });
  it('changes role filter and safely handles unknown URL parameters', () => {
    locale.lang = 'ar'; mount('/help?role=unknown&topic=unknown&guide=missing');
    expect(tree.root.findAllByType('article')).toHaveLength(helpArticles.length);
    act(() => tree.root.findAllByType('select')[1].props.onChange({ target: { value: 'employee' } }));
    expect(tree.root.findAllByType('article').map(a => a.props.id)).toContain('guide-employee');
    expect(tree.root.findAllByType('article').map(a => a.props.id)).not.toContain('guide-platform-owner');
  });
});
