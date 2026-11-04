import {describe,it,expect,vi} from 'vitest';
import {webcrypto} from 'node:crypto';
import {CATEGORY_TEMPLATES,categoryTemplate} from '../src/lib/categoryTemplates/catalog';
import {installCategoryTemplate,templateCategoryId} from '../src/lib/categoryTemplates/install';
vi.stubGlobal('crypto',webcrypto);
const scope={tenant:'11111111-1111-4111-8111-111111111111',branch:null};
function harness(){
 const rows=[];
 return {rows,list:vi.fn(async()=>rows.map(r=>({...r}))),get:vi.fn(async id=>rows.find(r=>r.id===id)),create:vi.fn(async row=>{if(rows.some(r=>r.id===row.id))throw {code:'23505'};rows.push(row);return row;})};
}
const run=(h,extra={})=>installCategoryTemplate({scope,mode:'retail',groups:categoryTemplate('retail'),...h,...extra});
describe('business category templates',()=>{
 it('covers every registered business mode with ten translated parents and twenty children',()=>{
  expect(Object.keys(CATEGORY_TEMPLATES).sort()).toEqual(['restaurant','cafe','retail','warehouse','factory','pharmacy','clinic','wholesale','services','other'].sort());
  for(const groups of Object.values(CATEGORY_TEMPLATES)){
   expect(groups).toHaveLength(10);
   const rows=groups.flatMap(g=>[g,...g.children]);expect(rows).toHaveLength(30);
   expect(new Set(rows.map(r=>r.key)).size).toBe(30);
   for(const row of rows)for(const key of ['name','name_ar','name_fa'])expect(row[key]?.trim().length).toBeGreaterThan(0);
  }
 });
 it('returns independent editable copies',()=>{const a=categoryTemplate('retail');a[0].children[0].name='Edited';expect(categoryTemplate('retail')[0].children[0].name).not.toBe('Edited');});
 it('creates parent links and remains idempotent after user renaming',async()=>{
  const h=harness();expect(await run(h)).toEqual({created:30,skipped:0});
  const parent=h.rows[0];parent.name='My edited category';parent.is_active=false;
  expect(h.rows[1].parent_id).toBe(parent.id);
  expect(await run(h)).toEqual({created:0,skipped:30});expect(parent.name).toBe('My edited category');expect(parent.is_active).toBe(false);
 });
 it('reuses an existing matching parent without changing it or its ordering',async()=>{
  const h=harness();h.rows.push({id:'existing',restaurant_id:scope.tenant,name:'FRUIT & VEGETABLES',sort_order:100,is_active:false});
  await run(h);expect(h.rows).toHaveLength(30);expect(h.rows[1].parent_id).toBe('existing');expect(h.rows[0].is_active).toBe(false);
 });
 it('can resume partial failure without duplicating saved categories',async()=>{
  const h=harness(),create=h.create;let calls=0;
  await expect(run(h,{create:async row=>{if(++calls===4)throw Error('offline');return create(row);}})).rejects.toThrow('offline');
  expect(h.rows).toHaveLength(3);expect(await run(h)).toEqual({created:27,skipped:3});
 });
 it('fails closed on reads and unresolved scope',async()=>{
  const h=harness();await expect(run(h,{list:async()=>{throw Error('read denied');}})).rejects.toThrow('read denied');expect(h.create).not.toHaveBeenCalled();
  await expect(run(h,{scope:{...scope,branchScoped:true,branch:'legacy'}})).rejects.toThrow('valid business');
 });
 it('does not share deterministic IDs across tenants or branches',async()=>{
  const a=await templateCategoryId(scope,'retail','produce');
  expect(await templateCategoryId({...scope,tenant:'22222222-2222-4222-8222-222222222222'},'retail','produce')).not.toBe(a);
  expect(await templateCategoryId({...scope,branch:'33333333-3333-4333-8333-333333333333'},'retail','produce')).not.toBe(a);
 });
 it('handles simultaneous imports and aborts when workspace changes',async()=>{
  const h=harness();await Promise.all([run(h),run(h)]);expect(h.rows).toHaveLength(30);
  const blocked=harness();await expect(run(blocked,{isCurrent:()=>false})).rejects.toThrow('Workspace changed');expect(blocked.create).not.toHaveBeenCalled();
 });
 it('validates all names before creating any records',async()=>{
  const h=harness(),groups=categoryTemplate('retail');groups[9].children[1].name='';
  await expect(run(h,{groups})).rejects.toThrow('1–160');expect(h.create).not.toHaveBeenCalled();
 });
});
