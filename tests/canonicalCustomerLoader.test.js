import { describe, expect, it } from 'vitest';
import {
  customerCreditEntryPatch,
  hasCanonicalCustomerScope,
  loadCanonicalActiveCustomers,
  mergeCanonicalCustomers,
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

  it('returns one normalized canonical customer and preserves its customer ID for a credit entry', () => {
    const customer = activeCustomer();
    expect(mergeCanonicalCustomers([customer])).toEqual([expect.objectContaining({
      id: 'customer-1',
      customer_name: 'Canonical Customer',
      outstanding_balance: 85,
    })]);
    expect(customerCreditEntryPatch(customer)).toMatchObject({
      customer_id: 'customer-1',
      customer_name_snapshot: 'Canonical Customer',
      previous_credit: 85,
      current_debt: 85,
      credit_limit: 2000,
      available_credit: 1915,
    });
  });

  it('includes multiple active customers regardless of whether a debt record exists, while excluding inactive rows', () => {
    const withDebt = activeCustomer({ id: 'customer-with-debt', name: 'With debt', has_debt_record: true });
    const withoutDebt = activeCustomer({ id: 'customer-without-debt', name: 'Without debt', has_debt_record: false });
    const inactive = activeCustomer({ id: 'inactive-customer', name: 'Inactive', is_active: false, has_debt_record: true });

    expect(mergeCanonicalCustomers([withDebt, inactive], [withoutDebt, withDebt])).toEqual([
      expect.objectContaining({ id: 'customer-with-debt', name: 'With debt' }),
      expect.objectContaining({ id: 'customer-without-debt', name: 'Without debt' }),
    ]);
  });

  it('queries both canonical and legacy branch storage, deduplicates by canonical ID, and never widens to another branch', async () => {
    const canonical = activeCustomer({ id: 'customer-1', name: 'Alpha', branch_id: 'branch-1', branch: '0045' });
    const legacy = activeCustomer({ id: 'customer-2', name: 'Beta', branch_id: null, branch: '0045' });
    const { client, calls } = createCustomerClient([
      { data: [canonical], error: null },
      { data: [legacy, canonical], error: null },
    ]);

    await expect(loadCanonicalActiveCustomers({
      client,
      restaurantId: 'tenant-1',
      branchId: 'branch-1',
      branchKey: '0045',
    })).resolves.toEqual([
      expect.objectContaining({ id: 'customer-1', name: 'Alpha' }),
      expect.objectContaining({ id: 'customer-2', name: 'Beta' }),
    ]);

    expect(calls).toHaveLength(2);
    expect(calls[0].filters).toContainEqual(['eq', 'restaurant_id', 'tenant-1']);
    expect(calls[0].filters).toContainEqual(['eq', 'branch_id', 'branch-1']);
    expect(calls[1].filters).toContainEqual(['is', 'branch_id', null]);
    expect(calls[1].filters).toContainEqual(['eq', 'branch', '0045']);
  });

  it('uses a resolved canonical branch ID even while the legacy branch key is temporarily unavailable', async () => {
    const canonical = activeCustomer({ branch_id: 'branch-1' });
    const { client, calls } = createCustomerClient([{ data: [canonical], error: null }]);

    await expect(loadCanonicalActiveCustomers({
      client,
      restaurantId: 'tenant-1',
      branchId: 'branch-1',
      branchKey: '',
    })).resolves.toEqual([expect.objectContaining({ id: 'customer-1' })]);

    expect(calls).toHaveLength(1);
    expect(calls[0].filters).toContainEqual(['eq', 'branch_id', 'branch-1']);
  });
});
