import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
const read = path => readFile(new URL(path,import.meta.url),'utf8');
describe('Public synthetic business demo catalog',()=>{
 it('has eleven isolated display models, stable unique SKUs and complete translations',async()=>{
  const d=JSON.parse(await read('../fixtures/demo/businesses.trilingual.json'));
  expect(d.synthetic).toBe(true);
  expect(d.businesses).toHaveLength(11);
  expect(d.businesses.every(b=>b.is_demo)).toBe(true);
  const items=d.businesses.flatMap(b=>b.items);
  expect(items).toHaveLength(41);
  expect(new Set(items.map(x=>x.sku)).size).toBe(41);
  for(const item of items) for(const field of ['product','supplier','category','subcategory']) for(const lang of ['en','ar','fa']) expect(item[field][lang]).toBeTruthy();
 });
 it('uses the exact fixture in a separate read-only RLS catalog',async()=>{
  const d=JSON.parse(await read('../fixtures/demo/businesses.trilingual.json'));
  const sql=await read('../supabase/migrations/20261125080842_bizctrl_public_demo_catalog.sql');
  expect(sql).toContain('enable row level security');
  expect(sql).toContain('revoke all on table public.bizctrl_public_demo_catalog from public, anon, authenticated');
  expect(sql).toContain('grant select on table public.bizctrl_public_demo_catalog to anon, authenticated');
  expect(JSON.parse(sql.split('$bizctrldemo$')[1])).toEqual(d);
  const page=await read('../src/pages/PublicDemoCatalog.jsx');
  expect(page).toContain("from('bizctrl_public_demo_catalog').select('payload')");
  expect(page).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
  expect(await read('../src/App.jsx')).toContain('path="/demo" element={<PublicDemoCatalog />}');
 });
});
