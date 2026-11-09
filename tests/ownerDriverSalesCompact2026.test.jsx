import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe,expect,it,vi,beforeEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import OwnerDriverSalesCard from '../src/components/dashboard/OwnerDriverSalesCard';

const mock=vi.hoisted(()=>({
  enabled:[],
  invalidate:vi.fn(),
  summary:{
    totals:{revenue:1147,cash:526,network:621,entries:13,selling_drivers:2},
    drivers:[{id:'driver-1',name:'Driver A',branch_name:'Rayan',active:true,revenue:1147,cash:526,network:621,entries:13}],
    branches:[{id:'branch-1',name:'Rayan',revenue:1147,cash:526,network:621,entries:13}],
    trend:[{date:'2026-11-09',revenue:1147,cash:526,network:621,entries:13}],
  },
}));
vi.mock('@tanstack/react-query',()=>({
  useQueryClient:()=>({invalidateQueries:mock.invalidate}),
  useQuery:options=>{
    mock.enabled.push({key:options.queryKey,enabled:options.enabled});
    return {data:options.enabled?mock.summary:undefined,isPending:!options.enabled,isError:false,isFetching:false};
  },
}));
vi.mock('react-router-dom',()=>({useNavigate:()=>vi.fn()}));
vi.mock('../src/api/supabaseClient',()=>({
  supabase:{
    channel:()=>({on(){return this;},subscribe(){return this;}}),
    removeChannel:vi.fn(),
    rpc:vi.fn(),
  },
}));
vi.mock('recharts',()=>Object.fromEntries(
  ['Bar','BarChart','CartesianGrid','Legend','Line','LineChart','ResponsiveContainer','Tooltip','XAxis','YAxis'].map(name=>[
    name,({children,...props})=>React.createElement('recharts-'+name,props,children),
  ]),
));

describe('Owner Driver Sales compact mode',()=>{
  beforeEach(()=>{mock.enabled.length=0;mock.invalidate.mockClear();});

  it('starts collapsed with only the verified total and split, then reveals existing ERP analytics when explored',()=>{
    let tree;
    act(()=>{tree=create(<OwnerDriverSalesCard restaurantId="restaurant-1" branchLabel="All branches" lang="en" />);});
    expect(tree.root.findAllByProps({'data-testid':'owner-driver-sales-compact'})).toHaveLength(1);
    expect(tree.root.findAllByProps({'data-testid':'owner-driver-sales-filters'})).toHaveLength(0);
    expect(tree.root.findAllByProps({'data-testid':'owner-driver-sales-kpis'})).toHaveLength(0);
    expect(tree.root.findAllByProps({'data-testid':'owner-driver-sales-trend'})).toHaveLength(0);
    expect(JSON.stringify(tree.toJSON())).toContain('"1,147.00"');
    expect(JSON.stringify(tree.toJSON())).toContain('"526.00"');
    expect(JSON.stringify(tree.toJSON())).toContain('"621.00"');
    const toggle=tree.root.findByProps({'data-testid':'owner-driver-explore-trends'});
    expect(toggle.props['aria-expanded']).toBe(false);
    expect(mock.enabled.some(q=>q.key[0]==='owner-driver-sales'&&q.enabled===false)).toBe(true);
    act(()=>toggle.props.onClick());
    expect(tree.root.findByProps({'data-testid':'owner-driver-explore-trends'}).props['aria-expanded']).toBe(true);
    expect(tree.root.findAllByProps({'data-testid':'owner-driver-sales-compact'})).toHaveLength(0);
    expect(tree.root.findAllByProps({'data-testid':'owner-driver-sales-filters'})).toHaveLength(1);
    expect(tree.root.findAllByProps({'data-testid':'owner-driver-sales-kpis'})).toHaveLength(1);
    expect(tree.root.findAllByProps({'data-testid':'owner-driver-sales-trend'})).toHaveLength(1);
    expect(mock.enabled.slice(-2).every(q=>q.enabled)).toBe(true);
    act(()=>tree.root.findByProps({'data-testid':'owner-driver-explore-trends'}).props.onClick());
    expect(tree.root.findAllByProps({'data-testid':'owner-driver-sales-compact'})).toHaveLength(1);
    act(()=>tree.unmount());
  });

  it('keeps summary labels in all supported languages and does not change financial source logic',async()=>{
    const s=await readFile(new URL('../src/components/dashboard/OwnerDriverSalesCard.jsx',import.meta.url),'utf8');
    expect(s).toContain("explore:'Explore trends',collapse:'Hide trends'");
    expect(s).toContain("explore:'نمایش ترندها',collapse:'بستن تحلیل‌ها'");
    expect(s).toContain("explore:'استعراض الاتجاهات',collapse:'إخفاء التحليلات'");
    expect(s).toContain('aria-controls="owner-driver-sales-details"');
    expect(s).toContain('enabled:enabled && expanded');
    expect(s).toContain('p_restaurant_id:restaurantId,p_branch_id:branch,p_driver_id:driverId||null');
    expect(s).toContain('ownerDriverReconciliation');
    expect(s).toContain('current.isError');
  });
});
