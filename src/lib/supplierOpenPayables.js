/**
 * Current, posted supplier payables: use the saved invoice totals, never a
 * client-side cached balance or another supplier's credit.
 * Payment eligibility is narrower than visibility: the atomic RPC also
 * verifies branch, supplier, approval and payment reconciliation under lock.
 */
export function supplierOutstandingAmount(invoice = {}) {
  const status = String(invoice.status || '').toLowerCase();
  if (['draft', 'paid', 'cancelled', 'canceled', 'void', 'voided', 'rejected'].includes(status)) return 0;
  const approved = ['approved', 'auto_approved'].includes(String(invoice.approval_status || '').toLowerCase())
    || ['approved', 'partial'].includes(status);
  if (!approved) return 0;
  const total = Number(invoice.total_amount);
  const paid = Number(invoice.paid_amount ?? invoice.amount_paid ?? 0);
  if (!Number.isFinite(total) || !Number.isFinite(paid) || total <= 0 || paid < 0) return 0;
  return Math.max(0, Math.round(total * 100) - Math.round(paid * 100)) / 100;
}

export const isOpenSupplierPayable = invoice => supplierOutstandingAmount(invoice) > 0;

export function canPaySupplierInvoice(invoice) {
  return isOpenSupplierPayable(invoice) && Boolean(
    invoice?.id && invoice?.supplier_id && invoice?.restaurant_id && invoice?.branch_id
  ) && !['pending', 'draft', 'rejected'].includes(String(invoice.approval_status || '').toLowerCase());
}
