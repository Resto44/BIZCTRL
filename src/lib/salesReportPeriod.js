import {
  format, startOfWeek, startOfMonth, startOfYear, subDays, subWeeks, subMonths, subYears,
  differenceInCalendarDays, addDays, endOfMonth,
} from 'date-fns';
import { calculateSalesRevenue, tagExpensesWithCategories } from './helpers';

export const SALES_REPORT_PERIODS = ['today', 'yesterday', 'week', 'month', 'year'];
const dateString = date => format(date, 'yyyy-MM-dd');
const parseDate = value => new Date(`${value}T12:00:00`);
const validNumber = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const validDate = (row, from, to) => !!row?.date && row.date >= from && row.date <= to;
const approved = row => ['approved', 'auto_approved'].includes(row?.approval_status)
  || (!row?.approval_status && ['approved', 'paid', 'partial'].includes(row?.status));
const postedClosing = row => ['finalized', 'locked'].includes(row?.closing_state);
const activeExpense = row => !['cancelled', 'canceled', 'rejected', 'void', 'voided', 'deleted'].includes(String(row?.status || '').toLowerCase());

/** Calendar-aware KSA workweek (Saturday), current periods end today. */
export function salesReportDateRange(period = 'today', today = new Date()) {
  const type = SALES_REPORT_PERIODS.includes(period) ? period : 'today';
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  const yesterday = subDays(now, 1);
  const start = type === 'yesterday' ? yesterday
    : type === 'week' ? startOfWeek(now, {weekStartsOn:6})
    : type === 'month' ? startOfMonth(now)
    : type === 'year' ? startOfYear(now) : now;
  const end = type === 'yesterday' ? yesterday : now;
  const dayCount = differenceInCalendarDays(end, start) + 1;
  const prevStart = type === 'week' ? subWeeks(start, 1)
    : type === 'month' ? subMonths(start, 1)
    : type === 'year' ? subYears(start, 1) : subDays(start, 1);
  const previousStart = dateString(prevStart);
  const previousEnd = dateString(addDays(prevStart, dayCount - 1));
  return {
    type, from: dateString(start), to: dateString(end),
    previousFrom: previousStart, previousTo: previousEnd, dayCount,
  };
}

function closingRevenue(row, revenueSources) {
  return calculateSalesRevenue(row, revenueSources);
}

const purchaseValue = row => {
  const total=Number(row?.total_amount);
  return Number.isFinite(total) && total !== 0 ? total
    : validNumber(row?.qty) * validNumber(row?.used_price ?? row?.current_price);
};

/** Pro-rate the monthly fixed-expense pool once per included calendar day. */
function periodAllocatedFixed(allTaggedExpenses, from, to) {
  let current = parseDate(from), fixed = 0;
  const end = parseDate(to);
  const perMonth = new Map();
  while(current <= end) {
    const month = dateString(current).slice(0,7);
    if(!perMonth.has(month)) {
      const full = allTaggedExpenses.filter(row => row._is_fixed && row.date?.slice(0,7) === month)
        .reduce((sum,row) => sum + validNumber(row.amount),0);
      const monthDays = endOfMonth(current).getDate();
      perMonth.set(month, full / monthDays);
    }
    fixed += perMonth.get(month);
    current = addDays(current, 1);
  }
  return fixed;
}

/** Shared read-only model for screen and downloadable PDF. No cash handovers or
 * sales-source snapshot entries are added back to sales revenue. */
export function buildSalesReportSnapshot({
  sales = [], purchases = [], expenses = [], expenseCategories = [],
  revenueSources = [], from, to, groupBy = 'day',
} = {}) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '') || from>to)
    throw new Error('Valid report date range required');
  const confirmedSales = sales.filter(row => postedClosing(row) && validDate(row,from,to));
  const approvedPurchases = purchases.filter(row => approved(row) && validDate(row,from,to));
  const tagged = tagExpensesWithCategories(expenses.filter(activeExpense), expenseCategories);
  const periodExpenses = tagged.filter(row=>validDate(row,from,to));
  const fixedDeduction = periodAllocatedFixed(tagged,from,to);
  const variableExpenses = periodExpenses.filter(row=>!row._is_fixed).reduce((sum,row)=>sum+validNumber(row.amount),0);
  const totals = confirmedSales.reduce((v,row)=>{
    const r=closingRevenue(row,revenueSources);
    v.sales+=r.total;v.cash+=r.cash;v.network+=r.network;v.credit+=r.credit;v.other+=r.customSources;
    return v;
  },{sales:0,cash:0,network:0,credit:0,other:0});
  const purchaseCost=approvedPurchases.reduce((sum,row)=>sum+purchaseValue(row),0);
  const grossProfit=totals.sales-purchaseCost;
  const totalExpenses=variableExpenses+fixedDeduction;
  const netProfit=grossProfit-totalExpenses;
  const days=differenceInCalendarDays(parseDate(to),parseDate(from))+1;
  const dates=new Map();
  const keyFor=date=>groupBy==='month'?date.slice(0,7):date;
  const create=date=>({date, sales:0,cash:0,network:0,credit:0,other:0,purchases:0,variable:0,fixed:0,grossProfit:0,netProfit:0});
  for(let day=parseDate(from);day<=parseDate(to);day=addDays(day,1)){
    const date=dateString(day),key=keyFor(date);
    if(!dates.has(key)) dates.set(key,create(key));
    const current=dates.get(key);
    current.fixed+=periodAllocatedFixed(tagged,date,date);
  }
  for(const row of confirmedSales){
    const item=dates.get(keyFor(row.date)),r=closingRevenue(row,revenueSources);
    item.sales+=r.total;item.cash+=r.cash;item.network+=r.network;item.credit+=r.credit;item.other+=r.customSources;
  }
  for(const row of approvedPurchases)dates.get(keyFor(row.date)).purchases+=purchaseValue(row);
  for(const row of periodExpenses.filter(e=>!e._is_fixed))dates.get(keyFor(row.date)).variable+=validNumber(row.amount);
  const breakdown=Array.from(dates.values()).map(row=>({
    ...row,grossProfit:row.sales-row.purchases,
    netProfit:row.sales-row.purchases-row.variable-row.fixed,
  }));
  return {
    ...totals,purchases:purchaseCost,grossProfit,netProfit,
    variableExpenses,fixedDeduction,totalExpenses,
    grossMargin:totals.sales ? 100*grossProfit/totals.sales : null,
    netMargin:totals.sales ? 100*netProfit/totals.sales : null,
    averageDailySales:totals.sales/days,days,from,to,
    finalizedClosings:confirmedSales.length,
    breakdown,
  };
}

export function salesReportGrowth(current, previous) {
  return previous?.sales>0 ? 100*(current.sales-previous.sales)/previous.sales : null;
}
