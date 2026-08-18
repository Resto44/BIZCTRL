import { ArrowRight, Building2, CheckCircle2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  billingProductLabel,
  discountLabel,
  hasDiscount,
  money,
  monthlyLabel,
  planCapacities,
  planFeatures,
  trialDays,
  trialDisclosure,
} from '@/lib/pricingCatalog';

function CapacityIcon({ index }) {
  return index === 0 ? <Users className="h-4 w-4 text-cyan-300" /> : <Building2 className="h-4 w-4 text-cyan-300" />;
}

export default function PublicPricingCards({ plans, onStartFree, compact = false, busyPlanId = '', disabled = false, enterpriseContactMode = false }) {
  return (
    <div className={`grid gap-5 ${compact ? 'lg:grid-cols-3' : 'md:grid-cols-2 xl:grid-cols-3'}`}>
      {plans.map((plan) => {
        const discounted = hasDiscount(plan);
        const trial = trialDays(plan);
        const capacities = planCapacities(plan);
        const features = planFeatures(plan);
        const isEnterprise = String(plan.id) === 'enterprise_100';
        const missingEnterprisePrice = enterpriseContactMode && isEnterprise && !String(plan.paddle_price_id || '').trim();
        const isBusy = String(busyPlanId) === String(plan.id);
        return (
          <article key={plan.id} className={`relative flex min-h-full flex-col overflow-hidden rounded-3xl border p-6 shadow-xl shadow-slate-950/20 ${isEnterprise ? 'border-violet-400/30 bg-gradient-to-b from-violet-400/10 to-white/5' : 'border-white/10 bg-white/5'}`}>
            {discounted && <span className="absolute right-5 top-5 rounded-full bg-emerald-400 px-3 py-1 text-[10px] font-black tracking-wide text-slate-950">{discountLabel(plan)}</span>}
            <p className="text-lg font-black text-white">{plan.display_name}</p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{billingProductLabel(plan)}</p>
            <div className="mt-6 flex flex-wrap items-end gap-x-2 gap-y-1">
              {discounted && <span className="pb-1 text-lg font-bold text-slate-500 line-through">{money(plan.original_price_cents)}</span>}
              <span className="text-4xl font-black text-white">{money(plan.monthly_price_cents)}</span>
              <span className="pb-1 text-sm text-slate-400">{monthlyLabel(plan)}</span>
            </div>
            {trial > 0 ? <div className="mt-5 rounded-2xl border border-cyan-400/25 bg-cyan-400/10 p-4"><p className="font-bold text-cyan-100">First month free</p><p className="mt-2 text-sm leading-6 text-cyan-50/80">{trialDisclosure(plan)}</p></div> : <p className="mt-5 min-h-16 text-sm leading-6 text-slate-400">{isEnterprise ? 'Highest-tier plan for organizations that need all available ERP modules and expanded operating capacity.' : 'Launch Pricing is shown directly from the active BizCTRL plan catalog.'}</p>}
            <div className="mt-6 space-y-2 text-sm text-slate-300">
              {capacities.map((label, index) => <p key={label} className="flex items-center gap-2"><CapacityIcon index={index} />{label}</p>)}
            </div>
            <ul className="mt-6 flex-1 space-y-3 border-t border-white/10 pt-5 text-sm text-slate-300">
              {(features.length ? features : ['Included capabilities are configured for this plan.']).slice(0, compact ? 4 : 6).map((feature) => <li key={feature} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />{feature}</li>)}
            </ul>
            <Button onClick={() => onStartFree(plan)} disabled={disabled || isBusy} className="mt-7 w-full bg-cyan-500 font-bold text-slate-950 hover:bg-cyan-400">{isBusy ? 'Opening secure checkout…' : missingEnterprisePrice ? 'Contact Sales' : trial > 0 ? 'Start Free First Month' : 'Start Free'} <ArrowRight className="ml-2 h-4 w-4" /></Button>
          </article>
        );
      })}
    </div>
  );
}
