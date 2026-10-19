// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import OwnerWalletOperations from '../src/components/settlement/OwnerWalletOperations.jsx';
const read=p=>readFileSync(p,'utf8');
const page=read('src/components/settlement/PartnerTreasuryCenter.jsx');
const summary=read('src/components/settlement/WalletERPOverview.jsx');
const ledger=read('src/components/settlement/SponsorOwnerBilateralLedger.jsx');
const activity=read('src/components/settlement/OwnerWalletPersonActivity.jsx');

describe('Owner Accounts & Wallet bank-style routing',()=>{
 it('distinguishes real custody, personal debt and account statement without a generic bank transfer',async()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const host=document.createElement('div');document.body.append(host);
  const root=createRoot(host);const clicked=[];
  await act(async()=>root.render(<OwnerWalletOperations partner={{id:'A',name:'فرد',is_active:true,allow_loans:true}}
   lang="fa" onCustody={()=>clicked.push('custody')} onAdvance={()=>clicked.push('advance')} onStatement={()=>clicked.push('statement')}/>));
  expect(host.textContent).toContain('عملیات حساب');
  expect(host.textContent).toContain('انتقال پول امانی کسب‌وکار');
  expect(host.textContent).toContain('قرض شخصی / بازپرداخت');
  expect(host.textContent).toContain('گردش حساب');
  expect(host.textContent).toContain('هیچ پولی از بانک بیرونی انتقال داده نمی‌شود.');
  await act(async()=>{
   for(const button of host.querySelectorAll('button'))button.click();
  });
  expect(clicked).toEqual(['custody','advance','statement']);
  await act(async()=>root.unmount());host.remove();
 });
 it('never presents personal loans as permitted when the account loan permission is disabled',async()=>{
  const host=document.createElement('div');document.body.append(host),root=createRoot(host);
  await act(async()=>root.render(<OwnerWalletOperations partner={{id:'B',name:'Employee',is_active:true,allow_loans:false}} lang="en" onCustody={()=>{}} onAdvance={()=>{}} onStatement={()=>{}}/>));
  const buttons=[...host.querySelectorAll('button')];
  expect(buttons).toHaveLength(3);
  expect(buttons[0].disabled).toBe(false);
  expect(buttons[1].disabled).toBe(true);
  expect(buttons[2].disabled).toBe(false);
  await act(async()=>root.unmount());host.remove();
 });
 it('uses custody request-and-owner-review workflow, not an undocumented bank transfer RPC',()=>{
  expect(page).toContain("const showCustody=()=>{setRecordSignal(0);setRequestTab('custody');setView('requests');}");
  expect(page).toContain("const showFinance=()=>{setRecordSignal(x=>x+1);setView('ledger');}");
  expect(page).toContain("onCustody={showCustody}");
  expect(page).toContain("onAdvance={showFinance}");
  expect(page).toContain("requestTab==='custody'?<PartnerTransactionRequests");
  expect(page).toContain("view==='ledger'&&partner&&<SponsorOwnerBilateralLedger");
  expect(page).toContain("onSelect(p.id)");
  expect(page).not.toContain('erp_post_wallet_bank_transfer');
 });
 it('makes owner account KPIs visible and sources remain independently loading',()=>{
  expect(summary).toContain('summary.custodyHeld');
  expect(summary).toContain('summary.pendingCustodyCount');
  expect(summary).toContain('summary.businessOwesPeople');
  expect(summary).toContain('summary.peopleOweBusiness');
  expect(summary).toContain('loading={custody.isPending}');
  expect(summary).toContain('loading={ledger.isPending}');
  expect(summary).toContain('<OwnerWalletPersonActivity');
  expect(activity).toContain("erp_person_custody");
  expect(activity).toContain("q.isPending?<p role=\"status\"");
  expect(activity).toContain("q.isError?<p role=\"alert\"");
  expect(activity).toContain("<WalletUnifiedActivity loans={loans} custody={q.data.records}");
 });
 it('old loan dialog is named as personal finance, not a generic wallet transfer, in EN/AR/FA',()=>{
  expect(ledger).toContain("new:'Record personal advance / repayment'");
  expect(ledger).toContain("new:'ثبت قرض / بازپرداخت'");
  expect(ledger).toContain("new:'تسجيل سلفة / سداد'");
  expect(ledger).toContain('PERSONAL FINANCE ONLY');
  expect(ledger).toContain('p_kind:form.kind');
  expect(ledger).not.toContain("new:'Record transaction'");
 });
});
