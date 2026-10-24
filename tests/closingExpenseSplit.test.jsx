// @vitest-environment jsdom
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {dailySalesProfitSummary,toDailySalesCardRecord} from '../src/lib/dailySalesPresentation';
import ClosingHistoryAnalytics from '../src/components/sales/ClosingHistoryAnalytics';
const row={restaurant_cash:1925,approved_purchases_total:1158,fixed_expenses_total:300,variable_expenses_total:67,expenses_total:367};
describe('Closing expense classification',()=>{
 it('preserves snapshots through the card mapper and subtracts the combined expenses only once',()=>{
  expect(dailySalesProfitSummary(toDailySalesCardRecord(row))).toMatchObject({purchases:1158,fixedExpenses:300,variableExpenses:67,operatingExpenses:367,totalCosts:1525,netProfit:400,expenseBreakdownComplete:true,expenseBreakdownMismatch:false});
 });
 it('does not manufacture a split for legacy combined totals',()=>{
  const result=dailySalesProfitSummary({...row,fixed_expenses_total:undefined,variable_expenses_total:undefined});
  expect(result).toMatchObject({fixedExpenses:null,variableExpenses:null,expenseBreakdownComplete:false,netProfit:400});
 });
 it('blocks profit when fixed and variable do not reconcile, including legacy default zeros',()=>{
  expect(dailySalesProfitSummary({...row,fixed_expenses_total:0,variable_expenses_total:0})).toMatchObject({expenseBreakdownMismatch:true,netProfit:null,costsMissing:true});
 });
 it('handles fractional money without duplicate expense deductions',()=>{
  expect(dailySalesProfitSummary({...row,restaurant_cash:1,approved_purchases_total:0.1,fixed_expenses_total:0.1,variable_expenses_total:0.2,expenses_total:0.3})).toMatchObject({netProfit:0.6,expenseBreakdownMismatch:false});
 });
 it.each(['en','fa','ar'])('renders three costs and five waterfall steps in %s',lang=>{
  const html=renderToStaticMarkup(<ClosingHistoryAnalytics sale={toDailySalesCardRecord(row)} lang={lang} expanded/>);
  expect(html).toContain('SAR 1,158');expect(html).toContain('SAR 300');expect(html).toContain('SAR 67');expect(html).toContain('+SAR 400');
  expect((html.match(/<rect /g)||[])).toHaveLength(5);expect(html).not.toMatch(/NaN|Infinity/);
 });
 it('warns on zero fixed allocation instead of implying rent and payroll are covered',()=>{
  const html=renderToStaticMarkup(<ClosingHistoryAnalytics sale={{...row,fixed_expenses_total:0,variable_expenses_total:0,expenses_total:0}}/>);
  expect(html).toContain('Saved fixed allocation is zero');
 });
});
