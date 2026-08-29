import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarClock, CircleAlert, Clock3, Sparkles } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { useSubscription } from '@/lib/SubscriptionContext';

const COPY = {
  en: { trial: 'Full ERP trial', remaining: 'days remaining', pending: 'Paid plan is awaiting payment confirmation', active: 'Subscription active', free: 'Free plan', review: 'Review billing' },
  ar: { trial: 'تجربة ERP كاملة', remaining: 'يوماً متبقياً', pending: 'الخطة المدفوعة بانتظار تأكيد الدفع', active: 'الاشتراك نشط', free: 'الخطة المجانية', review: 'مراجعة الفوترة' },
  fa: { trial: 'آزمایش کامل ERP', remaining: 'روز باقی‌مانده', pending: 'طرح پولی در انتظار تأیید پرداخت است', active: 'اشتراک فعال', free: 'طرح رایگان', review: 'بررسی صورتحساب' },
};

export default function SubscriptionStatusBanner() {
  const { lang, isRTL } = useLanguage();
  const { loading, summary, status, trialDaysRemaining } = useSubscription();
  if (loading || !summary?.found) return null;
  const copy = COPY[lang] || COPY.en;
  const trial = status === 'TRIAL';
  const pending = status === 'PENDING_PAYMENT';
  const free = status === 'FREE';
  const tone = trial ? 'border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-50'
    : pending ? 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-50'
      : 'border-border bg-card text-card-foreground';
  const Icon = trial ? Clock3 : pending ? CircleAlert : CalendarClock;
  const label = trial ? `${copy.trial}: ${trialDaysRemaining} ${copy.remaining}` : pending ? copy.pending : free ? copy.free : copy.active;

  return (
    <div className={`mb-3 flex min-h-10 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs shadow-sm ${tone}`} dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate font-bold">{label}</span>
        {trial && <span className="hidden shrink-0 text-[11px] opacity-70 md:inline">· {summary.plan_name}</span>}
      </div>
      <Link to="/billing" aria-label={copy.review} title={copy.review} className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-current/15 bg-background/40 px-2 font-bold transition hover:bg-background/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current">
        <Sparkles className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{copy.review}</span>
        <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
      </Link>
    </div>
  );
}
