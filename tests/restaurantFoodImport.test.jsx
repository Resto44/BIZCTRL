/* @vitest-environment jsdom */
import {webcrypto} from 'node:crypto';
import {describe,it,expect,vi,beforeAll} from 'vitest';
import {foodTemplate,prepareFoodImport,runFoodImport,foodImportId} from '../src/lib/restaurantFoodImport';
import {parseProductSpreadsheet} from '../src/lib/productSpreadsheet';
beforeAll(()=>Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true}));
const scope={tenant:'restaurant-a',branch:'branch-a',categories:[{id:'sales',name:'Food',is_active:true}],inventory:[{id:'rice'}]};
const row=(overrides={})=>({_rowNumber:2,food_code:'FOOD-001',name:'Rice meal',selling_price:'22',tax_rate:'0',category_id:'sales',stock_mode:'recipe',recipe_json:'[{"inventory_id":"rice","quantity":0.5}]',status:'active',...overrides});
describe('restaurant food import',()=>{
 it('reads its Excel template with multilingual fields and explicit inactive stock settings',async()=>{
  const bytes=foodTemplate();const rows=await parseProductSpreadsheet({name:'foods.xlsx',size:bytes.length,arrayBuffer:async()=>bytes.buffer});
  expect(rows[0]).toMatchObject({food_code:'FOOD-001',stock_mode:'untracked',status:'inactive',selling_price:'22',tax_rate:'0'});
 });
 it('validates sales categories, ingredient scope, duplicates and prices before writes',async()=>{
  const input=[row(),row({food_code:'B',category_id:'purchasing'}),row({food_code:'C',selling_price:'abc'}),row({food_code:'D',recipe_json:'[{"inventory_id":"other-branch","quantity":1}]'}),row()];
  const result=await prepareFoodImport(input,scope);expect(result.rows).toHaveLength(1);expect(result.errors).toHaveLength(4);
  expect(result.rows[0].payload).toMatchObject({price:22,category_id:'sales',recipe:[{inventory_id:'rice',quantity:0.5}]});
 });
 it('uses deterministic branch-scoped IDs and detects existing imported food updates',async()=>{
  const a=await foodImportId('a','b','C');expect(await foodImportId('a','b','C')).toBe(a);expect(await foodImportId('a','other','C')).not.toBe(a);
  const first=await prepareFoodImport([row()],scope);const second=await prepareFoodImport([row()],{...scope,menu:[{id:first.rows[0].payload.id}]});expect(second.rows[0].update).toBe(true);
 });
 it('requires stock confirmation and reports per-row failures with safe retry IDs',async()=>{
  const prepared=await prepareFoodImport([row({stock_mode:'untracked',recipe_json:''}),row({food_code:'B'})],scope);const rpc=vi.fn().mockRejectedValueOnce(new Error('Network interrupted')).mockResolvedValue({ok:true});
  await expect(runFoodImport(prepared.rows,{...scope,rpc,confirmUntracked:false})).rejects.toThrow('Confirm');expect(rpc).not.toHaveBeenCalled();
  const result=await runFoodImport(prepared.rows,{...scope,rpc,confirmUntracked:true});expect(result.map(r=>r.ok)).toEqual([false,true]);
  await runFoodImport(result.filter(r=>!r.ok),{...scope,rpc,confirmUntracked:true});expect(rpc).toHaveBeenCalledTimes(3);
  expect(rpc.mock.calls[0][1].p_payload.id).toBe(rpc.mock.calls[2][1].p_payload.id);expect(rpc.mock.calls[0][1]).toMatchObject({p_restaurant_id:'restaurant-a',p_branch_id:'branch-a',p_command:'menu'});
 });
});

describe('customizable food spreadsheet import',()=>{
 const choice=(code,size,style='With rice',extra={})=>row({food_code:code,option_group:'Roast chicken',size,serving_style:style,...extra});
 it('round trips size columns and groups canonical priced choices for POS',async()=>{
  const bytes=foodTemplate(),records=await parseProductSpreadsheet({name:'foods.xlsx',size:bytes.length,arrayBuffer:async()=>bytes.buffer});
  expect(records[0]).toMatchObject({option_group:'Roast chicken',size:'Half',serving_style:'With rice'});
  const p=await prepareFoodImport([choice('WHOLE','Whole'),choice('HALF','Half','Plain',{selling_price:14})],scope);
  expect(p.errors).toEqual([]);expect(p.rows[1].payload).toMatchObject({price:14,option_group:'Roast chicken',variant_options:[{label:'Size',value:'Half'},{label:'Serving',value:'Plain'}]});
  const rpc=vi.fn().mockResolvedValue({});await runFoodImport(p.rows,{...scope,rpc,confirmUntracked:false});
  expect(rpc).toHaveBeenCalledTimes(1);expect(rpc.mock.calls[0][1]).toMatchObject({p_command:'menu_batch',p_payload:{option_group:'Roast chicken',items:p.rows.map(r=>({...r.payload,confirm_untracked:false}))}});
 });
 it('rejects duplicate combinations, inconsistent axes and incomplete existing groups',async()=>{
  expect((await prepareFoodImport([choice('A','Half'),choice('B','Half')],scope)).errors).toHaveLength(2);
  expect((await prepareFoodImport([choice('A','Half'),choice('B','Whole','')],scope)).errors).toHaveLength(2);
  const p=await prepareFoodImport([choice('A','Half')],{...scope,menu:[{id:'manual-choice',option_group:'Roast chicken'}]});expect(p.rows).toHaveLength(0);expect(p.errors[0].message).toContain('every existing');
  expect((await prepareFoodImport([choice('A','Half','With rice',{option_3_name:'Sauce'})],scope)).errors).toHaveLength(1);
 });
 it('retries the complete failed group without repeating a successful standalone food',async()=>{
  const p=await prepareFoodImport([choice('A','Whole'),choice('B','Half'),row({food_code:'drink'})],scope);
  const rpc=vi.fn().mockRejectedValueOnce(new Error('Failure')).mockResolvedValue({});
  const results=await runFoodImport(p.rows,{...scope,rpc,confirmUntracked:false});expect(results.map(r=>r.ok)).toEqual([false,false,true]);
  await runFoodImport(results.filter(r=>!r.ok),{...scope,rpc,confirmUntracked:false});
  expect(rpc).toHaveBeenCalledTimes(3);expect(rpc.mock.calls[0][1]).toEqual(rpc.mock.calls[2][1]);
 });
 it('updates imported groups with stable identifiers and supports extra options',async()=>{
  const inputs=[choice('A','Large','',{option_3_name:'Milk',option_3_value:'Oat'})];
  const first=await prepareFoodImport(inputs,scope);const again=await prepareFoodImport(inputs,{...scope,menu:first.rows.map(r=>r.payload)});
  expect(again.errors).toEqual([]);expect(again.rows[0].update).toBe(true);expect(again.rows[0].payload).toEqual(first.rows[0].payload);
 });
});
