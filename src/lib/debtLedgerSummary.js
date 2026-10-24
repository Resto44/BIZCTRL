import { differenceInCalendarDays, parseISO } from 'date-fns';

const excluded = new Set(['cancelled', 'canceled', 'rejected', 'void', 'voided', 'deleted']);
const status = row => String(row.status || '').toLowerCase();
export const debtMoney = value => Number.isFinite(Number(value)) ? Number(value) : 0;
export const isOpenDebtRecord = row => !excluded.has(status(row))
  && !['paid', 'written_off'].includes(status(row)) && debtMoney(row.remaining_amount) > 0;
export const isOverdueDebtRecord = (row, now = new Date()) => isOpenDebtRecord(row)
  && !!row.due_date && differenceInCalendarDays(now, parseISO(row.due_date)) > 0;

export function buildDebtLedgerSummary(debts, now = new Date()) {
  const open = debts.filter(isOpenDebtRecord);
  const receivables = open.filter(row => row.type === 'receivable');
  const liabilities = open.filter(row => row.type === 'liability');
  const overdue = open.filter(row => isOverdueDebtRecord(row, now));
  const sum = rows => rows.reduce((total, row) => total + debtMoney(row.remaining_amount), 0);
  const aging = { current: 0, '30d': 0, '60d': 0, '90d+': 0 };
  const parties = new Map();
  for (const row of receivables) {
    const days = row.due_date ? differenceInCalendarDays(now, parseISO(row.due_date)) : 0;
    const bucket = !Number.isFinite(days) || days <= 0 ? 'current' : days <= 30 ? '30d' : days <= 60 ? '60d' : '90d+';
    const amount = debtMoney(row.remaining_amount);
    aging[bucket] += amount;
    const id = row.customer_id || row.employee_id || row.driver_id || row.supplier_id;
    const key = id ? `${row.party_type}:${id}` : `legacy:${row.id}`;
    const party = parties.get(key) || { id: key, name: row.party_name || 'Unknown', amount: 0 };
    party.amount += amount;
    parties.set(key, party);
  }
  return {
    totalReceivable: sum(receivables), totalLiability: sum(liabilities), totalOverdue: sum(overdue),
    totalCollected: debts.filter(row => row.type === 'receivable' && !excluded.has(status(row)))
      .reduce((total, row) => total + debtMoney(row.paid_amount), 0),
    aging, topDebtors: [...parties.values()].sort((a, b) => b.amount - a.amount).slice(0, 5), overdue,
  };
}
