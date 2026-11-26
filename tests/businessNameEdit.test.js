import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const page=readFileSync('src/pages/RestaurantManager.jsx','utf8');
describe('Business name editing',()=>{
 it('offers an edit action for each business, including non-active businesses',()=>{
  expect(page).toContain('data-testid="edit-business-name"');
  expect(page).toContain('onClick={() => openRename(r)}');
  expect(page).toContain('setEditingBusiness({ id: business.id, name: business.name })');
 });
 it('validates name and owner scope, saves only name using target business ID',()=>{
  expect(page).toContain("role !== 'owner'");
  expect(page).toContain('businessName.trim()');
  expect(page).toContain('name.length > 150');
  expect(page).toContain('restaurants.some(r => r.id === editingBusiness.id)');
  expect(page).toContain('updateRestaurant(editingBusiness.id, { name })');
  expect(page).toContain('result?.id !== editingBusiness.id || result?.name !== name');
 });
 it('refreshes tenant and portal identity caches and guards duplicate saves',()=>{
  expect(page).toContain("queryClient.setQueryData(['restaurants', user?.id, user?.role]");
  expect(page).toContain("queryKey:['portal-identity']");
  expect(page).toContain('renameLock.current = true');
  expect(page).toContain('role="alert"');
 });
 it('supports three languages and accessible name input',()=>{
  expect(page).toContain("title:'Edit business name'");
  expect(page).toContain("title:'تعديل اسم النشاط التجاري'");
  expect(page).toContain("title:'ویرایش نام کسب‌وکار'");
  expect(page).toContain('htmlFor="business-edit-name"');
  expect(page).toContain('onSubmit={handleRename}');
 });
});
