// @vitest-environment jsdom
import React from 'react';
import {create,act} from 'react-test-renderer';
import {it,expect,vi,afterEach} from 'vitest';
vi.mock('@/lib/LanguageContext',()=>({useLanguage:()=>({lang:'en',formatDate:value=>value})}));
vi.mock('recharts',()=>({ResponsiveContainer:()=>null,BarChart:()=>null,Bar:()=>null,XAxis:()=>null,YAxis:()=>null,Tooltip:()=>null,Legend:()=>null}));
import BranchSettlementLedger from '../src/components/treasury/BranchSettlementLedger';
afterEach(()=>vi.useRealTimers());
it('applies branch and date controls to the same report and history',()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date(2026,9,12,12));
 let tree;act(()=>{tree=create(<BranchSettlementLedger branches={[{key:'a',label:'Branch A'},{key:'b',label:'Branch B'}]} transactions={[{branch:'a',transaction_date:'2026-10-01',transaction_type:'branch_to_owner_cash',amount:100},{branch:'b',transaction_date:'2026-10-12',transaction_type:'branch_to_owner_cash',amount:999}]}/>);});
 act(()=>tree.root.findByType('select').props.onChange({target:{value:'a'}}));
 expect(JSON.stringify(tree.toJSON())).not.toContain('999.00');
 act(()=>tree.root.findAllByType('button').find(b=>b.children.includes('Today')).props.onClick());
 const content=JSON.stringify(tree.toJSON());
 expect(content).toContain('100.00');expect(content).toContain('Opening Balance');expect(content).toContain('2026-10-12');
 expect(tree.root.findAllByType('button').find(b=>b.children.includes('Today')).props['aria-pressed']).toBe(true);
 tree.unmount();
});
it('shows loading rather than zero financial balances before the complete ledger arrives',()=>{
 const tree=create(<BranchSettlementLedger branches={[{key:'a',label:'Branch A'}]} loading/>);
 expect(tree.root.findByProps({role:'status'})).toBeTruthy();
 expect(JSON.stringify(tree.toJSON())).not.toContain('Closing Balance');tree.unmount();
});
