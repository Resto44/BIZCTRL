import { supabase } from '@/api/supabaseClient';

export function newReceivableRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function createCustomerReceivable({ customerId, branchId, branch, totalAmount, paidAmount = 0, date, dueDate, invoiceNumber, description, notes, requestId = newReceivableRequestId() }) {
  const total = Number(totalAmount);
  const paid = Number(paidAmount || 0);
  if (!customerId || !branchId || !branch || !Number.isFinite(total) || total <= 0 || !Number.isFinite(paid) || paid < 0 || paid > total) {
    const error = new Error('Select an active customer, branch, and valid credit sale amount.');
    error.code = 'CUSTOMER_RECEIVABLE_INVALID';
    throw error;
  }

  const { data, error } = await supabase.rpc('erp_create_customer_receivable', {
    p_payload: {
      customer_id: customerId,
      branch_id: branchId,
      branch,
      total_amount: total,
      paid_amount: paid,
      date: date || null,
      due_date: dueDate || null,
      invoice_number: invoiceNumber || null,
      description: description || null,
      notes: notes || null,
      request_id: requestId,
    },
  });
  if (error) throw error;
  if (!data?.debt) throw new Error('The customer receivable was not created. Please retry using the same request reference.');
  return data;
}

export async function recordCustomerDebtPayment({ debtId, amount, date, paymentMethod, notes, requestId = newReceivableRequestId() }) {
  const numericAmount = Number(amount);
  if (!debtId || !Number.isFinite(numericAmount) || numericAmount <= 0) {
    const error = new Error('Select an open customer debt and enter a valid payment amount.');
    error.code = 'CUSTOMER_DEBT_PAYMENT_INVALID';
    throw error;
  }

  const { data, error } = await supabase.rpc('erp_record_customer_debt_payment', {
    p_payload: {
      debt_id: debtId,
      amount: numericAmount,
      date: date || null,
      payment_method: paymentMethod || 'cash',
      notes: notes || null,
      request_id: requestId,
    },
  });
  if (error) throw error;
  if (!data?.payment) throw new Error('The customer payment was not recorded. Please retry using the same request reference.');
  return data;
}

export function invalidateCustomerReceivableQueries(queryClient) {
  if (!queryClient) return;
  [
    ['canonical_customer_credit_options'],
    ['customers'],
    ['v_customer_summary'],
    ['debt_records'],
    ['debt_records_customers'],
    ['debts_customer'],
    ['debts_customer_dash'],
    ['debt_payments'],
    ['customer_collections'],
    ['customer_collections_daily'],
    ['wallet_transactions'],
  ].forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
}

export const CUSTOMER_DEBT_PAYMENT_MESSAGES = {
  CUSTOMER_RECEIVABLE_INVALID: 'Select an active customer, branch, and valid credit sale amount.',
  CUSTOMER_DEBT_PAYMENT_INVALID: 'Select an open customer debt and enter a valid payment amount.',
  CUSTOMER_DEBT_PAYMENT_SETTLED: 'This debt is already settled and cannot accept another payment.',
  CUSTOMER_DEBT_PAYMENT_EXCEEDS_REMAINING: 'The payment cannot exceed the remaining debt balance.',
  SALES_CLOSING_PERMISSION_DENIED: 'You do not have permission to record a payment for this branch.',
};

export function customerDebtPaymentErrorMessage(error) {
  const technicalMessage = String(error?.message || '');
  const code = Object.keys(CUSTOMER_DEBT_PAYMENT_MESSAGES).find((key) => technicalMessage.includes(key));
  return CUSTOMER_DEBT_PAYMENT_MESSAGES[code] || error?.message || 'The customer payment could not be recorded. Please retry.';
}
