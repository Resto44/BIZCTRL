import { describe, expect, it, vi } from 'vitest';
import {
  loadCanonicalActiveCustomers,
  mergeCanonicalCustomersWithReceivables,
} from './CanonicalCustomerLoader';

describe('CanonicalCustomerLoader', () => {
  it('derives a customer balance from receivables keyed by customer_id instead of the Customer Master cache', () => {
    const [customer] = mergeCanonicalCustomersWithReceivables(
      [{
        id: 'customer-a',
        name: 'Customer A',
        credit_limit: 2000,
        outstanding_balance: 999999,
        is_active: true,
      }],
      [
        { customer_id: 'customer-a', total_amount: 200, paid_amount: 0, remaining_amount: 200, status: 'open' },
        { customer_id: 'customer-a', total_amount: 85, paid_amount: 0, remaining_amount: 85, status: 'open' },
      ],
    );

    expect(customer.outstanding_balance).toBe(285);
    expect(customer.available_credit).toBe(1715);
    expect(customer.total_credit_sales).toBe(285);
  });

  it('uses the branch-scoped aggregate RPC with a bounded search result', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        id: 'customer-a',
        name: 'Customer A',
        customer_name: 'Customer A',
        credit_limit: 2000,
        outstanding_balance: 85,
        total_credit_sales: 285,
        total_collected: 200,
        available_credit: 1915,
        credit_status: 'outstanding',
        is_active: true,
      }],
      error: null,
    });

    const customers = await loadCanonicalActiveCustomers({
      client: { rpc },
      restaurantId: 'restaurant-a',
      branchId: 'branch-a',
      branchKey: 'main',
      search: 'Customer',
      limit: 250,
    });

    expect(rpc).toHaveBeenCalledWith('erp_list_customer_credit_options', {
      p_restaurant_id: 'restaurant-a',
      p_branch_id: 'branch-a',
      p_search: 'Customer',
      p_limit: 100,
    });
    expect(customers).toMatchObject([{ id: 'customer-a', outstanding_balance: 85, available_credit: 1915 }]);
  });
});
