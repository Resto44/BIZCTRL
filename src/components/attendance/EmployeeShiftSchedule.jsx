import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function ScheduleForm({ employee, schedule }) {
 const { translateLiteral: tr } = useLanguage();
 const qc=useQueryClient();
 const [start,setStart]=useState(schedule?.start_time?.slice(0,5)||'');
 const [end,setEnd]=useState(schedule?.end_time?.slice(0,5)||'');
 const [workDays,setDays]=useState(schedule?.work_days||[0,1,2,3,4,5,6]);
 const [enabled,setEnabled]=useState(schedule?.enabled??true);
 const save=useMutation({mutationFn:async()=>{
  const {error}=await supabase.rpc('erp_attendance_save_schedule',{p_employee:employee.id,p_start:start,p_end:end,p_days:workDays,p_enabled:enabled});
  if(error)throw error;
 },onSuccess:()=>qc.invalidateQueries({queryKey:['employee-shift-schedules']})});
 return <div className="space-y-3 rounded-xl border p-3">
  <div className="grid grid-cols-2 gap-3">
   <label className="text-sm">{tr('Shift start')}<Input aria-label={tr('Shift start')} type="time" value={start} onChange={e=>setStart(e.target.value)}/></label>
   <label className="text-sm">{tr('Shift end')}<Input aria-label={tr('Shift end')} type="time" value={end} onChange={e=>setEnd(e.target.value)}/></label>
  </div>
  <p className="text-xs text-muted-foreground">{tr('Times use Saudi Arabia time (Asia/Riyadh). An earlier end time means the next day. Maximum shift: 16 hours.')}</p>
  <fieldset><legend className="mb-2 text-sm">{tr('Working days')}</legend><div className="flex flex-wrap gap-3">{days.map((day,i)=><label key={day} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={workDays.includes(i)} onChange={e=>setDays(old=>e.target.checked?[...old,i]:old.filter(d=>d!==i))}/>{tr(day)}</label>)}</div></fieldset>
  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>{tr('Automatic daily attendance codes')}</label>
  <p className="text-xs text-muted-foreground">{tr('Separate entry and exit codes appear on the employee dashboard and are queued for email 10 minutes before each shift time. Each code expires 30 minutes after issue.')}</p>
  {!employee.email&&<p role="alert" className="text-sm text-amber-700">{tr('Add the verified employee email before enabling delivery.')}</p>}
  <Button disabled={save.isPending||!start||!end||start===end||!workDays.length} onClick={()=>save.mutate()}>{tr(save.isPending?'Saving…':'Save shift schedule')}</Button>
  {save.isSuccess&&<p role="status" className="text-sm text-emerald-600">{tr('Shift schedule saved')}</p>}
  {save.isError&&<p role="alert" className="text-sm text-red-600">{tr('Unable to save shift. Check the branch assignment, working days and the 16-hour limit.')}</p>}
 </div>;
}
export default function EmployeeShiftSchedule({employees,restaurantId}) {
 const {translateLiteral:tr}=useLanguage();
 const [selected,setSelected]=useState('');
 const schedules=useQuery({queryKey:['employee-shift-schedules',restaurantId],enabled:!!restaurantId,queryFn:async()=>{
  const {data,error}=await supabase.from('employee_attendance_schedules').select('*').eq('restaurant_id',restaurantId);if(error)throw error;return data||[];
 }});
 const summary=useQuery({queryKey:['attendance-code-summary',restaurantId],enabled:!!restaurantId,refetchInterval:30000,queryFn:async()=>{
  const {data,error}=await supabase.rpc('erp_attendance_email_owner_summary',{p_restaurant:restaurantId,p_branch:null});if(error)throw error;return data;
 }});
 const employee=employees.find(e=>e.id===selected);
 const schedule=schedules.data?.find(s=>s.employee_id===selected);
 return <Card className="space-y-3 p-4">
  {summary.data&&<div><h3 className="mb-2 text-sm">{tr('Email delivery today')}</h3><div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{[['provider_accepted','Provider accepted'],['verified_in','Verified check-ins'],['verified_out','Verified check-outs'],['expired_unused','Expired unused codes']].map(([key,label])=><div key={key} className="rounded-lg bg-muted p-2"><p className="text-xs text-muted-foreground">{tr(label)}</p><p className="text-xl font-semibold">{summary.data[key]??0}</p></div>)}</div></div>}
  <h2 className="font-semibold">{tr('Employee shift & automatic codes')}</h2>
  <label className="block text-sm">{tr('Employee')}<select className="mt-1 block w-full rounded-md border bg-background p-2" aria-label={tr('Employee shift schedule')} value={selected} onChange={e=>setSelected(e.target.value)}><option value="">{tr('Select employee')}</option>{employees.filter(e=>e.is_active!==false).map(e=><option key={e.id} value={e.id}>{e.full_name} — {e.position||e.branch}</option>)}</select></label>
  {schedules.isError?<p role="alert">{tr('Unable to load shift schedules.')} <Button onClick={()=>schedules.refetch()}>{tr('Retry')}</Button></p>:employee&&!schedules.isPending&&<ScheduleForm key={`${selected}-${schedule?.updated_at||'new'}`} employee={employee} schedule={schedule}/>}
 </Card>;
}
