import {describe,it,expect} from 'vitest';
import {reconcileSalesToTreasury} from '../src/lib/treasuryReconciliation';
import {buildTreasuryEntry} from '../src/lib/treasuryEntryValidation';
const sale={id:'sale',date:'2026-10-11',branch:'b',closing_state:'finalized',restaurant_cash:0,restaurant_network:100};
const tx={id:'tx',reference_id:'sale',transaction_date:'2026-10-11',branch:'b',direction:'in',wallet:'owner_network',transaction_type:'network_sales_auto_v2',amount:100};
describe('Treasury audit edge cases',()=>{
 it('reports a network posting against a zero-network closing',()=>{
  const rows=reconcileSalesToTreasury({sales:[{...sale,restaurant_network:0}],transactions:[tx]});
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({status:'discrepancy',expected:0,deposited:100,diff:-100});
 });
 it('reports wrong direction and wallet instead of marking the closing matched',()=>{
  for(const changed of [{...tx,direction:'out'},{...tx,wallet:'branch_cash'}]){
   const [row]=reconcileSalesToTreasury({sales:[sale],transactions:[changed]});
   expect(row.status).toBe('discrepancy');
  }
 });
 it('detects one-cent differences despite binary floating point rounding',()=>{
  const [row]=reconcileSalesToTreasury({sales:[{...sale,restaurant_network:1.15}],transactions:[{...tx,amount:1.14}]});
  expect(row.status).toBe('discrepancy');
 });
 it('keeps a valid zero closing without postings out of exceptions',()=>{
  expect(reconcileSalesToTreasury({sales:[{...sale,restaurant_network:0}]})).toEqual([]);
 });
 it('rejects impossible calendar dates while accepting leap days',()=>{
  const input={form:{type:'owner_expense',date:'2026-02-30',amount:10,payment_method:'cash'},
   account:{id:'a',account_type:'cash'},meta:{wallet:'owner_cash',direction:'out'},restaurantId:'r'};
  for(const date of ['2026-02-30','2026-02-29','2026-04-31','2026-13-01']){
   expect(()=>buildTreasuryEntry({...input,form:{...input.form,date}})).toThrow('valid transaction date');
  }
  expect(buildTreasuryEntry({...input,form:{...input.form,date:'2024-02-29'}}).transaction_date).toBe('2024-02-29');
 });
});
