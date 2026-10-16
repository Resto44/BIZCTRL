import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {sponsorStatement,readSponsorSettlementRows} from '../src/lib/sponsorSettlementStatement.js';

const branch = {id:'b1',key:'main-9a50614652',name:'فرع الريان',label:'فرع الريان'};
const row=(flow_type,amount,status='approved',branchKey=branch.key)=>({
  id:`${flow_type}-${amount}-${status}`,flow_type,amount,status,branch:branchKey,date:'2026-10-16'
});

describe('Sponsor ERP accounting and iPhone regression',()=>{
  it('never represents empty data as fully settled',()=>{
    expect(sponsorStatement([],[branch],'fa').totals.status).toBe('no_data');
  });
  it('does not debit sponsor holdings from unapproved outgoing or pending receipts',()=>{
    const value=sponsorStatement([
      row('MANAGER_TO_SPONSOR','613.00'), row('MANAGER_TO_SPONSOR','5905.00','pending'),
      row('SPONSOR_TO_OWNER','200.00','pending'), row('SPONSOR_TO_OWNER','125.00','verified'),
    ],[branch],'fa');
    expect(value.totals.received).toBe(613);
    expect(value.totals.sent).toBe(0);
    expect(value.totals.remaining).toBe(613);
    expect(value.totals.pending).toBe(5905);
    expect(value.totals.pendingCount).toBe(1);
    expect(value.totals.status).toBe('awaiting_transfer');
    expect(value.ledger[0].label).toBe('فرع الريان');
  });
  it('recognizes approved transfers and distinguishes partial vs complete vs overpaid',()=>{
    const receipt=row('MANAGER_TO_SPONSOR',613);
    const partial=sponsorStatement([receipt,row('SPONSOR_TO_OWNER',250)],[branch]);
    expect(partial.totals).toMatchObject({received:613,sent:250,remaining:363,status:'partial'});
    const closed=sponsorStatement([receipt,row('SPONSOR_TO_OWNER',613)],[branch]);
    expect(closed.totals).toMatchObject({remaining:0,status:'settled'});
    const mismatch=sponsorStatement([receipt,row('SPONSOR_TO_OWNER',700)],[branch]);
    expect(mismatch.totals).toMatchObject({remaining:-87,status:'mismatch',mismatchCount:1});
  });
  it('does not count rejected payments or branch-owner funding as sponsor clearance',()=>{
    const result=sponsorStatement([row('MANAGER_TO_SPONSOR',110),
      row('SPONSOR_TO_OWNER',99,'rejected'),row('OWNER_TO_BRANCH',55)],[branch]);
    expect(result.totals.received).toBe(110);
    expect(result.totals.sent).toBe(0);
    expect(result.totals.rejectedCount).toBe(1);
    expect(result.ledger[0].ownerToBranch).toBe(55);
  });
  it('preserves valid negative residual and uses integer cents for decimals',()=>{
    const result=sponsorStatement([row('MANAGER_TO_SPONSOR','0.10'),row('SPONSOR_TO_OWNER','0.20')],[branch]);
    expect(result.totals.remaining).toBe(-0.1);
  });
  it('performs a tenant-scoped complete read, not a 500-item creator filter',async()=>{
    const calls=[];
    const rows=Array.from({length:1201},(_,i)=>({id:String(i),flow_type:'MANAGER_TO_SPONSOR',status:'pending'}));
    const db={from(t){calls.push(['table',t]);return{
      select(){return this},eq(k,v){calls.push(['eq',k,v]);return this},order(){return this},
      range(a,b){return Promise.resolve({data:rows.slice(a,b+1),error:null})}
    }}};
    const result=await readSponsorSettlementRows(db,'restaurant-1');
    expect(result).toHaveLength(1201);
    expect(calls).toContainEqual(['eq','restaurant_id','restaurant-1']);
    expect(calls).not.toContainEqual(['eq','created_by','restaurant-1']);
  });
  it('keeps Add Transaction mobile layout bounded without horizontal panning',()=>{
    const ui=readFileSync(new URL('../src/pages/Treasury.jsx',import.meta.url),'utf8');
    expect(ui).toContain('overflow-x-hidden overflow-y-auto');
    expect(ui).toContain('!w-[calc(100vw-1.5rem)]');
    expect(ui).toContain('grid-cols-1 gap-3 sm:grid-cols-2');
    expect(ui).toContain('[min-inline-size:0]');
    expect(ui).toContain('max-w-[calc(100vw-2rem)]');
    expect(ui).toContain('sticky bottom-0');
  });
  it('uses canonical restaurant and branch IDs on new sponsor submission, owner transfers and audits',()=>{
    for(const name of ['ManagerSubmitPanel.jsx','ReviewPanel.jsx']) {
      const source=readFileSync(new URL('../src/components/settlement/'+name,import.meta.url),'utf8');
      expect(source).toContain('restaurant_id: activeRestaurantId');
      expect(source).toContain('branch_id: chosenBranch.id');
    }
    const audit=readFileSync(new URL('../src/components/settlement/SettlementAuditLog.jsx',import.meta.url),'utf8');
    expect(audit).toContain('readSponsorSettlementRows(supabase, activeRestaurantId)');
  });
});
