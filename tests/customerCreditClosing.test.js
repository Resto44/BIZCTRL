// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { normalizeClosingPayload } from '../src/lib/closing/ClosingRepository';

const source = (relativePath) => readFile(resolve(process.cwd(), relativePath), 'utf8');

describe('Customer Credit Sales Source runtime', () => {
  it('passes Customer Credit sale rows to the RPC as a typed array', () => {
    const entries = [{ customer_id: 'customer-1', amount: 300 }];
    expect(normalizeClosingPayload({ credit_entries_json: entries }, 'credit-request-1').credit_entries_json).toEqual(entries);
    expect(normalizeClosingPayload({ credit_entries_json: JSON.stringify(entries) }, 'credit-request-2').credit_entries_json).toEqual(entries);
  });

  it('places the selected Customer Credit design outside the legacy Sales Sources box', async () => {
    const [workspace, customerCreditSource] = await Promise.all([
      source('src/components/sales/UnifiedSalesClosing.jsx'),
      source('src/components/sales/CustomerCreditSalesSource.jsx'),
    ]);
    expect(workspace).toContain('CustomerCreditSalesSource');
    expect(workspace).toContain("import CustomerCreditSalesSource from '@/components/sales/CustomerCreditSalesSource'");
    expect(workspace).not.toContain('function CustomerCreditSalesSource');
    expect(workspace).toContain('data-testid="customer-credit-closing-section"');
    expect(workspace).not.toContain('Managed by Sales Sources. Customer balances and payments come only from Debt Management.');
    expect(workspace).toContain('paymentMethods={configuredPaymentMethods}');
    expect(customerCreditSource).toContain("CREDIT_SALE: 'credit_sale'");
    expect(customerCreditSource).toContain("DEBT_PAYMENT: 'debt_payment'");
    expect(customerCreditSource).toContain("isPayment ? 'payment_amount' : 'amount'");
    expect(customerCreditSource).toContain('Sales Sources · Debt Management');
    expect(customerCreditSource).toContain('Search by name, phone, or customer ID');
    expect(customerCreditSource).toContain('Credit Sale Saves with Sales Closing');
    expect(customerCreditSource).toContain('Open Debt Management');
    expect(customerCreditSource).toContain('Payment cannot exceed outstanding debt.');
    expect(workspace).toContain('recordCustomerReceivablePayment');
    expect(workspace).toContain('customerCreditSourceSnapshot');
    expect(workspace).toContain('manualCreditTotal');
    expect(workspace).not.toContain('function CustomerCreditEntry');
    expect(workspace).not.toContain('customerCreditSnapshot');
    expect(workspace).not.toContain('creditEntryRequiresCustomer');
  });

  it('creates one customer-id-linked receivable per finalized Closing and validates available credit in the transactional core', async () => {
    const migration = await source('src/supabase/20260828_customer_credit_sales_source_receivables_rebuild.sql');
    expect(migration).toContain('erp_save_sales_closing_core_legacy_customer_balance');
    expect(migration).toContain('ON CONFLICT (sales_closing_id, customer_id)');
    expect(migration).toContain('SALES_CLOSING_CREDIT_LIMIT_EXCEEDED');
    expect(migration).toContain("'receivable', 'customer'");
    expect(migration).toContain('previous_outstanding_debt');
    expect(migration).toContain('available_credit');
  });

  it('records a customer debt payment separately from sales revenue and adds cash exactly once for cash payments', async () => {
    const migration = await source('src/supabase/20260828_customer_credit_sales_source_receivables_rebuild.sql');
    expect(migration).toContain('erp_record_customer_receivable_payment');
    expect(migration).toContain('ORDER BY due_date NULLS LAST, date, created_date, id');
    expect(migration).toContain('credit_collection_cash');
    expect(migration).toContain('customer_debt_collection');
    expect(migration).toContain("'CustomerPayments'");
    expect(migration).toContain('settlement_request_id');
    expect(migration).not.toContain('INSERT INTO public.daily_sales');
  });

  it('does not perform a post-commit Customer Credit debt write after the Closing transaction commits', async () => {
    const salesPage = await source('src/pages/Sales.jsx');
    expect(salesPage).toContain('Customer Credit receivables are written in the finalized Closing database');
    expect(salesPage).toContain('invalidateCustomerReceivableQueries(qc)');
    expect(salesPage).not.toContain('autoSaveCreditDebts');
    expect(salesPage).not.toContain('outstanding_balance: (Number(c.outstanding_balance) || 0) + amt');
  });
});
