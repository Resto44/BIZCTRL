// Payment rows are cash evidence; paid_amount is a reconciliation check, never
// a second payment event. No historical corrections are invented by this model.
const excluded = new Set(['draft', 'cancelled', 'canceled', 'void', 'rejected']);
const cents = value => Math.round(Number(value || 0) * 100);
const money = value => value / 100;
export function ledgerDate(value) {
  const day = String(value || '').slice(0, 10);
  const parsed = new Date(`${day}T12:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === day ? day : '';
}
export function ledgerCurrency(value) {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : 'UNKNOWN';
}
export function matchesLedgerBranch(row, branch) {
  if (!branch) return true;
  if (row.branch_id) return row.branch_id === branch.id;
  return Boolean(row.branch) && [branch.key, branch.branch_key, branch.id].filter(Boolean).includes(row.branch);
}
export function buildSupplierLedger({invoices = [], payments = [], branch = null, supplierId = 'all', start = '', end = '9999-12-31'}) {
  const issues = [];
  const unique = (rows, type) => {
    const seen = new Set();
    return rows.filter(row => {
      if (!row.id || seen.has(row.id)) { issues.push({type:'duplicate_or_missing_id', ref:row.id, source:type}); return false; }
      seen.add(row.id); return true;
    });
  };
  const invoiceRows = unique(invoices, 'invoice');
  const invoiceMap = new Map(invoiceRows.map(row => [row.id, row]));
  const inScope = row => matchesLedgerBranch(row, branch) && (supplierId === 'all' || row.supplier_id === supplierId);
  const eligible = row => !excluded.has(String(row.status || '').toLowerCase()) && !excluded.has(String(row.approval_status || '').toLowerCase()) && row.approval_status !== 'pending';
  const events = [];
  const linkedPaid = new Map();
  for (const payment of unique(payments, 'payment')) {
    const invoice = invoiceMap.get(payment.invoice_id);
    const row = {...payment, supplier_id:payment.supplier_id || invoice?.supplier_id, supplier_name:payment.supplier_name || invoice?.supplier_name};
    if (!inScope(row)) continue;
    const date = ledgerDate(row.date);
    if (!date || !Number.isFinite(cents(row.amount)) || cents(row.amount) <= 0) { issues.push({type:'invalid_payment',ref:row.id}); continue; }
    if (date > end) continue;
    const identityMatches = invoice && (!row.supplier_id || row.supplier_id === invoice.supplier_id) && (!row.restaurant_id || row.restaurant_id === invoice.restaurant_id) && (!row.branch_id || !invoice.branch_id || row.branch_id === invoice.branch_id);
    const currency = identityMatches ? ledgerCurrency(invoice.currency) : 'UNKNOWN';
    if (!identityMatches || !eligible(invoice)) issues.push({type:'unmatched_payment',ref:row.id});
    if (currency === 'UNKNOWN') issues.push({type:'unknown_currency',ref:row.id});
    if (identityMatches) linkedPaid.set(invoice.id, (linkedPaid.get(invoice.id) || 0) + cents(row.amount));
    events.push({id:`payment:${row.id}`,date,type:'payment',currency,debit:0,credit:cents(row.amount),ref:row});
  }
  const reconciledInvoices = [];
  const numbers = new Set();
  for (const row of invoiceRows.filter(inScope)) {
    if (!eligible(row)) {
      if (row.approval_status === 'pending' && ledgerDate(row.date) <= end) issues.push({type:'unapproved_invoice',ref:row.id});
      continue;
    }
    const date = ledgerDate(row.date);
    if (!date || !Number.isFinite(cents(row.total_amount)) || cents(row.total_amount) < 0) { issues.push({type:'invalid_invoice',ref:row.id}); continue; }
    if (date > end) continue;
    const currency = ledgerCurrency(row.currency);
    if (currency === 'UNKNOWN') issues.push({type:'unknown_currency',ref:row.id});
    const paid = linkedPaid.get(row.id) || 0;
    // paid_amount is a current snapshot: compare only for an as-of date that
    // includes all linked payments, so historical statements don't flag future payments.
    const hasLaterPayment = payments.some(p => p.invoice_id === row.id && ledgerDate(p.date) > end);
    if (!hasLaterPayment && paid !== cents(row.paid_amount)) issues.push({type:'payment_mismatch',ref:row.id,difference:money(cents(row.paid_amount)-paid)});
    const numberKey = JSON.stringify([row.restaurant_id,row.branch_id || row.branch,row.supplier_id,row.invoice_number]);
    if (row.invoice_number && numbers.has(numberKey)) issues.push({type:'duplicate_invoice_number',ref:row.id});
    numbers.add(numberKey);
    const remaining = cents(row.total_amount) - paid;
    reconciledInvoices.push({...row,currency,ledgerPaid:money(paid),ledgerRemaining:money(remaining),isOverdue:remaining>0 && Boolean(ledgerDate(row.due_date)) && row.due_date < end});
    events.push({id:`invoice:${row.id}`,date,type:'invoice',currency,debit:cents(row.total_amount),credit:0,ref:row});
  }
  events.sort((a,b) => a.date.localeCompare(b.date) || (a.type === b.type ? a.id.localeCompare(b.id) : a.type === 'invoice' ? -1 : 1));
  const groups = new Map();
  for (const event of events) {
    if (!groups.has(event.currency)) groups.set(event.currency,{currency:event.currency,opening:0,invoiced:0,paid:0,closing:0,rows:[],invoices:[],payments:[]});
    const group = groups.get(event.currency);
    group.closing += event.debit-event.credit;
    if (start && event.date < start) {group.opening += event.debit-event.credit;continue;}
    group.invoiced += event.debit; group.paid += event.credit;
    group.rows.push({...event,debit:money(event.debit),credit:money(event.credit),balance:money(group.closing)});
    if (event.type === 'payment') group.payments.push(event.ref);
  }
  for (const group of groups.values()) {
    group.invoices = reconciledInvoices.filter(row => row.currency === group.currency && (!start || row.date >= start));
    group.overdue = reconciledInvoices.filter(row => row.currency === group.currency && row.isOverdue);
    for (const key of ['opening','invoiced','paid','closing']) group[key] = money(group[key]);
  }
  return {groups:[...groups.values()].sort((a,b)=>a.currency.localeCompare(b.currency)),issues};
}
