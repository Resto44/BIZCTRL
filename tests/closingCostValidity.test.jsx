// @vitest-environment jsdom
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {closingExpenseContext} from '../src/lib/dailySalesPresentation';
import ClosingHistoryAnalytics from '../src/components/sales/ClosingHistoryAnalytics';
const row={restaurant_cash:1420,approved_purchases_total:1158,fixed_expenses_total:0,variable_expenses_total:0,expenses_total:0};
describe('Closing cost validity and RTL',()=>{
 it.each([null,undefined,'',' ','bad',Infinity,-1,false,[],{}])('rejects unavailable cost %s rather than coercing to zero',value=>{
  expect(closingExpenseContext({fixed_expense_today:value,variable_expenses_today:0})).toMatchObject({fixed:null,complete:false,total:null});
  expect(closingExpenseContext({fixed_expense_today:0,variable_expenses_today:value})).toMatchObject({variable:null,complete:false,total:null});
 });
 it('retains explicit zero and totals cents exactly',()=>{
  expect(closingExpenseContext({fixed_expense_today:'0',variable_expenses_today:0})).toEqual({fixed:0,variable:0,complete:true,total:0});
  expect(closingExpenseContext({fixed_expense_today:0.1,variable_expenses_today:0.2}).total).toBe(0.3);
 });
 it('labels a zero-fixed result provisional and keeps signs and percentages in LTR isolates',()=>{
  const html=renderToStaticMarkup(<ClosingHistoryAnalytics sale={row} lang="fa" trend={{change:-37.9}} expanded/>);
  expect(html).toContain('closing-result-provisional');expect(html).toContain('قبل از تأیید پوشش مصارف ثابت');
  expect(html).toContain('unicode-bidi:isolate');expect(html).toContain('unicode-bidi:bidi-override');
  expect(html).toContain('<bdi dir="ltr" class="font-bold">18.5%</bdi>');expect(html).not.toContain('>-0</text>');
  expect(html).toContain('fill="#b45309"');expect(html).not.toContain('#d97706');
 });
 it('does not claim positive fixed allocation is missing',()=>{
  const html=renderToStaticMarkup(<ClosingHistoryAnalytics sale={{...row,fixed_expenses_total:100,expenses_total:100}}/>);
  expect(html).not.toContain('closing-result-provisional');expect(html).not.toContain('Saved fixed allocation is zero');
 });
 it('guards both validation and submit paths against incomplete expense contexts',()=>{
  const source=readFileSync('src/components/sales/UnifiedSalesClosing.jsx','utf8');
  expect(source).toContain('passed: expenseContextReady');
  expect(source).toContain('if (!expenseContextReady) nextErrors.expenses = expenseContextMessage');
  expect(source).not.toContain('Number(cashLedgerContext.fixed_expense_today) || 0');
 });
});
