import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { summarizePostedCustomerReceivables } from '../src/lib/debt/customerReceivableSummary';

const debt = (id, remaining, overrides={}) => ({
  id, restaurant_id:'tenant-a', branch_id:'branch-a', type:'receivable',
  party_type:'customer', remaining_amount:remaining, total_amount:250,
  paid_amount:250-remaining, status: remaining > 0 ? 'partial' : 'paid', ...overrides,
});
describe('Owner posted customer credit ERP ledger',()=>{
  it('shows only outstanding debt after payments, not original invoice face value',()=>{
    const a=summarizePostedCustomerReceivables([debt('a',50),debt('b',0),debt('c',25)]);
    expect(a).toEqual({amount:75,count:2,status:'VERIFIED_POSTED_LEDGER'});
  });
  it('goes up with a new posted receivable and down after the payment is committed',()=>{
    expect(summarizePostedCustomerReceivables([debt('a',50)]).amount).toBe(50);
    expect(summarizePostedCustomerReceivables([debt('a',50),debt('b',20)]).amount).toBe(70);
    expect(summarizePostedCustomerReceivables([debt('a',35),debt('b',20)]).amount).toBe(55);
  });
  it('does not add written-off or cancelled principal back to the live balance',()=>{
    expect(summarizePostedCustomerReceivables([
      debt('a',30),debt('b',75,{status:'written_off'}),debt('c',25,{status:'cancelled'})
    ])).toMatchObject({amount:30,count:1});
  });
  it('counts repeated identical fetched record once, but rejects conflicting duplicates',()=>{
    expect(summarizePostedCustomerReceivables([debt('a',50),debt('a',50)]).amount).toBe(50);
    expect(summarizePostedCustomerReceivables([debt('a',50),debt('a',60)]).status).toBe('DUPLICATE_CONFLICT');
  });
  it('never shows a fake 0 for a missing source, null money, or failed scoped query',()=>{
    expect(summarizePostedCustomerReceivables([], {complete:false}).amount).toBeNull();
    expect(summarizePostedCustomerReceivables([debt('a',null)]).status).toBe('LEDGER_INVALID');
    expect(summarizePostedCustomerReceivables(null).status).toBe('UNAVAILABLE');
  });
  it('refuses to aggregate a record from outside the customer receivable source',()=>{
    expect(summarizePostedCustomerReceivables([debt('a',50,{party_type:'owner'})]).status).toBe('INVALID_SCOPE');
    expect(summarizePostedCustomerReceivables([debt('a',50,{type:'payable'})]).amount).toBeNull();
  });
  it('realtime invalidates posted debt and payments, not draft Closing credit as posted debt',()=>{
    const realtime=readFileSync('src/hooks/useOwnerDashboardRealtime.js','utf8');
    const owner=readFileSync('src/pages/OwnerDashboard.jsx','utf8');
    const reports=readFileSync('src/components/dashboard/OwnerReportCenter.jsx','utf8');
    expect(realtime).toContain("debt_payments: ['debts_customer_dash']");
    expect(realtime).toContain("customer_collections: ['debts_customer_dash']");
    expect(owner).toContain('summarizePostedCustomerReceivables(customerDebts');
    expect(owner).toContain("complete: !customerDebtsQuery.isError");
    expect(reports).toContain('data-testid="owner-customer-credit-outstanding"');
    expect(reports).toContain("receivables == null ? '—'");
    expect(reports).toContain("navigate('/debt-management')");
  });
});
