import React from 'react';
import {useQuery} from '@tanstack/react-query';
import {supabase} from '@/api/supabaseClient';
import {useLanguage} from '@/lib/LanguageContext';
import {attendanceDistance} from '@/lib/attendanceDistance';
const labels={inside:'Inside branch area',outside:'Outside branch area',uncertain:'GPS accuracy is insufficient',started:'Sharing started',stopped:'Sharing stopped',checkout:'Check Out',unknown:'Unknown — no fresh shared location'};
export default function LocationHistory({restaurantId=null,userId}){
 const {translateLiteral:tr}=useLanguage();
 const query=useQuery({queryKey:['attendance-location-history',restaurantId,userId],gcTime:0,refetchInterval:30000,queryFn:async()=>{
  const {data,error}=await supabase.rpc('erp_attendance_location_history',{p_restaurant:restaurantId});if(error)throw error;return data;
 }});
 const time=value=>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Riyadh',dateStyle:'short',timeStyle:'medium'}).format(new Date(value));
 return <section className="my-3 space-y-3 rounded-xl border p-4">
  <h2 className="font-semibold">{tr('Shift location history')}</h2>
  <p className="text-xs opacity-75">{tr('Distance-only history is kept for 90 days after consent. Latest 20 shifts; each shows its latest 30 events. Counts cover all recorded samples. Gaps and missing samples do not prove presence or absence.')}</p>
  {query.isPending&&<p>{tr('Loading...')}</p>}
  {query.isError&&<p role="alert">{tr('Location history could not be loaded.')}</p>}
  {!query.isPending&&!query.isError&&!query.data?.sessions?.length&&<p>{tr('No shift location history yet.')}</p>}
  {query.data?.sessions?.map(s=><details key={s.session_id} className="rounded-lg border p-3">
   <summary className="cursor-pointer text-sm font-semibold">{s.employee_name} · {s.shift_date} · {s.branch_name}</summary>
   <div className="mt-2 space-y-2 text-xs">
    <p>{tr('Maximum recorded distance')}: <span dir="ltr">{attendanceDistance(s.maximum_distance_m)}</span></p>
    <p>{tr('Recorded samples')}: {s.samples} · {tr('Inside branch area')}: {s.inside_samples} · {tr('Outside branch area')}: {s.outside_samples} · {tr('GPS accuracy is insufficient')}: {s.uncertain_samples}</p>
    {!s.samples&&<p>{tr('No distance samples were recorded for this shift.')}</p>}
    {s.events.map((e,i)=><div key={`${e.recorded_at}-${i}`} className="rounded border p-2">
     <p dir="ltr">{time(e.recorded_at)}</p><p>{tr(labels[e.kind==='sample'?e.presence:e.kind]||labels.unknown)}</p>
     {e.kind==='sample'&&<p>{tr('Distance from branch')}: <span dir="ltr">{attendanceDistance(e.distance_m)}</span> · {tr('GPS accuracy')}: ±{Math.round(e.accuracy_m)} m</p>}
    </div>)}
   </div>
  </details>)}
 </section>;
}
