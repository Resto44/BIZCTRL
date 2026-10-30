import {describe,it,expect,vi} from 'vitest';
import {createAutomaticReportHandler} from '../supabase/functions/automatic-report-email/handler.ts';

function fixture(options={}){
 const job={id:'job-1',lease:'lease-1',restaurant_id:'org-1',report_date:'2026-10-27',...options.job};
 const updates=[];
 const db={rpc:vi.fn(async(name,args)=>{
  if(name==='report_email_dispatch_secret')return {data:'a'.repeat(64)};
  if(name==='report_email_claim')return {data:options.empty?[]:[job]};
  if(name==='report_email_context')return options.denied?{error:new Error('denied')}:{data:{email:options.email||'owner@example.com',restaurant_id:'org-1',inventoryTransactions:[]}};
 }),from:vi.fn(table=>({update:values=>{
  updates.push({table,values});
  const q={eq:()=>q,select:()=>q,single:async()=>options.saveError?{error:new Error('save')}:{data:{id:job.id}},then:resolve=>resolve({error:null})};
  return q;
 }}))};
 const buildPdf=vi.fn(async()=> 'JVBERi0xLjQK');
 const fetchImpl=vi.fn(async()=>new Response(JSON.stringify(options.providerError?{message:'private error'}:{id:'provider-1'}),{status:options.providerError?429:200}));
 const handler=createAutomaticReportHandler({db,buildPdf,fetchImpl,env:()=>options.unconfigured?'': 'configured'});
 const run=(secret='a'.repeat(64))=>handler(new Request('https://example.com',{method:'POST',headers:{'x-dispatch-secret':secret},body:'{}'}));
 return {job,db,buildPdf,fetchImpl,updates,run};
}
describe('automatic daily report worker',()=>{
 it('rejects public and wrong-secret calls without claiming jobs',async()=>{
  const f=fixture();expect((await f.run('')).status).toBe(401);expect((await f.run('b'.repeat(64))).status).toBe(401);
  expect(f.db.rpc.mock.calls.some(c=>c[0]==='report_email_claim')).toBe(false);
 });
 it('does not consume jobs while email configuration is missing',async()=>{
  const f=fixture({unconfigured:true});expect((await f.run()).status).toBe(503);expect(f.buildPdf).not.toHaveBeenCalled();
 });
 it('persists the payload before sending and uses the job date and idempotency key',async()=>{
  const f=fixture();expect((await f.run()).status).toBe(200);
  const request=f.fetchImpl.mock.calls[0][1],payload=JSON.parse(request.body);
  expect(payload.to).toEqual(['owner@example.com']);expect(payload.subject).toContain('2026-10-27');
  expect(request.headers['Idempotency-Key']).toBe('daily-report-job-1');
  expect(f.updates[0].values.payload).toEqual(payload);expect(f.updates[1].values.state).toBe('accepted');
  expect(f.db.rpc.mock.calls.filter(c=>c[0]==='report_email_context')).toHaveLength(2);
 });
 it('reuses the exact persisted payload on retry even if sender config changes',async()=>{
  const payload={from:'original@example.com',to:['owner@example.com'],attachments:[{content:'frozen'}]};
  const f=fixture({job:{payload}});await f.run();expect(f.buildPdf).not.toHaveBeenCalled();
  expect(f.fetchImpl.mock.calls[0][1].body).toBe(JSON.stringify(payload));
 });
 it('never sends before durable payload persistence',async()=>{
  const f=fixture({saveError:true});expect((await f.run()).status).toBe(503);expect(f.fetchImpl).not.toHaveBeenCalled();
 });
 it('cancels when verification, subscription or owner authority is revoked',async()=>{
  const f=fixture({denied:true});await f.run();expect(f.fetchImpl).not.toHaveBeenCalled();expect(f.updates[0].values.state).toBe('cancelled');
 });
 it('does not resend a frozen report to an old email after identity changes',async()=>{
  const f=fixture({job:{payload:{to:['old@example.com']}},email:'new@example.com'});await f.run();
  expect(f.fetchImpl).not.toHaveBeenCalled();expect(f.updates[0].values.state).toBe('cancelled');
 });
 it('retries provider failures without recording acceptance or exposing provider contents',async()=>{
  const f=fixture({providerError:true});const response=await f.run();expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('private error');expect(f.updates.at(-1).values.state).toBe('pending');
  expect(f.updates.every(u=>u.table!=='organization_report_email')).toBe(true);
 });
 it('labels weekly PDF mail with the full covered range',async()=>{
  const f=fixture({job:{frequency:'weekly',period_start:'2026-10-24',report_date:'2026-10-30'}});
  await f.run();
  const payload=JSON.parse(f.fetchImpl.mock.calls[0][1].body);
  expect(payload.subject).toContain('weekly');
  expect(payload.subject).toContain('2026-10-24 to 2026-10-30');
  expect(payload.attachments[0].filename).toBe('BizCTRL-weekly-2026-10-24-2026-10-30.pdf');
 });
 it('does not render or send when no job is due',async()=>{
  const f=fixture({empty:true});expect(await (await f.run()).json()).toEqual({ok:true,processed:0});expect(f.fetchImpl).not.toHaveBeenCalled();
 });
});
