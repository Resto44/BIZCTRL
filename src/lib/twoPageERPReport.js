import {drawCompleteSalesAnalyticsPdf} from './completeSalesAnalyticsPdf';

// All date buckets contribute to trend totals. Never silently sample away money.
export function aggregateReportTrend(rows = [], limit = 16) {
  if (!rows.length) return [];
  const bucket = Math.max(1, Math.ceil(rows.length / Math.max(1, limit)));
  const output = [];
  for (let i = 0; i < rows.length; i += bucket) {
    const part = rows.slice(i, i + bucket);
    const sum = key => part.reduce((n, r) => n + (Number(r[key]) || 0), 0);
    output.push({
      from: part[0].date, to: part.at(-1).date,
      sales: sum('sales'), purchases: sum('purchases'),
      expenses: sum('variable') + sum('fixed'),fixed:sum('fixed'),variable:sum('variable'),
      closings: sum('closings'),
    });
  }
  return output;
}
export function summarizeReportRows(rows, limit, otherLabel) {
  if (rows.length <= limit) return rows;
  const rest = rows.slice(limit - 1);
  return [...rows.slice(0, limit - 1), {
    name: otherLabel, value: rest.reduce((n, r) => n + (Number(r.value) || 0), 0),
  }];
}
export function aggregateConsumptionEvents(rows = [], limit = 16) {
  const valid = rows.filter(row => row?.date && Number.isFinite(Number(row.events)));
  const bucket = Math.max(1, Math.ceil(valid.length / Math.max(1, limit)));
  const result = [];
  for (let i = 0; i < valid.length; i += bucket) {
    const part = valid.slice(i, i + bucket);
    result.push({
      from: part[0].date, to: part.at(-1).date,
      events: part.reduce((total, r) => total + Number(r.events), 0),
    });
  }
  return result;
}

export const drawTwoPageERPReport = drawCompleteSalesAnalyticsPdf;
