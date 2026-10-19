import {partnerDirection} from './partnerAnalytics';

/** Never net a person's loans into the custody of business funds. */
export const walletAccountReference=(uuid)=>{
  const id=String(uuid||'').toLowerCase();
  return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(id)
    ?'WLT-'+id.replaceAll('-','').toUpperCase():'';
};
export const accountRowsUnique=(accounts=[])=>{
  const seenIds=new Set(),seenReferences=new Set(),seenTenants=new Set();
  return accounts.filter(account=>{
    const id=account?.id;
    const ref=account?.account_reference||walletAccountReference(id);
    const tenant=account?.restaurant_id;
    if(!id||!ref||!tenant||seenIds.has(id)||seenReferences.has(ref)||seenTenants.has(tenant))return false;
    seenIds.add(id);seenReferences.add(ref);seenTenants.add(tenant);return true;
  });
};
/**
 * A banking-style activity feed, explicitly separated into TWO source ledgers:
 *  - personal advances/repayments, already posted to Treasury
 *  - custody requests, moving BUSINESS funds only if approved
 *
 * This read-only view is not a bank transfer engine or an accounting journal.
 * Source identifiers and amounts are never changed, duplicated or totaled.
 */
export function recentWalletActivity({loans=[],custody=[],currency='',limit=12}={}){
  const seen=new Set(),items=[];
  for(const loan of loans){
    if(!loan?.id||loan.currency!==currency)continue;
    const key='loan:'+loan.id;
    if(seen.has(key))continue;
    seen.add(key);
    items.push({
      key,source:'personal_advance',sourceId:loan.id,
      kind:loan.kind,amount:Number(loan.amount),
      direction:partnerDirection(loan),currency:loan.currency,
      date:loan.effective_date,createdAt:loan.posted_at||loan.effective_date,
      method:loan.payment_method,status:'posted',
      confirmation:loan.confirmed_at?'confirmed':'awaiting_recipient',
      reference:loan.external_reference||'',notes:loan.notes||'',
    });
  }
  for(const row of custody){
    if(!row?.id||row.currency!==currency)continue;
    const key='custody:'+row.id;
    if(seen.has(key))continue;
    seen.add(key);
    items.push({
      key,source:'business_custody',sourceId:row.id,
      kind:row.kind,amount:Number(row.amount),
      direction:row.kind==='custody_received'?'incoming':'outgoing',
      currency:row.currency,date:row.effective_date,
      createdAt:row.created_at||row.effective_date,
      method:row.payment_method,status:row.reversed_by?'reversed':row.reverses_id?'reversal_posted':row.status,
      confirmation:row.status==='approved'?'owner_approved':null,
      reference:row.reference||'',notes:row.notes||'',
    });
  }
  return items.filter(x=>Number.isFinite(x.amount)&&x.amount>0)
    .sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))||b.key.localeCompare(a.key))
    .slice(0,Math.max(0,Math.min(50,limit)));
}

/**
 * Canonical payer and payee in the PERSONAL ACCOUNT activity view.
 * "Direction" here means inflow/outflow for the named person's wallet account,
 * not the owner Treasury account and not an accounting profit/loss posting.
 * Personal-loan entries are already scoped to business_partners.id server-side.
 * Business custody is a separate business-owned ledger.
 */
export const walletPartiesForKind=(kind,{accountReference='',businessName=''}={})=>{
  const account=String(accountReference||'').trim();
  const business=String(businessName||'').trim();
  if(!account||!business)return null;
  const businessToPerson=new Set([
    'owner_advance_to_sponsor','owner_repay_sponsor','custody_received'
  ]);
  const personToBusiness=new Set([
    'sponsor_advance_to_owner','sponsor_repay_owner','custody_returned'
  ]);
  if(!businessToPerson.has(kind)&&!personToBusiness.has(kind))return null;
  const incoming=businessToPerson.has(kind);
  return Object.freeze({
    from:incoming?business:account,
    to:incoming?account:business,
    fromType:incoming?'business':'wallet',
    toType:incoming?'wallet':'business',
    direction:incoming?'incoming':'outgoing',
    businessOwned:kind.startsWith('custody_'),
  });
};
