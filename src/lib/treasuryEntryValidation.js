/**
 * Validates a manual Treasury entry before it reaches Supabase.
 * Wallet balances and account scope are accounting data, never UI-only state.
 * The caller must use ONE payment method per ledger posting.
 */
export class TreasuryEntryError extends Error {
  constructor(code,message){super(message);this.name='TreasuryEntryError';this.code=code;}
}

const branchType = t => t?.wallet==='branch_cash' || t?.value?.startsWith('branch_') ||
  (t?.settlement===true && t?.value==='owner_to_branch_funding');

export function buildTreasuryEntry({form,account,meta,branches=[],restaurantId,
  selectedBranchId=null,selectedBranchKey=null,isAllBranches=false}){
  if(!restaurantId)throw new TreasuryEntryError('MISSING_RESTAURANT','No active restaurant selected. Reopen the restaurant workspace.');
  if(!meta||!form?.type)throw new TreasuryEntryError('MISSING_TYPE','Choose a transaction type.');
  if(!account?.id || account.is_active===false)throw new TreasuryEntryError('MISSING_ACCOUNT','Choose an active Treasury account.');
  if(account.restaurant_id && account.restaurant_id!==restaurantId)
    throw new TreasuryEntryError('ACCOUNT_SCOPE','This Treasury account belongs to a different restaurant.');
  const amount=Number(form.amount);
  if(!Number.isFinite(amount)||amount<=0||!Number.isSafeInteger(Math.round(amount*100)))
    throw new TreasuryEntryError('INVALID_AMOUNT','Enter an amount greater than zero.');
  if(Math.abs(Math.round(amount*100)/100-amount)>0.00000001)
    throw new TreasuryEntryError('AMOUNT_PRECISION','Amounts must use at most 2 decimal places.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(form.date||'')||
     Number.isNaN(new Date(form.date+'T12:00:00Z').getTime()))
    throw new TreasuryEntryError('INVALID_DATE','Select a valid transaction date.');
  const payment=form.payment_method;
  if(payment==='both')throw new TreasuryEntryError('SPLIT_PAYMENT',
    'Cash + Network cannot be posted as one undivided entry. Record a Cash entry and a Network entry separately so each amount is accurate.');
  if(!['cash','network'].includes(payment))
    throw new TreasuryEntryError('PAYMENT_METHOD','Select Cash or Network as the payment method.');
  const mustHaveBranch=Boolean(branchType(meta));
  const fallbackKey=!isAllBranches?selectedBranchKey:null;
  // Match the actual account branch first; never re-scope unrelated accounts silently.
  const requestedKey=form.branch || fallbackKey || account.branch_key || '';
  const branch=branches.find(b=>String(b.key||b.branch_key)===String(requestedKey))||
    branches.find(b=>b.id===account.branch_id)||
    (!isAllBranches?branches.find(b=>b.id===selectedBranchId):null)||null;
  if(mustHaveBranch&&!branch)throw new TreasuryEntryError('MISSING_BRANCH',
    'Choose the destination branch for this transaction.');
  if(account.branch_id && branch && String(account.branch_id)!==String(branch.id))
    throw new TreasuryEntryError('ACCOUNT_BRANCH','The Treasury account and destination branch do not match.');
  if(account.branch_key && branch && account.branch_key!==(branch.key||branch.branch_key))
    throw new TreasuryEntryError('ACCOUNT_BRANCH','The Treasury account belongs to another branch.');
  if(!isAllBranches&&branch&&selectedBranchId&&String(branch.id)!==String(selectedBranchId))
    throw new TreasuryEntryError('BRANCH_SCOPE','The selected branch is outside your current branch scope.');
  // Enforce exact ledger source. A general cash account belongs to the owner,
  // even if the expense was for a branch; a branch cash account stays branch cash.
  const accountWallet=account.legacy_wallet_key||
    (account.branch_key||account.branch_id?'branch_cash':
      ['bank','network_pos','digital_wallet','clearing'].includes(account.account_type)?
      'owner_network':'owner_cash');
  const wallet=meta.wallet==='branch_cash'?accountWallet:(meta.wallet||accountWallet);
  return {
    transaction_date:form.date,
    transaction_type:form.type,
    account_id:account.id,
    branch:branch?.key||branch?.branch_key||requestedKey||'',
    branch_id:branch?.id||account.branch_id||(!isAllBranches?selectedBranchId:null)||null,
    amount:Math.round(amount*100)/100,
    payment_method:payment,
    description:(form.description||'').trim()||null,
    wallet,
    direction:meta.direction||'out',
    restaurant_id:restaurantId,
  };
}

export function treasurySaveErrorMessage(error){
 if(error?.name==='TreasuryEntryError')return error.message;
 const code=String(error?.code||'');
 if(code==='42501'||code==='PGRST301')return 'Permission denied. Check your role and selected branch, then retry.';
 if(code==='23503')return 'The selected branch or Treasury account no longer exists. Reload and select an active account.';
 if(code==='22P02')return 'An account or branch identifier is invalid. Reload the page and retry.';
 if(code==='23505')return 'This transaction may already have been saved. Check transaction history before retrying.';
 const msg=String(error?.message||'').slice(0,260);
 return msg ? 'Transaction was not confirmed: '+msg : 'Transaction was not confirmed. Check your connection and retry.';
}
