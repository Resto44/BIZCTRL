import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {getWorkspaceModuleForPath,isWorkspacePathEnabled} from '../src/lib/workspaceCustomization';
import translations from '../src/lib/i18n';
import {translateInterface} from '../src/lib/translateInterface';
const source=path=>readFileSync(path,'utf8');
describe('Dedicated Brand Analytics navigation',()=>{
 it('registers the lazy owner-only route with the inventory permission',()=>{
  const app=source('src/App.jsx');
  expect(app).toContain("lazy(() => import('@/pages/BrandAnalyticsPage'))");
  expect(app).toContain('<Route path="/brand-analytics" element={<ERPRoleGuard allowedRoles={[\'owner\']}><RoleGuard permission="viewInventory"><BrandAnalyticsPage /></RoleGuard></ERPRoleGuard>} />');
 });
 it('links desktop, mobile drawer and both owner More menus without granting access to other roles',()=>{
  const sidebar=source('src/components/layout/ERPSidebar.jsx');
  expect(sidebar).toContain("{ path: '/brand-analytics', label: 'Brand Analytics', icon: BarChart3, permission: 'viewInventory', roles: ['owner'] }");
  expect(sidebar).toContain("'/bi-center', '/branch-analytics', '/brand-analytics', '/alerts'");
  const bottom=source('src/components/layout/BottomNav.jsx');
  expect(bottom.match(/path: '\/brand-analytics', icon: BarChart3, labelKey: 'brand_analytics'/g)).toHaveLength(2);
  expect(bottom).toContain("if (item.path === '/brand-analytics' && role !== ROLES.OWNER) return false;");
  expect(bottom).toContain("'/brand-analytics': 'viewInventory'");
 });
 it('inherits product module enablement and translates the label in all three languages',()=>{
  expect(getWorkspaceModuleForPath('/brand-analytics').key).toBe('product_management');
  expect(isWorkspacePathEnabled({business:{disabled_modules:['product_management']}},'/brand-analytics')).toBe(false);
  for(const lang of ['en','ar','fa'])expect(translateInterface('Brand Analytics',lang)).toBe(translations[lang].brand_analytics);
 });
 it('reuses the existing tenant-scoped brand manager and resets on tenant change',()=>{
  const page=source('src/pages/BrandAnalyticsPage.jsx');
  expect(page).toContain('<ProductBrandManager key={activeRestaurant.id} restaurantId={activeRestaurant.id} lang={lang}/>');
  expect(page).toContain('to="/product-management"');
  expect(page).not.toContain('supabase.from(');
 });
});
