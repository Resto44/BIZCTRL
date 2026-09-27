import { describe, expect, it } from 'vitest';
import { mergeCustomerReportSummary } from './customerReportSummary';
const customer = { id: 'a', restaurant_id: 'r', name: 'Same name', outstanding_balance: 85, phone: '123' };
const row = { customer_id: 'a', restaurant_id: 'r', customer_name: 'Same name', outstanding_balance: 30, total_credit_sales: 35, total_collected: 5 };
describe('customer report financial totals', () => {
  it('uses the ledger over stale cached profile balances while retaining contact details', () => {
    expect(mergeCustomerReportSummary([row], [customer], 'r')[0]).toMatchObject({ outstanding_balance: 30, total_credit_sales: 35, total_collected: 5, phone: '123' });
  });
  it('adds separate branch/creator aggregates for one customer', () => {
    expect(mergeCustomerReportSummary([row, { ...row, outstanding_balance: 10 }], [customer], 'r')[0].outstanding_balance).toBe(40);
  });
  it('keeps different customers with identical names separate', () => {
    const result = mergeCustomerReportSummary([row, { ...row, customer_id: 'b', outstanding_balance: 10 }], [customer, { ...customer, id: 'b' }], 'r');
    expect(result.map(c => c.outstanding_balance)).toEqual([30, 10]);
  });
  it('does not expose another tenant or inactive customer', () => {
    expect(mergeCustomerReportSummary([row, { ...row, restaurant_id: 'other' }], [{ ...customer, is_active: false }], 'r')).toEqual([]);
  });
  it('keeps registered opening balances without a ledger and matches unambiguous legacy rows', () => {
    expect(mergeCustomerReportSummary([], [customer], 'r')[0].outstanding_balance).toBe(85);
    expect(mergeCustomerReportSummary([{ ...row, customer_id: null }], [customer], 'r')).toHaveLength(1);
  });
});
