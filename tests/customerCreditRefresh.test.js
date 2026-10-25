import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/api/supabaseClient', () => ({ supabase: {} }));
import { invalidateCustomerReceivableQueries } from '../src/lib/debt/customerReceivableRepository';

describe('customer credit refresh', () => {
  it('marks cached owner sales and receivables stale after a committed credit operation', () => {
    const queryClient = { invalidateQueries: vi.fn() };
    invalidateCustomerReceivableQueries(queryClient);
    for (const key of ['canonical_customer_credit_options', 'debts_customer_dash', 'sales_report_period', 'sales_report_previous_period', 'owner_drawer_cash_asof']) {
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: [key] });
    }
  });
});
