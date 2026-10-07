// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter,useLocation} from 'react-router-dom';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const f=vi.hoisted(()=>({tenant:{},event:null,record:null,reads:[],setBranch:vi.fn(),setTenant:vi.fn()}));
vi.mock('@/lib/AuthContext',()=>({useAuth:()=>({user:{id:'owner'}})}));
vi.mock('@/lib/LanguageContext',()=>({useLanguage:()=>({lang:'en'})}));
vi.mock('@/lib/TenantContext',()=>({useTenant:()=>f.tenant}));
vi.mock('@/lib/BranchScopeContext',()=>({useBranchScope:()=>({setSelectedBranchId:f.setBranch})}));
vi.mock('@/api/supabaseClient',()=>({supabase:{from:table=>{const read={table,filters:[]};f.reads.push(read);const q={select:()=>q,eq:(...x)=>{read.filters.push(x);return q;},maybeSingle:async()=>({data:table==='owner_record_events'?f.event:f.record,error:null})};return q;}}}));
import NotificationRecordLink,{useNotificationRecord} from '../src/components/notifications/NotificationRecordLink';
const id='11111111-1111-4111-8111-111111111111';
let root,container,qc;
function Child(){const l=useLocation(),r=useNotificationRecord();return <div data-testid="child">{l.pathname} {r?.record?.id}</div>;}
beforeEach(()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;f.reads=[];f.setBranch.mockClear();f.setTenant.mockClear();
 f.event={id,restaurant_id:'tenant',entity:'expenses',record_id:'expense-id',action:'insert',branch:'branch',reference:'Rent',context:{amount:650}};
 f.record={id:'expense-id',restaurant_id:'tenant',amount:650};
 f.tenant={restaurants:[{id:'tenant'}],activeRestaurant:{id:'tenant',currency:'SAR'},setActiveRestaurant:f.setTenant,allBranches:[{id:'branch',name:'North'}]};
 qc=new QueryClient({defaultOptions:{queries:{retry:false}}});container=document.createElement('div');document.body.append(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();qc.clear();});
async function render(path='/expenses') {await act(async()=>{root.render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={[path+'?notification='+id]}><NotificationRecordLink><Child/></NotificationRecordLink></MemoryRouter></QueryClientProvider>);});await act(async()=>{await new Promise(r=>setTimeout(r,25));});await act(async()=>{await new Promise(r=>setTimeout(r,25));});}
it('opens the exact scoped record and selected branch, even from a legacy notifications URL',async()=>{
 await render('/notifications');expect(container.querySelector('[data-testid="child"]').textContent).toContain('/expenses expense-id');
 expect(f.setBranch).toHaveBeenCalledWith('branch');expect(f.reads.find(x=>x.table==='expenses').filters).toEqual([['id','expense-id'],['restaurant_id','tenant']]);
});
it('shows a deletion snapshot in the correct section without looking up a deleted row',async()=>{
 f.event.action='delete';await render();expect(container.textContent).toContain('This record was deleted');expect(container.textContent).toContain('Rent');expect(f.reads.map(x=>x.table)).toEqual(['owner_record_events']);
});
it('never switches to an unauthorized business or fetches its current record',async()=>{
 f.event.restaurant_id='another-tenant';await render();expect(container.textContent).toContain('do not have access');expect(f.setTenant).not.toHaveBeenCalled();expect(f.reads.map(x=>x.table)).toEqual(['owner_record_events']);
});
it('switches only to an authorized business before reading the current record',async()=>{
 f.tenant.activeRestaurant={id:'other'};await render();expect(f.setTenant).toHaveBeenCalledWith('tenant');expect(container.querySelector('[data-testid="child"]')).toBeNull();expect(f.reads.map(x=>x.table)).toEqual(['owner_record_events']);
});
it('handles expired or inaccessible notifications without inventing record data',async()=>{
 f.event=null;await render();expect(container.textContent).toContain('notification is unavailable');expect(f.reads).toHaveLength(1);
});
