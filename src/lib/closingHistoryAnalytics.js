import { dailySalesProfitSummary } from './dailySalesPresentation';

export function closingRevenue(row) {
  const values = [row.restaurant_cash ?? row.cash ?? 0, row.restaurant_network ?? row.network ?? 0, row.credit ?? 0, row.custom_sources_total ?? 0].map(Number);
  if (values.some(value => !Number.isFinite(value) || value < 0)) return null;
  return values.reduce((sum, value) => sum + Math.round(value * 100), 0) / 100;
}
const scopeKey = row => {
  const branch = row.branch_id ? `id:${row.branch_id}` : row.branch ? `key:${row.branch}` : null;
  const operator = row.cashier_id || row.cashier_employee_id || row.manager_user_id;
  return row.restaurant_id && branch && row.shift && operator
    ? JSON.stringify([row.restaurant_id, branch, row.shift, operator]) : null;
};

// Compare finalized Closing *sessions*, not unique calendar dates. Multiple
// audited sessions in the same shift/day are valid and must be included once.
// Refuse to invent an order for truly ambiguous legacy same-day records.
export function buildClosingTrendIndex(records) {
  const groups = new Map();
  for (const row of records) {
    const key = scopeKey(row);
    if (!key || !row.id || !/^\d{4}-\d{2}-\d{2}$/.test(row.date || '')
      || (row.closing_state || 'finalized') !== 'finalized'
      || closingRevenue(row) === null) continue;
    if (!groups.has(key)) groups.set(key, new Map());
    const rows = groups.get(key);
    rows.set(row.id, row); // Never count a re-fetched row twice.
  }
  const index = new Map();
  const sessionNo = row => {
    const number = Number(row.closing_session_no);
    return Number.isInteger(number) && number > 0 ? number : null;
  };
  const closeStamp = row => {
    const value = row.finalized_at || row.session_closed_at;
    return value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
  };
  for (const group of groups.values()) {
    const byDate = new Map();
    for (const row of group.values()) {
      if (!byDate.has(row.date)) byDate.set(row.date, []);
      byDate.get(row.date).push(row);
    }
    const chronological = [];
    for (const date of [...byDate.keys()].sort()) {
      const sameDay = byDate.get(date);
      if (sameDay.length === 1) {
        chronological.push(sameDay[0]);
        continue;
      }
      const sessions = sameDay.map(sessionNo);
      const stamps = sameDay.map(closeStamp);
      if (sessions.every(n => n !== null) && new Set(sessions).size === sameDay.length) {
        chronological.push(...sameDay.sort((a,b) => sessionNo(a)-sessionNo(b)));
      } else if (stamps.every(n => n !== null) && new Set(stamps).size === sameDay.length) {
        chronological.push(...sameDay.sort((a,b) => closeStamp(a)-closeStamp(b)));
      }
      // A legacy group with no trustworthy session order stays excluded.
    }
    chronological.forEach((row,i) => {
      const points = chronological.slice(Math.max(0,i-6),i+1).map(item => ({
        date:item.date,value:closingRevenue(item),
        ...(sessionNo(item)!==null ? {session:sessionNo(item)} : {})
      }));
      const previous=points.at(-2)||null, current=closingRevenue(row);
      index.set(row.id,{
        points,previous,
        change: previous?.value > 0 ? (current-previous.value)/previous.value*100 : null
      });
    });
  }
  return index;
}

export function closingFinancialAnalysis(row) {
  const sales = closingRevenue(row);
  const profit = dailySalesProfitSummary(row);
  if (sales === null) { profit.grossProfit = null; profit.netProfit = null; }
  const margin = sales > 0 && !profit.costsMissing && !profit.noRecordedCosts ? profit.netProfit / sales * 100 : null;
  const allocation = sales > 0 && !profit.costsMissing && !profit.noRecordedCosts && profit.purchases >= 0 && profit.operatingExpenses >= 0 && profit.netProfit >= 0
    ? [profit.purchases, profit.operatingExpenses, profit.netProfit].map(value => value / sales * 100) : null;
  return { sales, ...profit, margin, allocation };
}
