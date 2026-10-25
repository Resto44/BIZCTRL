import {addDays, format, parseISO} from 'date-fns';

export const isReportFixedCategory = category => category?.is_fixed === true
  || String(category?.expense_type || '').toLowerCase() === 'fixed';
const active = row => !['cancelled','canceled','rejected','void','voided','deleted'].includes(String(row.status || '').toLowerCase());
const amount = value => Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);
const cents = value => Math.round((value + Number.EPSILON) * 100) / 100;

/** Read-only allocation, matching erp_sales_closing_expense_context.
 * Inputs must already be tenant/branch scoped. Configured amounts replace monthly
 * source records; latest eligible source per branch/category wins, never both.
 */
export function allocateReportExpenses(expenses = [], categories = [], from, to) {
  const categoryMap = new Map(categories.map(c => [String(c.id), c]));
  const rows = expenses.filter(active).map(e => ({...e,
    _category: categoryMap.get(String(e.expense_category_id || e.category_id)),
  }));
  const fixedCategories = categories.filter(c => c.is_active !== false && isReportFixedCategory(c));
  const daily = new Map(), groups = new Map();
  const add = (date, name, value, fixed) => {
    daily.get(date)[fixed ? 'fixed' : 'variable'] += value;
    groups.set(name, (groups.get(name) || 0) + value);
  };
  // Iterate at noon so a timezone transition at midnight cannot skip a business date.
  const start = parseISO(`${from}T12:00:00`);
  const end = parseISO(`${to}T12:00:00`);
  for (let day = start; day <= end; day = addDays(day, 1)) {
    const date = format(day, 'yyyy-MM-dd');
    daily.set(date, {date, fixed: 0, variable: 0});
    for (const category of fixedCategories) {
      const eligible = rows.filter(e => e._category?.id === category.id && e.date <= date
        && e.date?.slice(0, 7) === date.slice(0, 7));
      const branchSources = new Map();
      for (const row of eligible) {
        const key = row.branch_id || row.branch_key || row.branch || 'legacy';
        const prev = branchSources.get(key);
        const order = r => `${r.date}|${r.created_date || ''}|${r.id || ''}`;
        if (!prev || order(row) > order(prev)) branchSources.set(key, row);
      }
      const configured = amount(category.monthly_amount);
      // Branch-owned configuration also works without a monthly Expense record.
      const sources = category.branch_id && configured > 0 ? [{amount: configured}]
        : [...branchSources.values()].map(e => ({amount: configured || amount(e.amount)}));
      const days = Math.max(1, Number(category.allocation_days ?? 30) || 1);
      for (const source of sources) add(date, category.name || 'Other', cents(source.amount / days), true);
    }
    for (const row of rows) {
      if (isReportFixedCategory(row._category)) continue;
      if (row.date === date) add(date, row._category?.name || row.category_name || 'Other', amount(row.amount), false);
    }
  }
  const values = [...daily.values()];
  const fixed = cents(values.reduce((sum, r) => sum + r.fixed, 0));
  const variable = cents(values.reduce((sum, r) => sum + r.variable, 0));
  return {daily, fixed, variable,
    costGroups: [...groups].filter(([,value]) => value !== 0)
      .map(([name,value]) => ({name,value:cents(value)})).sort((a,b) => b.value-a.value),
    hasExpenseSource: rows.some(e => e.date >= from && e.date <= to) || fixed > 0,
  };
}
