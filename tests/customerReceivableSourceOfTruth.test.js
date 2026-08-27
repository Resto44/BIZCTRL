import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { customerCreditSnapshot } from '../src/lib/closing/CustomerCreditCalculations';
import {
  customerCreditEntryPatch,
  mergeCanonicalCustomersWithReceivables,
} from '../src/lib/closing/CanonicalCustomerLoader';

const source = (relativePath) => readFile(resolve(process.cwd(), relativePath), 'utf8');

const customer = (overrides = {}) => ({
  id: 'customer-1',
  name: 'Abdullah',
  phone: '565084065',
  is_active: true,
  credit_limit: 2000,
  ...overrides,
});

const receivable = (overrides = {}) => ({
  id: 'debt-1',
  customer_id: 'customer-1',
  total_amount: 85,
  paid_amount: 0,
  remaining_amount: 85,
  status: 'open',
  ...overrides,
});

describe('Customer Credit receivable source-of-truth', () => {
  it('keeps previous debt, today credit, new balance, and available credit mathematically separate', () => {
    const snapshot = customerCreditSnapshot({ previousCredit: 85, creditLimit: 2000, todayCredit: 200 });
    expect(snapshot).toMatchObject({
      previousCredit: 85,
      todayCredit: 200,
      newCreditBalance: 285,
      availableCredit: 1915,
      remainingCreditLimit: 1715,
      limitExceeded: false,
    });
  });

  it('reflects partial, full, and multiple repayments from receivable data rather than cached Customer Master debt', () => {
    const partial = mergeCanonicalCustomersWithReceivables([customer({ outstanding_balance: 300 })], [
      receivable({ total_amount: 285, paid_amount: 100, remaining_amount: 185, status: 'partial' }),
    ])[0];
    const settled = mergeCanonicalCustomersWithReceivables([customer({ outstanding_balance: 185 })], [
      receivable({ total_amount: 285, paid_amount: 285, remaining_amount: 0, status: 'paid' }),
      receivable({ id: 'debt-2', total_amount: 100, paid_amount: 50, remaining_amount: 50, status: 'partial' }),
    ])[0];

    expect(partial).toMatchObject({ outstanding_balance: 185, available_credit: 1815, total_collected: 100 });
    expect(settled).toMatchObject({ outstanding_balance: 50, available_credit: 1950, total_credit_sales: 385, total_collected: 335 });
  });

  it('keeps a zero-debt active customer selectable and removes inactive customers from the current credit position', () => {
    const positions = mergeCanonicalCustomersWithReceivables([
      customer({ id: 'zero', name: 'Zero debt' }),
      customer({ id: 'inactive', name: 'Inactive', is_active: false }),
    ], []);
    expect(positions).toEqual([expect.objectContaining({ id: 'zero', outstanding_balance: 0, available_credit: 2000 })]);
    expect(customerCreditEntryPatch(positions[0])).toMatchObject({ customer_id: 'zero', previous_credit: 0 });
  });

  it('flags a credit-limit breach without ever producing a negative available-credit display', () => {
    const atLimit = customerCreditSnapshot({ previousCredit: 2000, creditLimit: 2000, todayCredit: 1 });
    const aboveLimit = customerCreditSnapshot({ previousCredit: 185, creditLimit: 2000, todayCredit: 1816 });
    expect(atLimit).toMatchObject({ availableCredit: 0, limitExceeded: true, exceededBy: 1 });
    expect(aboveLimit).toMatchObject({ availableCredit: 1815, remainingCreditLimit: -1, limitExceeded: true, exceededBy: 1 });
  });

  it('moves Sales Closing debt creation into the server transaction and removes the post-commit duplicate writer', async () => {
    const [sales, migration] = await Promise.all([
      source('src/pages/Sales.jsx'),
      source('src/supabase/20260828_customer_credit_receivable_source_of_truth.sql'),
    ]);

    expect(sales).not.toContain('autoSaveCreditDebts');
    expect(sales).toContain('invalidateCustomerReceivableQueries(qc)');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.erp_save_sales_closing_core');
    expect(migration).toContain('uq_debt_records_sales_closing_customer');
    expect(migration).toContain("OR COALESCE((v_result ->> 'finalized_transition')::boolean, false) = false");
    expect(migration).toContain("'Credit sale from Sales Closing'");
  });

  it('defines an atomic, idempotent repayment transaction that reduces receivables and never treats repayments as sales revenue', async () => {
    const [migration, repository, paymentForm, dailySummary] = await Promise.all([
      source('src/supabase/20260828_customer_credit_receivable_source_of_truth.sql'),
      source('src/lib/debt/customerReceivableRepository.js'),
      source('src/components/debts/PaymentForm.jsx'),
      source('src/components/sales/DailySummary.jsx'),
    ]);

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.erp_record_customer_debt_payment');
    expect(migration).toContain('FOR UPDATE;');
    expect(migration).toContain("RAISE EXCEPTION 'CUSTOMER_DEBT_PAYMENT_EXCEEDS_REMAINING'");
    expect(migration).toContain('uq_debt_payments_request_id');
    expect(migration).toContain('uq_customer_collections_request_id');
    expect(migration).toContain("'credit_collection_cash'");
    expect(migration).toContain("'credit_collection_network'");
    expect(migration).not.toContain('UPDATE public.daily_sales\n   SET credit = credit + v_amount');
    expect(repository).toContain("supabase.rpc('erp_record_customer_debt_payment'");
    expect(paymentForm).toContain('paymentRequestId.current || (paymentRequestId.current = newReceivableRequestId())');
    expect(dailySummary).toContain(".from('customer_collections')");
    expect(dailySummary).not.toContain('entities.CreditCollection');
  });

  it('requires canonical Customer Master IDs for manual credit sales and collections instead of name-only matching', async () => {
    const [customerManagement, debtForm, migration] = await Promise.all([
      source('src/pages/CustomerManagement.jsx'),
      source('src/components/debts/DebtForm.jsx'),
      source('src/supabase/20260828_customer_credit_receivable_source_of_truth.sql'),
    ]);

    expect(customerManagement).toContain('customer_id: \'\'');
    expect(customerManagement).toContain('String(d.customer_id) === String(collectionForm.customer_id)');
    expect(customerManagement).toContain('recordCustomerDebtPayment({');
    expect(debtForm).toContain('createCustomerReceivable({');
    expect(debtForm).toContain('customer_id: customer.id');
    expect(migration).toContain('ADD CONSTRAINT debt_records_customer_id_fkey');
    expect(migration).toContain('Link only unambiguous legacy receivables');
  });
});
