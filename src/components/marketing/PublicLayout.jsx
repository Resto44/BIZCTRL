import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Menu, X, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const PRODUCT_DESCRIPTION = 'BizCTRL is a multi-tenant ERP SaaS built for restaurants, retail stores, pharmacies, warehouses, factories, and more. Manage inventory, sales, purchasing, HR, finance, and suppliers — all in one place.';
export const PUBLIC_APP_URL = (import.meta.env.VITE_PUBLIC_APP_URL || 'https://mybizctrl.site').replace(/\/$/, '');

export function usePublicPageMetadata(title, description = PRODUCT_DESCRIPTION) {
  useEffect(() => {
    document.title = title;
    const setMeta = (selector, content) => {
      let element = document.head.querySelector(selector);
      if (!element) {
        element = document.createElement('meta');
        const attributeMatch = selector.match(/^meta\[(name|property)="([^"]+)"\]$/);
        if (attributeMatch) element.setAttribute(attributeMatch[1], attributeMatch[2]);
        document.head.appendChild(element);
      }
      element.setAttribute('content', content);
    };

    setMeta('meta[name="description"]', description);
    setMeta('meta[property="og:title"]', title);
    setMeta('meta[property="og:description"]', description);
    setMeta('meta[name="twitter:title"]', title);
    setMeta('meta[name="twitter:description"]', description);

    const canonicalUrl = `${PUBLIC_APP_URL}${window.location.pathname}${window.location.search}`;
    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', canonicalUrl);
    setMeta('meta[property="og:url"]', canonicalUrl);
  }, [description, title]);
}

const headerLinks = [
  { label: 'Features', href: '/#features' },
  { label: 'Industries', href: '/#industries' },
  { label: 'Pricing', href: '/#pricing' },
  { label: 'Contact', to: '/contact' },
];

function BrandMark() {
  return (
    <Link to="/" className="flex items-center gap-3 text-white" aria-label="BizCTRL home">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 shadow-lg shadow-cyan-500/20">
        <Zap className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="leading-none">
        <span className="block text-lg font-black tracking-tight">Biz<span className="text-cyan-400">CTRL</span></span>
        <span className="mt-1 block text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500">Business ERP</span>
      </span>
    </Link>
  );
}

function HeaderLink({ item, onClick }) {
  const className = 'text-sm font-medium text-slate-300 transition-colors hover:text-white';
  if (item.to) return <Link to={item.to} className={className} onClick={onClick}>{item.label}</Link>;
  return <a href={item.href} className={className} onClick={onClick}>{item.label}</a>;
}

export function PublicLayout({ children }) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-950 text-white">
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <BrandMark />
          <div className="hidden items-center gap-6 md:flex">
            {headerLinks.map((item) => <HeaderLink key={item.label} item={item} />)}
          </div>
          <div className="hidden items-center gap-3 md:flex">
            <Button asChild variant="ghost" className="text-slate-200 hover:bg-white/10 hover:text-white">
              <Link to="/erp-login">Login</Link>
            </Button>
            <Button onClick={() => navigate('/erp-register?owner=1')} className="bg-cyan-500 font-bold text-slate-950 hover:bg-cyan-400">
              Start Free <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
          <button type="button" aria-label={menuOpen ? 'Close menu' : 'Open menu'} className="rounded-lg p-2 text-slate-300 hover:bg-white/10 md:hidden" onClick={() => setMenuOpen((open) => !open)}>
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {menuOpen && (
          <div className="border-t border-white/10 bg-slate-950 px-4 py-5 md:hidden">
            <div className="mx-auto flex max-w-7xl flex-col gap-4">
              {headerLinks.map((item) => <HeaderLink key={item.label} item={item} onClick={closeMenu} />)}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <Button asChild variant="outline" className="border-white/20 bg-transparent text-slate-100 hover:bg-white/10 hover:text-white" onClick={closeMenu}>
                  <Link to="/erp-login">Login</Link>
                </Button>
                <Button className="bg-cyan-500 font-bold text-slate-950 hover:bg-cyan-400" onClick={() => { closeMenu(); navigate('/erp-register?owner=1'); }}>
                  Start Free
                </Button>
              </div>
            </div>
          </div>
        )}
      </nav>
      <main>{children}</main>
      <footer className="border-t border-white/10 bg-slate-950">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.3fr_1fr_1fr]">
          <div>
            <BrandMark />
            <p className="mt-4 max-w-sm text-sm leading-6 text-slate-400">Run Your Entire Business From One Platform.</p>
            <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">BizCTRL is a cloud-based multi-tenant ERP SaaS for modern, multi-branch businesses.</p>
          </div>
          <div>
            <p className="text-sm font-bold text-white">Product</p>
            <div className="mt-4 flex flex-col gap-3 text-sm text-slate-400">
              <a href="/#features" className="hover:text-white">Features</a>
              <a href="/#industries" className="hover:text-white">Industries</a>
              <a href="/#pricing" className="hover:text-white">Pricing</a>
              <Link to="/erp-login" className="hover:text-white">Login</Link>
            </div>
          </div>
          <div>
            <p className="text-sm font-bold text-white">Company</p>
            <div className="mt-4 flex flex-col gap-3 text-sm text-slate-400">
              <Link to="/contact" className="hover:text-white">Contact</Link>
              <Link to="/terms" className="hover:text-white">Terms of Service</Link>
              <Link to="/privacy" className="hover:text-white">Privacy Policy</Link>
              <Link to="/refund" className="hover:text-white">Refund Policy</Link>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 px-4 py-5 text-center text-xs text-slate-500 sm:px-6">© {new Date().getFullYear()} BizCTRL. All rights reserved.</div>
      </footer>
    </div>
  );
}

export function PublicHero({ eyebrow, title, description, children }) {
  return (
    <section className="relative isolate overflow-hidden px-4 pb-16 pt-16 sm:px-6 sm:pb-24 sm:pt-24">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[30rem] w-[30rem] -translate-x-1/2 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="absolute right-0 top-28 h-72 w-72 rounded-full bg-blue-600/10 blur-3xl" />
      </div>
      <div className="mx-auto max-w-4xl text-center">
        {eyebrow && <p className="mb-5 inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.15em] text-cyan-300">{eyebrow}</p>}
        <h1 className="text-balance text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl">{title}</h1>
        {description && <p className="mx-auto mt-6 max-w-3xl text-pretty text-lg leading-8 text-slate-300 sm:text-xl">{description}</p>}
        {children && <div className="mt-9">{children}</div>}
      </div>
    </section>
  );
}

export function SectionHeading({ eyebrow, title, description, align = 'center' }) {
  const alignment = align === 'left' ? 'text-left' : 'text-center';
  const maxWidth = align === 'left' ? '' : 'mx-auto';
  return (
    <div className={`${alignment} ${maxWidth} mb-10 max-w-3xl`}>
      {eyebrow && <p className="mb-3 text-xs font-bold uppercase tracking-[0.15em] text-cyan-300">{eyebrow}</p>}
      <h2 className="text-balance text-3xl font-black tracking-tight text-white sm:text-4xl">{title}</h2>
      {description && <p className="mt-4 text-pretty leading-7 text-slate-400">{description}</p>}
    </div>
  );
}

export function ContentSection({ children, className = '' }) {
  return <section className={`mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 ${className}`}>{children}</section>;
}
