import React from 'react';
import {Link} from 'react-router-dom';
import {useQuery} from '@tanstack/react-query';
import {ChefHat,ArrowUpRight} from 'lucide-react';
import {restaurantRpc,restaurantBusinessDate,isRestaurantPOSPortal} from '@/lib/restaurantPOS';
import {restaurantCopy} from '@/components/restaurant-pos/copy';
import {money} from '@/lib/retailCashier';

export default function OwnerRestaurantPOS({restaurant,branchId,lang}){
 const enabled=isRestaurantPOSPortal(restaurant),day=restaurantBusinessDate(),c=restaurantCopy(lang);
 const {data,isError,isLoading}=useQuery({queryKey:['owner_restaurant_pos',restaurant?.id,branchId,day],
  enabled:enabled&&Boolean(restaurant?.id),queryFn:()=>restaurantRpc('pos_workspace',{p_restaurant_id:restaurant.id,p_branch_id:branchId||null,p_date:day}),
  refetchInterval:15000,refetchIntervalInBackground:false,retry:1});
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
  {!!data?.events?.length&&<details className="mt-1 text-xs"><summary className="cursor-pointer py-1 font-semibold">{latest}</summary>
   {data.events.slice(0,5).map((event,i)=><div key={`${event.occurred_at}:${i}`} className="flex flex-wrap justify-between gap-2 border-t py-2"><span>{event.code} · {event.action}</span><time>{new Date(event.occurred_at).toLocaleTimeString()}</time></div>)}
  </details>}
 </section>;
}
