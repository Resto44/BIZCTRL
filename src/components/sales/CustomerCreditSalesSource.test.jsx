import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

import CustomerCreditSalesSource from './CustomerCreditSalesSource';

vi.mock('@/components/ui/button', () => ({ Button: ({ children, ...props }) => React.createElement('button', props, children) }));
vi.mock('@/components/ui/input', () => ({ Input: (props) => React.createElement('input', props) }));
vi.mock('@/components/ui/label', () => ({ Label: ({ children, ...props }) => React.createElement('label', props, children) }));
vi.mock('@/components/ui/select', () => ({
  Select: ({ children, ...props }) => React.createElement('div', props, children),
  SelectContent: ({ children }) => React.createElement('div', null, children),
  SelectItem: ({ children, ...props }) => React.createElement('div', props, children),
  SelectTrigger: ({ children }) => React.createElement('button', null, children),
  SelectValue: () => React.createElement('span', null),
}));
vi.mock('lucide-react', () => ({
  AlertTriangle: () => null,
  ArrowDownLeft: () => null,
  ArrowUpRight: () => null,
  Check: () => null,
  CircleCheck: () => null,
  ClipboardCheck: () => null,
  CreditCard: () => null,
  ExternalLink: () => null,
  Info: () => null,
  Loader2: () => null,
  Pencil: () => null,
  Search: () => null,
  ShoppingCart: () => null,
  Trash2: () => null,
  TrendingDown: () => null,
  UserCheck: () => null,
  X: () => null,
}));

const customer = {
  id: 'c1',
  name: 'Ghana Khan',
  phone: '565084065',
  outstanding_balance: 110,
  credit_limit: 2000,
  available_credit: 1890,
};

const textOf = (node) => node.children.map((child) => (
  typeof child === 'string' ? child : textOf(child)
)).join(' ');

const renderSource = (overrides = {}) => TestRenderer.create(React.createElement(CustomerCreditSalesSource, {
  entry: { id: '1', customer_id: 'c1', amount: '', payment_amount: '', payment_method: 'cash', transaction_type: 'credit_sale' },
  idx: 0,
  onRemove: vi.fn(),
  onUpdate: vi.fn(),
  onCustomerSearch: vi.fn(),
  onRecordPayment: vi.fn(),
  customers: [customer],
  customerSearch: '',
  currency: 'SAR',
  ...overrides,
}));

describe('CustomerCreditSalesSource', () => {
  it('shows identity only inside the one-field customer search results', () => {
    const tree = renderSource({
      entry: { id: '1', customer_id: '', amount: '', payment_amount: '' },
      customerSearch: 'Ghana',
    });
    const resultText = tree.root.findAllByProps({ role: 'option' }).map(textOf).join(' ');
    expect(resultText).toContain('Ghana Khan');
    expect(resultText).toContain('565084065');
    expect(resultText).not.toContain('110');
    expect(resultText).not.toContain('2000');
    expect(resultText).not.toContain('Debt');
    expect(resultText).not.toContain('Available');
    expect(tree.root.findAllByType('input').filter((node) => node.props.role === 'combobox')).toHaveLength(1);
  });

  it('uses one amount input and switches accounting mode without retaining the old amount', () => {
    const onUpdate = vi.fn();
    const tree = renderSource({ onUpdate });

    expect(tree.root.findAllByType('input').filter((node) => node.props['aria-label'] === 'Credit sale amount')).toHaveLength(1);
    expect(tree.root.findAllByType('input').filter((node) => node.props['aria-label'] === 'Debt payment amount')).toHaveLength(0);

    const paymentMode = tree.root.findAllByType('button').find((node) => textOf(node).includes('Debt Payment'));
    act(() => paymentMode.props.onClick());

    expect(onUpdate).toHaveBeenCalledWith('1', {
      transaction_type: 'debt_payment',
      amount: '',
      payment_amount: '',
      payment_method: 'cash',
    });
  });

  it('renders configured Sales Source payment methods in debt-payment mode', () => {
    const tree = renderSource({
      entry: { id: '1', customer_id: 'c1', transaction_type: 'debt_payment', amount: '', payment_amount: '25', payment_method: 'bank_transfer' },
      paymentMethods: [
        { code: 'cash', name_en: 'Cash', is_active: true },
        { code: 'bank_transfer', name_en: 'Bank Transfer', is_active: true },
        { code: 'disabled', name_en: 'Disabled', is_active: false },
      ],
    });
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Cash');
    expect(json).toContain('Bank Transfer');
    expect(json).not.toContain('Disabled');
    expect(tree.root.findAllByType('input').filter((node) => node.props['aria-label'] === 'Debt payment amount')).toHaveLength(1);
    expect(tree.root.findAllByType('input').filter((node) => node.props['aria-label'] === 'Credit sale amount')).toHaveLength(0);
  });

  it('shows the selected-design closing status and a Debt Management fallback', () => {
    const tree = renderSource({
      entry: { id: '1', customer_id: 'c1', amount: '50', payment_amount: '', transaction_type: 'credit_sale' },
    });
    expect(JSON.stringify(tree.toJSON())).toContain('Credit Sale Ready — Save with Closing');

    const emptyTree = renderSource({
      entry: { id: '2', customer_id: '', amount: '', payment_amount: '' },
      customers: [],
      customerSearch: 'missing',
    });
    const link = emptyTree.root.findByType('a');
    expect(link.props.href).toBe('/debt-management');
    expect(link.props.target).toBe('_blank');
  });
});
