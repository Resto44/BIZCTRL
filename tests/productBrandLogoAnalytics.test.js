import {describe,it,expect,vi} from 'vitest';
import {normalizeBrandImageUrl,safeBrandImageUrl,brandCatalogAnalytics,filterBrandCatalog,fetchBrandUsage,saveBrandMaster} from '../src/lib/productBrandMaster';
const rows=[
 {id:'a',brand:'Royal Fresh',name_en:'Royal Fresh',name_ar:'رويال',name_fa:'رویال',image_url:'https://example.com/logo.png',created_at:'2026-11-02T10:00:00Z',is_active:true},
 {id:'b',brand:'Golden Grain',name_en:'Golden Grain',is_active:false,created_at:'2026-06-03T00:00:00Z'},
 {brand:'Legacy brand',name_en:'Legacy brand'},
 {id:'c',brand:'Unused',name_en:'Unused',created_at:'2026-01-01T00:00:00Z',is_active:true}
];
const usage={total:8,unbranded:2,byBrand:{'royal fresh':4,'golden grain':1,'legacy brand':1}};
describe('Brand logo and catalog analytics',()=>{
 it('permits optional HTTPS links only; rejects credentials, unsafe schemes and malformed URLs',()=>{
  expect(normalizeBrandImageUrl(' https://example.com/logo.png ')).toBe('https://example.com/logo.png');
  expect(normalizeBrandImageUrl('')).toBeNull();
  for(const bad of ['http://example.com/a','javascript:alert(1)','data:image/png;base64,x','https://user:pass@example.com/a','https://','https://example.com/a b'])expect(safeBrandImageUrl(bad)).toBeNull();
 });
 it('calculates real catalog counts and six-month registrations, excluding legacy dates',()=>{
  const x=brandCatalogAnalytics(rows,usage,new Date('2026-11-26T00:00:00Z'));
  expect(x).toMatchObject({total:4,active:2,archived:1,legacy:1,withLogo:1,products:8,unbranded:2});
  expect(x.trend.map(r=>r.month)).toEqual(['2026-06','2026-07','2026-08','2026-09','2026-10','2026-11']);
  expect(x.trend.map(r=>r.count)).toEqual([1,0,0,0,0,1]);
  expect(x.ranked.map(r=>r.brand)).toEqual(['Royal Fresh','Golden Grain','Legacy brand']);
  expect(brandCatalogAnalytics(rows,null).products).toBeNull();
 });
 it('combines multilingual search, archive/logo/usage filters and usage sort',()=>{
  expect(filterBrandCatalog(rows,{query:'رویال',logo:'yes',status:'active',usage:'used',counts:usage.byBrand})).toEqual([rows[0]]);
  expect(filterBrandCatalog(rows,{status:'archived'})).toEqual([rows[1]]);
  expect(filterBrandCatalog(rows,{status:'legacy'})).toEqual([rows[2]]);
  expect(filterBrandCatalog(rows,{usage:'unused',counts:usage.byBrand})).toEqual([rows[3]]);
  expect(filterBrandCatalog(rows,{sort:'products',counts:usage.byBrand})[0]).toEqual(rows[0]);
 });
 it('counts normalized product brands only in the selected tenant and fails on query error',async()=>{
  const q={select:vi.fn(()=>q),eq:vi.fn(()=>q),order:vi.fn(()=>q),range:vi.fn(async()=>({data:[{id:'1',brand:' Royal  Fresh '},{id:'2',brand:'ROYAL FRESH'},{id:'3',brand:null}],error:null}))};
  const db={from:vi.fn(()=>q)},id='11111111-1111-1111-1111-111111111111';
  expect(await fetchBrandUsage(db,id)).toEqual({total:3,unbranded:1,byBrand:{'royal fresh':2}});
  expect(q.eq).toHaveBeenCalledWith('restaurant_id',id);
  q.range.mockResolvedValueOnce({data:null,error:new Error('denied')});
  await expect(fetchBrandUsage(db,id)).rejects.toThrow('denied');
 });
 it('saves and clears the logo without changing the stable brand key',async()=>{
  const q={eq:vi.fn(()=>q),select:()=>({single:async()=>({data:rows[0]})})};
  const update=vi.fn(()=>q);const db={from:()=>({update})};
  await saveBrandMaster(db,'tenant',{...rows[0],image_url:''});
  expect(update).toHaveBeenCalledWith(expect.objectContaining({image_url:null}));
  expect(update.mock.calls[0][0]).not.toHaveProperty('brand');
  await saveBrandMaster(db,'tenant',{...rows[0],image_url:'https://example.com/new.png'});
  expect(update.mock.calls[1][0].image_url).toBe('https://example.com/new.png');
 });
});
