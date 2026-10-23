// @vitest-environment jsdom
import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ClosingStepNavigation, { closingStepIssues } from '../src/components/sales/ClosingStepNavigation';

describe('Guided closing workflow', () => {
  it('does not demand a cash count while reviewing sales, but blocks invalid card/customer amounts', () => {
    const checks = [{ key: 'cashBalance', passed: false }, { key: 'erpData', passed: false }, { key: 'pos', passed: false }];
    expect(closingStepIssues(0, checks).map(x => x.key)).toEqual(['pos']);
    expect(closingStepIssues(1, checks).map(x => x.key)).toEqual(['cashBalance', 'erpData']);
    expect(closingStepIssues(0, [{ key: 'pos', passed: true }])).toEqual([]);
  });
  it.each(['fa', 'ar', 'en'])('exposes the active step and prevents skipping cash count in %s', (lang) => {
    const onChange = vi.fn(); let tree;
    act(() => { tree = create(<ClosingStepNavigation step={0} onChange={onChange} lang={lang} />); });
    let buttons = tree.root.findAllByType('button');
    expect(buttons[0].props['aria-current']).toBe('step');
    expect(buttons[2].props.disabled).toBe(true);
    expect(buttons.every(b => b.props.type === 'button')).toBe(true);
    act(() => buttons[1].props.onClick()); expect(onChange).toHaveBeenCalledWith(1);
    act(() => tree.update(<ClosingStepNavigation step={1} onChange={onChange} lang={lang} />));
    buttons = tree.root.findAllByType('button');
    expect(buttons[1].props['aria-current']).toBe('step');
    expect(buttons[2].props.disabled).toBe(false);
    act(() => buttons[0].props.onClick()); expect(onChange).toHaveBeenLastCalledWith(0);
    act(() => tree.update(<ClosingStepNavigation step={1} onChange={onChange} disabled lang={lang} />));
    expect(tree.root.findAllByType('button').every(b => b.props.disabled)).toBe(true);
    act(() => tree.unmount());
  });
  it('keeps form sections mounted across steps and requires an explicit final confirmation', () => {
    const source = readFileSync('src/components/sales/UnifiedSalesClosing.jsx', 'utf8');
    expect(source).toContain('hidden={closingStep !== 0} data-testid="closing-step-sales"');
    expect(source).toContain('hidden={closingStep !== 1} data-testid="closing-step-cash"');
    expect(source).toContain('hidden={closingStep !== 2} data-testid="closing-step-review"');
    expect(source).toContain('if (!explicitDraft && !confirmed)');
    expect(source).toContain('finalConfirmation.current = false;');
    expect(source).toContain('try { formRef.current?.requestSubmit(); } finally { finalConfirmation.current = false; }');
    expect(source).toContain('data-closing-intent="draft"');
    expect(source).toContain('open={ledgerOverdrawn || showFunding}');
  });
});
