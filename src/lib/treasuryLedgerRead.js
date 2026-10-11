/**
 * Treasury reads are financial ledgers, not a "latest records" activity feed.
 * Never silently use a limited first page to calculate an account balance.
 */
export async function fetchCompleteTreasuryRows({
  db, table, restaurantId, branchId=null, branchKey=null,
  allBranches=true, legacyColumn='branch', orderColumn='date', pageSize=1000,
}){
  if(!restaurantId)return [];
  if(!allBranches && (!branchId || !branchKey))return [];
  if(!Number.isInteger(pageSize)||pageSize<1||pageSize>1000)throw Error('Invalid treasury page size');
  const read=async predicate=>{
    const records=[];
    for(let page=0;page<1000;page++){
      let query=db.from(table).select('*').eq('restaurant_id',restaurantId)
        .order(orderColumn,{ascending:false})
        .order('id',{ascending:false});
      if(predicate==='canonical')query=query.eq('branch_id',branchId);
      if(predicate==='legacy')query=query.is('branch_id',null).eq(legacyColumn,branchKey);
      const {data,error}=await query.range(page*pageSize,(page+1)*pageSize-1);
      if(error)throw error;
      const batch=data||[];
      records.push(...batch);
      if(batch.length<pageSize)return records;
    }
    // Returning a partial ledger would make a plausible-looking but false balance.
    throw Error('Treasury ledger exceeds retrieval safety limit; no partial totals shown');
  };
  if(allBranches)return read('all');
  const [canonical,legacy]=await Promise.all([read('canonical'),read('legacy')]);
  return [...new Map([...canonical,...legacy].map(record=>[record.id,record])).values()];
}
export function accountsForTreasuryScope(accounts=[],{allBranches=true,branchId=null,branchKey=null}={}){
 if(allBranches)return accounts;
 return accounts.filter(a=>
   Boolean((branchId && a.branch_id===branchId) ||
     (branchKey && a.branch_key===branchKey &&
      (!a.branch_id || a.branch_id===branchId))));
}
export function treasuryIntegrity(accounts=[],transactions=[],knownAccounts=accounts){
 const accountMap=new Map(knownAccounts.map(a=>[a.id,a]));
 const ids=new Set(accountMap.keys());
 const closingReferences=new Map();
 const fundingDebits=new Set(transactions.filter(t=>t.transaction_type==='owner_branch_funding_debit'&&t.reference_id)
   .map(t=>String(t.restaurant_id)+'|'+String(t.reference_id)));
 let branchAccountMismatches=0;
 for(const tx of transactions){
  const account=accountMap.get(tx.account_id);
  if(account?.branch_id&&String(account.branch_id)!==String(tx.branch_id||''))branchAccountMismatches++;
  if(['network_sales_auto','network_sales_auto_v2'].includes(tx.transaction_type)&&tx.reference_id){
   const k=String(tx.restaurant_id)+'|'+String(tx.reference_id);
   closingReferences.set(k,(closingReferences.get(k)||0)+1);
  }
 }
 return {
  legacyWalletMovements:transactions.filter(tx=>!tx.account_id).length,
  unknownAccountMovements:transactions.filter(tx=>tx.account_id&&!ids.has(tx.account_id)).length,
  negativeAccounts:accounts.filter(a=>a.is_active!==false &&
   (Number(a.opening_balance||0)+transactions.filter(tx=>tx.account_id===a.id)
     .reduce((v,tx)=>v+(tx.direction==='out'?-1:1)*Number(tx.amount||0),0))<0).length,
  branchAccountMismatches,
  duplicateNetworkClosings:[...closingReferences.values()].reduce((n,count)=>n+Math.max(0,count-1),0),
  unpairedFundingCredits:transactions.filter(tx=>tx.transaction_type==='owner_to_branch_funding'&&
    !fundingDebits.has(String(tx.restaurant_id)+'|'+String(tx.reference_id||''))).length,
 };
}
