import { isReportFixedCategory } from './reportExpenseAllocation';
export { isReportFixedCategory };

export function expenseAllocationFields(form, branchId) {
  if (typeof form.is_fixed !== 'boolean') throw new Error('Select an expense type explicitly.');
  const monthly = Number(form.monthly_amount ?? 0);
  const days = Number(form.allocation_days ?? 30);
  if (!Number.isFinite(monthly) || monthly < 0 || !Number.isInteger(days) || days < 1 || days > 366) {
    throw new Error('Enter a valid monthly amount and allocation days (1–366).');
  }
  if (form.is_fixed && monthly > 0 && !branchId) throw new Error('A monthly allocation must belong to a specific branch.');
  return { is_fixed: form.is_fixed, expense_type: form.is_fixed ? 'fixed' : 'variable',
    monthly_amount: form.is_fixed ? monthly : 0, allocation_days: days };
}

export function invalidateExpenseClosingContext(client) {
  return client.invalidateQueries({ queryKey: ['sales-closing-cash-ledger-context'] });
}
