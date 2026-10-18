export const partnerDirection = row => ['owner_repay_sponsor','owner_advance_to_sponsor'].includes(row.kind) ? 'incoming' : 'outgoing';
export async function loadPartnerStatement(client, partnerId, signal) {
 const read = async offset => {
  if(signal?.aborted)throw Error('ABORTED');
  const {data,error}=await client.rpc('erp_partner_portal_statement',{p_partner_id:partnerId,p_offset:offset});
  if(error)throw error;
  if(!data||!Array.isArray(data.records)||!Array.isArray(data.balances))throw Error('INVALID_STATEMENT');
  return data;
 };
 const first=await read(0),records=[...first.records];
 while(records.length<first.count){
  const next=await read(records.length);
  if(next.count!==first.count||!next.records.length)throw Error('STATEMENT_CHANGED');
  records.push(...next.records);
 }
 if(records.length!==Number(first.count)||new Set(records.map(r=>r.id)).size!==records.length)throw Error('STATEMENT_CHANGED');
 if(records.length>50){const check=await read(0);if(check.count!==first.count||JSON.stringify(check.balances)!==JSON.stringify(first.balances)||check.records[0]?.id!==first.records[0]?.id)throw Error('STATEMENT_CHANGED');}
 return {...first,records};
}
export function partnerPeriodStart(period, today) {
 if(period==='all')return '';
 const d=new Date(`${today}T12:00:00Z`);
 if(period==='week')d.setUTCDate(d.getUTCDate()-6);
 if(['month','quarter','half','year'].includes(period)){
  d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-({month:0,quarter:2,half:5,year:11}[period]));
 }
 return d.toISOString().slice(0,10);
}
export function filterPartnerRecords(records,{currency,from='',to='',method='all',status='all',search=''}) {
 const needle=search.trim().toLocaleLowerCase();
 return records.filter(r=>r.currency===currency&&(!from||r.effective_date>=from)&&(!to||r.effective_date<=to)&&(method==='all'||r.payment_method===method)&&(status==='all'||(status==='confirmed'?!!r.confirmed_at:!r.confirmed_at))&&(!needle||[r.external_reference,r.notes,r.amount,r.effective_date].some(x=>String(x??'').toLocaleLowerCase().includes(needle))));
}
export function summarizePartnerRecords(records){
 let incoming=0,outgoing=0,pending=0;const methods={cash:0,network:0,other:0};const months=new Map();
 for(const r of records){const cents=Math.round(Number(r.amount)*100),direction=partnerDirection(r);if(direction==='incoming')incoming+=cents;else outgoing+=cents;if(!r.confirmed_at)pending++;
 const method=r.payment_method==='cash'?'cash':r.payment_method==='network'?'network':'other';methods[method]+=cents;
 const month=r.effective_date.slice(0,7);const bucket=months.get(month)||{month,incoming:0,outgoing:0};bucket[direction]+=cents;months.set(month,bucket);
 }
 return {incoming:incoming/100,outgoing:outgoing/100,pending,methods:Object.fromEntries(Object.entries(methods).map(([k,v])=>[k,v/100])),months:[...months.values()].sort((a,b)=>a.month.localeCompare(b.month)).map(b=>({...b,incoming:b.incoming/100,outgoing:b.outgoing/100}))};
}
export function partnerBalanceTrend(records,currency,from='',to='') {
 let owner=0,partner=0;const months=new Map();
 for(const r of [...records].filter(r=>r.currency===currency&&(!to||r.effective_date<=to)).sort((a,b)=>a.effective_date.localeCompare(b.effective_date))){
  const cents=Math.round(Number(r.amount)*100);
  if(r.kind==='sponsor_advance_to_owner')owner+=cents;
  if(r.kind==='owner_repay_sponsor')owner-=cents;
  if(r.kind==='owner_advance_to_sponsor')partner+=cents;
  if(r.kind==='sponsor_repay_owner')partner-=cents;
  if(!from||r.effective_date>=from)months.set(r.effective_date.slice(0,7),{month:r.effective_date.slice(0,7),owner:owner/100,partner:partner/100});
 }
 return [...months.values()];
}
