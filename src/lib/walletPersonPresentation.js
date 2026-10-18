/** A displayed cash custody amount is always scoped by currency and method. */
export function readCashCustodyAndPending(snapshot, currency) {
  if (!snapshot || !Array.isArray(snapshot.balances)) return null;
  const cash = snapshot.balances.filter(x=>x.currency===currency&&x.payment_method==='cash');
  const pending = snapshot.balances.filter(x=>x.currency===currency);
  return {
    cash:cash.reduce((sum,x)=>sum+Number(x.held||0),0),
    pending:pending.reduce((sum,x)=>sum+Number(x.pending||0),0),
  };
}
