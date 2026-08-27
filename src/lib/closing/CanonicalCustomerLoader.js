const asRecordArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

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
    credit_limit: Number(customer.credit_limit) || 0,
    outstanding_balance: Number(customer.outstanding_balance) || 0,
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

export const loadCanonicalActiveCustomers = async ({ client, restaurantId, branchId, branchKey }) => {
  if (!hasCanonicalCustomerScope({ restaurantId, branchId, branchKey })) return [];

  const baseQuery = () => client
    .from('customers')
    .select('id, name, customer_name:name, phone, credit_limit, outstanding_balance, branch, branch_id, is_active')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
    .order('name')
    .limit(500);

  const queries = [];
  if (branchId) queries.push(baseQuery().eq('branch_id', branchId));
  if (branchKey) {
    queries.push(
      branchId
        ? baseQuery().is('branch_id', null).eq('branch', branchKey)
        : baseQuery().eq('branch', branchKey),
    );
  }

  const results = await Promise.all(queries);
  const failed = results.find((result) => result?.error);
  if (failed?.error) throw failed.error;

  return mergeCanonicalCustomers(...results.map((result) => result?.data));
};
