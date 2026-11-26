import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {parseRestaurantMaterialSpreadsheet,validateProductImport} from '../src/lib/productSpreadsheet';
const csv=text=>({name:'materials.csv',size:text.length,text:async()=>text});
describe('Restaurant raw material import',()=>{
 it('accepts translated names, L2/L3 and pricing from CSV without opening stock',async()=>{
  const result=await parseRestaurantMaterialSpreadsheet(csv('name,sku,name_ar,name_fa,category,subcategory,child_category,unit,purchase_cost,selling_price,wholesale_price,minimum_selling_price,opening_stock,status\nRice,RM-001,أرز,برنج,Rice & grains,Rice,Basmati,KG,5.5,8,7,6,100,active'));
  expect(result.errors).toEqual([]);
  expect(result.validRows[0]).toMatchObject({sku:'RM-001',name_ar:'أرز',name_fa:'برنج',subcategory:'Rice',child_category:'Basmati',wholesale_price:7,minimum_selling_price:6});
  expect(result.validRows[0]).not.toHaveProperty('opening_stock');
 });
 it('blocks malformed numerical values and duplicate SKU',async()=>{
  const result=await parseRestaurantMaterialSpreadsheet(csv('name,sku,category,unit,purchase_cost\nRice,RM-001,Rice,KG,no\nRice,RM-001,Rice,KG,5'));
  expect(result.errors.length).toBeGreaterThanOrEqual(2);
 });
 it('leaves supermarket validation intact',()=>{
  expect(validateProductImport([{name:'Milk',sku:'S1'}]).validRows).toHaveLength(1);
 });
 it('keeps the restaurant RPC invoker scoped, create only, and zero-stock',()=>{
  const sql=readFileSync('supabase/migrations/20261126143000_restaurant_material_import.sql','utf8');
  expect(sql).toContain('security invoker');
  expect(sql).toContain("erp_current_role() is distinct from 'owner'");
  expect(sql).toContain('if not p_commit then return');
  expect(sql).toContain("'pos_visibility','hidden'");
  expect(sql).toContain("0,p->>'status',p->>'status'='active','raw_material'");
  expect(sql).not.toMatch(/update public\.products|insert into public\.inventory/i);
 });
});
