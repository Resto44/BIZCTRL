import React from 'react';
import { act, create } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { helpArticles, searchHelpArticles, normalizeHelpSearch } from '../src/lib/helpArticles';
const locale = vi.hoisted(() => ({ lang: 'en' }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => locale }));
import HelpCenter from '../src/components/help/HelpCenter';
let tree;
afterEach(() => { if (tree) act(() => tree.unmount()); tree = null; locale.lang = 'en'; });
const mount = (path = '/help') => act(() => { tree = create(<MemoryRouter initialEntries={[path]}><HelpCenter /></MemoryRouter>); });

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
  it('changes role filter and safely handles unknown URL parameters', () => {
    locale.lang = 'ar'; mount('/help?role=unknown&topic=unknown&guide=missing');
    expect(tree.root.findAllByType('article')).toHaveLength(helpArticles.length);
    act(() => tree.root.findAllByType('select')[1].props.onChange({ target: { value: 'employee' } }));
    expect(tree.root.findAllByType('article').map(a => a.props.id)).toContain('guide-employee');
    expect(tree.root.findAllByType('article').map(a => a.props.id)).not.toContain('guide-platform-owner');
  });
});
