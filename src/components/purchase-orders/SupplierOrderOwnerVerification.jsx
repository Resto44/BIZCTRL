import React,{useState} from 'react';
import { PackageCheck,ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/api/supabaseClient';

const parseItems=items=>{
 try{
  const arr=typeof items==='string'?JSON.parse(items):items;
  return Array.isArray(arr)?arr:[];
 }catch{return [];}
};
export default function SupplierOrderOwnerVerification({order,onConfirmed,onCancel}){
 const items=parseItems(order?.items);
 const [checked,setChecked]=useState({});
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const quantities=items.map(x=>Number(x?.qty??x?.quantity));
 const valid=items.length>0&&items.length<=100&&items.every((item,i)=>
  Boolean(item?.product_name||item?.name)&&Number.isFinite(quantities[i])&&quantities[i]>0&&
  quantities[i]<=100000);
 const allVerified=valid&&items.every((_,i)=>checked[i]===true);
 const confirm=async()=>{
  if(!allVerified||busy||order?.status!=='shipped')return;
  setBusy(true);setError('');
  try{
   const {data,error:rpcError}=await supabase.rpc('erp_owner_confirm_supplier_delivery',{
    p_order_id:order.id,
    p_received_items:items.map((_,i)=>({line_index:i,received_qty:quantities[i]}))
   });
   if(rpcError)throw rpcError;
   if(data?.status!=='received')throw new Error('Owner delivery receipt was not confirmed');
   onConfirmed?.(data);
  }catch(e){setError(e?.message||'Owner confirmation failed');}
  finally{setBusy(false);}
 };
 return <section data-testid="supplier-owner-order-verification"
  className="mt-3 min-w-0 space-y-3 rounded-2xl border border-blue-200 bg-blue-50/70 p-3 text-slate-900">
  <div className="flex items-center gap-2"><ShieldCheck className="size-5 text-blue-700"/><h3 className="text-sm font-bold">Owner product receipt verification</h3></div>
  <p className="text-xs leading-5">Check each delivered product and the complete quantity against the purchase order. Only an approved Owner can confirm completion. This confirmation does not automatically post stock or make a payment.</p>
  <p className="text-xs font-semibold">Order: {order?.order_number||order?.id?.slice(0,8)}</p>
  {!valid&&<p role="alert" className="rounded-lg bg-amber-100 p-2 text-xs text-amber-900">
   Product names and ordered quantities are required before completing an order. Correct the source purchase order first.
  </p>}
  {items.map((item,i)=><label key={i} className="flex min-w-0 items-start gap-3 rounded-xl border bg-white p-3">
   <input type="checkbox" className="mt-1 size-5 shrink-0" checked={Boolean(checked[i])}
    disabled={busy||!valid} onChange={e=>setChecked(s=>({...s,[i]:e.target.checked}))}/>
   <span className="min-w-0 flex-1">
    <strong className="block break-words text-sm">{item.product_name||item.name||'—'}</strong>
    <span className="block text-xs text-slate-600">Ordered / physically verified: {quantities[i]} {item.unit||''}</span>
    <span className="block text-[11px] text-slate-500">Product {i+1} of {items.length}</span>
   </span>
  </label>)}
  {error&&<p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</p>}
  <div className="flex flex-wrap gap-2">
   <Button type="button" disabled={busy||!allVerified} onClick={confirm}
    className="min-h-11 bg-emerald-700 text-white hover:bg-emerald-800">
    <PackageCheck className="me-2 size-4"/>{busy?'Confirming…':'Approve all delivered products'}
   </Button>
   <Button variant="outline" type="button" className="min-h-11" onClick={onCancel} disabled={busy}>Cancel</Button>
  </div>
 </section>;
}
