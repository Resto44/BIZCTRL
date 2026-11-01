import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {planCapacities,planResourceCapacities,PUBLIC_PLAN_FIELDS} from '../src/lib/pricingCatalog.js';
import {recommendedCapacityPlan,planCapacityGaps} from '../src/lib/billingUpgradeCapacity.js';

const text=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const catalog=[
 {id:'starter_20',display_name:'Starter',monthly_price_cents:1000,max_restaurants:2,max_branches:3,max_users:10,max_employees:20,max_storage_mb:10240,max_pdf_exports:250,max_ocr_scans:150},
 {id:'growth_40',display_name:'Growth',monthly_price_cents:2000,max_restaurants:5,max_branches:5,max_users:25,max_employees:50,max_storage_mb:51200,max_pdf_exports:1000,max_ocr_scans:750},
 {id:'enterprise_100',display_name:'Enterprise',monthly_price_cents:5000,max_restaurants:15,max_branches:15,max_users:75,max_employees:150,max_storage_mb:204800,max_pdf_exports:5000,max_ocr_scans:2500}
];
describe('November 2026 tiered ERP plan quotas — canonical catalog',()=>{
 it('changes all seven catalog quotas with no subscription, Paddle or price updates',()=>{
   const sql=text('../supabase/migrations/20261101180000_expand_paid_erp_plan_capacities.sql');
   const compact=sql.replace(/\s+/g,'');
   for(const row of catalog){
     expect(compact).toContain(`('${row.id}',${row.max_restaurants},${row.max_branches},${row.max_users},${row.max_employees},${row.max_storage_mb},${row.max_pdf_exports},${row.max_ocr_scans})`);
   }
   for(const field of ['max_restaurants','max_branches','max_users','max_employees','max_storage_mb','max_pdf_exports','max_ocr_scans'])
     expect(sql).toContain(`${field} = c.`);
   expect(sql).not.toMatch(/SET\s+plan\s*=/i);
   expect(sql).not.toMatch(/SET\s+subscription_status\s*=/i);
   expect(sql).not.toMatch(/UPDATE\s+public\.subscription_payments/i);
   expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
   expect(sql).toContain("PLAN_CAPACITY_CATALOG_PRECONDITION_FAILED");
 });
 it('4 branches are compatible with Growth and Enterprise but not Starter',()=>{
   const usage={branches:4,employees:2,users:2,restaurants:1};
   expect(planCapacityGaps(catalog[0],usage)).toEqual([{resource:'branches',used:4,limit:3}]);
   expect(planCapacityGaps(catalog[1],usage)).toEqual([]);
   expect(planCapacityGaps(catalog[2],usage)).toEqual([]);
   expect(recommendedCapacityPlan(catalog,usage).id).toBe('growth_40');
   expect(recommendedCapacityPlan(catalog,{...usage,branches:12}).id).toBe('enterprise_100');
   expect(recommendedCapacityPlan(catalog,{...usage,branches:16})).toBeNull();
 });
 it('public catalog, billing UI and owner management read real plan limits',()=>{
   for(const key of ['max_restaurants','max_branches','max_users','max_employees','max_storage_mb','max_pdf_exports','max_ocr_scans'])expect(PUBLIC_PLAN_FIELDS).toContain(key);
   expect(planCapacities(catalog[0],'en')).toEqual(['10 users','3 branches','20 employees']);
   expect(planResourceCapacities(catalog[0],'en')).toEqual(['10 GB storage','250 PDF exports','150 OCR scans']);
   expect(planResourceCapacities(catalog[1],'fa').join(' ')).toContain('گیگابایت');
   expect(planResourceCapacities(catalog[2],'ar').join(' ')).toContain('OCR');
   const billing=text('../src/pages/Billing.jsx');
   const cards=text('../src/components/marketing/PublicPricingCards.jsx');
   const owner=text('../src/pages/PlatformOwnerPortal.jsx');
   expect(billing).toContain('planResourceCapacities(item,lang)');
   expect(cards).toContain('planResourceCapacities(plan, lang)');
   expect(owner).toContain('max_restaurants: item.entitlement_limits?.max_restaurants');
   expect(owner).toContain('ocr_scans: item.entitlement_limits?.ocr_scans');
   expect(owner).toContain('pdf_exports: item.entitlement_limits?.pdf_exports');
 });
 it('Platform Owner saves never silently reset omitted storage/PDF/OCR quotas',()=>{
   const sql=text('../supabase/migrations/20261101180500_preserve_erp_plan_limits_on_platform_edits.sql');
   for(const key of ['max_restaurants','max_branches','max_users','max_employees','max_storage_mb','max_pdf_exports','max_ocr_scans'])
     expect(sql).toContain(`v_existing.${key}`);
   expect(sql).toContain('max_restaurants = EXCLUDED.max_restaurants');
   expect(sql).toContain('PERFORM public.platform_owner_assert()');
   expect(sql).not.toMatch(/GRANT\s+EXECUTE\s+ON.*TO\s+anon/i);
 });
});
