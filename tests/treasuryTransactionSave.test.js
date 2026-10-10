import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { buildTreasuryEntry, TreasuryEntryError, treasurySaveErrorMessage } from '../src/lib/treasuryEntryValidation.js';

const account={id:'a1',restaurant_id:'r1',account_name:'الراجحي',account_type:'cash',is_active:true};
const branches=[{id:'b1',key:'rayyan',label:'فرع الريان'},{id:'b2',key:'rawdah'}];
const meta={value:'salary_advance',wallet:'branch_cash',direction:'out'};
const form={type:'salary_advance',account_id:'a1',date:'2026-10-10',amount:'450',
  branch:'',payment_method:'cash',description:'Advance for employee'};
const args={form,account,meta,branches,restaurantId:'r1',
  selectedBranchId:'b1',selectedBranchKey:'rayyan',isAllBranches:false};
describe('Treasury transaction save regression',()=>{
  it('uses selected branch when the manager branch selector is hidden',()=>{
    const result=buildTreasuryEntry(args);
    expect(result).toMatchObject({restaurant_id:'r1',transaction_type:'salary_advance',
      branch_id:'b1',branch:'rayyan',amount:450,payment_method:'cash',
      direction:'out',wallet:'owner_cash',account_id:'a1'});
  });
  it('owner must choose destination branch on branch-only transaction',()=>{
    expect(()=>buildTreasuryEntry({...args,isAllBranches:true,
      selectedBranchId:null,selectedBranchKey:null})).toThrow('Choose the destination branch');
  });
  it('rejects selected branch outside current allowed scope',()=>{
    expect(()=>buildTreasuryEntry({...args,form:{...form,branch:'rawdah'}})).toThrow('outside your current branch scope');
  });
  it('rejects account assigned to a different branch and restaurant',()=>{
    expect(()=>buildTreasuryEntry({...args,account:{...account,branch_id:'b2',branch_key:'rawdah'}}))
      .toThrow('do not match');
    expect(()=>buildTreasuryEntry({...args,account:{...account,restaurant_id:'r2'}}))
      .toThrow('different restaurant');
  });
  it('never inserts ambiguous BOTH payment with no cash/network amounts',()=>{
    expect(()=>buildTreasuryEntry({...args,form:{...form,payment_method:'both'}}))
      .toThrow(TreasuryEntryError);
    expect(()=>buildTreasuryEntry({...args,form:{...form,payment_method:'both'}}))
      .toThrow('two separate');
  });
  it('rejects invalid amount/date and accepts decimal money without floating noise',()=>{
    for(const invalid of ['0','-5','abc','1.231']){
      expect(()=>buildTreasuryEntry({...args,form:{...form,amount:invalid}})).toThrow();
    }
    const result=buildTreasuryEntry({...args,form:{...form,amount:'450.50',payment_method:'network'}});
    expect(result.amount).toBe(450.5);
    expect(result.payment_method).toBe('network');
  });
  it('converts Supabase RLS, FK and unknown errors into visible status text',()=>{
    expect(treasurySaveErrorMessage({code:'42501'})).toMatch(/Permission denied/);
    expect(treasurySaveErrorMessage({code:'23503'})).toMatch(/no longer exists/);
    expect(treasurySaveErrorMessage({code:'23505'})).toMatch(/already have been saved/);
    expect(treasurySaveErrorMessage({message:'PostgREST connection closed'}))
      .toMatch(/not confirmed.*PostgREST/);
  });
  it('saves transaction before push, displays save errors, idempotently retries',async()=>{
    const page=await readFile(new URL('../src/pages/Treasury.jsx',import.meta.url),'utf8');
    expect(page).toContain('await saveMut.mutateAsync');
    expect(page).toContain('pendingTransactionId.current ||= crypto.randomUUID()');
    expect(page).toContain("if(error?.code==='23505'");
    expect(page).toContain("setTransactionError(message)");
    expect(page).toContain('role="alert"');
    expect(page).toContain("toast.success(local('Transaction saved successfully.'))");
    expect(page.indexOf('await saveMut.mutateAsync')).toBeLessThan(page.indexOf('notif.salaryAdvance({'));
    expect(page).not.toContain("notif.error(");
    expect(page).not.toContain("setSelectedBranchId(branchKey === 'all'");
  });
});