import React, { useLayoutEffect, useRef } from 'react';

const COPY = {
  en: { title: 'Total Sales', scope: 'This session only' },
  ar: { title: 'إجمالي المبيعات', scope: 'هذه الجلسة فقط' },
  fa: { title: 'مجموع فروش', scope: 'فقط همین نوبت' },
};

// Display only: use the canonical total passed by the closing, never sum
// inputs a second time or mix drawer balance / payments with sales.
export function ClosingLiveTotal({ totalSales, currency, lang = 'en', compact = false }) {
  const copy = COPY[lang] || COPY.en;
  const amount = totalSales == null || totalSales === '' || !Number.isFinite(Number(totalSales))
    ? '—' : Number(totalSales).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <section data-testid="closing-live-total" data-i18n-skip="true" dir={lang === 'en' ? 'ltr' : 'rtl'}
      className="min-w-0 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-blue-950 shadow-sm dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <div className="min-w-0">
          <p className="text-sm font-black">{copy.title}</p>
          {!compact && <p className="text-[11px] text-blue-800 dark:text-blue-200">{copy.scope}</p>}
        </div>
        <output aria-live="polite" aria-atomic="true" dir="ltr" data-testid="closing-live-total-value"
          className={`flex min-w-0 max-w-full flex-wrap items-baseline justify-end gap-x-1.5 font-black leading-tight tabular-nums text-blue-700 dark:text-blue-200 ${compact ? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-4xl'}`}>
          <span className="text-[0.53em] font-bold">{currency}</span>
          <span className="min-w-0 break-all">{amount}</span>
        </output>
      </div>
    </section>
  );
}

// Sticky belongs to the real ERP page scroller, not to the window or the
// fixed bottom navigation. Observe the workspace tab strip and the total's
// actual height (including wrapping, zoom, and language changes).
export default function StickyClosingTotal({ active = true, ...props }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const bar = ref.current;
    if (!active || !bar) return undefined;
    const viewport = bar.closest('[data-erp-page-viewport="true"]');
    if (!viewport) return undefined;
    const tabs = viewport.querySelector('[aria-label="Open workspace pages"]');
    const previous = viewport.style.scrollPaddingTop;
    const basePadding = parseFloat(getComputedStyle(viewport).scrollPaddingTop) || 0;
    let applied = '';
    const measure = () => {
      const tabHeight = Math.ceil(tabs?.getBoundingClientRect().height || 0);
      bar.style.setProperty('--closing-total-top', tabHeight + 'px');
      const height = Math.ceil(bar.getBoundingClientRect().height);
      applied = Math.max(basePadding, tabHeight + height + 8) + 'px';
      viewport.style.scrollPaddingTop = applied;
    };
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(bar);
    if (tabs) observer?.observe(tabs);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      if (viewport.style.scrollPaddingTop === applied) viewport.style.scrollPaddingTop = previous;
      bar.style.removeProperty('--closing-total-top');
    };
  }, [active]);
  return <div ref={ref} data-testid="closing-persistent-total"
    className="sticky top-[var(--closing-total-top,0px)] z-20 bg-background px-2 py-2 sm:px-4">
    <div className="mx-auto max-w-4xl"><ClosingLiveTotal {...props} /></div>
  </div>;
}
