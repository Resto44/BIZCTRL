import { describe, it, expect } from 'vitest';
import { isCustomerCreditSource, customerCreditSnapshots, customerCreditSourcePatch } from '../src/lib/customerCreditSources';
describe('customer-linked sales sources',()=>{
 const sources=[{id:'system',system_key:'credit',name_en:'Customer Credit'},{id:'corporate',name_en:'Corporate',...customerCreditSourcePatch(true)}];
 it('recognizes canonical and configured credit sources without treating ordinary customer-required cash as credit',()=>{
   expect(sources.every(isCustomerCreditSource)).toBe(true);
   expect(isCustomerCreditSource({requires_customer:true,default_payment_method:'cash'})).toBe(false);
   expect(isCustomerCreditSource({requires_customer:true,default_payment_method:'credit',allows_driver_entries:true})).toBe(false);
 });
 it('groups current credit by selected source, omitting payments and previous balances',()=>{
   const snapshots=customerCreditSnapshots(sources,[{source_id:'system',amount:20,payment_amount:50},{source_id:'corporate',amount:30,previous_outstanding_debt:999},{source_id:'corporate',amount:15},{source_id:'corporate',amount:0,payment_amount:100}]);
   expect(snapshots.map(s=>[s.source_id,s.amount,s.payment_bucket])).toEqual([['system',20,'credit'],['corporate',45,'credit']]);
   expect(snapshots.reduce((sum,s)=>sum+s.amount,0)).toBe(65);
 });
 it('keeps historical rows without a source on the canonical default and rejects unavailable source IDs',()=>{
   expect(customerCreditSnapshots(sources,[{amount:10}])[0].source_id).toBe('system');
   expect(()=>customerCreditSnapshots(sources,[{source_id:'other-branch',amount:10}])).toThrow('Select an active');
 });
});
