/**
 * Accounts payable is never reduced by unrelated supplier credits.
 * Historical overpayments remain on the invoice until reconciled in the
 * supplier ledger; this read-only summary never writes financial records.
 */
export function unpaidSupplierInvoiceAmount(invoice = {}) {
  if (['paid', 'cancelled'].includes(String(invoice.status || '').toLowerCase())) return 0;
  const total = Number(invoice.total_amount);
  const paid = Number(invoice.paid_amount);
  if (!Number.isFinite(total) || !Number.isFinite(paid)) return 0;
  return Math.max(0, Math.round(total * 100) - Math.round(paid * 100)) / 100;
}

export function totalOutstandingSupplierPayables(invoices = []) {
  return invoices.reduce((sum, invoice) => sum + unpaidSupplierInvoiceAmount(invoice), 0);
}

export function totalUnallocatedSupplierOverpayments(invoices = []) {
  return invoices.reduce((sum, invoice) => {
    const total = Number(invoice.total_amount);
    const paid = Number(invoice.paid_amount);
    if (!Number.isFinite(total) || !Number.isFinite(paid)) return sum;
    return sum + Math.max(0, Math.round(paid * 100) - Math.round(total * 100)) / 100;
  }, 0);
}
