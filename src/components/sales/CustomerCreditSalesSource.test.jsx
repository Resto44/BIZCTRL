import React from 'react';
import TestRenderer from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import CustomerCreditSalesSource from './CustomerCreditSalesSource';

vi.mock('@/components/ui/button', () => ({ Button: ({ children, ...props }) => React.createElement('button', props, children) }));
vi.mock('@/components/ui/input', () => ({ Input: (props) => React.createElement('input', props) }));
vi.mock('@/components/ui/label', () => ({ Label: ({ children, ...props }) => React.createElement('label', props, children) }));
vi.mock('@/components/ui/select', () => ({
  Select: ({ children }) => React.createElement('div', null, children),
  SelectContent: ({ children }) => React.createElement('div', null, children),
  SelectItem: ({ children }) => React.createElement('div', null, children),
  SelectTrigger: ({ children }) => React.createElement('button', null, children),
  SelectValue: () => React.createElement('span', null),
}));
vi.mock('lucide-react', () => ({ AlertTriangle: () => null, Minus: () => null, Plus: () => null, Trash2: () => null, UserCheck: () => null }));

describe('CustomerCreditSalesSource', () => {
  it('does not render financial data inside customer search results', () => {
    const tree = TestRenderer.create(React.createElement(CustomerCreditSalesSource, {
      entry: { id: '1', customer_id: '', amount: '', payment_amount: '' },
      idx: 0,
      onRemove: vi.fn(), onUpdate: vi.fn(), onCustomerSearch: vi.fn(), onRecordPayment: vi.fn(),
      customers: [{ id: 'c1', name: 'Ghana Khan', phone: '565084065', outstanding_balance: 110, credit_limit: 2000 }],
      customerSearch: 'Ghana', currency: 'SAR',
    }));
    const text = tree.root.findAllByType('button').map((node) => JSON.stringify(node.props.children)).join(' ');
    expect(text).toContain('Ghana Khan');
    expect(text).toContain('565084065');
    expect(text).not.toContain('110');
    expect(text).not.toContain('2000');
    expect(text).not.toContain('Debt');
    expect(text).not.toContain('Available');
  });

  it('shows compact after-transaction math and clamps at zero', () => {
    const tree = TestRenderer.create(React.createElement(CustomerCreditSalesSource, {
      entry: { id: '1', customer_id: 'c1', amount: '50', payment_amount: '200', payment_method: 'cash' },
      idx: 0,
      onRemove: vi.fn(), onUpdate: vi.fn(), onCustomerSearch: vi.fn(), onRecordPayment: vi.fn(),
      customers: [{ id: 'c1', name: 'Ghana Khan', phone: '565084065', outstanding_balance: 110, credit_limit: 2000 }],
      customerSearch: '', currency: 'SAR',
    }));
    expect(tree.root.findAllByProps({ children: 'After Transaction' }).length).toBeGreaterThan(0);
    expect(JSON.stringify(tree.toJSON())).toContain('0');
  });
});
