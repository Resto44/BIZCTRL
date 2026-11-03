import React from 'react';
import {Link} from 'react-router-dom';
import {useQuery} from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import {ChefHat,ArrowUpRight} from 'lucide-react';
import {restaurantRpc,restaurantBusinessDate,isRestaurantPOSPortal} from '@/lib/restaurantPOS';
import {restaurantCopy} from '@/components/restaurant-pos/copy';
import {money} from '@/lib/retailCashier';

export default function OwnerRestaurantPOS({restaurant,branchId,lang}){
 const enabled=isRestaurantPOSPortal(restaurant),day=restaurantBusinessDate(),c=restaurantCopy(lang);
 const {data,isError,isLoading}=useQuery({queryKey:['owner_restaurant_pos',restaurant?.id,branchId,day],
  enabled:enabled&&Boolean(restaurant?.id),queryFn:()=>restaurantRpc('pos_workspace',{p_restaurant_id:restaurant.id,p_branch_id:branchId||null,p_date:day}),
  refetchInterval:10000,refetchIntervalInBackground:false,retry:1});
 const cashierQuery=useQuery({queryKey:['owner_restaurant_cashiers',restaurant?.id,branchId,day],
  enabled:enabled&&Boolean(restaurant?.id),queryFn:async()=>{
   const {data:rows,error}=await supabase.rpc('erp_restaurant_pos_owner_cashiers',{
    p_restaurant_id:restaurant.id,p_branch_id:branchId||null,p_date:day
   });if(error)throw error;return rows;
  },refetchInterval:10000,refetchIntervalInBackground:false,retry:1});
 if(!enabled)return null;
 const open=lang==='fa'?'بازکردن صندوق':lang==='ar'?'فتح الكاشير':'Open POS';
 const latest=lang==='fa'?'آخرین فعالیت شعبه‌ها':lang==='ar'?'آخر نشاط للفروع':'Latest branch activity';
 return <section className="rounded-2xl border border-blue-200 bg-card p-3" aria-label={c.title}>
  <div className="flex flex-wrap items-center justify-between gap-2">
   <h2 className="flex items-center gap-2 text-sm font-bold"><ChefHat className="h-5 w-5 text-blue-600"/>{c.title}</h2>
   <Link to={branchId?`/restaurant/pos?branch=${encodeURIComponent(branchId)}`:'/restaurant/pos'} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-3 text-sm font-bold text-white">{open}<ArrowUpRight className="h-4 w-4"/></Link>
  </div>
  {isError?<p role="alert" className="mt-2 text-sm text-red-600">{lang==='fa'?'دریافت وضعیت POS ناموفق بود.':lang==='ar'?'تعذر تحميل حالة نقاط البيع.':'Could not load POS status.'}</p>:
   <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
    {[[c.paidSales,data?.paid_sales],[c.unpaidOrders,data?.unpaid_orders]].map(([label,value])=><div key={label} className="rounded-lg bg-muted p-2"><span>{label}</span><strong className="mt-1 block text-base" dir="ltr">{isLoading||value==null?'—':money(value,restaurant.currency||'SAR')}</strong></div>)}
   </div>}
  <p className="mt-1 text-[11px] text-muted-foreground">{day}</p>
  {cashierQuery.error && <p role="alert" className="mt-2 rounded-lg border border-amber-300 p-2 text-xs text-amber-800">
   {lang==='fa'?'دریافت فروش هر کاشیر ناموفق بود؛ صفر محسوب نکنید.':lang==='ar'?'تعذّر جلب مبيعات الكاشير؛ لا تعتبرها صفراً.':'Cashier totals unavailable; do not treat as zero.'}
  </p>}
  {!cashierQuery.error && (cashierQuery.data?.cashiers?.length>0) && <div className="mt-3 space-y-2">
   <h3 className="text-xs font-bold">{lang==='fa'?'فروش هر کاشیر':lang==='ar'?'مبيعات كل كاشير':'Sales per cashier'}</h3>
   {cashierQuery.data.cashiers.slice(0,20).map(shift=><div key={shift.shift_id} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-xs">
    <span className="min-w-0"><strong className="block">{shift.cashier_name||shift.device_code}</strong>
     <small className="text-muted-foreground">{shift.branch_name} · {shift.device_code} · {shift.online?(lang==='fa'?'آنلاین':lang==='ar'?'متصل':'Online'):(lang==='fa'?'آفلاین':lang==='ar'?'غير متصل':'Offline')} · {shift.receipt_count||0} {lang==='fa'?'فاکتور':lang==='ar'?'فاتورة':'receipts'}</small>
    </span>
    <strong dir="ltr" className="shrink-0">{money(shift.paid_sales,restaurant.currency||'SAR')}</strong>
   </div>)}
  </div>}
  {!!data?.events?.length&&<details className="mt-1 text-xs"><summary className="cursor-pointer py-1 font-semibold">{latest}</summary>
   {data.events.slice(0,5).map((event,i)=><div key={`${event.occurred_at}:${i}`} className="flex flex-wrap justify-between gap-2 border-t py-2"><span>{event.code} · {event.action}</span><time>{new Date(event.occurred_at).toLocaleTimeString()}</time></div>)}
  </details>}
 </section>;
}
