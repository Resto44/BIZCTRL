import {sponsorOwnerSummary} from './sponsorOwnerBilateral';

/** Financial snapshot is read-only. Custody never becomes personal principal. */
export function ownerWalletSnapshot({transactions=[],custodyBalances=[],people=[],currency='SAR'}={}){
 const allowedIds=new Set(people.map(p=>p.id));
 const posted=transactions.filter(r=>r.partner_id&&allowedIds.has(r.partner_id)&&r.currency===currency);
 const loans=sponsorOwnerSummary(posted,currency);
 const balances=custodyBalances.filter(r=>r.currency===currency);
 return {
  businessOwesPeople:loans.ownerOwes,
  peopleOweBusiness:loans.sponsorOwes,
  custodyHeld:balances.reduce((sum,row)=>sum+Number(row.held||0),0),
  pendingCustodyCount:balances.reduce((sum,row)=>sum+Number(row.pending||0),0),
  recentLoans:posted.slice(0,4),
 };
}
