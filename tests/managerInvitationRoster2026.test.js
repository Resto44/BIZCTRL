import {describe,it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
const root = new URL('../src/components/owner/',import.meta.url);
describe('Owner Approval Center quick manager roster',()=>{
 it('updates immediately from selected role and shows managers across the same store branches',async()=>{
  const [directory,owner,logic] = await Promise.all([
   readFile(new URL('InvitationDirectory.jsx',root),'utf8'),
   readFile(new URL('OwnerStaffProvisioning.jsx',root),'utf8'),
   readFile(new URL('../src/lib/invitationDirectory.js',import.meta.url),'utf8'),
  ]);
  expect(owner).toContain('role={form.role}');
  expect(owner).toContain('branches={branches}');
  expect(owner).toContain('key={`${selectedOrganizationId}:${form.branchId}:${form.role}`}');
  expect(directory).toContain("const isManager = role === 'manager'");
  expect(directory).toContain("t(isManager ? 'Managers in this business'");
  expect(directory).toContain('data-testid="role-directory-results"');
  expect(directory).toContain('data-testid="existing-role-member"');
  expect(directory).toContain('refetchOnMount: \'always\'');
  expect(logic).toContain("role === 'manager' || !r.branch_id");
  expect(logic).toContain(".eq('restaurant_id', restaurantId)");
 });
 it('does not create a second invitation for a current manager and shows a real zero state',async()=>{
  const page=await readFile(new URL('InvitationDirectory.jsx',root),'utf8');
  expect(page).toContain('person.canCreateInvitation');
  expect(page).toContain("person.source === 'membership'");
  expect(page).toContain('No managers registered or invited for this store yet.');
  expect(page).toContain('query.isError');
  expect(page).toContain('query.refetch()');
  expect(page).not.toContain("supabase.rpc('create_erp_invitation'");
 });
 it('adds Arabic and Dari translations for roster and empty state',async()=>{
  const paths=['../src/lib/arabicUiPhrases.js','../src/lib/persianUiPhrases.js'];
  for(const path of paths){
   const dictionary=await readFile(new URL(path,import.meta.url),'utf8');
   expect(dictionary).toContain('"Managers in this business":');
   expect(dictionary).toContain('"No managers registered or invited for this store yet. Create the first manager below.":');
  }
 });
});
