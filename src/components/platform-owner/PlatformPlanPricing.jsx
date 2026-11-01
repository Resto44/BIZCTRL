import {useState} from 'react';
import {Badge} from '@/components/ui/badge';
import {formatPlatformMoney} from '@/lib/platformOwnerManagement';
import {ownerAnnualCatalogState,expectedAnnualPriceCents} from '@/lib/platformAnnualBilling';

const LANG={
 en:{monthly:'Monthly',annual:'Annual · 30% off',saving:'Save 30% annually',linked:'Paddle annual price linked',unlinked:'Annual Paddle price not linked',mismatch:'Paddle price mismatch — review required',tax:'Taxes, if applicable, calculated at checkout',monthlyRate:'Monthly recurring',annualRate:'Yearly recurring'},
 fa:{monthly:'ماهانه',annual:'سالانه · ۳۰٪ تخفیف',saving:'۳۰٪ تخفیف سالانه',linked:'قیمت سالانه Paddle متصل است',unlinked:'قیمت سالانه Paddle متصل نیست',mismatch:'مغایرت قیمت Paddle — نیاز به بررسی',tax:'مالیات احتمالی هنگام پرداخت محاسبه می‌شود',monthlyRate:'پرداخت ماهانه',annualRate:'پرداخت سالانه'},
 ar:{monthly:'شهري',annual:'سنوي · خصم ٣٠٪',saving:'خصم سنوي ٣٠٪',linked:'سعر Paddle السنوي مرتبط',unlinked:'سعر Paddle السنوي غير مرتبط',mismatch:'عدم تطابق سعر Paddle — يلزم الفحص',tax:'تُحسب الضرائب إن وجدت عند الدفع',monthlyRate:'دفع شهري متكرر',annualRate:'دفع سنوي متكرر'}
};
export default function PlatformPlanPricing({plan,lang='en'}){
 const [period,setPeriod]=useState('month');
 const t=LANG[lang]||LANG.en;
 const catalog=ownerAnnualCatalogState(plan);
 const yearPrice=Number(plan.yearly_price_cents);
 const canShowAnnual=Number.isSafeInteger(yearPrice) && yearPrice>0 && catalog.kind==='linked';
 const amount=period==='year'?(canShowAnnual?yearPrice:null):plan.monthly_price_cents;
 return <div className="mt-3 space-y-2" data-testid={`platform-pricing-${plan.id}`}>
   <div role="group" aria-label={t.annualRate} className="inline-flex max-w-full rounded-xl bg-slate-100 p-1 text-xs">
    <button type="button" aria-pressed={period==='month'} onClick={()=>setPeriod('month')} className={`rounded-lg px-3 py-2 font-semibold ${period==='month'?'bg-white text-blue-700 shadow-sm':'text-slate-600'}`}>{t.monthly}</button>
    <button type="button" aria-pressed={period==='year'} onClick={()=>setPeriod('year')} className={`rounded-lg px-3 py-2 font-semibold ${period==='year'?'bg-white text-blue-700 shadow-sm':'text-slate-600'}`}>{t.annual}</button>
   </div>
   <div className="flex flex-wrap items-baseline gap-2">
    <strong className="text-2xl font-black text-slate-950">{amount===null?'—':formatPlatformMoney(amount,lang,plan.currency)}</strong>
    <span className="text-xs text-slate-500">{period==='year'?t.annualRate:t.monthlyRate}</span>
   </div>
   {period==='year' && <p className="text-xs text-emerald-700">{t.saving} · {t.tax}</p>}
   <Badge variant="outline" className={catalog.kind==='linked'?'border-emerald-200 text-emerald-800':catalog.kind==='mismatch'?'border-rose-300 text-rose-800':'border-amber-200 text-amber-800'}>
    {catalog.kind==='linked'?t.linked:catalog.kind==='mismatch'?t.mismatch:t.unlinked}
   </Badge>
   {catalog.annualId&&<p dir="ltr" className="break-all text-[10px] text-slate-500">Paddle yearly: {catalog.annualId}</p>}
 </div>;
}
