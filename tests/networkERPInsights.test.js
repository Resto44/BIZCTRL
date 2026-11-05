import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  NETWORK_PERIODS, networkDateWindow, networkInsights,
  networkReportedAmount, riyadhBusinessDate, branchMatches,
} from '../src/lib/networkAnalytics.js';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const branches = [
  {id:'branch-a',key:'main',name:'Main'},
  {id:'branch-b',key:'second',name:'Second'},
];
const window = networkDateWindow('week','2026-11-05');
const sales = [
  {id:'1',date:'2026-11-05',branch_id:'branch-a',branch:'main',reported_network_sales:25,restaurant_network:1000,total:125,
   pos_entries_json:[{network_account_id:'account-one',amount:25}]},
  {id:'2',date:'2026-11-05',branch_id:'branch-a',branch:'main',reported_network_sales:65,total:75,pos_entries_json:[]},
  {id:'3',date:'2026-11-04',branch_id:'branch-b',branch:'second',reported_network_sales:30,total:60,
   pos_entries_json:[{network_account_id:'account-two',amount:30}]},
  {id:'4',date:'2026-10-25',branch_id:'branch-a',branch:'main',reported_network_sales:45,total:50,pos_entries_json:[]},
  {id:'5',date:'2026-11-06',branch_id:'branch-a',branch:'main',reported_network_sales:999,total:999,pos_entries_json:[]},
];
const accounts = [{id:'account-one',branch_id:'branch-a',account_name:'Mada Main',status:'active'},
 {id:'account-two',branch_id:'branch-b',account_name:'Mada Second',status:'active'}];
const recons = [
  {id:'x',recon_date:'2026-11-05',branch_id:'branch-a',status:'variance',variance:-7},
  {id:'y',recon_date:'2026-11-05',branch_id:'branch-a',status:'pending',variance:0},
  {id:'z',recon_date:'2026-11-04',branch_id:'branch-b',status:'pending',variance:3},
];
const model = overrides => networkInsights({
  sales,accounts,branches,recons,window,branchId:'all',...overrides,
});

describe('Network ERP analytics financial invariants',()=>{
  it('supports six Riyadh business-day period filters and no future dates',()=>{
    expect(NETWORK_PERIODS).toEqual(['day','week','month','quarter','halfYear','year']);
    expect(riyadhBusinessDate(new Date('2026-11-05T20:30:00Z'))).toBe('2026-11-05');
    expect(riyadhBusinessDate(new Date('2026-11-05T22:30:00Z'))).toBe('2026-11-06');
    expect(networkDateWindow('day','2026-11-05')).toMatchObject({
      start:'2026-11-05',end:'2026-11-05',previousStart:'2026-11-04',previousEnd:'2026-11-04',days:1,
    });
    expect(networkDateWindow('week','2026-11-05')).toMatchObject({
      start:'2026-10-30',end:'2026-11-05',previousStart:'2026-10-23',previousEnd:'2026-10-29',days:7,
    });
    expect(networkDateWindow('month','2026-11-05').start).toBe('2026-11-01');
    expect(networkDateWindow('quarter','2026-11-05').start).toBe('2026-09-01');
    expect(networkDateWindow('halfYear','2026-11-05').start).toBe('2026-06-01');
    expect(networkDateWindow('year','2026-11-05').start).toBe('2025-12-01');
    expect(()=>networkDateWindow('invalid','2026-11-05')).toThrow();
  });
  it('uses canonical reported network revenue once, not POS entries or settlements added again',()=>{
    expect(networkReportedAmount(sales[0])).toBe(25);
    const data=model();
    expect(data.revenue).toBe(120); // 25+65+30, excludes previous and tomorrow
    expect(data.priorRevenue).toBe(45);
    expect(data.change).toBeCloseTo((120-45)*100/45,1);
    expect(data.currentRows).toBe(3);
    expect(data.byBranch.map(b=>b.value)).toEqual([90,30]);
    expect(data.allocated).toBe(55); // POS allocation is a subset, not extra sales
    expect(data.unallocated).toBe(65);
    expect(data.variance).toBe(10); // absolute settlement variances, not revenue
    expect(data.pending).toBe(2);
    expect(data.unmatched).toBe(1);
    expect(data.trend.reduce((n,b)=>n+b.value,0)).toBe(120);
    expect(data.weekdays.reduce((n,b)=>n+b.value,0)).toBe(120);
    expect(data.cardShare).toBeCloseTo(120*100/260,1);
  });
  it('only includes canonical or unambiguous legacy branch sales and reconciliations',()=>{
    const a=model({branchId:'branch-a'});
    expect(a.revenue).toBe(90);
    expect(a.currentRows).toBe(2);
    expect(a.activeAccounts).toBe(1);
    expect(a.pending).toBe(1);
    expect(a.variance).toBe(7);
    expect(branchMatches({branch:'main'},'branch-a',branches)).toBe(true);
    expect(branchMatches({branch:'second'},'branch-a',branches)).toBe(false);
    const duplicates=[{id:'a',key:'a',name:'Shared'}, {id:'b',key:'b',name:'Shared'}];
    expect(branchMatches({branch:'Shared'},'a',duplicates)).toBe(false);
    expect(branchMatches({branch_id:'b',branch:'Shared'},'a',duplicates)).toBe(false);
  });
  it('keeps same-name branches separate and supports unique legacy settlement keys',()=>{
    const duplicateNames = [
      {id:'id1',key:'one',name:'Shared'},
      {id:'id2',key:'two',name:'Shared'},
    ];
    const rows=[
      {id:'p1',date:'2026-11-05',branch_id:'id1',branch:'one',reported_network_sales:20},
      {id:'p2',date:'2026-11-05',branch_id:'id2',branch:'two',reported_network_sales:40},
    ];
    const m=networkInsights({sales:rows,branches:duplicateNames,window});
    expect(m.byBranch).toHaveLength(2);
    expect(m.byBranch.map(x=>x.value)).toEqual([40,20]);
    expect(m.byBranch[0].id).not.toBe(m.byBranch[1].id);
    expect(m.byBranch[0].name).not.toBe(m.byBranch[1].name);
    expect(branchMatches({branch_id:'main'},'branch-a',branches)).toBe(true);
    expect(branchMatches({branch_id:'second'},'branch-a',branches)).toBe(false);
    expect(branchMatches({branch_id:'Shared'},'id1',duplicateNames)).toBe(false);
  });
  it('does not invent POS account distribution when saved entries are absent',()=>{
    const result=model({sales:sales.map(s=>({...s,pos_entries_json:'[]'}))});
    expect(result.revenue).toBe(120);
    expect(result.allocated).toBe(0);
    expect(result.unallocated).toBe(120);
    expect(result.byAccount).toEqual([]);
    expect(result.unattributedRecords).toBe(3);
  });
  it('keeps the dashboard read-only, tenant-scoped, paginated and reusable across both tabs',()=>{
    const page=source('../src/pages/NetworkManagement.jsx');
    const view=source('../src/components/network/NetworkERPInsights.jsx');
    expect(page).toContain(".eq('restaurant_id', activeRestaurant.id)");
    expect(page).toContain(".or('closing_state.is.null,closing_state.in.(finalized,locked)')");
    expect(page).toContain(".gte('date', analyticsWindow.previousStart).lte('date', analyticsWindow.end)");
    expect(page).toContain('.range(offset, offset + 499)');
    expect(page).toContain('incomplete: true');
    expect(page).toContain('<NetworkERPInsights mode="dashboard"');
    expect(page).toContain('<NetworkERPInsights mode="analytics"');
    expect(view).toContain("data-testid={'network-period-'+code}");
    expect(view).toContain('data-testid="network-branch-filter"');
    expect(view).toContain('<AreaChart');
    expect(view).toContain('<BarChart');
    expect(view).toContain('<PieChart');
    expect(view).toContain('data-i18n-skip="true"');
    expect(page).not.toContain("daily_sales_network_report').delete(");
    expect(view).not.toContain('supabase.from(');
  });
});
