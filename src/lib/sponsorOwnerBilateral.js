/**
 * Bilateral Sponsor/Owner principal is independent of:
 * - Sponsor's custodial receipt of branch POS/network sales;
 * - restaurant revenue, expenses and profit; and
 * - the owner's separate personal spending records.
 */
export const SPONSOR_OWNER_KINDS = Object.freeze({
  sponsor_advance_to_owner: {direction:'in', side:'ownerOwes'},
  owner_repay_sponsor: {direction:'out', side:'ownerOwes'},
  owner_advance_to_sponsor: {direction:'out', side:'sponsorOwes'},
  sponsor_repay_owner: {direction:'in', side:'sponsorOwes'},
});

export function sponsorOwnerSummary(records = [], currency = '') {
  const result = {sponsorLent:0, ownerRepaid:0, ownerLent:0, sponsorRepaid:0,
    ownerOwes:0,sponsorOwes:0,count:0};
  const cents = {sponsorLent:0, ownerRepaid:0, ownerLent:0, sponsorRepaid:0};
  const m = {sponsor_advance_to_owner:'sponsorLent',
    owner_repay_sponsor:'ownerRepaid', owner_advance_to_sponsor:'ownerLent',
    sponsor_repay_owner:'sponsorRepaid'};
  for (const r of records) {
    if(currency && r.currency !== currency) continue;
    const key=m[r.kind];
    const amount=Number(r.amount);
    if(!key || !Number.isFinite(amount) || amount<=0)continue;
    cents[key]+=Math.round(amount*100);
    result.count++;
  }
  for(const k of Object.keys(cents)) result[k]=cents[k]/100;
  result.ownerOwes=(cents.sponsorLent-cents.ownerRepaid)/100;
  result.sponsorOwes=(cents.ownerLent-cents.sponsorRepaid)/100;
  return result;
}

export function validateSponsorOwnerEntry({kind,amount,date,accountId,notes,reference}) {
  const numeric=String(amount??'').trim().replace(/[٠-٩۰-۹]/g,c=>{
    const cp=c.charCodeAt(0);return String(cp>=0x06F0?cp-0x06F0:cp-0x0660);
  });
  if(!SPONSOR_OWNER_KINDS[kind])return 'kind';
  if(!accountId)return 'account';
  if(!/^\d+(?:\.\d{1,2})?$/.test(numeric)||Number(numeric)<=0||Number(numeric)>999999999.99)
    return 'amount';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return 'date';
  const d=new Date(date+'T00:00:00Z');
  const now=new Date();
  const localToday=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),
    String(now.getDate()).padStart(2,'0')].join('-');
  if(Number.isNaN(d.valueOf())||d.toISOString().slice(0,10)!==date
      ||date>localToday)return 'date';
  if(String(notes||'').length>1000 || String(reference||'').length>120)return 'notes';
  return null;
}

export async function readSponsorOwnerRows(db,restaurantId,{pageSize=500,maxPages=200}={}) {
  if(!restaurantId)throw Error('RESTAURANT_REQUIRED');
  const rows=[];
  for(let p=0;p<maxPages;p++){
    const {data,error}=await db.from('sponsor_owner_transactions').select('*')
      .eq('restaurant_id',restaurantId).order('effective_date',{ascending:false})
      .order('id',{ascending:false})
      .range(p*pageSize,(p+1)*pageSize-1);
    if(error)throw error;
    rows.push(...(data||[]));
    if((data||[]).length<pageSize)return rows;
  }
  throw Error('INCOMPLETE_SPONSOR_OWNER_LEDGER');
}

export function sponsorOwnerError(error,labels) {
  const s=String(error?.message||'');
  if(s.includes('ERP_SPONSOR_OWNER_REPAY_EXCEEDS_DUE')) return labels.excess;
  if(s.includes('ERP_SPONSOR_OWNER_INSUFFICIENT_TREASURY'))return labels.funds;
  if(s.includes('ERP_SPONSOR_OWNER_ACCOUNT_INVALID')||s.includes('ERP_SPONSOR_OWNER_WALLET_INVALID'))return labels.accountInvalid;
  if(s.includes('ERP_SPONSOR_OWNER_OWNER_ONLY')||error?.code==='42501')return labels.permission;
  if(s.includes('ERP_SPONSOR_OWNER_IDEMPOTENCY_CONFLICT'))return labels.duplicate;
  return labels.saveFailed;
}
