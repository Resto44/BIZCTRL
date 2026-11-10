// @vitest-environment jsdom
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {MemoryRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {describe,it,expect,vi,afterEach,beforeEach} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const source = path => readFileSync(resolve(process.cwd(),path),'utf8');

const state=vi.hoisted(()=>({
  portal:'restaurant',can:true,language:'en',subscribe:vi.fn(),rpc:vi.fn(),branches:[
    {id:'branch-1',name:'Rayan'}
  ],
}));
vi.mock('@/lib/TenantContext',()=>({useTenant:()=>({
  activeRestaurant:{id:'tenant-1',business_type:state.portal},branches:state.branches,
})}));
vi.mock('@/lib/RoleContext',()=>({useRole:()=>({can:{viewOrders:state.can}})}));
vi.mock('@/lib/LanguageContext',()=>({useLanguage:()=>({lang:'en'})}));
vi.mock('@/api/supabaseClient',()=>({supabase:{rpc:state.rpc}}));
vi.mock('@/lib/cashierBroadcast',()=>({subscribeCashierBroadcast:(...args)=>{state.subscribe(...args);return()=>{};}}));
import KitchenDisplayERP,{
  kitchenCanAdvance,kitchenMinutes,kitchenUrgency,kitchenGroupOrders
} from '../src/pages/restaurant/KitchenDisplayERP.jsx';

const orders=[
 {id:'order-1',number:10,revision:3,status:'held',kitchen_status:'queued',
  order_type:'takeaway',submitted_at:'2026-11-09T12:00:00Z',lines:[
   {name:'Chicken',name_ar:'دجاج',quantity:1,station:'Kitchen'}
  ]},
 {id:'order-2',number:11,revision:2,status:'paid',kitchen_status:'preparing',
  order_type:'dine_in',table_label:'A1',submitted_at:'2026-11-09T12:05:00Z',lines:[
   {name:'Grilled fish',quantity:2,station:'Grill'}
  ]},
 {id:'order-3',number:12,revision:5,status:'open',kitchen_status:'ready',
  order_type:'delivery',submitted_at:'2026-11-09T12:10:00Z',lines:[
   {name:'Rice',quantity:1,station:'Kitchen'}
  ]},
];
const board={branch_id:'branch-1',branch_name:'Rayan',server_time:'2026-11-09T12:00:00Z',
 orders,total_active:3,overflow:0};
const render=async(path='/restaurant/kitchen')=>{
  const client=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
  let tree;
  await act(async()=>{tree=TestRenderer.create(<QueryClientProvider client={client}>
    <MemoryRouter initialEntries={[path]}><KitchenDisplayERP/></MemoryRouter>
  </QueryClientProvider>);});
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
  return {tree,client,close:async()=>{await act(async()=>tree.unmount());client.clear();}};
};
beforeEach(()=>{
  state.portal='restaurant';state.can=true;state.language='en';state.branches=[{id:'branch-1',name:'Rayan'}];
  state.rpc.mockReset();state.subscribe.mockReset();
  state.rpc.mockImplementation(async (name,args)=>{
    if(name==='erp_restaurant_pos_kitchen_board')return {data:board,error:null};
    if(name==='erp_restaurant_kitchen_screen_language_get')
      return {data:{language:state.language,configured:state.language!==null},error:null};
    if(name==='erp_restaurant_kitchen_screen_language'){
      state.language=args.p_language;
      return {data:{language:state.language,changed:true},error:null};
    }
    return {data:{ok:true},error:null};
  });
});
afterEach(()=>vi.restoreAllMocks());

describe('Restaurant Kitchen TV workflow',()=>{
  it('keeps canonical state transitions, urgency and order grouping explicit',()=>{
    expect(kitchenMinutes('2026-11-09T12:00:00Z',Date.parse('2026-11-09T12:20:30Z'))).toBe(20);
    expect(kitchenMinutes('',Date.now())).toBeNull();
    expect(kitchenUrgency(9)).toBe('normal');
    expect(kitchenUrgency(10)).toBe('warning');
    expect(kitchenUrgency(20)).toBe('late');
    expect(kitchenCanAdvance(orders[0],true,false)).toBe(true);
    expect(kitchenCanAdvance(orders[2],true,false)).toBe(false); // unpaid cannot be served
    expect(kitchenCanAdvance(orders[1],false,false)).toBe(false); // disconnected
    expect(kitchenCanAdvance(orders[1],true,true)).toBe(false); // mutation in progress
    expect(kitchenGroupOrders(orders,'Grill').preparing.map(o=>o.number)).toEqual([11]);
    expect(kitchenGroupOrders(orders).ready).toHaveLength(1);
  });

  it('shows all current branch kitchen stages and advances by server revision without writing sales',async()=>{
    const {tree,close}=await render();
    try{
      expect(state.rpc).toHaveBeenCalledWith('erp_restaurant_pos_kitchen_board',{
        p_restaurant_id:'tenant-1',p_branch_id:'branch-1',
      });
      expect(state.rpc).toHaveBeenCalledWith('erp_restaurant_kitchen_screen_language_get',{
        p_restaurant_id:'tenant-1',p_branch_id:'branch-1',
      });
      // Loading an existing kitchen language must NOT overwrite it from this TV.
      expect(state.rpc.mock.calls.filter(([name])=>name==='erp_restaurant_kitchen_screen_language')).toHaveLength(0);
      expect(state.subscribe).toHaveBeenCalledWith(expect.anything(),'restaurant-pos:tenant-1',expect.any(Function));
      expect(tree.root.findAllByProps({'data-testid':'kds-ticket'})).toHaveLength(3);
      expect(tree.root.findByProps({'data-testid':'kds-connection'})).toBeTruthy();
      const ready=tree.root.findByProps({'data-testid':'kds-stage-ready'});
      expect(ready.findByProps({'data-testid':'kds-advance'}).props.disabled).toBe(true);
      const queued=tree.root.findByProps({'data-testid':'kds-stage-queued'});
      const button=queued.findByProps({'data-testid':'kds-advance'});
      expect(button.props.disabled).toBe(false);
      await act(async()=>{button.props.onClick();await new Promise(resolve=>setTimeout(resolve,10));});
      expect(state.rpc).toHaveBeenCalledWith('erp_restaurant_pos_kitchen',{
        p_order_id:'order-1',p_revision:3,p_status:'preparing',
      });
      expect(state.rpc.mock.calls.every(([name])=>!name.includes('cashier_command'))).toBe(true);
    }finally{await close();}
  });

  it('uses the stored branch language rather than the browser language and syncs a deliberate change',async()=>{
    state.language='ar';
    const {tree,close}=await render();
    try{
      const picker=tree.root.findByProps({'data-testid':'kds-screen-language'});
      expect(picker.props.value).toBe('ar');
      expect(state.rpc.mock.calls.filter(([name])=>name==='erp_restaurant_kitchen_screen_language')).toHaveLength(0);
      await act(async()=>{
        picker.props.onChange({target:{value:'fa'}});
        await new Promise(resolve=>setTimeout(resolve,30));
      });
      expect(state.rpc).toHaveBeenCalledWith('erp_restaurant_kitchen_screen_language',{
        p_restaurant_id:'tenant-1',p_branch_id:'branch-1',p_language:'fa',
      });
      expect(state.language).toBe('fa');
      expect(tree.root.findByProps({'data-testid':'kds-screen-language'}).props.value).toBe('fa');
    }finally{await close();}
  });
  it('fails closed when viewOrders is missing and never requests private orders',async()=>{
    state.can=false;const {tree,close}=await render();
    try{
      expect(tree.root.findAllByProps({role:'alert'}).length).toBeGreaterThan(0);
      expect(state.rpc).not.toHaveBeenCalled();
    }finally{await close();}
  });
  it('does not load the restaurant kitchen in retail workspaces',async()=>{
    state.portal='supermarket';const {tree,close}=await render();
    try{
      expect(tree.root.findAllByProps({role:'alert'}).length).toBeGreaterThan(0);
      expect(state.rpc).not.toHaveBeenCalled();
    }finally{await close();}
  });
  it('ignores forged branch URL and uses only tenant-authorized branch picker',async()=>{
    const {tree,close}=await render('/restaurant/kitchen?branch=unauthorized-branch');
    try{
      expect(tree.root.findByProps({'data-testid':'kds-portal'})).toBeTruthy();
      expect(state.rpc).toHaveBeenCalledWith('erp_restaurant_pos_kitchen_board',
        expect.objectContaining({p_branch_id:'branch-1'}));
      expect(state.rpc).not.toHaveBeenCalledWith('erp_restaurant_pos_kitchen_board',
        expect.objectContaining({p_branch_id:'unauthorized-branch'}));
    }finally{await close();}
  });
  it('avoids advancing whole multi-station orders while a single station filter is active',async()=>{
    const mixed={...orders[0],lines:[
      {name:'Rice',quantity:1,station:'Kitchen'},
      {name:'BBQ',quantity:1,station:'Grill'},
    ]};
    state.rpc.mockImplementation(async name=>({data:name==='erp_restaurant_pos_kitchen_board'?
      {...board,orders:[mixed]}:{ok:true},error:null}));
    const {tree,close}=await render();
    try{
      const selects=tree.root.findAllByType('select');
      const station=selects.find(s=>s.props['aria-label']==='Station');
      await act(async()=>station.props.onChange({target:{value:'Grill'}}));
      const ticket=tree.root.findByProps({'data-testid':'kds-ticket'});
      expect(ticket.findByProps({'data-testid':'kds-advance'}).props.disabled).toBe(true);
    }finally{await close();}
  });

  it('exposes a private, nonfinancial, permission-checked branch board and a separate route',()=>{
    const sql=source('supabase/migrations/20261110001500_restaurant_kitchen_tv_portal.sql');
    const app=source('src/App.jsx');
    const sidebar=source('src/components/layout/ERPSidebar.jsx');
    const mobile=source('src/components/layout/BottomNav.jsx');
    expect(sql).toContain("restaurant_pos_private.guard(p_restaurant_id,p_branch_id,'viewOrders')");
    expect(sql).toContain("d.branch_id=p_branch_id");
    expect(sql).toContain("o.kitchen_status in ('queued','preparing','ready')");
    expect(sql).toContain("revoke all on function public.erp_restaurant_pos_kitchen_board");
    expect(sql).toContain("grant execute on function public.erp_restaurant_pos_kitchen_board(uuid,uuid) to authenticated");
    expect(sql).not.toContain("'net_total',");
    expect(sql).not.toContain("'cash_paid',");
    expect(sql).not.toContain("'receipt',");
    expect(app).toContain('path="/restaurant/kitchen" element={<RoleGuard permission="viewOrders">');
    expect(sidebar).toContain("path: '/restaurant/kitchen'");
    expect(mobile).toContain("'/restaurant/kitchen': 'viewOrders'");
  });
});
