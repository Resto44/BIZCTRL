import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

import CashReconciliationPanel from './CashReconciliationPanel';

vi.mock('@/components/ui/button', () => ({ Button: ({ children, ...props }) => React.createElement('button', props, children) }));
vi.mock('@/components/ui/textarea', () => ({ Textarea: (props) => React.createElement('textarea', props) }));
vi.mock('@/components/sales/ClosingNumericInput', () => ({
  default: ({ id, value, onChange, disabled, error }) => React.createElement('input', {
    id,
    value,
    disabled,
    'aria-label': 'Actual Cash',
    'aria-invalid': Boolean(error),
    onChange: (event) => onChange(event.target.value),
  }),
}));
vi.mock('lucide-react', () => ({
  ArrowRight: () => null,
  Banknote: () => null,
  CheckCircle2: () => null,
  ChevronRight: () => null,
  CircleMinus: () => null,
  CircleSlash2: () => null,
  Loader2: () => null,
  MessageCircle: () => null,
  RefreshCw: () => null,
  ShieldCheck: () => null,
  TrendingDown: () => null,
  TrendingUp: () => null,
}));

const baseProps = {
  currency: 'SAR',
  openingCash: 150,
  cashSales: 150,
  cashIn: 0,
  cashOut: 0,
  expectedCash: 300,
  actualCashValue: '250',
  actualCash: 250,
  difference: -50,
  shortage: 50,
  overage: 0,
  cashNotes: '',
  onActualCashChange: vi.fn(),
  onCashNotesChange: vi.fn(),
  onApprove: vi.fn(),
  branchWalletApplied: 0,
  ownerSettlementRequired: 50,
  ownerSettlementRemaining: 50,
  ownerSettlementStatusLabel: 'Pending',
};

const textOf = (node) => node.children.map((child) => (
  typeof child === 'string' ? child : textOf(child)
)).join(' ');

describe('CashReconciliationPanel', () => {
  it('renders the selected shortage design with a computed, non-interactive status', () => {
    const tree = TestRenderer.create(<CashReconciliationPanel {...baseProps} />);
    const text = textOf(tree.root);

    expect(text).toContain('Cash Reconciliation');
    expect(text).toContain('SAR 50 Shortage');
    expect(text).toContain('Expected');
    expect(text).toMatch(/SAR\s+300/);
    expect(text).toContain('Settlement Responsibility');
    expect(text).toContain('Separate settlement — no sales impact');
    expect(tree.root.findAllByProps({ 'aria-current': 'true' })).toHaveLength(1);
    expect(textOf(tree.root.findByProps({ 'aria-current': 'true' }))).toContain('Short');
    expect(tree.root.findAllByProps({ role: 'status' }).length).toBeGreaterThan(1);
  });

  it('keeps the reconciliation note optional and approves the current count explicitly', () => {
    const onApprove = vi.fn();
    const onCashNotesChange = vi.fn();
    const tree = TestRenderer.create(<CashReconciliationPanel {...baseProps} onApprove={onApprove} onCashNotesChange={onCashNotesChange} />);

    const noteButton = tree.root.findByProps({ 'aria-label': 'Add optional reconciliation note' });
    act(() => noteButton.props.onClick());
    const note = tree.root.findByProps({ placeholder: 'Optional reconciliation note' });
    act(() => note.props.onChange({ target: { value: 'Count checked twice' } }));
    expect(onCashNotesChange).toHaveBeenCalledWith('Count checked twice');
    expect(textOf(tree.root)).toContain('Optional — a variance is recorded even when no note is added.');

    const approve = tree.root.findAllByType('button').find((node) => textOf(node).includes('Approve Cash Count'));
    expect(approve.props.disabled).toBe(false);
    act(() => approve.props.onClick());
    expect(onApprove).toHaveBeenCalledOnce();
  });

  it('blocks approval until Actual Cash exists and forwards stable numeric edits', () => {
    const onActualCashChange = vi.fn();
    const tree = TestRenderer.create(<CashReconciliationPanel
      {...baseProps}
      actualCashValue=""
      actualCash={null}
      difference={null}
      shortage={0}
      ownerSettlementRequired={0}
      ownerSettlementRemaining={0}
      onActualCashChange={onActualCashChange}
    />);

    const input = tree.root.findByProps({ 'aria-label': 'Actual Cash' });
    act(() => input.props.onChange({ target: { value: '250' } }));
    expect(onActualCashChange).toHaveBeenCalledWith('250');

    const approve = tree.root.findAllByType('button').find((node) => textOf(node).includes('Approve Cash Count'));
    expect(approve.props.disabled).toBe(true);
    expect(textOf(tree.root)).toContain('Awaiting Count');
  });
});
