export function customerCreditSnapshot({ previousCredit = 0, creditLimit = 0, todayCredit = 0 } = {}) {
  const previous = Math.max(0, Number(previousCredit) || 0);
  const limit = Math.max(0, Number(creditLimit) || 0);
  const today = Math.max(0, Number(todayCredit) || 0);
  const available = Math.max(0, limit - previous);
  const newBalance = previous + today;
  const remaining = limit - newBalance;
  const exceededBy = Math.max(0, today - available);

  return {
    previousCredit: previous,
    creditLimit: limit,
    availableCredit: available,
    todayCredit: today,
    newCreditBalance: newBalance,
    remainingCreditLimit: remaining,
    exceededBy,
    limitExceeded: today > available,
  };
}

export function creditEntryRequiresCustomer(entry = {}) {
  return (Number(entry.amount ?? entry.today_credit) || 0) > 0 && !entry.customer_id;
}
