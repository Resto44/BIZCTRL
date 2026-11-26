import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {filterRawMaterials,toggleRawMaterialSelection,selectedRawMaterials} from '../src/lib/rawMaterialSelection';
const rows=[{id:'a',name:'Rice',name_fa:'برنج',is_active:true,status:'active'},{id:'b',name:'Chicken',is_active:true,status:'active'},{id:'c',name:'Milk',is_active:false,status:'inactive'},{id:'d',name:'Oil',is_active:false,status:'discontinued'}];
describe('Raw material catalog archive selection',()=>{
 it('shows active products and restorable archived products separately',()=>{
  expect(filterRawMaterials(rows).map(p=>p.id)).toEqual(['a','b']);
  expect(filterRawMaterials(rows,'',true).map(p=>p.id)).toEqual(['c']);
 });
 it('selects partial or all matching results and excludes hidden selections',()=>{
  expect(toggleRawMaterialSelection(['a'],'b')).toEqual(['a','b']);
  expect(toggleRawMaterialSelection(['a'],'a')).toEqual([]);
  const matches=filterRawMaterials(rows,'برنج');
  expect(selectedRawMaterials(matches,['a','b','c']).map(p=>p.id)).toEqual(['a']);
  expect(selectedRawMaterials(filterRawMaterials(rows),['a','b']).length).toBe(2);
 });
 it('keeps selection bounded to raw material owner scope and transactional status change',()=>{
  const sql=readFileSync('supabase/migrations/20261126183000_raw_material_archive.sql','utf8');
  expect(sql).toContain('security invoker');
  expect(sql).toContain("erp_current_role() is distinct from 'owner'");
  expect(sql).toContain("restaurant_product_type='raw_material'");
  expect(sql).toContain('changed<>wanted');
  expect(sql).not.toMatch(/delete from|insert into/i);
 });
 it('includes a confirmation and clear selection before bulk changes',()=>{
  const source=readFileSync('src/components/restaurant-pos/RestaurantProductWorkspace.jsx','utf8');
  expect(source).toContain('matches.map(p=>p.id)');
  expect(source).toContain('ask(chosen)');
  expect(source).toContain('ask([p])');
  expect(source).toContain('pending.rows.map(p=>p.id)');
 });
});
