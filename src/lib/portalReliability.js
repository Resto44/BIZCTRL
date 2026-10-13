export function portalAccountState(user) {
  if (!user) return 'signed-out';
  const states=[user.status,user.approval_status].map(value=>String(value||'').toLowerCase());
  if(user.is_active===false || states.some(value=>['suspended','rejected','disabled','archived'].includes(value))) return 'blocked';
  return states.includes('pending')?'pending':'ready';
}
export function portalTreasuryMovement(rows) {
  return rows.reduce((result,row)=>{
    const amount=Number(row.amount)||0;
    const signed=row.direction==='out'?-Math.abs(amount):amount;
    if(signed<0)result.outflow-=signed;else result.inflow+=signed;
    result.net+=signed;return result;
  },{inflow:0,outflow:0,net:0});
}
export function supplierInvoiceTotals(rows) {
  return rows.filter(row=>!['rejected','cancelled','canceled','void'].includes(String(row.status).toLowerCase())).reduce((result,row)=>{
    const total=Number(row.total_amount)||0;
    const paid=row.paid_amount==null?(row.status==='paid'?total:0):(Number(row.paid_amount)||0);
    result.invoiced+=total;result.paid+=paid;result.outstanding+=total-paid;return result;
  },{invoiced:0,paid:0,outstanding:0});
}
export async function readAllPortalRows(queryFactory,pageSize=500) {
  const rows=[];
  for(let offset=0;;offset+=pageSize){
    const {data,error}=await queryFactory().range(offset,offset+pageSize-1);
    if(error)throw error;
    const page=data||[];rows.push(...page);
    if(page.length<pageSize)return rows;
  }
}

// Never combine different currencies into a single apparent balance.
export function supplierInvoiceCurrencyTotals(rows) {
  const groups = new Map();
  for (const row of rows) {
    const currency = row.currency || 'Unspecified currency';
    if (!groups.has(currency)) groups.set(currency, []);
    groups.get(currency).push(row);
  }
  return [...groups].map(([currency, invoices]) => ({currency, ...supplierInvoiceTotals(invoices)}));
}
