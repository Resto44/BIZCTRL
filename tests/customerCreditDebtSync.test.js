// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { customerCreditSnapshot } from '../src/lib/closing/CustomerCreditCalculations';
import { mergeCanonicalCustomersWithReceivables } from '../src/lib/closing/CanonicalCustomerLoader';
import {
  loadScopedCustomerCollections,
  loadScopedDebtPayments,
  loadScopedDebtRecords,
} from '../src/lib/debt/customerReceivableRepository';

const source = (relativePath) => readFile(resolve(process.cwd(), relativePath), 'utf8');

const customer = (overrides = {}) => ({
  id: 'customer-1',
  name: 'Canonical Customer',
  phone: '565084065',
  is_active: true,
  credit_limit: 2000,
  ...overrides,
});

const receivable = (overrides = {}) => ({
  id: 'debt-1',
  customer_id: 'customer-1',
  total_amount: 145,
  paid_amount: 0,
  remaining_amount: 145,
  status: 'open',
  ...overrides,
});

const createScopedClient = (responses) => {
  const calls = [];
  const from = (table) => {
    const filters = [];
    const query = {
      select: () => query,
      eq: (field, value) => {
        filters.push(['eq', field, value]);
        return query;
      },
      is: (field, value) => {
        filters.push(['is', field, value]);
        return query;
      },
      order: () => query,
      limit: () => query,
      then: (onFulfilled, onRejected) => {
        calls.push({ table, filters: [...filters] });
        return Promise.resolve(responses[calls.length - 1] || { data: [], error: null }).then(onFulfilled, onRejected);
      },
    };
    return query;
  };
  return { client: { from }, calls };
};

describe('Customer Credit debt synchronization', () => {
  it('uses receivables as the authoritative balance through partial and full repayment', () => {
    const partial = mergeCanonicalCustomersWithReceivables([customer()], [
      receivable({ paid_amount: 35, remaining_amount: 110, status: 'partial' }),
    ])[0];
    const settled = mergeCanonicalCustomersWithReceivables([customer()], [
      receivable({ paid_amount: 145, remaining_amount: 0, status: 'paid' }),
    ])[0];

    expect(partial).toMatchObject({
      id: 'customer-1',
      outstanding_balance: 110,
      available_credit: 1890,
      credit_status: 'partial',
    });
    expect(settled).toMatchObject({
      id: 'customer-1',
      outstanding_balance: 0,
      available_credit: 2000,
      credit_status: 'paid',
    });
  });

  it('adds a new credit sale to the current receivable position without adding cash', () => {
    const snapshot = customerCreditSnapshot({ previousCredit: 85, creditLimit: 2000, todayCredit: 200 });
    expect(snapshot).toMatchObject({
      previousCredit: 85,
      todayCredit: 200,
      newCreditBalance: 285,
      availableCredit: 1915,
      remainingCreditLimit: 1715,
    });
  });

  it('scopes debt records, payments, and collections by restaurant plus canonical-or-legacy branch without cross-branch query widening', async () => {
    const scope = {
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      branchKey: 'branch-a',
      isAllBranches: false,
    };
    const { client, calls } = createScopedClient([
      { data: [{ id: 'debt-canonical' }], error: null },
      { data: [{ id: 'debt-legacy' }, { id: 'debt-canonical' }], error: null },
      { data: [{ id: 'payment-canonical' }], error: null },
      { data: [{ id: 'payment-legacy' }], error: null },
      { data: [{ id: 'collection-canonical' }], error: null },
      { data: [{ id: 'collection-legacy' }], error: null },
    ]);

    await expect(loadScopedDebtRecords({ client, ...scope })).resolves.toEqual([
      { id: 'debt-canonical' }, { id: 'debt-legacy' },
    ]);
    await expect(loadScopedDebtPayments({ client, ...scope })).resolves.toEqual([
      { id: 'payment-canonical' }, { id: 'payment-legacy' },
    ]);
    await expect(loadScopedCustomerCollections({ client, ...scope, date: '2026-08-28' })).resolves.toEqual([
      { id: 'collection-canonical' }, { id: 'collection-legacy' },
    ]);

    expect(calls).toHaveLength(6);
    calls.forEach((call) => expect(call.filters).toContainEqual(['eq', 'restaurant_id', 'restaurant-1']));
    expect(calls[0].filters).toContainEqual(['eq', 'branch_id', 'branch-1']);
    expect(calls[1].filters).toContainEqual(['is', 'branch_id', null]);
    expect(calls[1].filters).toContainEqual(['eq', 'branch', 'branch-a']);
    expect(calls[5].filters).toContainEqual(['eq', 'date', '2026-08-28']);
  });

  it('keeps one canonical customer ID through Sales, Debts & Receivables, manual receivables, and ledger grouping', async () => {
    const [closing, debtManagement, debtForm] = await Promise.all([
      source('src/components/sales/UnifiedSalesClosing.jsx'),
      source('src/pages/DebtManagement.jsx'),
      source('src/components/debts/DebtForm.jsx'),
    ]);

    expect(closing).toContain("queryKey: ['customers_form', canonicalCustomerScope.restaurantId");
    expect(closing).toContain('hasDuplicateCreditCustomer');
    expect(closing).toContain('recordCustomerDebtPayment({');
    expect(closing).toContain('debtId: selectedPaymentDebt.id');
    expect(closing).toContain("queryClient.refetchQueries({ queryKey: ['customers_form'] })");
    expect(closing).toContain('Not sales revenue');
    expect(debtManagement).toContain('`customer:${debt.customer_id}`');
    expect(debtManagement).toContain('loadScopedDebtRecords(debtScope)');
    expect(debtForm).toContain('loadCanonicalActiveCustomers({ client: supabase, ...canonicalCustomerScope })');
    expect(debtForm).toContain('customer_id: customer.id');
    expect(debtForm).toContain('restaurantId: activeRestaurantId');
  });

  it('defines idempotent, non-revenue payments and one scoped receivable per finalized credit sale', async () => {
    const [migration, repository, sales] = await Promise.all([
      source('src/supabase/20260828_customer_credit_debt_sync.sql'),
      source('src/lib/debt/customerReceivableRepository.js'),
      source('src/pages/Sales.jsx'),
    ]);

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.erp_record_customer_debt_payment');
    expect(migration).toContain("status = CASE WHEN v_new_remaining = 0 THEN 'paid' ELSE 'partial' END");
    expect(migration).toContain("'credit_collection_cash'");
    expect(migration).toContain("'credit_collection_network'");
    expect(migration).not.toContain('UPDATE public.daily_sales\n   SET credit = credit + v_amount');
    expect(migration).toContain('SALES_CLOSING_CREDIT_CUSTOMER_SCOPE_INVALID');
    expect(migration).toContain('SALES_CLOSING_CREDIT_CUSTOMER_DUPLICATE');
    expect(migration).toContain('ON CONFLICT (sales_closing_id, customer_id)');
    expect(repository).toContain("['canonical_customer_credit_options']");
    expect(repository).toContain("['customers_form']");
    expect(sales).toContain('invalidateCustomerReceivableQueries(qc)');
  });
});
