import { describe, expect, it } from 'vitest';
import { calculateERPAccounting } from '../src/lib/helpers';
import { buildSalesReportSnapshot } from '../src/lib/salesReportPeriod';

const category = { id: 'rent', branch_id: 'b1', is_fixed: true, monthly_amount: 600, allocation_days: 30 };
function compare(from, to, categories, expenses = []) {
  const dashboard = calculateERPAccounting({ periodFrom: from, asOfDate: to,
    expenseCategories: categories, monthlyExpenses: expenses, periodExpenses: expenses });
  const report = buildSalesReportSnapshot({ from, to, expenseCategories: categories, expenses });
  expect(dashboard.fixedDeduction).toBe(report.fixedDeduction);
  expect(dashboard.totalVariableExpenses).toBe(report.variableExpenses);
  expect(dashboard.netProfit).toBe(report.netProfit);
  return dashboard;
}
describe('owner dashboard and report expense parity', () => {
  it('allocates configured branch costs even before a monthly payment is recorded', () => {
    expect(compare('2026-11-06', '2026-11-06', [category]).fixedDeduction).toBe(20);
  });
  it('does not add configured costs and duplicate monthly source amounts together', () => {
    const expenses = [{ id: 'a', branch_id: 'b1', expense_category_id: 'rent', date: '2026-11-01', amount: 600 },
      { id: 'b', branch_id: 'b1', expense_category_id: 'rent', date: '2026-11-02', amount: 600 }];
    expect(compare('2026-11-01', '2026-11-06', [category], expenses).fixedDeduction).toBe(120);
  });
  it('allocates across month boundaries using configured allocation days', () => {
    expect(compare('2026-10-30', '2026-11-02', [category]).fixedDeduction).toBe(80);
  });
  it('includes each scoped branch configuration once and excludes voided expenses', () => {
    const other = { ...category, id: 'rent2', branch_id: 'b2', monthly_amount: 300 };
    const expenses = [{ id: 'void', date: '2026-11-06', amount: 100, status: 'void' },
      { id: 'active', date: '2026-11-06', amount: 5, status: 'paid' }];
    const all = compare('2026-11-06', '2026-11-06', [category, other], expenses);
    expect(all.fixedDeduction).toBe(30);
    expect(all.totalVariableExpenses).toBe(5);
    expect(compare('2026-11-06', '2026-11-06', [category]).fixedDeduction).toBe(20);
  });
});
