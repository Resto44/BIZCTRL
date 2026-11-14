import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {
  PORTAL_ORDER_ALL,portalOrderCategories,selectedPortalCategory,filterPortalOrderProducts,
} from '../src/lib/portalOrderCategories.js';
const sql=readFileSync('supabase/migrations/20261114163500_portal_order_category_catalog.sql','utf8');
const ui=readFileSync('src/pages/PortalOrderDispatch.jsx','utf8');
const menu=[
  {id:'menu-1',name:'Rice Bukhari',name_ar:'الرز البخاري',category_key:'id:rice',
   category:'Rice',category_ar:'الأرز',category_fa:'برنج',price:6},
  {id:'menu-2',name:'Rice Kabsa',name_ar:'الرز الكبسة',category_key:'id:rice',
   category:'Rice',category_ar:'الأرز',category_fa:'برنج',price:6},
  {id:'menu-3',name:'Chicken Charcoal',name_ar:'دجاج فحم',category_key:'id:chicken',
   category:'Chicken',category_ar:'الدجاج',category_fa:'مرغ',price:48},
  {id:'menu-4',name:'Drinks',category_key:'legacy:drinks',
   category:'Drinks',price:3},
  {id:'menu-5',name:'Uncategorized',category_key:'uncategorized',price:9},
];
describe('ERP portal order category and quick product selection',()=>{
 it('uses real menu categories, deduplicated with counts and Arabic/Dari labels',()=>{
   expect(portalOrderCategories(menu,'en').map(x=>[x.key,x.count])).toEqual([
    ['id:rice',2],['id:chicken',1],['legacy:drinks',1],['uncategorized',1],
   ]);
   expect(portalOrderCategories(menu,'ar')[0].label).toBe('الأرز');
   expect(portalOrderCategories(menu,'fa')[1].label).toBe('مرغ');
   expect(portalOrderCategories(menu,'en')[3].label).toBe('Other');
 });
 it('defaults to first category for large lists but has an explicit all-categories option',()=>{
   const categories=portalOrderCategories(menu);
   expect(selectedPortalCategory(categories,'')).toBe('id:rice');
   expect(selectedPortalCategory(categories,'nonexistent')).toBe('id:rice');
   expect(selectedPortalCategory(categories,PORTAL_ORDER_ALL)).toBe(PORTAL_ORDER_ALL);
   expect(selectedPortalCategory(categories,'id:chicken')).toBe('id:chicken');
   expect(selectedPortalCategory(portalOrderCategories(menu.slice(0,1)),'')).toBe(PORTAL_ORDER_ALL);
 });
 it('filters within chosen category while searching Arabic, English and Dari names',()=>{
   expect(filterPortalOrderProducts(menu,'id:rice').map(x=>x.id)).toEqual(['menu-1','menu-2']);
   expect(filterPortalOrderProducts(menu,'id:rice','الكبسة').map(x=>x.id)).toEqual(['menu-2']);
   expect(filterPortalOrderProducts(menu,PORTAL_ORDER_ALL,'charcoal').map(x=>x.id)).toEqual(['menu-3']);
   expect(filterPortalOrderProducts(menu,'id:rice','دجاج')).toEqual([]);
   expect(filterPortalOrderProducts(menu,'id:chicken','مرغ').map(x=>x.id)).toEqual(['menu-3']);
 });
 it('does not mutate selections when user switches category',()=>{
   const cart={'menu-1':2,'menu-3':1};
   const rice=filterPortalOrderProducts(menu,'id:rice');
   const chicken=filterPortalOrderProducts(menu,'id:chicken');
   expect(rice.map(x=>x.id)).toEqual(['menu-1','menu-2']);
   expect(chicken.map(x=>x.id)).toEqual(['menu-3']);
   expect(Object.keys(cart)).toEqual(['menu-1','menu-3']);
   expect(ui).toContain('data-testid="portal-order-selected-items"');
   expect(ui).toContain('setCategoryChoice(e.target.value);setSearch(\'\')');
   expect(ui).not.toContain("setCategoryChoice(e.target.value);setChosen({})");
 });
 it('does not change payment, seller, stock or authoritative order validation',()=>{
   expect(sql).toContain('create or replace function public.erp_portal_order_context');
   expect(sql).toContain('portal_order_private.membership(p_restaurant_id)');
   expect(sql).toContain('portal_order_private.branch_for(m,p_branch_id)');
   expect(sql).toContain('m.restaurant_id');
   expect(sql).toContain('q.branch_id=b');
   expect(sql).toContain('q.active');
   expect(sql).toContain('coalesce(p.is_active,true)');
   expect(sql).toContain("coalesce(c.is_active,true)");
   expect(sql).toContain("'category_key'");
   expect(sql).toContain("'category_ar'");
   expect(sql).toContain("'category_fa'");
   expect(sql).not.toMatch(/\b(insert into|delete from|update public\.|drop table)\b/i);
   expect(sql).not.toContain('erp_portal_order_submit');
 });
 it('renders fast mobile category selector before product search and supports translations',()=>{
   const cat=ui.indexOf('data-testid="portal-order-category-select"');
   const search=ui.indexOf('<Input aria-label={t.search}',cat);
   const product=ui.indexOf('{visible.map(item=>',cat);
   expect(cat).toBeGreaterThan(0);
   expect(search).toBeGreaterThan(cat);
   expect(product).toBeGreaterThan(search);
   expect(ui).toContain('value={activeCategory}');
   expect(ui).toContain('portalOrderCategories(catalog,lang)');
   expect(ui).toContain('filterPortalOrderProducts(catalog,activeCategory,search)');
   expect(ui).toContain('selectedPortalCategory(categories,categoryChoice)');
   expect(ui).toContain('t.allCategories');
   expect(ui).toContain('group.count');
   expect(ui).toContain('دسته‌بندی غذاها');
   expect(ui).toContain('تصنيف الأطعمة');
   expect(ui).toContain('Food category');
 });
});
