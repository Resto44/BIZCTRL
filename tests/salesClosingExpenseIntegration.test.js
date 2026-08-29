import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (relativePath) => fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');

const workspace = read('src/components/sales/UnifiedSalesClosing.jsx');
const ledger = read('src/lib/closing/CashReconciliationLedger.js');
const migration = read('src/supabase/20260826_fix_sales_closing_expense_context.sql');

describe('Sales Closing expense integration', () => {
  it('uses a canonical authenticated server context for branch-and-date scoped expenses instead of a browser fallback', () => {
    expect(workspace).toContain("supabase.rpc('erp_sales_closing_cash_context'");
    expect(workspace).not.toContain("from('expenses')");
    expect(workspace).not.toContain('expensesForDate');
    expect(workspace).toContain('variableExpensesToday = Math.max(0, Number(cashLedgerContext.variable_expenses_today) || 0)');
    expect(migration).toContain('erp_can_access_scope_text(p_restaurant_id::text, p_branch_id::text)');
    expect(migration).toContain('expense.branch_id = p_branch_id');
    expect(migration).toContain("expense.branch_id IS NULL AND expense.branch_key = v_branch_key");
    expect(migration).toContain('expense.date = p_date');
  });

  it('allocates active fixed monthly sources once per Closing date and supports the legacy fixed-row source amount', () => {
    expect(migration).toContain('COALESCE(NULLIF(category.monthly_amount, 0), monthly_record.amount, 0)');
    expect(migration).toContain('monthly_amount / allocation_days');
    expect(migration).toContain("date_trunc('month', expense.date)::date = date_trunc('month', p_date)::date");
    expect(migration).toContain('expense.date <= p_date');
    expect(migration).toContain("ORDER BY expense.date DESC, expense.created_date DESC, expense.id DESC");
    expect(migration).toContain('LIMIT 1');
    expect(ledger).toContain('money(expense?.monthly_amount) || money(expense?.amount)');
  });

  it('sums only valid variable expense rows on the exact Closing date, independent from fixed expenses', () => {
    expect(migration).toContain('variable_expenses_today');
    expect(migration).toContain("lower(COALESCE(expense.status, 'pending')) NOT IN ('cancelled', 'canceled', 'rejected', 'void', 'voided', 'deleted')");
    expect(migration).toContain("COALESCE(category.is_fixed, false) = true OR lower(COALESCE(category.expense_type, 'variable')) = 'fixed'");
    expect(migration).toContain("'total_daily_expenses', fixed.fixed_expense_today + variable.variable_expenses_today");
  });

  it('keeps purchases separate but includes purchases plus both operating-expense components in Total Daily Expenses and Operating Result', () => {
    expect(workspace).toContain('const operatingExpensesTotal = fixedExpensesToday + variableExpensesToday;');
    expect(workspace).toContain('const totalDailyExpenses = approvedPurchasesTotal + operatingExpensesTotal;');
    expect(workspace).toContain('const operatingResult = totalSales - totalDailyExpenses;');
    expect(workspace).toContain('expenses_total: operatingExpensesTotal');
    expect(workspace).toContain('Expenses &amp; purchases');
    expect(workspace).toContain('value={totalDailyExpenses}');
  });

  it('does not pass accounting purchases or expenses into the physical cash formula, preserving ledger-only Expected Cash and wallet-first settlement', () => {
    const reconciliationCall = workspace.slice(workspace.indexOf('const reconciliation = cashReconciliationSnapshot({'), workspace.indexOf('const branchWalletApplied'));
    expect(reconciliationCall).not.toContain('purchases:');
    expect(reconciliationCall).not.toContain('expenses:');
    expect(ledger).toContain('const expectedCash = money(opening + ledger.cashIn + cashSales - ledger.cashOut);');
    expect(ledger).toContain('walletFirstSettlementAllocation({ requiredFunding: shortage, branchWalletAvailable })');
    expect(workspace).toContain('Funding never changes this result');
  });
});
