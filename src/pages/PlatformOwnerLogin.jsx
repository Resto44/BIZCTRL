import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { getPlatformOwnerRecoveryRedirectUrl } from '@/lib/appUrl';
import { platformOwnerApi } from '@/lib/platformOwnerApi';
import { useLanguage } from '@/lib/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShieldCheck, LockKeyhole, ArrowLeft, Loader2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

const copy = {
  en: { badge: 'Separate SaaS control plane', title: 'Platform Owner sign in', recoveryTitle: 'Set a new Platform Owner password', intro: 'This portal is reserved for verified RestoCTRL Platform Owners.', recoveryIntro: 'Choose a new password for this secure Supabase recovery session.', email: 'Email address', password: 'Password', newPassword: 'New password', confirmPassword: 'Confirm new password', signIn: 'Sign in securely', savePassword: 'Save new password', forgot: 'Forgot password?', mfa: 'MFA protection is enforced when required for your account.', denied: 'This account is not authorized for the Platform Owner portal.', back: 'Return to ERP sign in', heroTitle: 'Govern the SaaS platform.', heroAccent: 'Never a customer tenant.', heroDescription: 'Platform analytics, subscriptions, controlled manual payment approvals, feature overrides, and audit trails are isolated from the customer ERP.', boundary: 'Secure session boundary · Server-validated authorization · Tenant data remains isolated', checking: 'Checking authorization…', mfaRequired: 'MFA verification is required for this Platform Owner account.', signInFailed: 'Unable to sign in.', emailRequired: 'Enter your email address first.', resetSent: 'Password reset instructions have been sent.', passwordShort: 'Use at least 12 characters for the new password.', passwordMismatch: 'The passwords do not match.', passwordUpdated: 'Password updated securely. Sign in with your new password.', recoveryUnavailable: 'Open this page from the secure password-recovery link sent to your email.' },
  fa: { badge: 'لایه کنترل مستقل SaaS', title: 'ورود مالک پلتفرم', recoveryTitle: 'تنظیم گذرواژه جدید مالک پلتفرم', intro: 'این درگاه فقط برای مالکان تأییدشدهٔ پلتفرم RestoCTRL است.', recoveryIntro: 'برای این نشست بازیابی امن Supabase یک گذرواژه جدید انتخاب کنید.', email: 'ایمیل', password: 'گذرواژه', newPassword: 'گذرواژه جدید', confirmPassword: 'تأیید گذرواژه جدید', signIn: 'ورود امن', savePassword: 'ذخیره گذرواژه جدید', forgot: 'رمز را فراموش کرده‌اید؟', mfa: 'در صورت نیاز حساب شما، محافظت MFA اعمال می‌شود.', denied: 'این حساب برای درگاه مالک پلتفرم مجاز نیست.', back: 'بازگشت به ورود ERP', heroTitle: 'پلتفرم SaaS را مدیریت کنید.', heroAccent: 'هرگز مستأجر مشتری نیست.', heroDescription: 'تحلیل‌های پلتفرم، اشتراک‌ها، تأییدهای کنترل‌شده پرداخت دستی، لغوهای ویژگی و گزارش‌های حسابرسی از ERP مشتری جدا هستند.', boundary: 'مرز نشست امن · مجوز تأییدشده توسط سرور · داده‌های مستأجر جدا باقی می‌ماند', checking: 'در حال بررسی مجوز…', mfaRequired: 'تأیید MFA برای این حساب مالک پلتفرم لازم است.', signInFailed: 'ورود امکان‌پذیر نیست.', emailRequired: 'ابتدا ایمیل خود را وارد کنید.', resetSent: 'دستورالعمل بازنشانی گذرواژه ارسال شد.', passwordShort: 'برای گذرواژه جدید حداقل ۱۲ نویسه استفاده کنید.', passwordMismatch: 'گذرواژه‌ها یکسان نیستند.', passwordUpdated: 'گذرواژه به‌صورت امن به‌روزرسانی شد. با گذرواژه جدید وارد شوید.', recoveryUnavailable: 'این صفحه را از پیوند بازیابی امن ارسال‌شده به ایمیل خود باز کنید.' },
  ar: { badge: 'طبقة تحكم SaaS مستقلة', title: 'دخول مالك المنصة', recoveryTitle: 'تعيين كلمة مرور جديدة لمالك المنصة', intro: 'هذه البوابة مخصصة لمالكي منصة RestoCTRL المعتمدين فقط.', recoveryIntro: 'اختر كلمة مرور جديدة لجلسة الاسترداد الآمنة من Supabase.', email: 'البريد الإلكتروني', password: 'كلمة المرور', newPassword: 'كلمة المرور الجديدة', confirmPassword: 'تأكيد كلمة المرور الجديدة', signIn: 'تسجيل دخول آمن', savePassword: 'حفظ كلمة المرور الجديدة', forgot: 'هل نسيت كلمة المرور؟', mfa: 'تُطبّق حماية MFA عندما تكون مطلوبة لحسابك.', denied: 'هذا الحساب غير مصرح له بالدخول إلى بوابة مالك المنصة.', back: 'العودة إلى دخول ERP', heroTitle: 'أدر منصة SaaS.', heroAccent: 'وليست مستأجراً للعميل أبداً.', heroDescription: 'تحليلات المنصة والاشتراكات والموافقات المنظمة على المدفوعات اليدوية وتجاوزات الميزات وسجلات التدقيق معزولة عن نظام ERP الخاص بالعميل.', boundary: 'حد جلسة آمن · تفويض متحقق منه بالخادم · تبقى بيانات المستأجر معزولة', checking: 'جارٍ التحقق من التفويض…', mfaRequired: 'يلزم التحقق عبر MFA لحساب مالك المنصة هذا.', signInFailed: 'تعذر تسجيل الدخول.', emailRequired: 'أدخل بريدك الإلكتروني أولاً.', resetSent: 'تم إرسال تعليمات إعادة تعيين كلمة المرور.', passwordShort: 'استخدم 12 حرفاً على الأقل لكلمة المرور الجديدة.', passwordMismatch: 'كلمتا المرور غير متطابقتين.', passwordUpdated: 'تم تحديث كلمة المرور بأمان. سجل الدخول بكلمة المرور الجديدة.', recoveryUnavailable: 'افتح هذه الصفحة من رابط الاسترداد الآمن المُرسل إلى بريدك الإلكتروني.' },
};

function recoveryRequested(location) {
  const query = new URLSearchParams(location.search);
  const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
  return query.get('mode') === 'recovery' || fragment.get('type') === 'recovery';
}

export default function PlatformOwnerLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { lang } = useLanguage();
  const text = copy[lang] || copy.en;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recovery, setRecovery] = useState(() => recoveryRequested(location));
  const recoveryMode = useMemo(() => recovery || recoveryRequested(location), [location, recovery]);

  const verify = async () => {
    const snapshot = await platformOwnerApi.snapshot();
    if (!snapshot?.authorized || (snapshot.mfa_required && !snapshot.mfa_verified)) {
      await supabase.auth.signOut();
      throw new Error(snapshot?.mfa_required ? 'PLATFORM_OWNER_MFA_REQUIRED' : 'PLATFORM_OWNER_REQUIRED');
    }
    navigate('/platform-owner', { replace: true });
  };

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
    });
    if (!recoveryRequested(location)) {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) verify().catch(() => {});
      });
    }
    return () => listener.subscription.unsubscribe();
  }, []);

  const signIn = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      await verify();
    } catch (error) {
      await supabase.auth.signOut();
      toast.error(error.message === 'PLATFORM_OWNER_REQUIRED' ? text.denied : error.message === 'PLATFORM_OWNER_MFA_REQUIRED' ? text.mfaRequired : error.message || text.signInFailed);
    } finally { setLoading(false); }
  };

  const forgotPassword = async () => {
    if (!email.trim()) { toast.error(text.emailRequired); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: getPlatformOwnerRecoveryRedirectUrl() });
    if (error) toast.error(error.message); else toast.success(text.resetSent);
  };

  const completeRecovery = async (event) => {
    event.preventDefault();
    if (!recoveryMode) { toast.error(text.recoveryUnavailable); return; }
    if (password.length < 12) { toast.error(text.passwordShort); return; }
    if (password !== confirmation) { toast.error(text.passwordMismatch); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPassword('');
      setConfirmation('');
      await supabase.auth.signOut();
      setRecovery(false);
      navigate('/platform-owner/login', { replace: true });
      toast.success(text.passwordUpdated);
    } catch (error) { toast.error(error.message || text.signInFailed); } finally { setLoading(false); }
  };

  const submit = recoveryMode ? completeRecovery : signIn;
  const pageTitle = recoveryMode ? text.recoveryTitle : text.title;
  const pageIntro = recoveryMode ? text.recoveryIntro : text.intro;
  return <main className="min-h-screen bg-slate-950 text-slate-100 grid lg:grid-cols-[1.1fr_.9fr]" dir={lang === 'en' ? 'ltr' : 'rtl'}>
    <section className="hidden lg:flex relative overflow-hidden p-12 bg-gradient-to-br from-cyan-950 via-slate-950 to-indigo-950 flex-col justify-between">
      <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(#22d3ee_1px,transparent_1px)] [background-size:26px_26px]" />
      <div className="relative flex items-center gap-3 font-black text-xl"><span className="grid size-11 place-items-center rounded-2xl bg-cyan-400 text-slate-950"><ShieldCheck /></span> RestoCTRL <span className="text-cyan-300">Platform</span></div>
      <div className="relative max-w-lg"><p className="inline-flex rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-200">{text.badge}</p><h1 className="mt-6 text-5xl font-black leading-tight">{text.heroTitle} <span className="text-cyan-300">{text.heroAccent}</span></h1><p className="mt-5 text-slate-300 leading-7">{text.heroDescription}</p></div>
      <p className="relative text-xs text-slate-400">{text.boundary}</p>
    </section>
    <section className="flex items-center justify-center p-5 sm:p-10"><div className="w-full max-w-md">
      <button onClick={() => navigate('/erp-login')} className="mb-10 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft className="size-4" />{text.back}</button>
      <div className="mb-8 lg:hidden flex items-center gap-3 font-black text-xl"><span className="grid size-10 place-items-center rounded-xl bg-cyan-400 text-slate-950"><ShieldCheck /></span> RestoCTRL Platform</div>
      <div className="rounded-3xl border border-slate-700/80 bg-slate-900/70 p-6 shadow-2xl sm:p-8"><div className="mb-7"><div className="mb-4 grid size-12 place-items-center rounded-2xl bg-cyan-400/15 text-cyan-300"><LockKeyhole /></div><h2 className="text-2xl font-bold">{pageTitle}</h2><p className="mt-2 text-sm leading-6 text-slate-400">{pageIntro}</p></div>
        <form onSubmit={submit} className="space-y-5">{!recoveryMode && <div><Label className="text-slate-200">{text.email}</Label><Input className="mt-2 border-slate-700 bg-slate-950 text-white" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></div>}<div><div className="flex items-center justify-between"><Label className="text-slate-200">{recoveryMode ? text.newPassword : text.password}</Label>{!recoveryMode && <button type="button" onClick={forgotPassword} className="text-xs font-semibold text-cyan-300 hover:text-cyan-200">{text.forgot}</button>}</div><div className="relative mt-2"><Input className="border-slate-700 bg-slate-950 pe-11 text-white" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete={recoveryMode ? 'new-password' : 'current-password'} /><button type="button" aria-label={text.password} onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 end-0 px-3 text-slate-400">{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></div>{recoveryMode && <div><Label className="text-slate-200">{text.confirmPassword}</Label><Input className="mt-2 border-slate-700 bg-slate-950 text-white" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required autoComplete="new-password" /></div>}<Button className="w-full bg-cyan-400 font-bold text-slate-950 hover:bg-cyan-300" disabled={loading}>{loading ? <><Loader2 className="me-2 size-4 animate-spin" />{text.checking}</> : recoveryMode ? text.savePassword : text.signIn}</Button></form>
        {!recoveryMode && <p className="mt-5 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs leading-5 text-slate-400">{text.mfa}</p>}
      </div>
    </div></section>
  </main>;
}
