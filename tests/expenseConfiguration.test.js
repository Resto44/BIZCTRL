import { describe, it, expect, vi } from 'vitest';
import { expenseAllocationFields, isReportFixedCategory, invalidateExpenseClosingContext } from '../src/lib/expenseConfiguration';
import { allocateReportExpenses } from '../src/lib/reportExpenseAllocation';
describe('expense type and closing allocation', () => {
  it('requires an explicit type and never infers it from a category name', () => {
    expect(() => expenseAllocationFields({ is_fixed: null }, 'branch')).toThrow();
    expect(isReportFixedCategory({ name: 'مصارف ثابت ماهانه', is_fixed: false, expense_type: 'variable' })).toBe(false);
    expect(isReportFixedCategory({ is_fixed: false, expense_type: 'fixed' })).toBe(true);
  });
  it('requires branch ownership for configured monthly amounts and validates days', () => {
    expect(() => expenseAllocationFields({ is_fixed: true, monthly_amount: 650 }, null)).toThrow();
    expect(() => expenseAllocationFields({ is_fixed: true, allocation_days: 0 }, 'branch')).toThrow();
    expect(expenseAllocationFields({ is_fixed: true, monthly_amount: '650', allocation_days: '30' }, 'branch')).toMatchObject({ monthly_amount: 650, allocation_days: 30, expense_type: 'fixed' });
  });
  it('excludes expenses on other dates and allocates a configured fixed cost exactly once', () => {
    const categories = [{id:'rent',is_fixed:true,branch_id:'b',monthly_amount:650,allocation_days:30},{id:'electricity',is_fixed:false}];
    const expenses = [{category_id:'rent',branch_id:'b',date:'2026-10-15',amount:650},{category_id:'electricity',branch_id:'b',date:'2026-10-30',amount:345}];
    expect(allocateReportExpenses(expenses,categories,'2026-10-24','2026-10-24')).toMatchObject({fixed:21.67,variable:0});
    expect(allocateReportExpenses(expenses,categories,'2026-10-30','2026-10-30')).toMatchObject({fixed:21.67,variable:345});
  });
  it('refreshes the closing expense context after an expense or category changes', () => {
    const client={invalidateQueries:vi.fn()}; invalidateExpenseClosingContext(client);
    expect(client.invalidateQueries).toHaveBeenCalledWith({queryKey:['sales-closing-cash-ledger-context']});
  });
});
