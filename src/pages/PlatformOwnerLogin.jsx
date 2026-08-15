import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { platformOwnerApi } from '@/lib/platformOwnerApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShieldCheck, LockKeyhole, ArrowLeft, Loader2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

const copy = {
  en: { badge: 'Separate SaaS control plane', title: 'Platform Owner sign in', intro: 'This portal is reserved for verified RestoCTRL Platform Owners.', email: 'Email address', password: 'Password', signIn: 'Sign in securely', forgot: 'Forgot password?', mfa: 'MFA protection is enforced when required for your account.', denied: 'This account is not authorized for the Platform Owner portal.', back: 'Return to ERP sign in' },
  fa: { badge: 'لایه کنترل مستقل SaaS', title: 'ورود مالک پلتفرم', intro: 'این درگاه فقط برای مالکان تأییدشدهٔ پلتفرم RestoCTRL است.', email: 'ایمیل', password: 'گذرواژه', signIn: 'ورود امن', forgot: 'رمز را فراموش کرده‌اید؟', mfa: 'در صورت نیاز حساب شما، محافظت MFA اعمال می‌شود.', denied: 'این حساب برای درگاه مالک پلتفرم مجاز نیست.', back: 'بازگشت به ورود ERP' },
  ar: { badge: 'طبقة تحكم SaaS مستقلة', title: 'دخول مالك المنصة', intro: 'هذه البوابة مخصصة لمالكي منصة RestoCTRL المعتمدين فقط.', email: 'البريد الإلكتروني', password: 'كلمة المرور', signIn: 'تسجيل دخول آمن', forgot: 'هل نسيت كلمة المرور؟', mfa: 'تُطبّق حماية MFA عندما تكون مطلوبة لحسابك.', denied: 'هذا الحساب غير مصرح له بالدخول إلى بوابة مالك المنصة.', back: 'العودة إلى دخول ERP' },
};

export default function PlatformOwnerLogin() {
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const text = copy[lang] || copy.en;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const verify = async () => {
    const snapshot = await platformOwnerApi.snapshot();
    if (!snapshot?.authorized || (snapshot.mfa_required && !snapshot.mfa_verified)) {
      await supabase.auth.signOut();
      throw new Error(snapshot?.mfa_required ? 'PLATFORM_OWNER_MFA_REQUIRED' : 'PLATFORM_OWNER_REQUIRED');
    }
    navigate('/platform-owner', { replace: true });
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) verify().catch(() => {});
    });
  }, []);

  const signIn = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await verify();
    } catch (error) {
      await supabase.auth.signOut();
      toast.error(error.message === 'PLATFORM_OWNER_REQUIRED' ? text.denied : error.message === 'PLATFORM_OWNER_MFA_REQUIRED' ? 'MFA verification is required for this Platform Owner account.' : error.message || 'Unable to sign in.');
    } finally { setLoading(false); }
  };

  const forgotPassword = async () => {
    if (!email) { toast.error('Enter your email address first.'); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/platform-owner/login` });
    if (error) toast.error(error.message); else toast.success('Password reset instructions have been sent.');
  };

  return <main className="min-h-screen bg-slate-950 text-slate-100 grid lg:grid-cols-[1.1fr_.9fr]" dir={lang === 'en' ? 'ltr' : 'rtl'}>
    <section className="hidden lg:flex relative overflow-hidden p-12 bg-gradient-to-br from-cyan-950 via-slate-950 to-indigo-950 flex-col justify-between">
      <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(#22d3ee_1px,transparent_1px)] [background-size:26px_26px]" />
      <div className="relative flex items-center gap-3 font-black text-xl"><span className="grid size-11 place-items-center rounded-2xl bg-cyan-400 text-slate-950"><ShieldCheck /></span> RestoCTRL <span className="text-cyan-300">Platform</span></div>
      <div className="relative max-w-lg"><p className="inline-flex rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-200">{text.badge}</p><h1 className="mt-6 text-5xl font-black leading-tight">Govern the SaaS platform. <span className="text-cyan-300">Never a customer tenant.</span></h1><p className="mt-5 text-slate-300 leading-7">Platform analytics, subscriptions, controlled manual payment approvals, feature overrides, and audit trails are isolated from the customer ERP.</p></div>
      <p className="relative text-xs text-slate-400">Secure session boundary · Server-validated authorization · Tenant data remains isolated</p>
    </section>
    <section className="flex items-center justify-center p-5 sm:p-10"><div className="w-full max-w-md">
      <button onClick={() => navigate('/erp-login')} className="mb-10 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft className="size-4" />{text.back}</button>
      <div className="mb-8 lg:hidden flex items-center gap-3 font-black text-xl"><span className="grid size-10 place-items-center rounded-xl bg-cyan-400 text-slate-950"><ShieldCheck /></span> RestoCTRL Platform</div>
      <div className="rounded-3xl border border-slate-700/80 bg-slate-900/70 p-6 shadow-2xl sm:p-8"><div className="mb-7"><div className="mb-4 grid size-12 place-items-center rounded-2xl bg-cyan-400/15 text-cyan-300"><LockKeyhole /></div><h2 className="text-2xl font-bold">{text.title}</h2><p className="mt-2 text-sm leading-6 text-slate-400">{text.intro}</p></div>
        <form onSubmit={signIn} className="space-y-5"><div><Label className="text-slate-200">{text.email}</Label><Input className="mt-2 border-slate-700 bg-slate-950 text-white" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></div><div><div className="flex items-center justify-between"><Label className="text-slate-200">{text.password}</Label><button type="button" onClick={forgotPassword} className="text-xs font-semibold text-cyan-300 hover:text-cyan-200">{text.forgot}</button></div><div className="relative mt-2"><Input className="border-slate-700 bg-slate-950 pr-11 text-white" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 px-3 text-slate-400">{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></div><Button className="w-full bg-cyan-400 font-bold text-slate-950 hover:bg-cyan-300" disabled={loading}>{loading ? <><Loader2 className="mr-2 size-4 animate-spin" />Checking authorization…</> : text.signIn}</Button></form>
        <p className="mt-5 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs leading-5 text-slate-400">{text.mfa}</p>
      </div>
    </div></section>
  </main>;
}
