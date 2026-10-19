import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {sponsorOwnerSummary,validateSponsorOwnerEntry,readSponsorOwnerRows,
  SPONSOR_OWNER_KINDS,sponsorOwnerAccountMethod} from '../src/lib/sponsorOwnerBilateral.js';
import {sponsorStatement} from '../src/lib/sponsorSettlementStatement.js';

const tx=(kind,amount,currency='SAR')=>({kind,amount,currency,effective_date:'2026-10-16'});
describe('Bilateral Sponsor-Owner ERP accounting',()=>{
  it('classifies cash and network accounts exactly as the posting RPC does',()=>{
    expect(sponsorOwnerAccountMethod({legacy_wallet_key:'owner_cash',account_type:'bank'})).toBe('cash');
    expect(sponsorOwnerAccountMethod({legacy_wallet_key:'owner_network',account_type:'cash'})).toBe('network');
    for(const account_type of ['bank','network_pos','digital_wallet','clearing']) expect(sponsorOwnerAccountMethod({account_type})).toBe('network');
    expect(sponsorOwnerAccountMethod({account_type:'cash'})).toBe('cash');
    expect(sponsorOwnerAccountMethod({legacy_wallet_key:'branch_cash'})).toBe(null);
    expect(sponsorOwnerAccountMethod(null)).toBe(null);
  });
  it('keeps each party receivable separate without netting unrelated claims',()=>{
    const rows=[tx('sponsor_advance_to_owner','500.00'),
      tx('owner_repay_sponsor','120.00'),tx('owner_advance_to_sponsor','700.00'),
      tx('sponsor_repay_owner','100.00')];
    expect(sponsorOwnerSummary(rows,'SAR')).toMatchObject({
      ownerOwes:380,sponsorOwes:600,sponsorLent:500,ownerRepaid:120,
      ownerLent:700,sponsorRepaid:100,count:4,
    });
  });
  it('does not combine different currencies into a misleading single total',()=>{
    const r=[tx('sponsor_advance_to_owner','100','SAR'),tx('owner_advance_to_sponsor','500','USD')];
    expect(sponsorOwnerSummary(r,'SAR')).toMatchObject({ownerOwes:100,sponsorOwes:0,count:1});
    expect(sponsorOwnerSummary(r,'USD')).toMatchObject({ownerOwes:0,sponsorOwes:500,count:1});
  });
  it('never maps branch sponsor settlements into personal bilateral debt',()=>{
    const sponsorCustody=sponsorStatement([{
      id:'sale-1',flow_type:'MANAGER_TO_SPONSOR',status:'approved',
      branch:'main-abc12345',amount:300
    }]);
    const bilateral=sponsorOwnerSummary([],'SAR');
    expect(sponsorCustody.totals.received).toBe(300);
    expect(bilateral.ownerOwes).toBe(0);
    expect(bilateral.sponsorOwes).toBe(0);
  });
  it('uses one money movement per type with explicit inbound/outbound side',()=>{
    expect(SPONSOR_OWNER_KINDS.sponsor_advance_to_owner).toMatchObject({direction:'in',side:'ownerOwes'});
    expect(SPONSOR_OWNER_KINDS.owner_repay_sponsor).toMatchObject({direction:'out',side:'ownerOwes'});
    expect(SPONSOR_OWNER_KINDS.owner_advance_to_sponsor).toMatchObject({direction:'out',side:'sponsorOwes'});
    expect(SPONSOR_OWNER_KINDS.sponsor_repay_owner).toMatchObject({direction:'in',side:'sponsorOwes'});
  });
  it('validates positive two-decimal amounts including Persian numerals and real dates',()=>{
    const valid={kind:'owner_advance_to_sponsor',amount:'23.50',date:'2026-10-10',accountId:'a'};
    expect(validateSponsorOwnerEntry(valid)).toBeNull();
    expect(validateSponsorOwnerEntry({...valid,amount:'۲۳.۵۰'})).toBeNull();
    expect(validateSponsorOwnerEntry({...valid,amount:'5.888'})).toBe('amount');
    expect(validateSponsorOwnerEntry({...valid,amount:'-5'})).toBe('amount');
    expect(validateSponsorOwnerEntry({...valid,date:'2026-02-31'})).toBe('date');
    expect(validateSponsorOwnerEntry({...valid,date:'2099-10-16'})).toBe('date');
    expect(validateSponsorOwnerEntry({...valid,accountId:''})).toBe('account');
  });
  it('pages beyond first thousand records and preserves tenant scope',async()=>{
    const source=Array.from({length:1201},(_,i)=>({id:String(i),kind:'sponsor_repay_owner'}));
    const args=[];
    const db={from(name){args.push(['from',name]);return{
      select(){return this},eq(k,v){args.push(['eq',k,v]);return this},
      order(){return this},range(a,b){return Promise.resolve({data:source.slice(a,b+1),error:null})}
    }}};
    const rows=await readSponsorOwnerRows(db,'restaurant-id');
    expect(rows).toHaveLength(1201);
    expect(args).toContainEqual(['eq','restaurant_id','restaurant-id']);
  });
  it('atomic server RPC is the only posting path; client never writes or reassigns historical sponsor records',()=>{
    const ui=readFileSync(new URL('../src/components/settlement/SponsorOwnerBilateralLedger.jsx',import.meta.url),'utf8');
    expect(ui).toContain("supabase.rpc(partner?'erp_post_partner_transaction':'erp_post_sponsor_owner_transaction'");
    expect(ui).toContain("requestId.current ||= crypto.randomUUID()");
    expect(ui).not.toContain("from('sponsor_owner_transactions').insert(");
    const migration=readFileSync(new URL('../supabase/migrations/20261016184500_sponsor_owner_bilateral_erp.sql',import.meta.url),'utf8');
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('treasury_account_is_owner(p_restaurant_id)');
    expect(migration).toContain('FOR UPDATE');
    expect(migration).toContain('ERP_SPONSOR_OWNER_REPAY_EXCEEDS_DUE');
    expect(migration).toContain('ERP_SPONSOR_OWNER_INSUFFICIENT_TREASURY');
    expect(migration).toContain('v_existing');
    expect(migration).toContain('trg_erp_sponsor_owner_wallet_immutable');
    expect(migration).not.toContain('UPDATE public.settlement_records');
  });
  it('module is discoverable from Treasury Sponsor and standalone Sponsor↔Owner',()=>{
    const source=path=>readFileSync(new URL(path,import.meta.url),'utf8');
    expect(source('../src/pages/Treasury.jsx')).toContain('<SponsorOwnerBilateralLedger />');
    expect(source('../src/pages/SponsorTreasury.jsx')).toContain('<WalletBankingOwnerPortal/>');
    expect(source('../src/pages/SponsorTreasury.jsx')).not.toContain('<TabsContent value="bilateral">');
  });
});
