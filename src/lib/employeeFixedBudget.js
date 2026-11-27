import {isReportFixedCategory} from './expenseConfiguration';

const salaryCategoryNames=new Set(['salary','salaries','employee salaries','employee salary','staff salaries','staff salary','payroll','base salary','wages','staff wages','employee wages','الرواتب','رواتب','رواتب الموظفين','رواتب العمال','الأجور','اجور','أجور','حقوق','حقوق کارکنان','حقوق کارمندان','معاش','معاشات','معاش کارمندان','معاش کارکنان','دستمزد']);
const normalized=value=>String(value||'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ').replace(/ي/g,'ی').replace(/ك/g,'ک');
const salaryNames=new Set([...salaryCategoryNames].map(normalized));
const cents=value=>{const n=Number(value);return Number.isFinite(n)&&n>0?Math.round(n*100):0;};
export function riyadhBudgetDate(date=new Date()){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).map(x=>[x.type,x.value]));
 return p.year+'-'+p.month+'-'+p.day;
}
/** Current contractual base-pay snapshot, not a posted expense, accrual or historical payroll.
 * Existing manual salary allocations require review rather than silently counting twice.
 */
export function employeeFixedBudget(employees=[],categories=[],{restaurantId,branchId,branchKey,branches=[],today=riyadhBudgetDate(),configuredFixed=0}={}){
 const keys=new Set(branches.map(b=>b.key||b.branch_key).filter(Boolean));
 const ids=new Set(branches.map(b=>b.id).filter(Boolean));
 const seen=new Set();
 let total=0,count=0;
 for(const e of employees){
  if(!e.id||seen.has(e.id)||!restaurantId||e.restaurant_id!==restaurantId||e.is_active===false)continue;
  if(branchId ? (e.branch_id?e.branch_id!==branchId:!branchKey||e.branch!==branchKey)
      : (e.branch_id?!ids.has(e.branch_id):!keys.has(e.branch)))continue;
  const joined=e.joining_date||e.hire_date;
  if(joined&&String(joined).slice(0,10)>today)continue;
  seen.add(e.id); count++;total+=cents(e.base_salary??e.salary);
 }
 const manualSalary=categories.filter(c=>c.is_active!==false&&isReportFixedCategory(c)&&cents(c.monthly_amount)>0&&(!c.branch_id||!branchId||c.branch_id===branchId)&&[c.name,c.name_en,c.name_ar,c.name_fa].some(n=>salaryNames.has(normalized(n))));
 return {salary:total/100,count,manualSalaryConflict:manualSalary.length>0,combined:manualSalary.length?null:(cents(configuredFixed)+total)/100};
}
