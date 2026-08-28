import { supabase } from '@/api/supabaseClient';

const asRecordArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

const uniqueById = (records) => Array.from(new Map(
  asRecordArray(records).map((record) => [String(record.id), record]),
).values());

const scopedBranchQueries = ({ branchId, branchKey, makeBaseQuery }) => {
  const queries = [];
  if (branchId) queries.push(makeBaseQuery().eq('branch_id', branchId));
  if (branchKey) {
    queries.push(
      branchId
        ? makeBaseQuery().is('branch_id', null).eq('branch', branchKey)
        : makeBaseQuery().eq('branch', branchKey),
    );
  }
  return queries;
};

async function loadScopedRows({ client, restaurantId, branchId, branchKey, isAllBranches = false, makeBaseQuery }) {
  if (!restaurantId || (!isAllBranches && !branchId && !branchKey)) return [];

  if (isAllBranches) {
    const { data, error } = await makeBaseQuery();
    if (error) throw error;
    return uniqueById(data);
  }

  const results = await Promise.all(scopedBranchQueries({ branchId, branchKey, makeBaseQuery }));
  const failed = results.find((result) => result?.error);
  if (failed?.error) throw failed.error;
  return uniqueById(results.flatMap((result) => asRecordArray(result?.data)));
}

/**
 * The Debts & Receivables screen must read the same tenant- and branch-scoped
 * canonical rows that are mutated by the customer receivable RPCs. Legacy rows
 * are included only when their UUID branch_id is null and their legacy branch
 * key matches the active branch; they are never read from another branch.
 */
export async function loadScopedCustomerMaster({ client = supabase, restaurantId, branchId, branchKey, isAllBranches = false }) {
  return loadScopedRows({
    client,
    restaurantId,
    branchId,
    branchKey,
    isAllBranches,
    makeBaseQuery: () => client
      .from('customers')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('name')
      .limit(500),
  });
}

export async function loadScopedDebtRecords({ client = supabase, restaurantId, branchId, branchKey, isAllBranches = false }) {
  return loadScopedRows({
    client,
    restaurantId,
    branchId,
    branchKey,
    isAllBranches,
    makeBaseQuery: () => client
      .from('debt_records')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('date', { ascending: false })
      .limit(500),
  });
}

export async function loadScopedDebtPayments({ client = supabase, restaurantId, branchId, branchKey, isAllBranches = false }) {
  return loadScopedRows({
    client,
    restaurantId,
    branchId,
    branchKey,
    isAllBranches,
    makeBaseQuery: () => client
      .from('debt_payments')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('date', { ascending: false })
      .limit(500),
  });
}

export async function loadScopedCustomerCollections({ client = supabase, restaurantId, branchId, branchKey, isAllBranches = false, date = null }) {
  return loadScopedRows({
    client,
    restaurantId,
    branchId,
    branchKey,
    isAllBranches,
    makeBaseQuery: () => {
      let query = client
        .from('customer_collections')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('date', { ascending: false })
        .limit(500);
      if (date) query = query.eq('date', date);
      return query;
    },
  });
}

export function newReceivableRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function createCustomerReceivable({ restaurantId, customerId, branchId, branch, totalAmount, paidAmount = 0, date, dueDate, invoiceNumber, description, notes, requestId = newReceivableRequestId() }) {
  const total = Number(totalAmount);
  const paid = Number(paidAmount || 0);
  if (!restaurantId || !customerId || !branchId || !branch || !Number.isFinite(total) || total <= 0 || !Number.isFinite(paid) || paid < 0 || paid > total) {
    const error = new Error('Select an active customer, branch, and valid credit sale amount.');
    error.code = 'CUSTOMER_RECEIVABLE_INVALID';
    throw error;
  }

  const { data, error } = await supabase.rpc('erp_create_customer_receivable', {
    p_payload: {
      restaurant_id: restaurantId,
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
    // Kept during the query-key migration so open legacy Sales tabs refresh too.
    ['customers_form'],
    ['customers'],
    ['v_customer_summary'],
    ['debt_records'],
    ['debt_records_customers'],
    ['debts'],
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
  SALES_CLOSING_CREDIT_CUSTOMER_SCOPE_INVALID: 'The selected customer is not active in the current restaurant and branch.',
  SALES_CLOSING_CREDIT_CUSTOMER_DUPLICATE: 'A customer can appear only once in a sales closing credit entry.',
};

export function customerDebtPaymentErrorMessage(error) {
  const technicalMessage = String(error?.message || '');
  const code = Object.keys(CUSTOMER_DEBT_PAYMENT_MESSAGES).find((key) => technicalMessage.includes(key));
  return CUSTOMER_DEBT_PAYMENT_MESSAGES[code] || error?.message || 'The customer payment could not be recorded. Please retry.';
}
