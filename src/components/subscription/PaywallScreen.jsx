import React from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { useSubscription } from '@/lib/SubscriptionContext';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Lock, CreditCard } from 'lucide-react';

const messages = {
  en: {
    title: 'Subscription Required',
    body: 'Your subscription is not active. Please pay to continue.',
    trial_expired: 'Your free trial has ended.',
    past_due: 'Your payment is past due. Please update your billing.',
    canceled: 'Your subscription has been canceled.',
    go_billing: 'Go to Billing',
    plan_info: 'Choose a plan to unlock all features.',
  },
  ar: {
    title: 'الاشتراك مطلوب',
    body: 'اشتراكك غير نشط. يرجى الدفع للمتابعة.',
    trial_expired: 'انتهت فترة التجربة المجانية.',
    past_due: 'الدفع متأخر. يرجى تحديث بيانات الفوترة.',
    canceled: 'تم إلغاء اشتراكك.',
    go_billing: 'الذهاب إلى الفواتير',
    plan_info: 'اختر خطة لفتح جميع الميزات.',
  },
  fa: {
    title: 'اشتراک لازم است',
    body: 'اشتراک فعال نیست. لطفاً برای ادامه پرداخت کنید.',
    trial_expired: 'دوره آزمایشی رایگان شما پایان یافته است.',
    past_due: 'پرداخت شما معوق است. لطفاً اطلاعات صورتحساب را بروز کنید.',
    canceled: 'اشتراک شما لغو شده است.',
    go_billing: 'رفتن به صورتحساب',
    plan_info: 'یک طرح انتخاب کنید تا همه امکانات فعال شود.',
  },
};

export default function PaywallScreen() {
  const { lang } = useLanguage();
  const { status } = useSubscription();
  const m = messages[lang] || messages.en;

  const statusMsg = status === 'PAST_DUE' ? m.past_due
    : status === 'CANCELED' ? m.canceled
    : m.trial_expired;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
        <Lock className="w-8 h-8 text-destructive" />
      </div>
      <h1 className="text-2xl font-bold text-foreground mb-2">{m.title}</h1>
      <p className="text-muted-foreground mb-1 text-lg">{m.body}</p>
      <p className="text-muted-foreground mb-6 text-sm">{statusMsg}</p>
      <p className="text-sm text-muted-foreground mb-6">{m.plan_info}</p>
      <Button size="lg" asChild className="gap-2">
        <Link to="/billing">
          <CreditCard className="w-5 h-5" />
          {m.go_billing}
        </Link>
      </Button>
    </div>
  );
}
