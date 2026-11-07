import { isReportFixedCategory } from './expenseConfiguration';

/** Totals cover only the selected Riyadh calendar month, never all-time expense history.
 * Configured monthly fixed budgets are shown separately: they are NOT added to
 * recorded expenditure, invoice purchases or COGS. No amount is ever invented.
 */
export function riyadhCurrentMonth(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',
  }).formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return parts.year+'-'+parts.month;
}
export function expenseMonthModel(expenses=[],categories=[],options={}) {
  const month=options.month||riyadhCurrentMonth();
  const branchId=options.branchId||null;
  const type=options.type||'all';
  const categoryId=options.categoryId||'all';
  const categoryMap=new Map(categories.map(c=>[c.id,c]));
  const excluded=new Set(['cancelled','canceled','rejected','void','voided','deleted']);
  const monthly=(Array.isArray(expenses)?expenses:[])
    .filter(e=>String(e.date||'').slice(0,7)===month
      && !excluded.has(String(e.status||'').toLowerCase()));
  const isFixed=e=>isReportFixedCategory(categoryMap.get(e.expense_category_id||e.category_id));
  const amount=e=>{const v=Number(e.amount);return Number.isFinite(v)&&v>0?v:0;};
  const sum=items=>Math.round(items.reduce((acc,e)=>acc+Math.round(amount(e)*100),0))/100;
  const fixed=monthly.filter(isFixed);
  const variable=monthly.filter(e=>!isFixed(e));
  const visible=monthly.filter(e=>(type==='all'||(type==='fixed'?isFixed(e):!isFixed(e)))
    && (categoryId==='all'||(e.expense_category_id||e.category_id)===categoryId));
  const configuredFixed=categories.filter(c=>c.is_active!==false && isReportFixedCategory(c)
    && Number(c.monthly_amount)>0 && (!c.branch_id||!branchId||c.branch_id===branchId));
  const plannedFixed=Math.round(configuredFixed.reduce((n,c)=>n+Math.round(Number(c.monthly_amount)*100),0))/100;
  return {month,recordedTotal:sum(monthly),recordedFixed:sum(fixed),
    recordedVariable:sum(variable),recordCount:monthly.length,
    fixedCount:fixed.length,variableCount:variable.length,
    configuredFixed:plannedFixed,configuredCategoryCount:configuredFixed.length,
    visible};
}
export function invoiceExpenseLinkInput(selectedExpense, selectedCategoryId = null) {
  if (!selectedExpense) return {
    expense_id:null,expense_category_id:selectedCategoryId||null,
  };
  const categoryId=selectedExpense.expense_category_id||selectedExpense.category_id||null;
  return {expense_id:selectedExpense.id,expense_category_id:categoryId};
}
