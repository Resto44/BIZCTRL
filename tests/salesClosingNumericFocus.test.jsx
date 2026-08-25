/** @vitest-environment jsdom */
import React, { useState } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { NumInput } from '../src/components/sales/UnifiedSalesClosing';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots = [];

function render(ui) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  mountedRoots.push({ root, container });
  return container;
}

function enterValue(input, value) {
  const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => {
    valueSetter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

afterEach(() => {
  while (mountedRoots.length) {
    const { root, container } = mountedRoots.pop();
    act(() => root.unmount());
    container.remove();
  }
});

function ClosingNumericHarness() {
  const [actualCash, setActualCash] = useState('');
  const [sourceToday, setSourceToday] = useState('');
  const actual = actualCash === '' ? null : Number(actualCash);
  const expected = 985;
  const difference = actual === null ? null : actual - expected;
  const source = sourceToday === '' ? null : Number(sourceToday);

  return <>
    <section data-testid="cash-reconciliation">
      <NumInput
        id="quick-closing-actualCash"
        label="Actual Cash"
        value={actualCash}
        onChange={setActualCash}
        prefix="SAR"
        error={difference === null ? undefined : difference === 0 ? undefined : 'Difference requires review'}
      />
      {difference !== null && <div data-testid="difference">{difference}</div>}
      {difference !== null && difference !== 0 && <textarea aria-label="Reconciliation note" />}
    </section>
    <section data-testid="sales-source">
      <NumInput
        id="quick-closing-source-hungerstation"
        label="HungerStation Today"
        value={sourceToday}
        onChange={setSourceToday}
        prefix="SAR"
      />
      {source !== null && <div data-testid="source-today">{source}</div>}
    </section>
  </>;
}

describe('Sales Closing numeric input focus stability', () => {
  it('keeps Actual Cash mounted and focused as Difference updates for a multi-digit mobile-style sequence', () => {
    const container = render(<ClosingNumericHarness />);
    const actualCash = container.querySelector('#quick-closing-actualCash');
    actualCash.focus();

    ['2', '20', '200'].forEach((value) => {
      enterValue(actualCash, value);
      expect(container.querySelector('#quick-closing-actualCash')).toBe(actualCash);
      expect(document.activeElement).toBe(actualCash);
      expect(actualCash.value).toBe(value);
    });

    expect(container.querySelector('[data-testid="difference"]').textContent).toBe('-785');
    expect(container.querySelector('[aria-label="Reconciliation note"]')).not.toBeNull();
  });

  it('keeps a Sales Source Today input mounted and focused for the former keyboard-dismissal sequence', () => {
    const container = render(<ClosingNumericHarness />);
    const today = container.querySelector('#quick-closing-source-hungerstation');
    today.focus();

    ['2', '25', '250'].forEach((value) => {
      enterValue(today, value);
      expect(container.querySelector('#quick-closing-source-hungerstation')).toBe(today);
      expect(document.activeElement).toBe(today);
      expect(today.value).toBe(value);
    });

    expect(container.querySelector('[data-testid="source-today"]').textContent).toBe('250');
  });

  it('preserves unformatted editing values for whole-number and decimal sequences', () => {
    const container = render(<ClosingNumericHarness />);
    const actualCash = container.querySelector('#quick-closing-actualCash');
    actualCash.focus();

    ['123', '250', '1000', '12500', '0', '0.50', '150.75'].forEach((value) => {
      enterValue(actualCash, value);
      expect(container.querySelector('#quick-closing-actualCash')).toBe(actualCash);
      expect(document.activeElement).toBe(actualCash);
      expect(actualCash.value).toBe(value);
    });
  });

  it('does not use calculated values as React keys for input-containing Sales Closing sections', async () => {
    const [{ readFile }, { resolve }] = await Promise.all([
      import('node:fs/promises'),
      import('node:path'),
    ]);
    const workspace = await readFile(resolve(process.cwd(), 'src/components/sales/UnifiedSalesClosing.jsx'), 'utf8');

    expect(workspace).not.toContain('key={`cash-reconciliation-${expectedCash}-${cashDifference ?? \'pending\'}`}');
    expect(workspace).not.toContain('key={`automatic-summary-${useAutomaticSales}-${autoSourceLoading}-${totalSales}`}');
    expect(workspace).not.toContain('key={`closing-summary-${totalSales}-${approvedPurchasesTotal}-${expensesTotal}-${expectedCash}-${cashDifference ?? \'pending\'}`}');
    expect(workspace).toContain('key={source.id}');
    expect(workspace).toContain('key={field.id}');
  });
});
