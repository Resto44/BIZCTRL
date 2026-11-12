/**
 * Supplier-visible goods progress. Purchase invoice goods receipts and purchase
 * orders are distinct workflows: an approved/paid invoice is NOT a delivery.
 * All input invoices are already scoped by the caller to the signed-in supplier,
 * tenant and branch. Match receipts again by supplier and branch as defense in depth.
 */
export function buildSupplierGoodsTimeline(invoices = [], receipts = []) {
  const receiptsByInvoice = new Map();
  for (const receipt of Array.isArray(receipts) ? receipts : []) {
    if (receipt?.invoice_id) receiptsByInvoice.set(String(receipt.invoice_id), receipt);
  }
  return (Array.isArray(invoices) ? invoices : [])
    .filter(invoice => invoice?.id && invoice?.supplier_id && invoice?.branch_id)
    .map(invoice => {
      const candidate = receiptsByInvoice.get(String(invoice.id));
      const receipt = candidate
        && String(candidate.supplier_id) === String(invoice.supplier_id)
        && String(candidate.branch_id) === String(invoice.branch_id)
        ? candidate : null;
      const approved = ['approved', 'auto_approved'].includes(invoice.approval_status)
        && ['approved', 'paid', 'partial', 'unpaid'].includes(invoice.status);
      return {
        invoice,
        receipt,
        stage: receipt ? 'received' : approved ? 'awaiting_owner' : 'pending_approval',
      };
    });
}

export function completedSupplierGoodsHistory(timeline = []) {
  return timeline.filter(entry => entry.stage === 'received' && entry.receipt)
    .sort((a, b) => (Date.parse(b.receipt.confirmed_at) || 0)
      - (Date.parse(a.receipt.confirmed_at) || 0));
}
