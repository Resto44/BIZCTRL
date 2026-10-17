import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BrandLogo from '../src/components/BrandLogo.jsx';
import { readFileSync } from 'node:fs';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');

describe('Public portal Arabic/Persian logo and font regression',()=>{
  it('renders the real approved glossy PNG with no SVG text or letter collisions',()=>{
    const markup=renderToStaticMarkup(React.createElement(BrandLogo,{icon:true,className:'h-11 w-11'}));
    expect(markup).toContain('<img');
    expect(markup).toContain('/icons/bizctrl-icon-192-v3.png');
    expect(markup).toContain('width="88" height="88"');
    expect(markup).not.toContain('<svg');
    expect(markup).not.toContain('BizCTRL</span>');
  });
  it('provides a non-mirrored full wordmark on desktop and legacy sign-in pages',()=>{
    const markup=renderToStaticMarkup(React.createElement(BrandLogo,{tone:'light',className:'h-12'}));
    expect(markup).toContain('dir="ltr"');
    expect(markup).toContain('translate="no"');
    expect(markup).toContain('Biz');
    expect(markup).toContain('CTRL');
    expect(markup).toContain('<img');
    expect(markup).not.toContain('<svg');
  });
  it('never compresses the wordmark into the mobile 56px center track',()=>{
    const page=read('../src/components/marketing/PublicLayout.jsx');
    const css=read('../src/components/marketing/publicLandingTypography.css');
    expect(page).toContain('grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)]');
    expect(page).toContain('{!compact && <span');
    expect(page).toContain('data-testid="public-mobile-brand-icon"');
    expect(css).toContain('grid-template-columns: minmax(0,1fr) 56px minmax(0,1fr)');
    expect(css).not.toContain('overflow: hidden;\n}\n/* Fit the actual iPhone');
  });
  it('applies a visibly heavier, native iPhone-style reading hierarchy to both RTL languages',()=>{
    const css=read('../src/components/marketing/publicLandingTypography.css');
    expect(css).toContain('--public-locale-font: -apple-system, BlinkMacSystemFont, "Vazirmatn"');
    expect(css).toContain('--public-locale-font: -apple-system, BlinkMacSystemFont, "Noto Sans Arabic"');
    expect(css).toMatch(/font-weight:\s*700/);
    expect(css).toMatch(/font-weight:\s*600/);
    expect(css).toContain('.public-hero-description, .public-section-description');
    expect(css).toContain('line-height: 1.72');
    expect(css).not.toContain('font-weight: 500');
  });
});
