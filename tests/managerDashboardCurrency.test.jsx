// @vitest-environment jsdom
import React from 'react';
import {act,create} from 'react-test-renderer';
import {describe,it,expect,vi} from 'vitest';
const mock=vi.hoisted(()=>({currency:'SAR',drawer:{amount:null}}));
vi.mock('@/lib/TenantContext',()=>({useTenant:()=>({managerBranchObject:{id:'b',name:'Branch',restaurant_id:'r'},activeRestaurant:{currency:mock.currency}})}));
vi.mock('@/lib/LanguageContext',()=>({useLanguage:()=>({lang:'en'})}));
vi.mock('@/lib/AuthContext',()=>({useAuth:()=>({user:{id:'manager'}})}));
vi.mock('@/api/supabaseClient',()=>({supabase:{}}));
vi.mock('react-router-dom',()=>({useNavigate:()=>vi.fn(),Link:({children})=><a>{children}</a>}));
vi.mock('@/components/help/HelpLink',()=>({default:()=>null}));
vi.mock('@tanstack/react-query',()=>({useQuery:({queryKey})=>({
 data:queryKey[0]==='mgr-today-sales'?[{total:146.75}]:queryKey[0]==='mgr-verified-drawer-cash'?mock.drawer:[],
 isLoading:false,isPending:false,isError:false,refetch:vi.fn()
})}));
vi.mock('recharts',()=>Object.fromEntries(['AreaChart','Area','XAxis','YAxis','CartesianGrid','Tooltip','ResponsiveContainer','Legend'].map(name=>[name,({children})=><div>{children}</div>])));
import Manager from '@/pages/ManagerDashboardERP';
describe('manager currency follows the business',()=>{
 it.each(['SAR','EUR','USD'])('renders %s and preserves fractional money',currency=>{
  mock.currency=currency;let tree;
  act(()=>{tree=create(<Manager/>);});
  const text=JSON.stringify(tree.toJSON());
  expect(text).toContain(currency);
  expect(text).toContain('146.75');
  expect(text).not.toContain('$146');
  act(()=>tree.unmount());
 });
 it('does not invent dollars when organization currency is missing',()=>{
  mock.currency='';let tree;
  act(()=>{tree=create(<Manager/>);});
  expect(JSON.stringify(tree.toJSON())).not.toContain('$146');
  act(()=>tree.unmount());
 });
});

it('renders the prior verified cash count with its date on the manager dashboard',()=>{
 mock.currency='SAR';mock.drawer={amount:95,date:'2026-11-20',reason:'last_finalized_count'};
 let tree;act(()=>{tree=create(<Manager/>);});
 const text=JSON.stringify(tree.toJSON());
 expect(text).toContain('95.00');expect(text).toContain('2026-11-20');
 expect(text).toContain('Last finalized physical count');
 expect(text).not.toContain('No finalized physical count recorded');
 act(()=>tree.unmount());mock.drawer={amount:null};
});
