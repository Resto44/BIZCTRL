import {expect,it,vi} from 'vitest';
import {filterPartnerRecords,partnerBalanceTrend,loadPartnerStatement,partnerPeriodStart,summarizePartnerRecords} from '../src/lib/partnerAnalytics';
const row=(id,kind='owner_advance_to_sponsor',amount=100,currency='SAR')=>({id,kind,amount,currency,effective_date:'2026-10-18',payment_method:'cash'});
it('loads all authorized pages rather than summing the first 50',async()=>{
 const records=Array.from({length:51},(_,i)=>row(String(i)));
 const client={rpc:vi.fn(async(_,{p_partner_id,p_offset})=>{expect(p_partner_id).toBe('partner-a');return {data:{count:51,balances:[],records:records.slice(p_offset,p_offset+50)}};})};
 expect((await loadPartnerStatement(client,'partner-a')).records).toHaveLength(51);expect(client.rpc).toHaveBeenCalledTimes(3);
});
it('refuses inconsistent or denied page data',async()=>{
 const client={rpc:vi.fn().mockResolvedValueOnce({data:{count:51,balances:[],records:Array.from({length:50},(_,i)=>row(String(i)))}}).mockResolvedValue({data:{count:52,balances:[],records:[row('51')]}})};
 await expect(loadPartnerStatement(client,'a')).rejects.toThrow('STATEMENT_CHANGED');
 await expect(loadPartnerStatement({rpc:async()=>({error:Error('denied')})},'a')).rejects.toThrow('denied');
});
it('uses partner direction and integer minor units without mixing currencies',()=>{
 const records=[row('a','owner_advance_to_sponsor',0.1),row('b','owner_repay_sponsor',0.2),row('c','sponsor_advance_to_owner',10),row('d','sponsor_repay_owner',5),row('e','owner_advance_to_sponsor',999,'USD')];
 const filtered=filterPartnerRecords(records,{currency:'SAR'}),s=summarizePartnerRecords(filtered);
 expect(s.incoming).toBe(.3);expect(s.outgoing).toBe(15);expect(s.methods.cash).toBe(15.3);expect(s.pending).toBe(4);
});
it('filters dates, method, confirmation and reference consistently',()=>{
 const records=[{...row('a'),external_reference:'receipt-123',confirmed_at:'2026-10-18'},{...row('b'),payment_method:'network'}];
 expect(filterPartnerRecords(records,{currency:'SAR',from:'2026-10-01',to:'2026-10-18',method:'cash',status:'confirmed',search:'123'}).map(r=>r.id)).toEqual(['a']);
 expect(filterPartnerRecords(records,{currency:'SAR',to:'2026-10-17'})).toEqual([]);
});
it('computes calendar month and rolling day filters across year boundaries',()=>{
 expect(partnerPeriodStart('quarter','2026-01-20')).toBe('2025-11-01');expect(partnerPeriodStart('week','2026-01-03')).toBe('2025-12-28');expect(partnerPeriodStart('all','2026-01-03')).toBe('');
});

it('balance trends carry prior principal and keep both obligations separate',()=>{
 const records=[{...row('prior','sponsor_advance_to_owner',100),effective_date:'2026-09-01'},row('repay','owner_repay_sponsor',25),row('advance','owner_advance_to_sponsor',40),row('foreign','owner_advance_to_sponsor',999,'USD')];
 expect(partnerBalanceTrend(records,'SAR','2026-10-01','2026-10-31')).toEqual([{month:'2026-10',owner:75,partner:40}]);
});
