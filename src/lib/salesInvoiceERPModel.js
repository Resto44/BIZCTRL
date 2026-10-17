/**
 * Presentation-only snapshot for a posted Sales Invoice.
 * Never recompute canonical revenue from cash drawer balances.
 */
import { treasuryBranchDisplayName } from './treasuryBranchDisplay';

const numeric = value => value === null || value === undefined || value === '' ? null :
  Number.isFinite(Number(value)) ? Number(value) : null;
const cents = value => Math.round(Number(value || 0) * 100);

export function salesInvoiceERPModel(invoice = {}, { branches = [], lang = 'en' } = {}) {
  const cash = numeric(invoice.cash_sales);
  const network = numeric(invoice.network_sales);
  const credit = numeric(invoice.credit_sales);
  const other = numeric(invoice.other_sales) ?? 0;
  const total = numeric(invoice.sales_total);
  const values = [
    { key: 'cash', amount: cash },
    { key: 'network', amount: network },
    { key: 'credit', amount: credit },
    { key: 'other', amount: other },
  ];
  const knownTotalCents = values.reduce((sum, v) => sum + cents(v.amount), 0);
  const unknownSourceCount = values.filter(v => v.amount === null).length;
  const varianceCents = total === null ? null : cents(total) - knownTotalCents;
  const balanced = varianceCents === 0 && unknownSourceCount === 0;
  const sources = values.filter(v => v.key !== 'other' || v.amount !== 0).map(v => ({
    ...v,
    percent: total > 0 && v.amount !== null ? 100 * v.amount / total : null,
  }));
  const branchName = treasuryBranchDisplayName(
    { branch: invoice.branch, branch_id: invoice.branch_id },
    branches, lang,
  );
  const sourceStatus = unknownSourceCount > 0
    ? 'incomplete' : balanced ? 'matched' : 'mismatch';

  // Recorded cash variances cannot be verified against an expected cash value
  // from this table. Treat the saved amount/status as separate ledger facts.
  return {
    number: String(invoice.invoice_number || '—'),
    date: String(invoice.sale_date || '—'),
    cashier: String(invoice.cashier_name || '—'),
    shift: String(invoice.shift || '—'),
    branch: branchName || String(invoice.branch || '—'),
    total, sources, sourceStatus,
    sourceGap: varianceCents === null ? null : varianceCents / 100,
    sourceKnownTotal: knownTotalCents / 100,
    openingCash: numeric(invoice.opening_cash),
    closingCash: numeric(invoice.closing_cash),
    cashDifference: numeric(invoice.cash_difference),
    cashStatus: invoice.cash_status || '—',
    generatedAt: new Date(),
  };
}

export function invoicePercentLabel(value) {
  if (value === null || !Number.isFinite(value)) return '—';
  return value.toFixed(1) + '%';
}
