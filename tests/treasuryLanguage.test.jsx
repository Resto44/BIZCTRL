// @vitest-environment jsdom
import React from 'react';
import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({lang:'en'}));
vi.mock('@/lib/LanguageContext',()=>({useLanguage:()=>({lang:state.lang,locale:{locale:state.lang==='en'?'en-US':state.lang==='ar'?'ar-SA':'fa-IR'},formatDate:value=>value})}));
import BranchSettlementLedger, { computeBranchSettlements } from '../src/components/treasury/BranchSettlementLedger';
it.each([
 ['en','Owner spending and returns exceed the amount received.'],
 ['fa','مصارف و مبالغ برگشتی مالک از مبلغ دریافتی بیشتر است.'],
 ['ar','مصروفات المالك والمبالغ المعادة تتجاوز المبلغ المستلم.'],
])('renders settlement warning in %s while preserving branch names',(lang,expected)=>{
 state.lang=lang;
 const html=renderToString(<BranchSettlementLedger branches={[{key:'branch',label:'فرع الريان'}]} transactions={[{branch:'branch',transaction_type:'owner_expense',amount:424,transaction_date:'2026-10-07'}]}/>);
 expect(html).toContain(expected);expect(html).toContain('فرع الريان');
 if(lang==='en') expect(html).not.toContain('مصارف');
});

it('keeps branch-funded purchases out of owner settlements',()=>{
 const ledger=computeBranchSettlements([
  {branch:'b',transaction_type:'branch_to_owner_cash',amount:'100'},
  {branch:'b',transaction_type:'branch_to_owner_network',amount:'50'},
  {branch:'b',transaction_type:'branch_purchase_payment',amount:80},
  {branch:'b',transaction_type:'owner_external_payment',amount:'25'},
  {branch:'b',transaction_type:'owner_to_branch_funding',amount:'10'},
  {branch:'unrelated',transaction_type:'branch_purchase_payment',amount:20},
 ]);
 expect(ledger.b.sentToOwner).toBe(150);
 expect(ledger.b.ownerExpenseForBranch).toBe(25);
 expect(ledger.b.remaining).toBe(115);
 expect(ledger.b.history).toHaveLength(4);
 expect(ledger.unrelated).toBeUndefined();
});
it('preserves owner advances as negative balances and ignores invalid amounts',()=>{
 const ledger=computeBranchSettlements([
  {branch:'b',transaction_type:'owner_expense',amount:'424'},
  {branch:'b',transaction_type:'owner_expense',amount:'invalid'},
 ]);
 expect(ledger.b.remaining).toBe(-424);
 expect(ledger.b.history).toHaveLength(1);
});
