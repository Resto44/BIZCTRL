import { describe, expect, it, vi } from 'vitest';
import {
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
  });

  it('preserves canonical identity while deriving a displayed position from receivables', () => {
    const customer = mergeCanonicalCustomersWithReceivables([activeCustomer()], [receivable({ remaining_amount: 85 })])[0];
    expect(customer).toMatchObject({
      id: 'customer-1',
      customer_name: 'Canonical Customer',
      outstanding_balance: 85,
      available_credit: 1915,
      credit_status: 'outstanding',
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
      expect.objectContaining({ id: 'customer-with-debt', outstanding_balance: 100, credit_status: 'outstanding' }),
      expect.objectContaining({ id: 'customer-without-debt', outstanding_balance: 0, available_credit: 600, credit_status: 'settled' }),
    ]);
  });

  it('ignores written-off, malformed, negative, and unlinked receivable values', () => {
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
    });
  });

  it('uses one branch-scoped aggregate RPC with bounded search rather than loading all customers and debts', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [activeCustomer({
        customer_name: 'Canonical Customer',
        outstanding_balance: 85,
        total_credit_sales: 285,
        total_collected: 200,
        available_credit: 1915,
        credit_status: 'outstanding',
      })],
      error: null,
    });

    await expect(loadCanonicalActiveCustomers({
      client: { rpc },
      restaurantId: 'tenant-1',
      branchId: 'branch-1',
      branchKey: '0045',
      search: 'Canonical',
      limit: 500,
    })).resolves.toEqual([expect.objectContaining({ id: 'customer-1', outstanding_balance: 85, available_credit: 1915 })]);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('erp_list_customer_credit_options', {
      p_restaurant_id: 'tenant-1',
      p_branch_id: 'branch-1',
      p_search: 'Canonical',
      p_limit: 100,
    });
  });

  it('does not issue a customer query until the canonical branch UUID is resolved', async () => {
    const rpc = vi.fn();
    await expect(loadCanonicalActiveCustomers({
      client: { rpc },
      restaurantId: 'tenant-1',
      branchId: '',
      branchKey: '0045',
    })).resolves.toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });
});
