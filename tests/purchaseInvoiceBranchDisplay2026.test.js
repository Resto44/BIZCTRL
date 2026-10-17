import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {treasuryBranchDisplayName,isTechnicalTreasuryBranch} from '../src/lib/treasuryBranchDisplay.js';

const files={
 purchases:readFileSync('src/pages/Purchases.jsx','utf8'),
 list:readFileSync('src/components/purchases/PurchaseInvoiceList.jsx','utf8'),
 enterprise:readFileSync('src/pages/EnterprisePurchaseCommandCenter.jsx','utf8'),
 mobile:readFileSync('src/components/purchases/MobileOptimizedPurchaseView.jsx','utf8'),
};
const tenantBranches=[
 {id:'63a92c99-c4c8-4831-8e7f-33c8e0a6e653',restaurant_id:'c9e3506b-cc38-4307-a561-d9e227a99224',key:'main-9a50614652',branch_key:'main-9a50614652',name:'فرع الريان',label:'فرع الريان'},
 {id:'5b063d7c-d6b0-4b4f-b947-9ad9390b1249',restaurant_id:'c9e3506b-cc38-4307-a561-d9e227a99224',key:'secondary-3',branch_key:'secondary-3',name:'فرع السعادة',label:'فرع السعادة'},
];
const invoice={
 id:'123',branch:'main-9a50614652',branch_id:'63a92c99-c4c8-4831-8e7f-33c8e0a6e653',
 restaurant_id:'c9e3506b-cc38-4307-a561-d9e227a99224',
 supplier_name:'مستودع بن فاضل',total_amount:1319.05,paid_amount:250,
};

describe('Purchases show canonical tenant-scoped branch display names',()=>{
 it('resolves the real production key to its stored branch name in EN, AR and FA',()=>{
  expect(isTechnicalTreasuryBranch(invoice.branch)).toBe(true);
  for(const lang of ['en','ar','fa']){
    expect(treasuryBranchDisplayName(invoice,tenantBranches,lang)).toBe('فرع الريان');
  }
  expect(treasuryBranchDisplayName({...invoice,branch:'legacy-name'},tenantBranches,'fa')).toBe('فرع الريان');
  expect(treasuryBranchDisplayName({...invoice,branch_id:null},tenantBranches,'ar')).toBe('فرع الريان');
 });
 it('does not render raw UUIDs or synthetic main keys when the tenant branch is unavailable',()=>{
  expect(treasuryBranchDisplayName(invoice,[], 'fa')).toBe('فرع نامشخص');
  expect(treasuryBranchDisplayName(invoice,[], 'ar')).toBe('فرع غير محدد');
  expect(treasuryBranchDisplayName(invoice,[], 'en')).toBe('Unknown branch');
  expect(treasuryBranchDisplayName({...invoice,branch:null,branch_id:null},[], 'fa')).toBe('');
 });
 it('does not resolve names using metadata for another organization',()=>{
   const otherTenantBranch={...tenantBranches[0],restaurant_id:'another-org',branch_key:'other-main',key:'other-main',id:'other-uuid',name:'Another company'};
   expect(treasuryBranchDisplayName(invoice,[otherTenantBranch], 'en')).toBe('Unknown branch');
 });
 it('uses display-only resolution in regular purchase cards without mutating the invoice',()=>{
  expect(files.purchases).toContain('branches={branches}');
  expect(files.list).toContain('branches = []');
  expect(files.list).toContain('treasuryBranchDisplayName(inv, branches, lang)');
  expect(files.list).toContain('{branchDisplayName}');
  expect(files.list).not.toContain('>{inv.branch}</span>');
  expect(files.list).not.toContain("supabase.from('supplier_invoices').update");
 });
 it('passes tenant branch metadata into both enterprise purchase lists',()=>{
  expect(files.enterprise).toContain('const { ownerFilter, activeRestaurant, branches } = useTenant()');
  expect(files.enterprise.match(/<MobileInvoiceList/g)?.length).toBe(2);
  expect(files.enterprise.match(/branches=\{branches\}/g)?.length).toBe(2);
  expect(files.enterprise.match(/lang=\{lang\}/g)?.length).toBeGreaterThanOrEqual(2);
  expect(files.enterprise).toContain('treasuryBranchDisplayName(inv, branches, lang).toLowerCase().includes(q)');
  // Branch filters must keep canonical stored keys, not their translated/display names.
  expect(files.enterprise).toContain('invoices.filter(i => i.branch === filterBranch)');
  expect(files.purchases).toContain(".eq('branch_id', selectedBranchId)");
 });
 it('renders a natural RTL label on phone while preserving raw backend reference',()=>{
  expect(files.mobile).toContain('const branchDisplayName = treasuryBranchDisplayName(inv, branches, lang)');
  expect(files.mobile).toContain('{branchDisplayName}');
  expect(files.mobile).not.toContain('>{inv.branch}</span>');
  expect(files.mobile).toContain('dir="auto"');
  expect(files.mobile).toContain('branches={branches}');
  expect(files.mobile).toContain('lang={lang}');
 });
});
