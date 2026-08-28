import { describe, expect, it } from 'vitest';
import {
  customerCreditEntryPatch,
  hasCanonicalCustomerScope,
  loadCanonicalActiveCustomers,
  mergeCanonicalCustomers,
  mergeCanonicalCustomersWithReceivables,
  receivableTotalsByCustomer,
} from '../src/lib/closing/CanonicalCustomerLoader';

const activeCustomer = (overrides = {}) => ({
  id: 'customer-1',
  name: 'Canonical Customer',
  is_active: true,
  phone: '0700000000',
  credit_limit: 2000,
  outstanding_balance: 85,
  ...overrides,
});

const receivable = (overrides = {}) => ({
  id: 'debt-1',
  customer_id: 'customer-1',
  total_amount: 200,
  paid_amount: 0,
  remaining_amount: 200,
  status: 'open',
  ...overrides,
});

const createCustomerClient = (responses) => {
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

describe('canonical Sales Closing customer loader', () => {
  it('requires a tenant and either the canonical branch ID or the legacy branch key', () => {
    expect(hasCanonicalCustomerScope({ restaurantId: '', branchId: 'branch-1', branchKey: '' })).toBe(false);
    expect(hasCanonicalCustomerScope({ restaurantId: 'tenant-1', branchId: '', branchKey: '' })).toBe(false);
    expect(hasCanonicalCustomerScope({ restaurantId: 'tenant-1', branchId: 'branch-1', branchKey: '' })).toBe(true);
    expect(hasCanonicalCustomerScope({ restaurantId: 'tenant-1', branchId: '', branchKey: '0045' })).toBe(true);
  });

  it('returns no option for empty, null, malformed, or inactive customer inputs', () => {
    expect(mergeCanonicalCustomers([])).toEqual([]);
    expect(mergeCanonicalCustomers([null, undefined, {}, activeCustomer({ id: '', is_active: true }), activeCustomer({ is_active: false })])).toEqual([]);
    expect(customerCreditEntryPatch(null)).toBeNull();
    expect(customerCreditEntryPatch({ id: 'missing-name', is_active: true })).toBeNull();
  });

  it('preserves a canonical customer ID and credit-entry snapshot after receivable-backed selection', () => {
    const customer = mergeCanonicalCustomersWithReceivables([activeCustomer()], [receivable({ remaining_amount: 85 })])[0];
    expect(customer).toMatchObject({
      id: 'customer-1',
      customer_name: 'Canonical Customer',
      outstanding_balance: 85,
      available_credit: 1915,
      credit_status: 'open',
    });
    expect(customerCreditEntryPatch(customer)).toMatchObject({
      customer_id: 'customer-1',
      customer_name_snapshot: 'Canonical Customer',
      previous_credit: 85,
      current_debt: 85,
      credit_limit: 2000,
      available_credit: 1915,
    });
  });

  it('uses receivable totals rather than a stale Customer Master outstanding-balance cache', () => {
    const customer = activeCustomer({ outstanding_balance: 999 });
    const position = mergeCanonicalCustomersWithReceivables([customer], [
      receivable({ total_amount: 200, paid_amount: 100, remaining_amount: 100 }),
      receivable({ id: 'debt-2', total_amount: 85, paid_amount: 0, remaining_amount: 85 }),
    ])[0];

    expect(position).toMatchObject({
      outstanding_balance: 185,
      total_credit_sales: 285,
      total_collected: 100,
      available_credit: 1815,
    });
  });

  it('includes active customers with zero debt and excludes inactive or unlinked legacy rows', () => {
    const withDebt = activeCustomer({ id: 'customer-with-debt', name: 'With debt', credit_limit: 500 });
    const withoutDebt = activeCustomer({ id: 'customer-without-debt', name: 'Without debt', credit_limit: 600 });
    const inactive = activeCustomer({ id: 'inactive-customer', name: 'Inactive', is_active: false });
    const positions = mergeCanonicalCustomersWithReceivables(
      [withDebt, inactive, withoutDebt],
      [
        receivable({ id: 'debt-with-debt', customer_id: 'customer-with-debt', total_amount: 100, remaining_amount: 100 }),
        receivable({ id: 'legacy-unlinked', customer_id: null, remaining_amount: 250 }),
      ],
    );

    expect(positions).toEqual([
      expect.objectContaining({ id: 'customer-with-debt', outstanding_balance: 100, credit_status: 'open' }),
      expect.objectContaining({ id: 'customer-without-debt', outstanding_balance: 0, available_credit: 600, credit_status: 'no_debt' }),
    ]);
  });

  it('ignores written-off, malformed, negative, and unrelated receivable values rather than displaying NaN or negative credit', () => {
    const totals = receivableTotalsByCustomer([
      receivable({ id: 'valid', remaining_amount: 50, total_amount: 100, paid_amount: 50 }),
      receivable({ id: 'written-off', status: 'written_off', remaining_amount: 900 }),
      receivable({ id: 'negative', remaining_amount: -50, total_amount: -1, paid_amount: -1 }),
      receivable({ id: 'malformed', remaining_amount: 'not-a-number', total_amount: null, paid_amount: undefined }),
      receivable({ id: 'no-customer', customer_id: null, remaining_amount: 500 }),
    ]);

    expect(totals.get('customer-1')).toEqual({
      outstanding_balance: 50,
      total_credit_sales: 100,
      total_collected: 50,
      has_open_receivable: false,
      has_partial_receivable: true,
      open_receivables: [{ id: 'valid', remaining_amount: 50, date: null, status: 'open' }],
    });
  });

  it('queries customers and receivables through both canonical and legacy branch storage, deduplicates customers, and never widens another branch', async () => {
    const canonical = activeCustomer({ id: 'customer-1', name: 'Alpha', branch_id: 'branch-1', branch: '0045' });
    const legacy = activeCustomer({ id: 'customer-2', name: 'Beta', branch_id: null, branch: '0045' });
    const { client, calls } = createCustomerClient([
      { data: [canonical], error: null },
      { data: [legacy, canonical], error: null },
      { data: [receivable({ customer_id: 'customer-1', remaining_amount: 85 })], error: null },
      { data: [receivable({ id: 'legacy-debt', customer_id: 'customer-2', remaining_amount: 40 })], error: null },
    ]);

    await expect(loadCanonicalActiveCustomers({
      client,
      restaurantId: 'tenant-1',
      branchId: 'branch-1',
      branchKey: '0045',
    })).resolves.toEqual([
      expect.objectContaining({ id: 'customer-1', name: 'Alpha', outstanding_balance: 85 }),
      expect.objectContaining({ id: 'customer-2', name: 'Beta', outstanding_balance: 40 }),
    ]);

    expect(calls).toHaveLength(4);
    expect(calls[0]).toMatchObject({ table: 'customers' });
    expect(calls[0].filters).toContainEqual(['eq', 'restaurant_id', 'tenant-1']);
    expect(calls[0].filters).toContainEqual(['eq', 'branch_id', 'branch-1']);
    expect(calls[1].filters).toContainEqual(['is', 'branch_id', null]);
    expect(calls[1].filters).toContainEqual(['eq', 'branch', '0045']);
    expect(calls[2]).toMatchObject({ table: 'debt_records' });
    expect(calls[2].filters).toContainEqual(['eq', 'party_type', 'customer']);
    expect(calls[2].filters).toContainEqual(['eq', 'type', 'receivable']);
  });

  it('uses a resolved canonical branch ID even while the legacy branch key is temporarily unavailable', async () => {
    const canonical = activeCustomer({ branch_id: 'branch-1' });
    const { client, calls } = createCustomerClient([
      { data: [canonical], error: null },
      { data: [receivable({ remaining_amount: 85 })], error: null },
    ]);

    await expect(loadCanonicalActiveCustomers({
      client,
      restaurantId: 'tenant-1',
      branchId: 'branch-1',
      branchKey: '',
    })).resolves.toEqual([expect.objectContaining({ id: 'customer-1', outstanding_balance: 85 })]);

    expect(calls).toHaveLength(2);
    expect(calls[0].filters).toContainEqual(['eq', 'branch_id', 'branch-1']);
    expect(calls[1]).toMatchObject({ table: 'debt_records' });
    expect(calls[1].filters).toContainEqual(['eq', 'branch_id', 'branch-1']);
  });
});
