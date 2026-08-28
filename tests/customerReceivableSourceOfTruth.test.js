import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mergeCanonicalCustomersWithReceivables } from '../src/lib/closing/CanonicalCustomerLoader';

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
  });

  it('never presents a negative available-credit amount when canonical receivables meet or exceed the limit', () => {
    const atLimit = mergeCanonicalCustomersWithReceivables([customer()], [
      receivable({ total_amount: 2000, remaining_amount: 2000 }),
    ])[0];
    const aboveLimit = mergeCanonicalCustomersWithReceivables([customer()], [
      receivable({ total_amount: 2001, remaining_amount: 2001 }),
    ])[0];
    expect(atLimit).toMatchObject({ available_credit: 0, credit_status: 'outstanding' });
    expect(aboveLimit).toMatchObject({ available_credit: 0, credit_status: 'outstanding' });
  });

  it('moves Customer Credit debt creation into the server transaction and removes the post-commit duplicate writer', async () => {
    const [sales, migration] = await Promise.all([
      source('src/pages/Sales.jsx'),
      source('src/supabase/20260828_customer_credit_sales_source_receivables_rebuild.sql'),
    ]);

    expect(sales).not.toContain('autoSaveCreditDebts');
    expect(sales).toContain('invalidateCustomerReceivableQueries(qc)');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.erp_save_sales_closing_core');
    expect(migration).toContain('ON CONFLICT (sales_closing_id, customer_id)');
    expect(migration).toContain("'Credit sale from Customer Credit sales source'");
    expect(migration).toContain('SALES_CLOSING_CREDIT_FINALIZED_IMMUTABLE');
  });

  it('defines an atomic, idempotent customer-level repayment that allocates receivables and never treats repayment as sales revenue', async () => {
    const [migration, repository, paymentForm, dailySummary] = await Promise.all([
      source('src/supabase/20260828_customer_credit_sales_source_receivables_rebuild.sql'),
      source('src/lib/debt/customerReceivableRepository.js'),
      source('src/components/debts/PaymentForm.jsx'),
      source('src/components/sales/DailySummary.jsx'),
    ]);

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.erp_record_customer_receivable_payment');
    expect(migration).toContain('FOR UPDATE;');
    expect(migration).toContain("RAISE EXCEPTION 'CUSTOMER_DEBT_PAYMENT_EXCEEDS_REMAINING'");
    expect(migration).toContain('settlement_request_id');
    expect(migration).toContain("'credit_collection_cash'");
    expect(migration).toContain("'credit_collection_network'");
    expect(migration).toContain("'customer_debt_collection'");
    expect(migration).not.toContain('INSERT INTO public.daily_sales');
    expect(repository).toContain("supabase.rpc('erp_record_customer_receivable_payment'");
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

    expect(customerManagement).toContain("customer_id: ''");
    expect(customerManagement).toContain('String(d.customer_id) === String(collectionForm.customer_id)');
    expect(customerManagement).toContain('recordCustomerDebtPayment({');
    expect(debtForm).toContain('createCustomerReceivable({');
    expect(debtForm).toContain('customer_id: customer.id');
    expect(migration).toContain('ADD CONSTRAINT debt_records_customer_id_fkey');
    expect(migration).toContain('Link only unambiguous legacy receivables');
  });
});
