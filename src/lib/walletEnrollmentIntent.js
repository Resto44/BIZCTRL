/**
 * A current wallet invitation URL always takes priority over cached tokens.
 * Old, saved personal tokens must never shadow an explicitly opened shared
 * enrollment URL, or vice versa.
 * Never log or include these bearer tokens in diagnostic events.
 */
export const walletTokenValid=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);

export function resolveWalletEnrollmentIntent({
 hash='',search='',savedPersonal='',savedJoin='',
}={}){
 const fragment=new URLSearchParams(String(hash||'').replace(/^#/,''));
 const query=new URLSearchParams(String(search||'').replace(/^\?/,''));
 const explicit=(type)=>fragment.has(type)||query.has(type);
 const token=(type)=>fragment.get(type)||query.get(type)||'';
 if(explicit('personal')){
  const candidate=token('personal');
  return {kind:'personal',personal:walletTokenValid(candidate)?candidate:'',join:'',explicit:true,invalid:!walletTokenValid(candidate)};
 }
 if(explicit('join')){
  const candidate=token('join');
  return {kind:'join',personal:'',join:walletTokenValid(candidate)?candidate:'',explicit:true,invalid:!walletTokenValid(candidate)};
 }
 // With multiple cached tokens and no explicit URL, the intended target is
 // ambiguous. Fail closed instead of sending a stale token to the wrong RPC.
 if(walletTokenValid(savedPersonal)&&walletTokenValid(savedJoin))
  return {kind:'ambiguous',personal:'',join:'',explicit:false,invalid:true};
 if(walletTokenValid(savedPersonal))
  return {kind:'personal',personal:savedPersonal,join:'',explicit:false,invalid:false};
 if(walletTokenValid(savedJoin))
  return {kind:'join',personal:'',join:savedJoin,explicit:false,invalid:false};
 return {kind:'none',personal:'',join:'',explicit:false,invalid:false};
}

export const WALLET_MEMBERSHIP_ERROR_KEYS={
 WALLET_INVITEE_EMAIL_MISMATCH:'walletEmailMismatch',
 PARTNER_INVITATION_INVALID:'walletLinkInvalid',
 WALLET_INVITEE_NOT_FOUND:'walletLinkInvalid',
 PERSON_EMAIL_UNVERIFIED:'walletEmailUnverified',
 PERSON_OWNER_CANNOT_JOIN:'walletOwnerCannotJoin',
 WALLET_ACCOUNT_ALREADY_LINKED:'walletAlreadyLinked',
 PARTNER_ACCESS_DENIED:'walletLoginRequired',
 PERSON_INVALID:'walletNameInvalid',
};
export function walletMembershipErrorKey(error){
 const raw=[error?.code,error?.message,error?.details,error?.hint].filter(Boolean).join(' ').toUpperCase();
 for(const [code,label] of Object.entries(WALLET_MEMBERSHIP_ERROR_KEYS)){
  if(raw.includes(code))return label;
 }
 if(/JWT EXPIRED|INVALID JWT|UNAUTHORIZED/.test(raw))return 'walletLoginRequired';
 if(/TIMEOUT|NETWORK|FETCH FAILED|FAILED TO FETCH/.test(raw))return 'walletConnectionError';
 return 'failed';
}
