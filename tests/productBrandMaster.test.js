import {describe,it,expect,vi} from 'vitest';
import {brandKey,brandLabel,brandMatches,mergeBrandMaster,brandMasterPayload,saveBrandMaster} from '../src/lib/productBrandMaster';
import {readFileSync} from 'node:fs';
describe('Independent product brand master',()=>{
 const row={id:'brand-1',brand:'Royal Fresh',name_en:'Royal Fresh',name_ar:'رويال فريش',name_fa:'رویال فریش',is_active:false};
 it('deduplicates old product spelling, preserves archive and translates without changing key',()=>{
  const merged=mergeBrandMaster([row],[' ROYAL   FRESH ','Old brand']);
  expect(merged).toHaveLength(2);
  expect(merged.find(r=>r.id===row.id)).toEqual(row);
  expect(brandLabel(row,'ar')).toBe('رويال فريش');
  expect(brandLabel(row,'fa')).toBe('رویال فریش');
  expect(brandMatches(row,'رویال')).toBe(true);
  expect(brandKey(' Royal  Fresh ')).toBe('royal fresh');
 });
 it('requires all three names and normalizes whitespace',()=>{
  expect(()=>brandMasterPayload({name_en:'Royal Fresh',name_ar:'',name_fa:'رویال'})).toThrow('BRAND_NAMES_REQUIRED');
  expect(brandMasterPayload({...row,name_en:' Royal   Fresh '})).toEqual({name_en:'Royal Fresh',name_ar:row.name_ar,name_fa:row.name_fa});
 });
 it('inserts a brand without creating or changing a product',async()=>{
  const single=vi.fn(async()=>({data:row,error:null}));
  const insert=vi.fn(()=>({select:()=>({single})}));
  const db={from:vi.fn(()=>({insert}))};
  expect(await saveBrandMaster(db,'restaurant-1',{...row,id:undefined,is_active:true})).toEqual(row);
  expect(db.from).toHaveBeenCalledWith('product_brand_master');
  expect(insert).toHaveBeenCalledWith({restaurant_id:'restaurant-1',brand:'Royal Fresh',name_en:row.name_en,name_ar:row.name_ar,name_fa:row.name_fa,is_active:true});
 });
 it('scopes archive to the tenant and id and changes only active state',async()=>{
  const single=vi.fn(async()=>({data:row,error:null}));
  const q={eq:vi.fn(()=>q),select:()=>({single})};
  const update=vi.fn(()=>q);
  const db={from:vi.fn(()=>({update}))};
  await saveBrandMaster(db,'restaurant-1',{...row,statusOnly:true});
  expect(update).toHaveBeenCalledWith({is_active:false});
  expect(q.eq.mock.calls).toEqual([['restaurant_id','restaurant-1'],['id','brand-1']]);
 });
 it('retains the existing product brand reference and enforces restricted SQL access',()=>{
  const sql=readFileSync('supabase/migrations/20261126100000_product_brand_master.sql','utf8');
  expect(sql).toContain('unique (restaurant_id,brand_key)');
  expect(sql).toContain('enable row level security');
  expect(sql).toContain('update (name_en,name_ar,name_fa,is_active)');
  expect(sql).toContain("erp_current_role()='owner'");
  expect(sql).not.toMatch(/update public\.products|delete from public\.products/i);
  const form=readFileSync('src/components/products/ProductMasterForm.jsx','utf8');
  expect(form).toContain('onSelected={brand=>{set(\'brand\',brand);setBrandManagerOpen(false);}}');
 });
});
