import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {parseRestaurantMaterialSpreadsheet} from '../src/lib/productSpreadsheet';
const csv=text=>({name:'materials.csv',size:text.length,text:async()=>text});
describe('Supplier catalog and restaurant supplier import',()=>{
 it('preserves each row primary supplier by name or ID, without changing other fields',async()=>{
  const r=await parseRestaurantMaterialSpreadsheet(csv('name,sku,category,unit,supplier,purchase_cost\nRice,R1,Rice,KG,Supplier 1,5\nLamb,R2,Meat,KG,Supplier 2,40'));
  expect(r.errors).toEqual([]);
  expect(r.validRows.map(x=>[x.sku,x.supplier,x.purchase_cost])).toEqual([['R1','Supplier 1',5],['R2','Supplier 2',40]]);
 });
 it('accepts primary_supplier alias and leaves older files for explicit default selection',async()=>{
  const r=await parseRestaurantMaterialSpreadsheet(csv('name,sku,primary_supplier\nRice,R1,Supplier 1\nMilk,R2,'));
  expect(r.validRows.map(x=>x.supplier)).toEqual(['Supplier 1','']);
 });
 it('protects old supplier assignments and tenant boundaries in the atomic function',()=>{
  const sql=readFileSync('supabase/migrations/20261126170000_supplier_catalog_import.sql','utf8');
  expect(sql).toContain('security invoker');
  expect(sql).toContain('supplier_id is null or supplier_id=v_id');
  expect(sql).toContain('restaurant_id=p_restaurant_id');
  expect(sql).toContain('Primary Supplier is required');
  expect(sql).toContain("branch_id is null and status is true");
  expect(sql).toContain("(p->>'supplier_id')::uuid");
  expect(sql).not.toMatch(/insert into public\.(supplier_invoices|inventory)/i);
 });
 it('connects UI selection to one atomic save and validates explicit supplier before create',()=>{
  const supplier=readFileSync('src/pages/Suppliers.jsx','utf8');
  const picker=readFileSync('src/components/suppliers/SupplierCatalogPicker.jsx','utf8');
  const importer=readFileSync('src/components/restaurant-pos/RestaurantMaterialImport.jsx','utf8');
  expect(supplier).toContain("supabase.rpc('erp_save_supplier_catalog'");
  expect(picker).toContain('disabled={disabled||linked}');
  expect(importer).toContain("supabase.rpc('erp_import_restaurant_materials_v2'");
  expect(importer).toContain('supplier:r.supplier||defaultSupplier');
  expect(importer).toContain('setReady(false)');
 });
});
