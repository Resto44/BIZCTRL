// Retain completed work when a later payment fails. A retry must not create a
// second invoice, reapply inventory, or repeat already-confirmed payments.
export async function resumePurchaseSubmission({ state, saveInvoice, payments, savePayment, onInvoiceSaved }) {
  if (!state.invoice) {
    state.invoice = await saveInvoice();
    onInvoiceSaved?.(state.invoice);
  }
  for (const payment of payments) {
    if (state.completedPayments.has(payment._id)) continue;
    await savePayment(state.invoice, payment);
    state.completedPayments.add(payment._id);
  }
  return state.invoice;
}
