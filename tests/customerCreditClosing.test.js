// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { normalizeClosingPayload } from '../src/lib/closing/ClosingRepository';
import { customerCreditSnapshot, creditEntryRequiresCustomer } from '../src/lib/closing/CustomerCreditCalculations';

const source = (relativePath) => readFile(resolve(process.cwd(), relativePath), 'utf8');

describe('Customer Master credit Closing runtime', () => {
  it('calculates available, new, remaining, and exceeded amounts from Today Credit only', () => {
    expect(customerCreditSnapshot({ previousCredit: 1200, creditLimit: 2000, todayCredit: 300 })).toMatchObject({
      availableCredit: 800,
      newCreditBalance: 1500,
      remainingCreditLimit: 500,
      exceededBy: 0,
      limitExceeded: false,
    });
    expect(customerCreditSnapshot({ previousCredit: 1200, creditLimit: 2000, todayCredit: 900 })).toMatchObject({
      availableCredit: 800,
      newCreditBalance: 2100,
      remainingCreditLimit: -100,
      exceededBy: 100,
      limitExceeded: true,
    });
    expect(creditEntryRequiresCustomer({ amount: 300, customer_id: '' })).toBe(true);
    expect(creditEntryRequiresCustomer({ amount: 0, customer_id: '' })).toBe(false);
  });

  it('passes Customer Credit rows to the RPC as a typed array', () => {
    const entries = [{ customer_id: 'customer-1', today_credit: 300 }];
    expect(normalizeClosingPayload({ credit_entries_json: entries }, 'credit-request-1').credit_entries_json).toEqual(entries);
    expect(normalizeClosingPayload({ credit_entries_json: JSON.stringify(entries) }, 'credit-request-2').credit_entries_json).toEqual(entries);
  });

  it('uses Customer Master selection, stable row keys, and Today-only Closing totals in the workspace', async () => {
    const workspace = await source('src/components/sales/UnifiedSalesClosing.jsx');
    expect(workspace).toContain('data-testid="customer-credit-card"');
    expect(workspace).toContain('Customer Credit Today Total');
    expect(workspace).toContain('customers.map((customer) => <SelectItem key={customer.id} value={customer.id}>');
    expect(workspace).toContain('creditEntries.map((entry, index) => <CustomerCreditEntry key={entry.id}');
    expect(workspace).toContain('id={`quick-closing-credit-${entry.id}`}');
    expect(workspace).toContain('credit_entries_json: creditEntries.map');
    expect(workspace).toContain('creditEntryRequiresCustomer');
    expect(workspace).toContain('manualCreditTotal');
    expect(workspace).not.toContain('defaultCustomer');
  });

  it('enforces Customer Master validation and records immutable finalized snapshots in the canonical transaction', async () => {
    const migration = await source('src/supabase/20260826_sales_closing_customer_credit_runtime.sql');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.sales_closing_customer_credit_snapshots');
    expect(migration).toContain('customer_name_snapshot');
    expect(migration).toContain('previous_credit_snapshot');
    expect(migration).toContain('available_credit_snapshot');
    expect(migration).toContain('remaining_credit_limit');
    expect(migration).toContain('SALES_CLOSING_CREDIT_LIMIT_EXCEEDED');
    expect(migration).toContain('SALES_CLOSING_CREDIT_OVERRIDE_DENIED');
    expect(migration).toContain('credit_entries_json = v_credit_entries_sanitized');
    expect(migration).toContain('UPDATE public.customers AS customer');
    expect(migration).toContain('erp_guard_sales_closing_customer_credit_snapshot_immutable');
  });

  it('does not asynchronously increment Customer Master balances after the server transaction commits', async () => {
    const salesPage = await source('src/pages/Sales.jsx');
    expect(salesPage).toContain('Customer Master balances are updated atomically by the canonical Sales');
    expect(salesPage).not.toContain('outstanding_balance: (Number(c.outstanding_balance) || 0) + amt');
  });

  it('keeps the selected canonical customer reference through legacy receivable and payment synchronization', async () => {
    const salesPage = await source('src/pages/Sales.jsx');
    expect(salesPage).toContain('A Customer Master ID is never a DebtRecord ID');
    expect(salesPage).not.toContain('DebtRecord.filter({ id: customerId })');
    expect(salesPage).toContain('customer_id: customerId');
    expect(salesPage).toContain('customer_id: customerId || debtRecord.customer_id || null');
  });
});
