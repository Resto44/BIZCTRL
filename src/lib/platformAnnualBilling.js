// Public Platform Owner display helpers; server remains the pricing authority.
export const ADDITIONAL_ANNUAL_DISCOUNT=30;
export function expectedAnnualPriceCents(plan){
 const monthly=plan?.monthly_price_cents;
 if(monthly==null || !Number.isSafeInteger(Number(monthly)) || Number(monthly)<=0)return null;
 return Math.round(Number(monthly)*12*0.7);
}
export function ownerAnnualCatalogState(plan){
 const expected=expectedAnnualPriceCents(plan);
 const stored=plan?.yearly_price_cents;
 const monthlyId=String(plan?.paddle_price_id||'');
 const annualId=String(plan?.paddle_annual_price_id||'');
 if(!monthlyId || !annualId)return {kind:'unlinked',expected,annualId:null};
 if(!/^pri_[a-z0-9]{26}$/i.test(monthlyId)||!/^pri_[a-z0-9]{26}$/i.test(annualId)||
    expected===null || Number(stored)!==expected || plan?.currency!=='USD')
   return {kind:'mismatch',expected,annualId};
 return {kind:'linked',expected,annualId};
}
export function ownerBillingInterval(item){
 if(String(item?.subscription_status||'').toUpperCase()==='TRIAL')return 'trial';
 if(String(item?.subscription_status||'').toUpperCase()!=='ACTIVE')return 'none';
 return item?.billing_interval==='year'?'year':'month';
}
