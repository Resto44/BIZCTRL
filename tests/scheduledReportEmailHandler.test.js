import {describe,it,expect,vi} from 'vitest';
import {createEmailHandler} from '../supabase/functions/scheduled-report-email/handler.ts';
function fixture({user={id:'owner'},schedule={id:'s',restaurant_id:'r',branch_id:null,name:'Report',recipients:['owner@example.com']},canWrite=true,configured=true,accepted=true}={}) {
 const update=vi.fn(()=>({eq:()=>({select:()=>({single:async()=>({data:{id:'s'}})})})}));
 const db={auth:{getUser:async()=>({data:{user}})},rpc:async()=>({data:canWrite}),from:()=>({select:()=>({eq:()=>({single:async()=>({data:schedule})})}),update})};
 const fetchImpl=vi.fn(async()=>new Response(JSON.stringify(accepted?{id:'provider-id'}:{message:'Rejected'}),{status:accepted?200:422}));
 const handler=createEmailHandler({createClient:()=>db,env:()=>configured?'configured':undefined,fetchImpl});
 const send=async(body={action:'send',schedule_id:'s',pdf:'JVBERi0xLjQK'})=>handler(new Request('https://example.com',{method:'POST',headers:{Authorization:'Bearer token'},body:JSON.stringify(body)}));
 return {send,fetchImpl,update};
}
describe('email endpoint fails closed',()=>{
 it('requires a real signed-in user',async()=>{
  const f=fixture({user:null}); expect((await f.send()).status).toBe(401);expect(f.fetchImpl).not.toHaveBeenCalled();
 });
 it.each([{schedule:null},{canWrite:false}])('does not send inaccessible reports %s',async options=>{
  const f=fixture(options);expect((await f.send()).status).toBe(403);expect(f.fetchImpl).not.toHaveBeenCalled();
 });
 it('reports missing configuration without claiming sent',async()=>{
  const f=fixture({configured:false});expect((await f.send()).status).toBe(503);expect(f.update).not.toHaveBeenCalled();
 });
 it('never advances last_sent_at on provider rejection',async()=>{
  const f=fixture({accepted:false});expect((await f.send()).status).toBe(502);expect(f.update).not.toHaveBeenCalled();
 });
 it('uses saved recipients and updates status only after provider acceptance',async()=>{
  const f=fixture();const result=await (await f.send({action:'send',schedule_id:'s',pdf:'JVBERi0xLjQK',to:'attacker@example.com'})).json();
  expect(result).toMatchObject({ok:true,accepted:true,status_saved:true});
  const payload=JSON.parse(f.fetchImpl.mock.calls[0][1].body);expect(payload.to).toEqual(['owner@example.com']);
  expect(f.update).toHaveBeenCalledOnce();
 });
 it('does not advertise automatic delivery',async()=>{
  const f=fixture();expect(await (await f.send({action:'status'})).json()).toEqual({ok:true,configured:true,automatic:false});
 });
});
