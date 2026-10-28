import {describe,it,expect,vi} from 'vitest';
import {reportRecipients,reportSchedulePayload,listReportSchedules,invokeReportEmail} from '../src/lib/scheduledReportEmail';
import {validRecipients,validPDF} from '../supabase/functions/scheduled-report-email/policy.ts';
describe('scheduled report email contract',()=>{
 it('writes real database columns with restaurant and branch scope',()=>{
  expect(reportSchedulePayload({name:' Report ',email_to:'OWNER@example.com',frequency:'monthly'},'restaurant','branch')).toEqual({name:'Report',recipients:['owner@example.com'],frequency:'monthly',restaurant_id:'restaurant',branch_id:'branch',report_type:'sales',is_active:true});
 });
 it('rejects missing scope, empty names and invalid frequency',()=>{
  const f={name:'Report',email_to:'a@b.com',frequency:'daily'};
  expect(()=>reportSchedulePayload(f,null,null)).toThrow('MISSING_RESTAURANT');
  expect(()=>reportSchedulePayload({...f,name:' '},'r',null)).toThrow('MISSING_NAME');
  expect(()=>reportSchedulePayload({...f,frequency:'hourly'},'r',null)).toThrow('INVALID_FREQUENCY');
 });
 it('validates multiple recipients and removes duplicates',()=>{
  expect(reportRecipients('A@B.com; a@b.com، c@d.com')).toEqual(['a@b.com','c@d.com']);
  for(const email of ['', 'bad','a@b.com\nBcc: x@y.com',Array.from({length:6},(_,i)=>`${i}@b.com`).join(',')]) expect(()=>reportRecipients(email)).toThrow();
 });
 it('does not disguise read failure as an empty list',async()=>{
  const chain={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),order:vi.fn().mockResolvedValue({error:new Error('denied')})};
  const db={from:vi.fn(()=>chain)};
  await expect(listReportSchedules(db,'r')).rejects.toThrow('denied');
  expect(chain.eq).toHaveBeenCalledWith('restaurant_id','r');
 });
 it('propagates structured provider configuration errors',async()=>{
  const db={functions:{invoke:vi.fn().mockResolvedValue({error:{context:{json:async()=>({error:'EMAIL_NOT_CONFIGURED'})}}})}};
  await expect(invokeReportEmail(db,{action:'send'})).rejects.toThrow('EMAIL_NOT_CONFIGURED');
 });
 it('never treats empty integration results as successful email',async()=>{
  const db={functions:{invoke:vi.fn().mockResolvedValue({data:{}})}};
  await expect(invokeReportEmail(db,{})).rejects.toThrow('EMAIL_UNAVAILABLE');
 });
 it('preserves provider acceptance separately from persistence',async()=>{
  const data={ok:true,accepted:true,status_saved:false};
  expect(await invokeReportEmail({functions:{invoke:async()=>({data})}},{})).toEqual(data);
 });
 it('server rejects malformed recipients and non-PDF/oversize payloads',()=>{
  expect(validRecipients(['a@b.com'])).toBe(true);
  for(const value of [[],null,'a@b.com',['\nBcc:x@y.com'],Array(6).fill('a@b.com')]) expect(validRecipients(value)).toBe(false);
  expect(validPDF('JVBERi0xLjQK')).toBe(true);
  for(const value of [null,'<script>','JVBERi0%','JVBERi0'+'A'.repeat(6000000)]) expect(validPDF(value)).toBe(false);
 });
});
