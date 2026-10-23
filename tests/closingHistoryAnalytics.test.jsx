// @vitest-environment jsdom
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { buildClosingTrendIndex, closingFinancialAnalysis } from '../src/lib/closingHistoryAnalytics';
import ClosingHistoryAnalytics from '../src/components/sales/ClosingHistoryAnalytics';
const row = (id, date, sales, patch = {}) => ({ id, date, restaurant_id: 'r', branch_id: 'b', cashier_id: 'c', shift: 'Morning', closing_state: 'finalized', restaurant_cash: sales, approved_purchases_total: 400, expenses_total: 150, ...patch });
describe('Closing history analytics', () => {
  it('compares only available earlier finalized shifts with the same tenant, branch, operator and shift', () => {
    const current = row('now','2026-10-23',1000);
    const records = [current, row('old','2026-10-22',800), row('future','2026-10-24',2000), ...[
      { restaurant_id:'other' }, { branch_id:'other' }, { cashier_id:'other' }, { shift:'Evening' }, { closing_state:'draft' }, { closing_state:'cancelled' }
    ].map((patch,i)=>row(`wrong${i}`,'2026-10-21',4000,patch))];
    expect(buildClosingTrendIndex(records).get('now')).toEqual({ points:[{date:'2026-10-22',value:800},{date:'2026-10-23',value:1000}],previous:{date:'2026-10-22',value:800},change:25 });
  });
  it('excludes ambiguous same-date closings and does not mix canonical IDs with legacy keys', () => {
    const records = [row('now','2026-10-23',1000),row('a','2026-10-22',500),row('b','2026-10-22',300),row('legacy','2026-10-21',800,{branch_id:null,branch:'b'}),row('unknown','2026-10-20',100,{cashier_id:null})];
    expect(buildClosingTrendIndex(records).get('now').points).toHaveLength(1);
    expect(buildClosingTrendIndex(records).has('a')).toBe(false);
    expect(buildClosingTrendIndex(records).has('unknown')).toBe(false);
  });
  it('caps real observations at seven, sorts dates and has no invented percent from a zero baseline', () => {
    const records = Array.from({length:10},(_,i)=>row(String(i),`2026-10-${String(i+10).padStart(2,'0')}`,i*100));
    const result = buildClosingTrendIndex(records.reverse());
    expect(result.get('9').points).toHaveLength(7);
    expect(result.get('1').change).toBeNull();
    expect(result.get('9').previous.date).toBe('2026-10-18');
  });
  it('uses canonical sales once and keeps owner funding and cash variance outside profit', () => {
    const result = closingFinancialAnalysis(row('a','2026-10-23',600,{restaurant_network:300,credit:100,owner_cash_injection:200,cash_difference:-20,sales_sources_json:[{amount:600}]}));
    expect(result).toMatchObject({sales:1000,grossProfit:600,netProfit:450,margin:45,allocation:[40,15,45]});
  });
  it('keeps losses signed and refuses misleading allocation charts for losses, invalid sales or missing/zero costs', () => {
    expect(closingFinancialAnalysis(row('a','2026-10-23',300))).toMatchObject({netProfit:-250,allocation:null});
    expect(closingFinancialAnalysis(row('a','2026-10-23','bad'))).toMatchObject({sales:null,netProfit:null,margin:null});
    expect(closingFinancialAnalysis(row('a','2026-10-23',1000,{expenses_total:null}))).toMatchObject({netProfit:null,margin:null,allocation:null});
    expect(closingFinancialAnalysis(row('a','2026-10-23',1000,{expenses_total:0,approved_purchases_total:0}))).toMatchObject({margin:null,allocation:null,noRecordedCosts:true});
  });
  it.each(['fa','ar','en'])('renders real trends and reveals the waterfall only when expanded (%s)', lang => {
    const sale = row('a','2026-10-23',1000), trend = buildClosingTrendIndex([sale,row('b','2026-10-22',800)]).get('a');
    const closed = renderToStaticMarkup(<ClosingHistoryAnalytics sale={sale} trend={trend} lang={lang}/>);
    expect(closed).toContain('+25.0%'); expect(closed).toContain('2026-10-22'); expect(closed).not.toContain('closing-profit-waterfall');
    const open = renderToStaticMarkup(<ClosingHistoryAnalytics sale={sale} trend={trend} lang={lang} expanded/>);
    expect(open).toContain('closing-profit-waterfall'); expect(open).not.toMatch(/NaN|Infinity/);
  });
});
