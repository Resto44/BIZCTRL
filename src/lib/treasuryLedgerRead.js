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
/**
 * Source of audit diagnostics: immutable ledger rows. Unlinked does NOT mean
 * amount missing; records can be valid legacy wallet postings without an account.
 */
export function treasuryIntegrity(accounts=[],transactions=[],knownAccounts=accounts){
 const idToAccount=new Map(knownAccounts.map(a=>[a.id,a]));
 const linked=transactions.filter(tx=>tx.account_id);
 const scopeMismatches=linked.filter(tx=>{
   const a=idToAccount.get(tx.account_id);
   if(!a)return false;
   if(a.restaurant_id&&tx.restaurant_id&&a.restaurant_id!==tx.restaurant_id)return true;
   if(a.branch_id&&tx.branch_id&&a.branch_id!==tx.branch_id)return true;
   if(a.branch_key&&tx.branch&&!a.branch_id&&a.branch_key!==tx.branch)return true;
   return false;
 }).length;
 const refs=new Map();
 for(const tx of transactions){
   if(!['network_sales_auto','network_sales_auto_v2'].includes(tx.transaction_type)||
     !tx.reference_id)continue;
   const id=String(tx.restaurant_id)+'::'+String(tx.reference_id);
   refs.set(id,(refs.get(id)||0)+1);
 }
 const paired=new Map();
 for(const tx of transactions){
   if(!['owner_branch_funding_debit','owner_to_branch_funding'].includes(tx.transaction_type)||
      !tx.reference_id)continue;
   const id=String(tx.restaurant_id)+'::'+String(tx.reference_id);
   if(!paired.has(id))paired.set(id,{debit:[],credit:[]});
   paired.get(id)[tx.transaction_type==='owner_branch_funding_debit'?'debit':'credit'].push(tx);
 }
 const unpairedFunding=[...paired.values()].filter(x=>
   x.debit.length!==1||x.credit.length!==1||
   Math.abs(Number(x.debit[0]?.amount||0)-Number(x.credit[0]?.amount||0))>0.009).length;
 return {
   legacyWalletMovements:transactions.filter(tx=>!tx.account_id).length,
   unknownAccountMovements:linked.filter(tx=>!idToAccount.has(tx.account_id)).length,
   negativeAccounts:accounts.filter(a=>a.is_active!==false &&
      (Number(a.opening_balance||0)+transactions.filter(tx=>tx.account_id===a.id)
       .reduce((v,tx)=>v+(tx.direction==='out'?-1:1)*Number(tx.amount||0),0))<0).length,
   scopeMismatches,
   duplicateNetworkReferences:[...refs.values()].filter(n=>n>1).length,
   unpairedFunding,
 };
}
