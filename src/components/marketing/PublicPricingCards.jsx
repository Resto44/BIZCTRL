import { useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { ArrowRight, Building2, CheckCircle2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  annualPriceCents,annualSavingLabel,billingPeriodLabel,
  billingProductLabel,
  discountLabel,
  hasDiscount,
  money,
  monthlyLabel,
  planCapacities,
  planResourceCapacities,
  planFeatures,
  trialDays,
  trialDisclosure,
} from '@/lib/pricingCatalog';

function CapacityIcon({ index }) {
  return index === 0 ? <Users className="h-4 w-4 text-cyan-300" /> : <Building2 className="h-4 w-4 text-cyan-300" />;
}

export default function PublicPricingCards({ plans, onStartFree, onContactSales, compact = false, busyPlanId = '', disabled = false, enterpriseContactMode = false }) {
  const { lang } = useLanguage();
  const [billingInterval,setBillingInterval]=useState('month');
  return (
    <div className="space-y-5">
      <div role="group" aria-label="Subscription billing interval" className="mx-auto flex w-fit max-w-full flex-wrap justify-center gap-2 rounded-2xl bg-white/10 p-2">
       {['month','year'].map(interval=><button key={interval} type="button" aria-pressed={billingInterval===interval} onClick={()=>setBillingInterval(interval)} className={`rounded-xl px-4 py-2 text-sm font-bold ${billingInterval===interval?'bg-cyan-400 text-slate-950':'text-white'}`}>{interval==='year'?(lang==='fa'?'سالانه · ۳۰٪ تخفیف':lang==='ar'?'سنوي · خصم ٣٠٪':'Annual · 30% off'):(lang==='fa'?'ماهانه':lang==='ar'?'شهري':'Monthly')}</button>)}
      </div>
      <div className={`grid gap-5 ${compact ? 'lg:grid-cols-3' : 'md:grid-cols-2 xl:grid-cols-3'}`}>
      {plans.map((plan) => {
        const discounted = hasDiscount(plan);
        const trial = trialDays(plan);
        const capacities = planCapacities(plan, lang);
        const resourceCapacities = planResourceCapacities(plan, lang);
        const features = planFeatures(plan, lang);
        const isEnterprise = String(plan.id) === 'enterprise_100';
        const yearly = billingInterval==='year' && Number(plan.monthly_price_cents)>0;
        const missingEnterprisePrice = enterpriseContactMode && isEnterprise && !String(plan.paddle_price_id || '').trim();
        const isBusy = String(busyPlanId) === String(plan.id);
        return (
          <article key={plan.id} className={`relative flex min-h-full flex-col overflow-hidden rounded-3xl border p-6 shadow-xl shadow-slate-950/20 ${isEnterprise ? 'border-violet-400/30 bg-gradient-to-b from-violet-400/10 to-white/5' : 'border-white/10 bg-white/5'}`}>
            {discounted && billingInterval==='month' && <span className="absolute right-5 top-5 rounded-full bg-emerald-400 px-3 py-1 text-[10px] font-black tracking-wide text-slate-950">{discountLabel(plan, lang)}</span>}
            <p className="text-lg font-black text-white">{plan.display_name}</p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{yearly ? (lang==='fa'?'اشتراک سالانه':lang==='ar'?'اشتراك سنوي':'Annual subscription') : billingProductLabel(plan, lang)}</p>
            <div className="mt-6 flex flex-wrap items-end gap-x-2 gap-y-1">
              {yearly ? <span className="pb-1 text-lg font-bold text-slate-500 line-through">{money(Number(plan.monthly_price_cents)*12, lang)}</span> : discounted && <span className="pb-1 text-lg font-bold text-slate-500 line-through">{money(plan.original_price_cents, lang)}</span>}
              <span className="text-4xl font-black text-white">{money(yearly?annualPriceCents(plan):plan.monthly_price_cents,lang)}</span>
              <span className="pb-1 text-sm text-slate-400">{yearly?billingPeriodLabel('year',lang):monthlyLabel(plan,lang)}</span>
            </div>
            {yearly&&<p className="mt-2 text-xs font-bold text-emerald-300">{annualSavingLabel(plan,lang)}</p>}
            <p className="mt-2 text-xs leading-5 text-slate-300">{resourceCapacities.join(' · ')}</p>
            {trial > 0 && billingInterval==='month' ? <div className="mt-5 rounded-2xl border border-cyan-400/25 bg-cyan-400/10 p-4"><p className="font-bold text-cyan-100">First month free</p><p className="mt-2 text-sm leading-6 text-cyan-50/80">{trialDisclosure(plan, lang)}</p></div> : <p className="mt-5 min-h-16 text-sm leading-6 text-slate-400">{isEnterprise ? 'Highest-tier plan for organizations that need all available ERP modules and expanded operating capacity.' : 'Launch Pricing is shown directly from the active BizCTRL plan catalog.'}</p>}
            <div className="mt-6 space-y-2 text-sm text-slate-300">
              {capacities.map((label, index) => <p key={label} className="flex items-center gap-2"><CapacityIcon index={index} />{label}</p>)}
            </div>
            <ul className="mt-6 flex-1 space-y-3 border-t border-white/10 pt-5 text-sm text-slate-300">
              {(features.length ? features : ['Included capabilities are configured for this plan.']).slice(0, compact ? 4 : 6).map((feature) => <li key={feature} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />{feature}</li>)}
            </ul>
            <Button onClick={() => (missingEnterprisePrice && onContactSales ? onContactSales(plan) : onStartFree(plan,yearly?'year':'month'))} disabled={disabled || isBusy} className="mt-7 w-full bg-cyan-500 font-bold text-slate-950 hover:bg-cyan-400">{isBusy ? 'Opening secure checkout…' : missingEnterprisePrice ? 'Contact Sales' : yearly ? (lang==='fa'?'انتخاب اشتراک سالانه':lang==='ar'?'اختيار الاشتراك السنوي':'Choose annual plan') : trial > 0 ? 'Start Free First Month' : 'Start Free'} <ArrowRight className="ml-2 h-4 w-4" /></Button>
          </article>
        );
      })}
      </div>
    </div>
  );
}
