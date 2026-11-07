import { describe,it,expect,vi } from 'vitest';
import { createAttendanceMailHandler } from '../supabase/functions/attendance-scheduled-mail/handler.ts';
const secret='a'.repeat(64);
function setup({accepted=true,secretValue=secret}={}){
 const job={id:'challenge',lease:'lease',code:'012345',recipient:'test@example.com',action:'out',expires_at:'2026-11-07T11:00:00Z'};
 let claimed=false;
 const db={rpc:vi.fn(async(name)=>{
  if(name==='erp_attendance_dispatch_secret')return {data:secretValue};
  if(name==='erp_attendance_claim_mail'){if(claimed)return {data:null};claimed=true;return {data:job};}
  return {data:true};
 })};
 const fetchImpl=vi.fn(async()=>({ok:accepted,json:async()=>accepted?{id:'provider-id'}:{error:'rejected'}}));
 const handler=createAttendanceMailHandler({db,env:()=> 'configured',fetchImpl});
 return {db,fetchImpl,handler};
}
describe('Scheduled attendance delivery',()=>{
 it('rejects an invalid dispatch credential before claiming jobs',async()=>{
  const {db,handler,fetchImpl}=setup();
  const r=await handler(new Request('https://test',{method:'POST',headers:{'x-dispatch-secret':'b'.repeat(64)}}));
  expect(r.status).toBe(401);expect(fetchImpl).not.toHaveBeenCalled();expect(db.rpc).toHaveBeenCalledTimes(1);
 });
 it('sends a stable, single-recipient payload preserving leading zero and acknowledges the lease',async()=>{
  const {db,handler,fetchImpl}=setup();
  const r=await handler(new Request('https://test',{method:'POST',headers:{'x-dispatch-secret':secret}}));
  expect(await r.json()).toEqual({ok:true,processed:1,accepted:1});
  const options=fetchImpl.mock.calls[0][1];
  expect(options.headers['Idempotency-Key']).toBe('attendance-scheduled-challenge');
  expect(JSON.parse(options.body).to).toEqual(['test@example.com']);
  expect(JSON.parse(options.body).text).toContain('012345');
  expect(db.rpc).toHaveBeenCalledWith('erp_attendance_finish_mail',{p_id:'challenge',p_lease:'lease',p_accepted:true});
 });
 it('records provider failure without reporting successful delivery',async()=>{
  const {db,handler}=setup({accepted:false});
  const r=await handler(new Request('https://test',{method:'POST',headers:{'x-dispatch-secret':secret}}));
  expect((await r.json()).accepted).toBe(0);
  expect(db.rpc).toHaveBeenCalledWith('erp_attendance_finish_mail',{p_id:'challenge',p_lease:'lease',p_accepted:false});
 });
});
