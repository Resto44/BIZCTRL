// @vitest-environment jsdom
import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ pay: vi.fn(), notify: vi.fn(), receipt: vi.fn(), save: vi.fn() }));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ user: { email: 'owner@example.test' } }) }));
vi.mock('@/lib/TenantContext', () => ({ useTenant: () => ({ activeRestaurantId: 'r' }) }));
vi.mock('@/lib/debtI18n', () => ({ useDebtI18n: () => ({ max_placeholder: value => value }) }));
vi.mock('@/lib/useNotify', () => ({ useNotify: () => ({ creditCollection: mocks.notify }) }));
vi.mock('@/lib/whatsappService', () => ({ isWhatsAppConfigured: () => false }));
vi.mock('@/lib/debtInvoiceService', () => ({ processPaymentSave: mocks.receipt, generateReceiptPDF: vi.fn(), openPDFInNewTab: vi.fn() }));
vi.mock('@/lib/debt/customerReceivableRepository', () => ({ recordCustomerDebtPayment: mocks.pay, newReceivableRequestId: () => 'request', customerDebtPaymentErrorMessage: error => error.message }));
vi.mock('@/components/ui/select', () => {
  const Part = ({ children }) => <div>{children}</div>;
  return { Select: Part, SelectContent: Part, SelectItem: Part, SelectTrigger: Part, SelectValue: Part };
});
import PaymentForm from '../src/components/debts/PaymentForm';
describe('payment commit boundary', () => {
  it('posts once during double submit and completes even when the post-commit notification fails', async () => {
    let resolve;
    mocks.pay.mockReset().mockImplementation(() => new Promise(done => { resolve = done; }));
    mocks.notify.mockReset().mockRejectedValue(new Error('notification offline'));
    mocks.receipt.mockReset().mockResolvedValue({});
    mocks.save.mockReset();
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    let tree;
    try {
      await act(async () => { tree = create(<PaymentForm debt={{ id: 'd', total_amount: 100, remaining_amount: 100 }} onSave={mocks.save} onCancel={() => {}} />); });
      act(() => tree.root.findAllByType('input').find(input => input.props.type === 'number').props.onChange({ target: { value: '10' } }));
      let first, second;
      act(() => {
        const submit = tree.root.findByType('form').props.onSubmit;
        first = submit({ preventDefault() {} });
        second = submit({ preventDefault() {} });
      });
      expect(mocks.pay).toHaveBeenCalledTimes(1);
      await act(async () => { resolve({ payment: { id: 'p' }, debt: { id: 'd', remaining_amount: 90 } }); await Promise.all([first, second]); });
      expect(mocks.receipt).toHaveBeenCalledTimes(1);
      expect(mocks.save).toHaveBeenCalledTimes(1);
      expect(alert).not.toHaveBeenCalled();
    } finally { if (tree) act(() => tree.unmount()); warning.mockRestore(); alert.mockRestore(); }
  });
});
