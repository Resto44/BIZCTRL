import {
  differenceInCalendarDays, format, isValid, parseISO, startOfMonth,
  startOfWeek, startOfYear, subDays, subMonths,
} from 'date-fns';

export const OWNER_DRIVER_PERIODS = ['today','yesterday','week','month','3m','6m','9m','year','custom'];
const day = date => format(date,'yyyy-MM-dd');

export function ownerDriverDateRange(period, now = new Date(), customFrom = '', customTo = '') {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'custom') {
    const start = parseISO(customFrom);
    const end = parseISO(customTo);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(customFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(customTo)
      || !isValid(start) || !isValid(end)
      || day(start) !== customFrom || day(end) !== customTo) return null;
    const days = differenceInCalendarDays(end,start)+1;
    if (days < 1 || days > 371) return null;
    return {from:customFrom,to:customTo,days};
  }
  const starts = {
    today,
    yesterday:subDays(today,1),
    week:startOfWeek(today,{weekStartsOn:1}),
    month:startOfMonth(today),
    '3m':startOfMonth(subMonths(today,2)),
    '6m':startOfMonth(subMonths(today,5)),
    '9m':startOfMonth(subMonths(today,8)),
    year:startOfYear(today),
  };
  const start = starts[period] || today;
  const end = period === 'yesterday' ? subDays(today,1) : today;
  return {from:day(start),to:day(end),days:differenceInCalendarDays(end,start)+1};
}

export function previousOwnerDriverRange(range) {
  if (!range) return null;
  const first = parseISO(range.from);
  return {from:day(subDays(first,range.days)),to:day(subDays(first,1)),days:range.days};
}

export function ownerDriverGrowth(current, previous) {
  const now = Number(current);
  const before = Number(previous);
  if (!Number.isFinite(now) || !Number.isFinite(before) || before === 0) return null;
  return ((now-before)/Math.abs(before))*100;
}

export function ownerDriverReconciliation(summary) {
  const totals=summary?.totals || {};
  return Math.abs(Number(totals.revenue||0)-Number(totals.cash||0)-Number(totals.network||0)) < 0.005;
}
