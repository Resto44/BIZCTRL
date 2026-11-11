import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { money } from '@/lib/retailCashier';

// Mounted only in the Customer Credit tender. Existing cash/card dialogs do not
// mount a customer query, preserving their standalone test and offline behavior.
export default function POSCreditCustomerPicker({
 restaurantId,branchId,currency='SAR',total,labels,selectedId,confirmed,onSelect,onConfirmed
}){
 const [search,setSearch]=useState('');
 const {data:customers=[],isFetching,isError,isSuccess,error}=useQuery({
  queryKey:['restaurant-pos-credit-customers',restaurantId,branchId,search],
  enabled:Boolean(restaurantId&&branchId),
  queryFn:()=>supabase.rpc('erp_restaurant_credit_customers',{
   p_restaurant_id:restaurantId,p_branch_id:branchId,p_search:search||null,p_limit:100
  }).then(({data,error})=>{if(error)throw error;return data||[];}),
  staleTime:0,refetchOnWindowFocus:true,retry:1
 });
 const selected=customers.find(x=>x.id===selectedId)||null;
 const available=Number(selected?.available_credit||0);
 return <section className="min-w-0 space-y-3 rounded-xl border border-blue-200 bg-blue-50/60 p-3" aria-label={labels.credit}>
  <label className="block text-sm font-semibold">{labels.search}
   <input className="h-12 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-base"
    type="search" value={search} onChange={e=>{setSearch(e.target.value);onSelect(null);}} autoComplete="off"/>
  </label>
  <label className="block text-sm font-semibold">{labels.choose}
   <select className="mt-2 h-12 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-base"
     value={selectedId} disabled={isFetching||isError} onChange={e=>onSelect(customers.find(x=>x.id===e.target.value)||null)} required>
    <option value="">—</option>
    {customers.map(x=><option key={x.id} value={x.id}>{x.name} · {money(x.available_credit,currency)}</option>)}
   </select>
  </label>
  {isError&&<p role="alert" className="text-sm text-red-700">{error?.message||labels.noCustomer}</p>}
  {isSuccess&&customers.length===0&&<p className="text-sm text-amber-800">{labels.noResults}</p>}
  {selected&&<p className="text-sm">{labels.balance}: <strong dir="ltr">{money(available,currency)}</strong></p>}
  {selected&&available<Number(total||0)&&<p role="alert" className="text-sm font-semibold text-red-700">{labels.noCustomer}</p>}
  <label className="flex items-start gap-3 text-sm">
   <input type="checkbox" className="mt-1 size-4" checked={confirmed} onChange={e=>onConfirmed(e.target.checked)}/>{labels.confirm}
  </label>
  <p className="text-xs font-semibold">{labels.currency}: <span dir="ltr">{money(total,currency)}</span></p>
 </section>;
}
