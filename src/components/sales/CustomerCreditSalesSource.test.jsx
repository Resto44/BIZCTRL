import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import CustomerCreditSalesSource from './CustomerCreditSalesSource';

const language = vi.hoisted(() => ({ lang: 'en' }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => language }));
beforeEach(() => { language.lang = 'en'; });

vi.mock('@/components/ui/button', () => ({ Button: ({ children, ...props }) => React.createElement('button', props, children) }));
vi.mock('@/components/ui/input', () => ({ Input: React.forwardRef((props, ref) => React.createElement('input', { ...props, ref })) }));
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

const renderSource = (overrides = {}, options) => TestRenderer.create(React.createElement(CustomerCreditSalesSource, {
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
}), options);

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

  it('dismisses the search keyboard before expanding the selected customer', () => {
    const blur = vi.fn();
    const onUpdate = vi.fn();
    const tree = renderSource({
      entry: { id: '1', customer_id: '' },
      customerSearch: 'Ghana',
      onUpdate,
    }, { createNodeMock: (element) => element.props.role === 'combobox' ? { blur } : null });
    const option = tree.root.findByProps({ role: 'option' });
    act(() => option.props.onPointerDown({ preventDefault: vi.fn() }));
    expect(blur).toHaveBeenCalledOnce();
    expect(blur.mock.invocationCallOrder[0]).toBeLessThan(onUpdate.mock.invocationCallOrder[0]);
    expect(onUpdate).toHaveBeenCalledOnce();
    tree.unmount();
  });

  it('selects a customer on pointer down before iOS blur closes the results', () => {
    const onUpdate = vi.fn();
    const onCustomerSearch = vi.fn();
    const onSelectCustomer = vi.fn();
    const tree = renderSource({
      entry: { id: '1', customer_id: '', amount: '', payment_amount: '' },
      customerSearch: 'Ghana',
      onUpdate,
      onCustomerSearch,
      onSelectCustomer,
    });
    const option = tree.root.findByProps({ role: 'option' });
    const preventDefault = vi.fn();

    act(() => option.props.onPointerDown({ preventDefault, pointerType: 'touch' }));

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(onUpdate).toHaveBeenCalledWith('1', {
      customer_id: 'c1',
      customer_name_snapshot: 'Ghana Khan',
      customer_phone: '565084065',
      previous_outstanding_debt: 110,
      credit_limit: 2000,
      available_credit: 1890,
      transaction_type: 'credit_sale',
      amount: '',
      payment_amount: '',
    });
    expect(onCustomerSearch).toHaveBeenLastCalledWith('');
    expect(onSelectCustomer).toHaveBeenCalledOnce();
    expect(tree.root.findAllByProps({ role: 'option' })).toHaveLength(0);
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
    const onReviewCreditSale = vi.fn();
    const tree = renderSource({
      onReviewCreditSale,
      entry: { id: '1', customer_id: 'c1', amount: '50', payment_amount: '', transaction_type: 'credit_sale' },
    });
    const review = tree.root.findAllByType('button').find(node => textOf(node).includes('Review & Save with Closing'));
    expect(review.props.disabled).toBe(false);
    act(() => review.props.onClick());
    expect(onReviewCreditSale).toHaveBeenCalledWith(expect.objectContaining({customer_id:'c1',amount:'50'}));

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

describe('credit balances and localized amounts', () => {
  it.each(['۵۰٫۲۵', '٥٠٫٢٥', '50.25'])('normalizes %s before the closing receives it', value => {
    const onUpdate = vi.fn();
    const tree = renderSource({ onUpdate });
    act(() => tree.root.findByProps({ 'aria-label': 'Credit sale amount' }).props.onChange({ target: { value } }));
    expect(onUpdate).toHaveBeenCalledWith('1', 'amount', '50.25');
    tree.unmount();
  });

  it.each(['1e2', '1,20', '-50', '50.001'])('blocks invalid monetary input %s', value => {
    const tree = renderSource({ entry: { id: '1', customer_id: 'c1', amount: value }, onReviewCreditSale: vi.fn() });
    expect(tree.root.findByProps({ 'aria-label': 'Credit sale amount' }).props['aria-invalid']).toBe(true);
    const review = tree.root.findAllByType('button').find(node => textOf(node).includes('Review & Save with Closing'));
    expect(review.props.disabled).toBe(true);
    expect(tree.root.findAllByProps({ 'data-testid': 'credit-balance-preview' })).toHaveLength(0);
    tree.unmount();
  });

  it('updates the marked cards as a preview while preserving the recorded balance', () => {
    const tree = renderSource({ entry: { id: '1', customer_id: 'c1', amount: '50' } });
    const preview = textOf(tree.root.findByProps({ 'data-testid': 'credit-balance-preview' }));
    expect(preview).toContain('After finalizing closing (preview)');
    expect(preview).toContain('SAR 160');
    expect(preview).toContain('SAR 1,840');
    const cards = textOf(tree.root.findByProps({ 'data-testid': 'credit-balance-cards' }));
    expect(cards).toContain('SAR 160');
    expect(cards).toContain('SAR 1,840');
    expect(cards).toContain('Recorded balance');
    expect(cards).toContain('SAR 110');
    expect(JSON.stringify(tree.toJSON())).toContain('SAR 110');
    tree.unmount();
  });

  it('previews a full repayment and updates posted metrics when canonical data refreshes', () => {
    const props = { entry: { id: '1', customer_id: 'c1', transaction_type: 'debt_payment', payment_amount: '110' }, customers: [customer] };
    const tree = renderSource(props);
    const preview = textOf(tree.root.findByProps({ 'data-testid': 'credit-balance-preview' }));
    expect(preview).toContain('SAR 0');
    expect(preview).toContain('SAR 2,000');
    const cards = textOf(tree.root.findByProps({ 'data-testid': 'credit-balance-cards' }));
    expect(cards).toContain('After recording payment (preview)');
    expect(cards).toContain('SAR 0');
    expect(cards).toContain('SAR 2,000');
    act(() => tree.update(React.createElement(CustomerCreditSalesSource, { ...props, entry: { ...props.entry, payment_amount: '' }, customers: [{ ...customer, outstanding_balance: 0, available_credit: 2000 }] })));
    expect(tree.root.findAllByProps({ 'data-testid': 'credit-balance-preview' })).toHaveLength(0);
    expect(JSON.stringify(tree.toJSON())).toContain('SAR 2,000');
    tree.unmount();
  });

  it('never previews a finalized credit sale twice or deletes it when recording payment', () => {
    const onUpdate = vi.fn();
    const tree = renderSource({ creditPosted: true, onUpdate, entry: { id: '1', customer_id: 'c1', amount: '50' } });
    expect(tree.root.findAllByProps({ 'data-testid': 'credit-balance-preview' })).toHaveLength(0);
    expect(tree.root.findByProps({ 'aria-label': 'Credit sale amount' }).props.disabled).toBe(true);
    act(() => tree.root.findAllByType('button').find(node => textOf(node) === ' Debt Payment').props.onClick());
    expect(onUpdate).toHaveBeenCalledWith('1', expect.objectContaining({ transaction_type: 'debt_payment', amount: '50', payment_amount: '' }));
    tree.unmount();
  });
});


describe('live closing language selection', () => {
  it('switches English → Persian → Arabic → English without changing entered money or customer identity', () => {
    const props = { entry: { id: '1', customer_id: 'c1', amount: '50.25' }, customers: [customer], onUpdate: vi.fn(), onReviewCreditSale: vi.fn() };
    const tree = renderSource(props);
    for (const [lang, title, action] of [
      ['fa', 'اعتبار مشتری', 'بررسی و ذخیره همراه بستن حساب'],
      ['ar', 'ائتمان العميل', 'مراجعة وحفظ مع الإقفال'],
      ['en', 'Customer Credit', 'Review & Save with Closing'],
    ]) {
      language.lang = lang;
      act(() => tree.update(React.createElement(CustomerCreditSalesSource, props)));
      const text = textOf(tree.root.findByType('article'));
      expect(text).toContain(title);
      expect(text).toContain(action);
      expect(text).toContain(customer.name);
      expect(text).toContain(customer.phone);
      expect(tree.root.findAllByType('input').find(node => node.props.inputMode === 'decimal').props.value).toBe('50.25');
      if (lang !== 'en') expect(text).not.toMatch(/Customer Credit|Credit Sale|Debt Payment|After finalizing|Available|Limit/);
    }
    expect(props.onUpdate).not.toHaveBeenCalled();
    tree.unmount();
  });

  it('uses localized payment method names while preserving their submitted codes', () => {
    language.lang = 'ar';
    const onRecordPayment = vi.fn();
    const tree = renderSource({ onRecordPayment, entry: { id: '1', customer_id: 'c1', transaction_type: 'debt_payment', payment_amount: '25', payment_method: 'cash' }, paymentMethods: [{ code: 'cash', name_en: 'Cash', name_ar: 'نقد الفرع', name_fa: 'نقد شعبه' }] });
    expect(textOf(tree.root.findByType('article'))).toContain('نقد الفرع');
    const button = tree.root.findAllByType('button').find(node => textOf(node).includes('تسجيل سداد الدين'));
    act(() => button.props.onClick());
    expect(onRecordPayment).toHaveBeenCalledWith(expect.objectContaining({ payment_method: 'cash', payment_amount: '25' }));
    tree.unmount();
  });
});
