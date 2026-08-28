const asRecordArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

const asNonNegativeAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
};

export const hasCanonicalCustomerScope = ({ restaurantId, branchId, branchKey }) => (
  Boolean(restaurantId && (branchId || branchKey))
);

export const normalizeCanonicalCustomer = (customer) => {
  if (!customer?.id || customer?.is_active !== true) return null;

  const name = String(customer.customer_name || customer.name || '').trim();
  if (!name) return null;

  return {
    ...customer,
    id: customer.id,
    name,
    customer_name: name,
    phone: customer.phone || '',
    credit_limit: asNonNegativeAmount(customer.credit_limit),
    outstanding_balance: asNonNegativeAmount(customer.outstanding_balance),
  };
};

export const mergeCanonicalCustomers = (...customerGroups) => {
  const uniqueCustomers = new Map();

  customerGroups.flatMap(asRecordArray).forEach((customer) => {
    const normalized = normalizeCanonicalCustomer(customer);
    if (normalized && !uniqueCustomers.has(String(normalized.id))) {
      uniqueCustomers.set(String(normalized.id), normalized);
    }
  });

  return [...uniqueCustomers.values()].sort((left, right) => left.name.localeCompare(right.name));
};

/**
 * Customer Master is the identity and limit source. Receivable rows are the
 * sole source for outstanding debt and collection totals. Invalid legacy rows
 * without a canonical customer_id are intentionally excluded here: associating
 * them by display name at read-time could attach one customer's debt to another.
 */
export const receivableTotalsByCustomer = (...receivableGroups) => {
  const totals = new Map();

  receivableGroups.flatMap(asRecordArray).forEach((receivable) => {
    const customerId = receivable?.customer_id;
    if (!customerId || String(receivable?.status || '').toLowerCase() === 'written_off') return;

    const current = totals.get(String(customerId)) || {
      outstanding_balance: 0,
      total_credit_sales: 0,
      total_collected: 0,
      has_open_receivable: false,
      has_partial_receivable: false,
      open_receivables: [],
    };
    const remainingAmount = asNonNegativeAmount(receivable.remaining_amount);
    const paidAmount = asNonNegativeAmount(receivable.paid_amount);
    current.outstanding_balance += remainingAmount;
    current.total_credit_sales += asNonNegativeAmount(receivable.total_amount);
    current.total_collected += paidAmount;
    current.has_open_receivable ||= remainingAmount > 0 && paidAmount === 0;
    current.has_partial_receivable ||= remainingAmount > 0 && paidAmount > 0;
    if (remainingAmount > 0 && receivable.id) {
      current.open_receivables.push({
        id: receivable.id,
        remaining_amount: remainingAmount,
        date: receivable.date || null,
        status: receivable.status || 'open',
      });
    }
    totals.set(String(customerId), current);
  });

  return totals;
};

export const mergeCanonicalCustomersWithReceivables = (customers, receivables) => {
  const receivableTotals = receivableTotalsByCustomer(receivables);

  return mergeCanonicalCustomers(customers).map((customer) => {
    const totals = receivableTotals.get(String(customer.id)) || {
      outstanding_balance: 0,
      total_credit_sales: 0,
      total_collected: 0,
      has_open_receivable: false,
      has_partial_receivable: false,
      open_receivables: [],
    };
    const outstandingBalance = asNonNegativeAmount(totals.outstanding_balance);
    const creditLimit = asNonNegativeAmount(customer.credit_limit);

    return {
      ...customer,
      // Do not use the legacy Customer Master balance cache for Customer Credit.
      outstanding_balance: outstandingBalance,
      total_credit_sales: asNonNegativeAmount(totals.total_credit_sales),
      total_collected: asNonNegativeAmount(totals.total_collected),
      open_receivables: asRecordArray(totals.open_receivables)
        .sort((left, right) => String(left.date || '').localeCompare(String(right.date || ''))),
      available_credit: Math.max(0, creditLimit - outstandingBalance),
      credit_status: outstandingBalance > 0
        ? (totals.has_partial_receivable ? 'partial' : 'open')
        : (asNonNegativeAmount(totals.total_credit_sales) > 0 ? 'paid' : 'no_debt'),
    };
  });
};

export const customerCreditEntryPatch = (customer) => {
  const canonicalCustomer = normalizeCanonicalCustomer(customer);
  if (!canonicalCustomer) return null;

  const previousCredit = canonicalCustomer.outstanding_balance;
  const creditLimit = canonicalCustomer.credit_limit;

  return {
    customer_id: canonicalCustomer.id,
    customer: canonicalCustomer.name,
    customer_name_snapshot: canonicalCustomer.name,
    customer_phone: canonicalCustomer.phone,
    previous_credit: previousCredit,
    current_debt: previousCredit,
    credit_limit: creditLimit,
    available_credit: Math.max(0, creditLimit - previousCredit),
    manager_override: false,
  };
};

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

export const loadCanonicalActiveCustomers = async ({ client, restaurantId, branchId, branchKey }) => {
  if (!hasCanonicalCustomerScope({ restaurantId, branchId, branchKey })) return [];

  const customerBaseQuery = () => client
    .from('customers')
    .select('id, name, customer_name:name, phone, credit_limit, branch, branch_id, is_active')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
    .order('name')
    .limit(500);
  const receivableBaseQuery = () => client
    .from('debt_records')
    .select('id, customer_id, total_amount, paid_amount, remaining_amount, status, branch, branch_id')
    .eq('restaurant_id', restaurantId)
    .eq('party_type', 'customer')
    .eq('type', 'receivable')
    .limit(1000);

  const customerQueries = scopedBranchQueries({ branchId, branchKey, makeBaseQuery: customerBaseQuery });
  const receivableQueries = scopedBranchQueries({ branchId, branchKey, makeBaseQuery: receivableBaseQuery });
  const results = await Promise.all([...customerQueries, ...receivableQueries]);
  const failed = results.find((result) => result?.error);
  if (failed?.error) throw failed.error;

  const customerResults = results.slice(0, customerQueries.length);
  const receivableResults = results.slice(customerQueries.length);
  return mergeCanonicalCustomersWithReceivables(
    customerResults.flatMap((result) => asRecordArray(result?.data)),
    receivableResults.flatMap((result) => asRecordArray(result?.data)),
  );
};

export { asNonNegativeAmount };
