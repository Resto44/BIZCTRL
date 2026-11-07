import LocationHistory from './LocationHistory';
import { attendanceDistance } from '@/lib/attendanceDistance';
import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const labels={inside:'Inside branch area',outside:'Outside branch area',uncertain:'GPS accuracy is insufficient',unknown:'Unknown — no fresh shared location'};
function RelativeLocation({ row, tr }) {
 const north=(row.latitude-row.branch_latitude)*111195;
 const east=(row.longitude-row.branch_longitude)*111195*Math.cos(row.branch_latitude*Math.PI/180);
 const extent=Math.max(row.radius_m*1.5,Math.hypot(north,east)+row.accuracy_m,100);
 const scale=85/extent;
 return <figure className="rounded-lg bg-slate-50 p-2 text-slate-800">
  <svg viewBox="0 0 220 220" className="mx-auto h-44 w-44" role="img" aria-label={tr('Employee position relative to branch')}>
   <path d="M110 15V205M15 110H205" stroke="#cbd5e1"/>
   <circle cx="110" cy="110" r={row.radius_m*scale} fill="#d1fae5" stroke="#059669" strokeDasharray="4 3"/>
   <rect x="106" y="106" width="8" height="8" fill="#0f172a"/>
   <circle cx={110+east*scale} cy={110-north*scale} r={Math.max(3,row.accuracy_m*scale)} fill="#3b82f6" fillOpacity="0.15" stroke="#3b82f6"/>
   <circle cx={110+east*scale} cy={110-north*scale} r="4" fill="#2563eb"/>
   <text x="110" y="12" textAnchor="middle" fontSize="10">{tr('North')}</text>
  </svg>
  <figcaption className="text-center text-xs">{tr('Blue: employee GPS · Square: branch · Green: allowed area')}</figcaption>
 </figure>;
}
export default function OwnerLiveLocations({ restaurantId }) {
 const {translateLiteral:tr}=useLanguage();
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),5000);return()=>clearInterval(timer);},[]);
 const query=useQuery({queryKey:['owner-live-locations',restaurantId],enabled:!!restaurantId,gcTime:0,refetchInterval:15000,retry:1,queryFn:async()=>{
  const {data,error}=await supabase.rpc('erp_attendance_owner_locations',{p_restaurant:restaurantId});if(error)throw error;
  return {...data,receivedOnClient:Date.now()};
 }});
 const serverNow=Date.parse(query.data?.server_now)+(now-(query.data?.receivedOnClient||now));
 return <Card className="my-3 space-y-3 p-4">
  <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{tr('Employee live locations')}</h2><Button variant="outline" size="sm" onClick={()=>query.refetch()}>{tr('Refresh')}</Button></div>
  <p className="text-xs text-muted-foreground">{tr('Only employees who choose to share during an open shift appear with a location. After two minutes without a fresh reading, presence is unknown. GPS is not proof of the person’s presence.')}</p>
  {query.isPending&&<p role="status">{tr('Loading...')}</p>}
  {query.isError&&<p role="alert">{tr('Live locations unavailable. Presence cannot be confirmed.')}</p>}
  {!query.isPending&&!query.isError&&!query.data?.employees?.length&&<p className="text-sm">{tr('No open employee shifts.')}</p>}
  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{query.data?.employees?.map(row=>{
   const fresh=!query.isError&&row.latitude!=null&&serverNow-Date.parse(row.received_at)<120000;
   const status=fresh?row.status:'unknown';
   return <article key={row.session_id} className="min-w-0 space-y-2 rounded-xl border p-3">
    <h3 className="font-semibold">{row.employee_name}</h3><p className="text-xs text-muted-foreground">{row.branch_name}</p>
    <p className={`text-sm font-semibold ${status==='inside'?'text-emerald-700':status==='outside'?'text-red-700':'text-amber-700'}`}>{tr(labels[status]||labels.unknown)}</p>
    <p className="text-xs">{tr('Last location received')}: {row.received_at?new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Riyadh',dateStyle:'short',timeStyle:'medium'}).format(new Date(row.received_at)):'—'}</p>
    {fresh&&<>
     <p className="text-xs">{tr('Distance from branch')}: {attendanceDistance(row.distance_m)} · {tr('GPS accuracy')}: ±{Math.round(row.accuracy_m)} m</p>
     {row.branch_latitude!=null&&row.radius_m&&<RelativeLocation row={row} tr={tr}/>}
     <p className="break-all text-xs tabular-nums" dir="ltr">GPS: {row.latitude.toFixed(6)}, {row.longitude.toFixed(6)}</p>
     <a className="inline-block text-sm text-blue-600 underline" href={`https://www.google.com/maps/search/?api=1&query=${row.latitude},${row.longitude}`} target="_blank" rel="noopener noreferrer">{tr('Open location in Google Maps')}</a>
    </>}
   </article>;
  })}</div>
 <LocationHistory restaurantId={restaurantId}/>
 </Card>;
}
