import { format } from 'date-fns';

// Personal withdrawals are money taken FROM the business and received BY the
// owner. They do not represent a personal expense or operating P&L expense.
export function ownerFinanceSummary(records = []) {
  const totals = { income: 0, expense: 0, withdrawal: 0, count: 0 };
  records.forEach((r) => {
    const type = r?.record_type || r?.type;
    const amount = Number(r?.amount);
    if (!Object.prototype.hasOwnProperty.call(totals, type) || !Number.isFinite(amount) || amount < 0) return;
    totals[type] += amount;
    totals.count += 1;
  });
  return {
    ...totals,
    inflow: totals.income + totals.withdrawal,
    netFlow: totals.income + totals.withdrawal - totals.expense,
  };
}

export function ownerFinancePeriodBounds(period, today = new Date()) {
  const y = today.getFullYear();
  const m = today.getMonth();
  const start = (year, month, date = 1) => format(new Date(year, month, date), 'yyyy-MM-dd');
  const end = start(y, m, today.getDate());
  switch (period) {
    case 'today': return { from: end, to: end };
    case 'month': return { from: start(y, m), to: end };
    case 'previous': return { from: start(y, m - 1), to: start(y, m, 0) };
    case '3m': return { from: start(y, m - 2), to: end };
    case '6m': return { from: start(y, m - 5), to: end };
    case 'year': return { from: start(y, 0), to: end };
    case 'all': return { from: '', to: '' };
    default: return { from: start(y, m), to: end };
  }
}

export function filterOwnerFinance(records, { period = 'month', type = 'all', search = '' } = {}, today = new Date()) {
  const { from, to } = ownerFinancePeriodBounds(period, today);
  const q = search.trim().toLocaleLowerCase();
  return records.filter((r) => {
    const rowType = r.record_type || r.type;
    if (type !== 'all' && rowType !== type) return false;
    if (!r.date || (from && r.date < from) || (to && r.date > to)) return false;
    if (!q) return true;
    return [r.notes, r.description, r.source, r.category, r.wallet_source, r.payment_method]
      .some((value) => String(value || '').toLocaleLowerCase().includes(q));
  });
}

export function ownerFinanceTrend(records, today = new Date(), months = 6) {
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() - (months - i - 1), 1);
    const key = format(d, 'yyyy-MM');
    const sums = ownerFinanceSummary(records.filter((r) => r.date?.startsWith(key)));
    return { key, label: format(d, 'MMM yy'),
      Income: sums.income, Withdrawals: sums.withdrawal,
      Expenses: sums.expense, Net: sums.netFlow };
  });
}

export function ownerFinanceCategories(records) {
  const totals = new Map();
  records.filter((r) => (r.record_type || r.type) === 'expense')
    .forEach((r) => {
      const key = r.category || 'miscellaneous';
      totals.set(key, (totals.get(key) || 0) + Number(r.amount || 0));
    });
  return [...totals].map(([key, amount]) => ({ key, amount }))
    .sort((a, b) => b.amount - a.amount);
}

// Input validation is shared by the form and regression tests.
export function parseOwnerFinanceAmount(input) {
  const s = String(input ?? '').trim().replace(/[٠-٩۰-۹]/g, (c) => {
    const cp = c.charCodeAt(0);
    return String(cp >= 0x06F0 ? cp - 0x06F0 : cp - 0x0660);
  });
  if (!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 && n <= 999999999.99 ? n : null;
}

export function isRealFinanceDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return false;
  const d = new Date(date + 'T00:00:00Z');
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === date;
}

export function ownerWithdrawalIntegrity(records, walletDebits = []) {
  const byReference = new Map();
  for (const tx of walletDebits) {
    const ref = String(tx.reference_id || '');
    if (!ref.startsWith('owner_personal_finance:')) continue;
    byReference.set(ref, [...(byReference.get(ref) || []), tx]);
  }
  return records.filter((r) => (r.record_type || r.type) === 'withdrawal').map((r) => {
    const matching = byReference.get('owner_personal_finance:' + r.id) || [];
    const valid = matching.length === 1 && matching[0].direction === 'out'
      && matching[0].transaction_type === 'owner_personal_withdrawal'
      && matching[0].wallet === r.wallet_source
      && Boolean(matching[0].account_id)
      && Number(matching[0].amount) === Number(r.amount);
    return { id: r.id, status: valid ? 'matched' : (matching.length === 0 ? 'missing' : 'mismatch') };
  });
}

// Explicit pagination: do not silently report a 1,000-row limit as an ERP total.
export async function readCompleteOwnerFinance(db, restaurantId, email, { pageSize = 500, maxRows = 50000 } = {}) {
  if (!restaurantId || !email) throw new Error('Owner restaurant/email required');
  const rows = [];
  for (let start = 0; start < maxRows; start += pageSize) {
    const { data, error } = await db.from('owner_personal_finance').select('*')
      .eq('restaurant_id', restaurantId).eq('created_by', email)
      .order('date', { ascending: false }).order('id', { ascending: true })
      .range(start, start + pageSize - 1);
    if (error) throw error;
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < pageSize) return rows;
  }
  throw new Error('OWNER_FINANCE_READ_LIMIT_EXCEEDED');
}

export async function readCompleteOwnerWithdrawalDebits(db, restaurantId, { pageSize = 500, maxRows = 50000 } = {}) {
  const rows = [];
  for (let start = 0; start < maxRows; start += pageSize) {
    const { data, error } = await db.from('wallet_transactions')
      .select('id,reference_id,direction,transaction_type,wallet,account_id,amount')
      .eq('restaurant_id', restaurantId).eq('transaction_type', 'owner_personal_withdrawal')
      .like('reference_id', 'owner_personal_finance:%')
      .order('id', { ascending: true }).range(start, start + pageSize - 1);
    if (error) throw error;
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < pageSize) return rows;
  }
  throw new Error('OWNER_FINANCE_LEDGER_READ_LIMIT_EXCEEDED');
}

export function ownerFinanceCsvCell(value) {
  let str = String(value ?? '').replaceAll('"', '""');
  // Block spreadsheet formula execution in downloaded reports.
  if (/^[\s\x00-\x1f]*[=+@\-]/.test(str)) str = "'" + str;
  return '"' + str + '"';
}

export function buildOwnerFinanceCsv(records, columns) {
  return '\uFEFF' + [columns.map((c) => ownerFinanceCsvCell(c.label)).join(','),
    ...records.map((r) => columns.map((c) => ownerFinanceCsvCell(c.get(r))).join(','))].join('\r\n');
}
