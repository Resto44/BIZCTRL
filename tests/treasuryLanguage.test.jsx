// @vitest-environment jsdom
import React from 'react';
import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({lang:'en'}));
vi.mock('@/lib/LanguageContext',()=>({useLanguage:()=>({lang:state.lang,locale:{locale:state.lang==='en'?'en-US':state.lang==='ar'?'ar-SA':'fa-IR'},formatDate:value=>value})}));
import BranchSettlementLedger from '../src/components/treasury/BranchSettlementLedger';
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
