import React from 'react';
import {useQuery} from '@tanstack/react-query';
import {supabase} from '@/api/supabaseClient';
export default function PeopleCustodySummary({tenant,t}){
 const q=useQuery({queryKey:['people-custody-totals',tenant],enabled:!!tenant,queryFn:async()=>{const {data,error}=await supabase.rpc('erp_people_custody_totals',{p_restaurant_id:tenant});if(error)throw error;return data||[];},refetchInterval:15000});
 return <section className="space-y-3 rounded-2xl border bg-blue-50/40 p-4"><h2 className="font-extrabold">{t.custodyTotal}</h2>{q.isLoading?<p>{t.loading}</p>:q.isError?<p role="alert">{t.failed}</p>:!q.data?.length?<p className="text-sm">{t.noRecords}</p>:<div className="grid gap-3 sm:grid-cols-2">{q.data.map(b=><article key={`${b.currency}:${b.payment_method}`}><p className="text-sm">{t[b.payment_method]}</p><p dir="ltr" className="text-2xl font-extrabold text-blue-700">{Number(b.held).toFixed(2)} {b.currency}</p><p className="text-xs">{t.pendingCount}: {b.pending}</p></article>)}</div>}</section>;
}
