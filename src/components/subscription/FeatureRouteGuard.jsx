import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LockKeyhole, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSubscription } from '@/lib/SubscriptionContext';
import { useLanguage } from '@/lib/LanguageContext';
import { supabase } from '@/api/supabaseClient';

const COPY = {
  en: { title: 'Plan feature required', body: 'This ERP module is not included in your current subscription. Your plan permissions are validated again by the backend on protected data operations.', action: 'View plans' },
  ar: { title: 'ميزة الخطة مطلوبة', body: 'وحدة ERP هذه غير مشمولة في اشتراكك الحالي. يتم التحقق من أذونات خطتك مرة أخرى من الخلفية عند عمليات البيانات المحمية.', action: 'عرض الخطط' },
  fa: { title: 'این قابلیت به طرح بالاتری نیاز دارد', body: 'این ماژول ERP در اشتراک فعلی شما نیست. مجوزهای طرح شما هنگام عملیات داده‌های محافظت‌شده دوباره در سمت سرور بررسی می‌شوند.', action: 'مشاهده طرح‌ها' },
};

export default function FeatureRouteGuard({ feature, children }) {
  const { loading, isActive, hasFeature } = useSubscription();
  const { lang, isRTL } = useLanguage();
  const copy = COPY[lang] || COPY.en;
  const featureAccess = useQuery({
    queryKey: ['subscription-feature-access', feature],
    enabled: !loading && isActive && hasFeature(feature),
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('erp_require_subscription_feature', { p_feature: feature });
      if (error) throw error;
      return data?.allowed === true;
    },
  });

  if (loading || featureAccess.isLoading) {
    return <div className="flex min-h-[40vh] items-center justify-center"><div className="h-7 w-7 animate-spin rounded-full border-4 border-muted border-t-primary" /></div>;
  }

  if (isActive && hasFeature(feature) && featureAccess.data === true) return children;

  return (
    <div className="flex min-h-[52vh] flex-col items-center justify-center p-6 text-center" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200"><LockKeyhole className="h-6 w-6" /></div>
      <h1 className="text-xl font-bold">{copy.title}</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{copy.body}</p>
      <Button asChild className="mt-5"><Link to="/billing"><Sparkles className="me-2 h-4 w-4" />{copy.action}</Link></Button>
    </div>
  );
}
