import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const landingPath = new URL('../src/pages/LandingPage.jsx', import.meta.url);
const layoutPath = new URL('../src/components/marketing/PublicLayout.jsx', import.meta.url);

describe('Landing Page navigation', () => {
  it('routes every primary Start Free CTA to the owner organization registration route', async () => {
    const landing = await readFile(landingPath, 'utf8');
    const layout = await readFile(layoutPath, 'utf8');

    expect(landing.match(/navigate\('\/erp-register\?owner=1'\)/g)).toHaveLength(3);
    expect(layout).toContain("navigate('/erp-register?owner=1')");
  });

  it('uses explicit smooth scrolling for the hero pricing CTA and keeps the pricing section addressable', async () => {
    const landing = await readFile(landingPath, 'utf8');
    const layout = await readFile(layoutPath, 'utf8');

    expect(landing).toContain("document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth', block: 'start' })");
    expect(landing).toContain("window.history.pushState(null, '', '/#pricing')");
    expect(layout).toContain('function scrollToPublicSection(sectionId)');
    expect(layout).toContain("window.addEventListener('hashchange', scrollFromHash)");
    expect(layout).toContain('scroll-mt-20');
  });

  it('keeps Header and Footer product links functional on the landing route', async () => {
    const layout = await readFile(layoutPath, 'utf8');

    expect(layout).toContain("handlePublicHashLink(event, item.href)");
    expect(layout).toContain("handlePublicHashLink(event, '/#features')");
    expect(layout).toContain("handlePublicHashLink(event, '/#industries')");
    expect(layout).toContain("handlePublicHashLink(event, '/#pricing')");
    expect(layout).toContain('<Link to="/contact" className="hover:text-white">Contact</Link>');
    expect(layout).toContain('<Link to="/erp-login" className="hover:text-white">Login</Link>');
  });
});
