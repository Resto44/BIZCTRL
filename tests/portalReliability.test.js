import {describe,it,expect,vi} from 'vitest';
import {portalAccountState,portalTreasuryMovement,supplierInvoiceTotals,supplierInvoiceCurrencyTotals,readAllPortalRows} from '../src/lib/portalReliability';
describe('portal reliability',()=>{
 it('does not let active status override rejection or pending approval',()=>{
  expect(portalAccountState({status:'active',approval_status:'rejected'})).toBe('blocked');
  expect(portalAccountState({status:'active',approval_status:'pending'})).toBe('pending');
  expect(portalAccountState({status:'active',is_active:false})).toBe('blocked');
  expect(portalAccountState({status:'active',approval_status:'approved'})).toBe('ready');
 });
 it('honors canonical out direction and legacy negative values',()=>{
  expect(portalTreasuryMovement([{amount:'100',direction:'in'},{amount:'30',direction:'out'},{amount:-10}])).toEqual({inflow:100,outflow:40,net:60});
 });
 it('counts partial payments, preserves explicit zero, and excludes voids',()=>{
  expect(supplierInvoiceTotals([{total_amount:'100',paid_amount:'40',status:'partial'},{total_amount:20,paid_amount:0,status:'paid'},{total_amount:50,status:'paid'},{total_amount:900,status:'void'}])).toEqual({invoiced:170,paid:90,outstanding:80});
 });
 it('keeps currencies separate',()=>{
  expect(supplierInvoiceCurrencyTotals([{total_amount:100,currency:'SAR'},{total_amount:25,currency:'USD'}])).toEqual([{currency:'SAR',invoiced:100,paid:0,outstanding:100},{currency:'USD',invoiced:25,paid:0,outstanding:25}]);
 });
 it('reads beyond the first server page',async()=>{
  const range=vi.fn().mockResolvedValueOnce({data:[1,2]}).mockResolvedValueOnce({data:[3]});
  expect(await readAllPortalRows(()=>({range}),2)).toEqual([1,2,3]);
  expect(range.mock.calls).toEqual([[0,1],[2,3]]);
 });
 it('rejects a partial result if a later page fails',async()=>{
  const range=vi.fn().mockResolvedValueOnce({data:[1,2]}).mockResolvedValueOnce({error:new Error('offline')});
  await expect(readAllPortalRows(()=>({range}),2)).rejects.toThrow('offline');
 });
});
