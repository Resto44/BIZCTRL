// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import StickyClosingTotal, { ClosingLiveTotal } from '@/components/sales/ClosingLiveTotal';

describe('Persistent canonical closing total', () => {
  it('keeps the same display node while the total and language change', async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(<ClosingLiveTotal totalSales={25} currency="SAR" />));
      const value = host.querySelector('[data-testid="closing-live-total-value"]');
      expect(value.textContent).toBe('SAR25.00');
      expect(value.getAttribute('aria-live')).toBe('polite');
      await act(async () => root.render(<ClosingLiveTotal totalSales={1234567.89} currency="SAR" lang="ar" />));
      expect(host.querySelector('[data-testid="closing-live-total-value"]')).toBe(value);
      expect(value.textContent).toBe('SAR1,234,567.89');
      expect(host.textContent).toContain('إجمالي المبيعات');
      expect(value.getAttribute('dir')).toBe('ltr');
      await act(async () => root.render(<ClosingLiveTotal totalSales={0} currency="USD" lang="fa" />));
      expect(value.textContent).toBe('USD0.00');
      expect(host.textContent).toContain('مجموع فروش');
      await act(async () => root.render(<ClosingLiveTotal totalSales={null} currency="USD" />));
      expect(value.textContent).toBe('USD—');
    } finally { await act(async () => root.unmount()); host.remove(); }
  });

  it('measures sticky tab and total heights, and restores the scroll offset when the workspace is hidden', async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const viewport = document.createElement('main');
    viewport.dataset.erpPageViewport = 'true';
    viewport.style.scrollPaddingTop = '12px';
    viewport.innerHTML = '<nav aria-label="Open workspace pages"></nav><div></div>';
    document.body.append(viewport);
    const host = viewport.lastElementChild;
    const tabs = viewport.firstElementChild;
    let tabsHeight = 42, totalHeight = 72;
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function() {
      return { height: this === tabs ? tabsHeight : this.dataset.testid === 'closing-persistent-total' ? totalHeight : 0 };
    });
    const root = createRoot(host);
    try {
      await act(async () => root.render(<StickyClosingTotal active totalSales={25} currency="SAR" />));
      const bar = host.querySelector('[data-testid="closing-persistent-total"]');
      expect(bar.className).toContain('sticky');
      expect(bar.style.getPropertyValue('--closing-total-top')).toBe('42px');
      expect(viewport.style.scrollPaddingTop).toBe('122px');
      tabsHeight = 0; totalHeight = 84;
      await act(async () => window.dispatchEvent(new Event('resize')));
      expect(bar.style.getPropertyValue('--closing-total-top')).toBe('0px');
      expect(viewport.style.scrollPaddingTop).toBe('92px');
      await act(async () => root.render(<StickyClosingTotal active={false} totalSales={25} currency="SAR" />));
      expect(viewport.style.scrollPaddingTop).toBe('12px');
      expect(bar.style.getPropertyValue('--closing-total-top')).toBe('');
    } finally { await act(async () => root.unmount()); rect.mockRestore(); viewport.remove(); }
  });

  it('uses the same canonical total outside step content and inside both modal surfaces without moving posting actions', () => {
    const source = readFileSync('src/components/sales/UnifiedSalesClosing.jsx','utf8');
    expect(source).toContain('const totalSales = sumClosingMoney(cashSales, networkTotal, creditTotal, otherPaymentTotal);');
    const sticky = '<StickyClosingTotal active={workspaceTabActive} totalSales={totalSales} currency={currency} lang={lang} />';
    expect(source).toContain(sticky);
    expect(source.indexOf(sticky)).toBeLessThan(source.indexOf('data-testid="closing-step-sales"'));
    expect(source.match(/<ClosingLiveTotal totalSales=\{totalSales\} currency=\{currency\} lang=\{lang\} compact \/>/g)).toHaveLength(2);
    expect(source).toContain('id="sales-closing-actions" tabIndex={-1}');
    expect(source).toContain('className="relative mt-4 mb-[calc(5.25rem+env(safe-area-inset-bottom))]');
    expect(source).toContain('formRef.current?.requestSubmit()');
  });
});
