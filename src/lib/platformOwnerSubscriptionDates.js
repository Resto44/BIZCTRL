// Display semantics only. Never mutate subscription periods or infer a charge
// from a trial_end date; only the provider/authorized billing state can do that.
export function ownerSubscriptionDate(item) {
  const status = String(item?.subscription_status || '').toUpperCase();
  if(status === 'TRIAL') return {kind:'trialEnd',value:item?.trial_end||null};
  if(status === 'ACTIVE'){
    const isPaddle=String(item?.payment_provider||'').toLowerCase()==='paddle';
    return {kind:isPaddle?'nextBilling':'accessThrough',value:item?.current_period_end||null};
  }
  return {kind:'none',value:null};
}

// Database DATE values are *calendar days*, not UTC instants.
// Rendering them through new Date(...) in Asia/Riyadh adds a fictional 03:00.
export function formatOwnerSubscriptionDate(value,lang='en'){
  if(!value || typeof value!=='string')return '—';
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if(!match)return '—';
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
  const date=new Date(Date.UTC(year,month-1,day,12,0,0));
  if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return '—';
  const locale={en:'en-US',fa:'fa-IR',ar:'ar-SA'}[lang]||'en-US';
  return new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeZone:'UTC'}).format(date);
}
