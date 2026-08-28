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
    customer_code: customer.customer_code || '',
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

export const receivableTotalsByCustomer = (...receivableGroups) => {
  const totals = new Map();

  receivableGroups.flatMap(asRecordArray).forEach((receivable) => {
    const customerId = receivable?.customer_id;
    if (!customerId || String(receivable?.status || '').toLowerCase() === 'written_off') return;

    const current = totals.get(String(customerId)) || {
      outstanding_balance: 0,
      total_credit_sales: 0,
      total_collected: 0,
    };
    current.outstanding_balance += asNonNegativeAmount(receivable.remaining_amount);
    current.total_credit_sales += asNonNegativeAmount(receivable.total_amount);
    current.total_collected += asNonNegativeAmount(receivable.paid_amount);
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
    };
    const outstandingBalance = asNonNegativeAmount(totals.outstanding_balance);
    const creditLimit = asNonNegativeAmount(customer.credit_limit);

    return {
      ...customer,
      outstanding_balance: outstandingBalance,
      total_credit_sales: asNonNegativeAmount(totals.total_credit_sales),
      total_collected: asNonNegativeAmount(totals.total_collected),
      available_credit: Math.max(0, creditLimit - outstandingBalance),
      credit_status: outstandingBalance > 0 ? 'outstanding' : 'settled',
    };
  });
};

export const loadCanonicalActiveCustomers = async ({ client, restaurantId, branchId, branchKey, search = '', limit = 100 }) => {
  if (!hasCanonicalCustomerScope({ restaurantId, branchId, branchKey }) || !branchId) return [];

  const { data, error } = await client.rpc('erp_list_customer_credit_options', {
    p_restaurant_id: restaurantId,
    p_branch_id: branchId,
    p_search: String(search || '').trim() || null,
    p_limit: Math.min(Math.max(Number(limit) || 100, 1), 100),
  });
  if (error) throw error;
  return mergeCanonicalCustomers(asRecordArray(data)).map((customer) => ({
    ...customer,
    outstanding_balance: asNonNegativeAmount(customer.outstanding_balance),
    total_credit_sales: asNonNegativeAmount(customer.total_credit_sales),
    total_collected: asNonNegativeAmount(customer.total_collected),
    available_credit: asNonNegativeAmount(customer.available_credit),
    credit_status: customer.credit_status || 'settled',
  }));
};

export { asNonNegativeAmount };
