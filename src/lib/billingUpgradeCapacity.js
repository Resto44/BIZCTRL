// A plan upgrade must support the organization's existing resources.
// Do not redirect a customer with 4 branches toward a 1- or 3-branch plan.
const CAPACITIES=[['branches','max_branches'],['users','max_users'],['employees','max_employees']];
export function planCapacityGaps(plan,usage={}) {
 if(!plan)return [{resource:'plan',used:0,limit:0}];
 return CAPACITIES.flatMap(([resource,field])=>{
   const used=Number(usage?.[resource]||0),limit=Number(plan?.[field]);
   return Number.isFinite(used)&&used>0&&(!Number.isFinite(limit)||limit<used)
    ? [{resource,used,limit:Number.isFinite(limit)?limit:null}] : [];
 });
}
export function recommendedCapacityPlan(plans=[],usage={}) {
 return [...plans].filter(p=>p?.is_active!==false && p?.is_public!==false &&
   Number(p?.monthly_price_cents)>0 && planCapacityGaps(p,usage).length===0)
  .sort((a,b)=>Number(a.monthly_price_cents)-Number(b.monthly_price_cents))[0]||null;
}
