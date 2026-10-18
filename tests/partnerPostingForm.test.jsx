// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({rpc:vi.fn(),invalidateQueries:vi.fn().mockResolvedValue()}));
vi.mock('@/lib/LanguageContext',()=>({useLanguage:()=>({lang:'en',currency:'SAR'})}));
vi.mock('@/lib/RoleContext',()=>({useRole:()=>({role:'owner'})}));
vi.mock('@/lib/TenantContext',()=>({useTenant:()=>({activeRestaurantId:'tenant'})}));
vi.mock('@/api/supabaseClient',()=>({supabase:{rpc:(...args)=>state.rpc(...args)}}));
vi.mock('@/api/base44Client',()=>({base44:{}}));
vi.mock('sonner',()=>({toast:{error:vi.fn(),success:vi.fn()}}));
vi.mock('@tanstack/react-query',()=>({useQueryClient:()=>state,useQuery:({queryKey})=>({data:queryKey[0]==='sponsor-owner-bilateral'?[{id:'old',partner_id:'partner',kind:'owner_advance_to_sponsor',amount:100,currency:'SAR'}]:[{id:'cash',account_name:'Cash account',currency:'SAR',account_type:'cash'}],refetch:vi.fn()})}));
vi.mock('@/components/ui/select',()=>({Select:({value,onValueChange,children})=><select value={value||''} onChange={e=>onValueChange(e.target.value)}>{children}</select>,SelectTrigger:()=>null,SelectValue:()=>null,SelectContent:({children})=><>{children}</>,SelectItem:({value,children})=><option value={value}>{children}</option>}));
vi.mock('@/components/ui/dialog',()=>({Dialog:({open,children})=>open?<>{children}</>:null,DialogContent:({children,...props})=><div role="dialog" {...props}>{children}</div>,DialogHeader:({children,...props})=><div {...props}>{children}</div>,DialogTitle:({children})=><h2>{children}</h2>}));
import Ledger from '@/components/settlement/SponsorOwnerBilateralLedger';
it.each([false,true])('keeps confirmation and server errors beside submit; denied=%s',async(denied)=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;state.rpc.mockReset().mockImplementation(async(_name,args)=>denied?{error:{message:'ERP_SPONSOR_OWNER_REPAY_EXCEEDS_DUE'}}:{data:{id:args.p_request_id}});
 const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host);
 try{
 await act(async()=>root.render(<Ledger partner={{id:'partner',name:'Partner',is_active:true}}/>));
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent.includes('Record transaction')).click());
 const dialog=host.querySelector('[role="dialog"]');const kind=dialog.querySelector('select');
 await act(async()=>{kind.value='sponsor_repay_owner';kind.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(dialog.textContent).toContain('100.00 SAR');
 const amount=dialog.querySelector('input[inputmode="decimal"]');
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(amount,'35');amount.dispatchEvent(new Event('input',{bubbles:true}));});
 const submit=[...dialog.querySelectorAll('button')].find(b=>b.textContent.includes('Post transaction'));
 const checkbox=dialog.querySelector('input[type="checkbox"]');expect(submit.disabled).toBe(true);expect(submit.parentElement.parentElement.contains(checkbox)).toBe(true);
 await act(async()=>checkbox.click());expect(submit.disabled).toBe(false);
 await act(async()=>submit.click());expect(state.rpc).toHaveBeenCalledWith('erp_post_partner_transaction',expect.objectContaining({p_partner_id:'partner',p_amount:35,p_kind:'sponsor_repay_owner'}));
 if(denied){expect(dialog.querySelector('[role="alert"]').textContent).toContain('Repayment exceeds');expect(submit.parentElement.parentElement.contains(dialog.querySelector('[role="alert"]'))).toBe(true);}else expect(host.querySelector('[role="dialog"]')).toBeNull();
 }finally{await act(async()=>root.unmount());host.remove();}
});
