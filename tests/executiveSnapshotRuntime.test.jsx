import React from 'react';
import {create,act} from 'react-test-renderer';
import {describe,it,expect,vi} from 'vitest';
import ExecutiveSnapshotV2 from '../src/components/dashboard/ExecutiveSnapshotV2';
vi.mock('react-router-dom',()=>({useNavigate:()=>vi.fn()}));
vi.mock('../src/components/dashboard/OwnerOrderSourcesAnalytics',()=>({default:()=>null}));
vi.mock('recharts',()=>Object.fromEntries(['Area','AreaChart','ResponsiveContainer','Tooltip','XAxis','YAxis','CartesianGrid'].map(name=>[name,({children,...props})=>React.createElement('chart-'+name,props,children)])));
const model={periodMetrics:{totalSales:52,totalCash:52,totalExpenses:80,totalPurchaseCost:500,grossProfit:-448,netProfit:-528,netMargin:-1015.4},previousPeriodMetrics:{totalSales:100,totalExpenses:40},formatMoney:value=>`SAR ${value}`,periodKey:'today',periodLabel:'Today',lang:'en',revenueTrend:[{date:'2026-10-24',sales:52}]};
const card=(tree,id)=>tree.root.findByProps({'data-testid':id});
describe('Executive analytics interaction and truthful states',()=>{
 it('switches periods through the owner handler and shows real expenses',()=>{
  const changeReportPeriod=vi.fn();let tree;act(()=>{tree=create(<ExecutiveSnapshotV2 model={{...model,changeReportPeriod}}/>)});
  const week=tree.root.findAllByType('button').find(b=>b.children.includes('This week'));
  act(()=>week.props.onClick());expect(changeReportPeriod).toHaveBeenCalledWith('week');
  expect(card(tree,'snapshot-expenses').findAllByType('p')[0].children.join('')).toContain('SAR 80');
  expect(JSON.stringify(tree.toJSON())).not.toContain('VERIFIED ERP');tree.unmount();
 });
 it('does not fabricate a margin when there are zero sales',()=>{
  const tree=create(<ExecutiveSnapshotV2 model={{...model,periodMetrics:{...model.periodMetrics,totalSales:0,netMargin:0}}}/>);
  expect(card(tree,'snapshot-margin').findAllByType('p')[0].children.join('')).toBe('—');tree.unmount();
 });
 it('shows pending expense status and suppresses unavailable executive totals',()=>{
  const tree=create(<ExecutiveSnapshotV2 model={{...model,accountingProvisional:true}}/>);
  expect(tree.root.findByProps({role:'status'}).children.join('')).toContain('pending expenses');
  act(()=>tree.update(<ExecutiveSnapshotV2 model={{...model,hasQueryError:true}}/>));
  expect(tree.root.findByProps({role:'status'}).children.join('')).toBe('Sync required');
  expect(card(tree,'snapshot-sales').findAllByType('p')[0].children.join('')).toBe('—');tree.unmount();
 });
});
