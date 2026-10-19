import {describe,it,expect} from 'vitest';
import {ownerWalletSnapshot} from './walletERPViewModel';

describe('ERP Accounts & Wallet financial boundaries',()=>{
 const people=[{id:'a'},{id:'b'}];
 const transactions=[
  {id:'1',partner_id:'a',kind:'sponsor_advance_to_owner',amount:500,currency:'SAR'},
  {id:'2',partner_id:'a',kind:'owner_repay_sponsor',amount:100,currency:'SAR'},
  {id:'3',partner_id:'b',kind:'owner_advance_to_sponsor',amount:700,currency:'SAR'},
  {id:'4',partner_id:'a',kind:'owner_advance_to_sponsor',amount:15,currency:'USD'},
  {id:'5',partner_id:null,kind:'sponsor_advance_to_owner',amount:10000,currency:'SAR'},
  {id:'6',partner_id:'other',kind:'owner_advance_to_sponsor',amount:900,currency:'SAR'},
 ];
 const custodyBalances=[{currency:'SAR',payment_method:'cash',held:80,pending:2},{currency:'SAR',payment_method:'network',held:20,pending:1},{currency:'USD',payment_method:'cash',held:300,pending:4}];
 it('keeps personal claims and business custody as separate metrics without netting',()=>{
  expect(ownerWalletSnapshot({transactions,custodyBalances,people,currency:'SAR'})).toMatchObject({
   businessOwesPeople:400,peopleOweBusiness:700,custodyHeld:100,pendingCustodyCount:3,
  });
 });
 it('never blends other currencies or unassigned legacy transactions',()=>{
  const s=ownerWalletSnapshot({transactions,custodyBalances,people,currency:'USD'});
  expect(s.businessOwesPeople).toBe(0);
  expect(s.peopleOweBusiness).toBe(15);
  expect(s.custodyHeld).toBe(300);
  expect(s.pendingCustodyCount).toBe(4);
  expect(s.recentLoans).toHaveLength(1);
 });
 it('does not present missing unrelated amounts as business funding',()=>{
  expect(ownerWalletSnapshot({people,currency:'SAR'})).toEqual({
   businessOwesPeople:0,peopleOweBusiness:0,custodyHeld:0,pendingCustodyCount:0,recentLoans:[]
  });
 });
});
