import { supabase } from '@/api/supabaseClient';

const finiteNonNegative = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
};

export const creditPosition = ({ outstanding = 0, creditLimit = 0 }) => {
  const debt = finiteNonNegative(outstanding);
  const limit = finiteNonNegative(creditLimit);
  return {
    outstanding: debt,
    creditLimit: limit,
    available: Math.max(0, limit - debt),
  };
};

export const afterCreditSale = ({ outstanding = 0, amount = 0 }) =>
  finiteNonNegative(outstanding) + finiteNonNegative(amount);

export const afterDebtPayment = ({ outstanding = 0, amount = 0 }) =>
  Math.max(0, finiteNonNegative(outstanding) - finiteNonNegative(amount));

export const customerCreditRequestId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export async function saveCustomerCreditTransactions({
  restaurantId,
  branchId,
  branch,
  closingId = null,
  requestId = customerCreditRequestId(),
  creditEntries = [],
  payment = null,
}) {
  if (!restaurantId || !branchId || !branch) throw new Error('CUSTOMER_CREDIT_SCOPE_REQUIRED');
  const { data, error } = await supabase.rpc('erp_save_customer_credit_transactions', {
    p_restaurant_id: restaurantId,
    p_branch_id: branchId,
    p_branch: branch,
    p_closing_id: closingId,
    p_request_id: requestId,
    p_credit_entries: creditEntries,
    p_payment: payment,
  });
  if (error) throw error;
  return data;
}
