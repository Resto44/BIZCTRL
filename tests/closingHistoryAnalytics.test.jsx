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
  it('keeps all four independently finalized Oct 31 closings and three prior Oct 27 sessions in the trend',()=>{
    const rows=[
      ...[560,976,930].map((amount,i)=>row('prior-'+(i+1),'2026-10-27',amount,
        {closing_session_no:i+1,finalized_at:`2026-10-27T0${i+8}:00:00Z`})),
      ...[427,203,453,407].map((amount,i)=>row('current-'+(i+1),'2026-10-31',amount,
        {closing_session_no:i+1,finalized_at:`2026-10-31T0${i+8}:00:00Z`}))
    ];
    const trend=buildClosingTrendIndex([...rows].reverse());
    const newest=trend.get('current-4');
    expect(newest.points).toHaveLength(7);
    expect(newest.points.map(p=>[p.date,p.session])).toEqual([
      ['2026-10-27',1],['2026-10-27',2],['2026-10-27',3],
      ['2026-10-31',1],['2026-10-31',2],['2026-10-31',3],['2026-10-31',4]
    ]);
    expect(newest.previous).toMatchObject({date:'2026-10-31',session:3,value:453});
    expect(newest.change).toBeCloseTo((407-453)/453*100);
    expect(renderToStaticMarkup(<ClosingHistoryAnalytics sale={rows[6]} trend={newest}/>))
      .toContain('(7/7)');
  });
  it('respects real close times when older same-day sessions have no sequence numbers',()=>{
    const old=row('old','2026-10-30',100,{finalized_at:'2026-10-30T05:00:00Z'});
    const next=row('next','2026-10-30',200,{finalized_at:'2026-10-30T11:00:00Z'});
    const trend=buildClosingTrendIndex([next,old]);
    expect(trend.get('next').points.map(p=>p.value)).toEqual([100,200]);
  });
  it('never mixes a different cashier or branch into a shared date trend',()=>{
    const a=row('a','2026-10-31',100,{closing_session_no:1});
    const b=row('b','2026-10-31',200,{closing_session_no:2});
    const unrelated=row('x','2026-10-31',999,{closing_session_no:3,cashier_id:'other'});
    const trend=buildClosingTrendIndex([a,b,unrelated]);
    expect(trend.get('b').points.map(p=>p.value)).toEqual([100,200]);
    expect(trend.get('x').points.map(p=>p.value)).toEqual([999]);
  });
  it('shows lengthy accounting guidance only under a collapsed disclosure',()=>{
    const sale=row('cost-warning','2026-10-31',407,{
      approved_purchases_total:0,expenses_total:0,fixed_expenses_total:0,variable_expenses_total:0
    });
    const html=renderToStaticMarkup(<ClosingHistoryAnalytics sale={sale}/>);
    expect(html).toMatch(/<details[^>]*data-testid="closing-history-accounting-notes"[^>]*>.*?<summary/s);
    expect(html).toMatch(/Profit unverified|Fixed costs unverified/);
    expect(html).not.toContain('These amounts were saved when this date was finalized.');
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
