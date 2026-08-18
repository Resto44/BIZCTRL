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
  en: {
    badge: 'Separate SaaS control plane',
    title: 'Platform Owner sign in',
    recoveryTitle: 'Platform Owner MFA Recovery',
    mfaTitle: 'Verify your authenticator',
    enrollTitle: 'Set up new authenticator',
    compromisedTitle: 'Replace unfinished authenticator setup',
    intro: 'This portal is reserved for verified BizCTRL Platform Owners.',
    recoveryIntro: 'Choose a new password. After the secure recovery session is validated, you will set up a new Google Authenticator factor.',
    mfaIntro: 'Enter the six-digit code from your authenticator app to continue.',
    enrollIntro: 'Scan this new QR code with Google Authenticator, then enter the current six-digit code. The previous authenticator remains active until this code is verified.',
    compromisedIntro: 'An unfinished authenticator setup must be discarded before a fresh secret can be generated. This does not disable MFA.',
    email: 'Email address',
    password: 'Password',
    newPassword: 'New password',
    confirmPassword: 'Confirm new password',
    mfaCode: 'Authenticator code',
    signIn: 'Sign in securely',
    savePassword: 'Continue to secure authenticator setup',
    verifyMfa: 'Verify and continue',
    enrollMfa: 'Verify new authenticator',
    forgot: 'Forgot password?',
    mfa: 'MFA protection is enforced for Platform Owner accounts.',
    denied: 'This account is not authorized for the Platform Owner portal.',
    back: 'Return to ERP sign in',
    heroTitle: 'Govern the SaaS platform.',
    heroAccent: 'Never a customer tenant.',
    heroDescription: 'Platform analytics, subscriptions, controlled manual payment approvals, feature overrides, and audit trails are isolated from the customer ERP.',
    boundary: 'Secure session boundary · Server-validated authorization · Tenant data remains isolated',
    checking: 'Checking authorization…',
    mfaRequired: 'MFA verification is required for this Platform Owner account.',
    signInFailed: 'Unable to sign in.',
    emailRequired: 'Enter your email address first.',
    resetSent: 'Password reset instructions have been sent.',
    passwordShort: 'Use at least 12 characters for the new password.',
    passwordMismatch: 'The passwords do not match.',
    passwordUpdated: 'Password updated. Your secure recovery session is being validated.',
    recoveryUnavailable: 'Open this page from the secure password-recovery link sent to your email.',
    recoverySessionRequired: 'This recovery session is missing or expired. Open the newest recovery link from your email.',
    recoveryAuthorizationRequired: 'This password-recovery session is not authorized to replace Platform Owner MFA.',
    mfaUnavailable: 'Unable to initialize MFA securely.',
    invalidMfa: 'The authenticator code is invalid. Try again.',
    secret: 'Manual setup key',
    mfaEnrollmentReady: 'A new authenticator factor is ready. Scan the QR code and enter its current six-digit code.',
    discardMfa: 'Discard unfinished setup and generate a new QR code',
    mfaDiscarded: 'The unfinished setup was discarded. A fresh authenticator setup is ready.',
    recoverAuthenticator: 'Lost access to this authenticator? Recover MFA securely',
    mfaRecoverySent: 'Check your verified email to continue secure MFA recovery. The current authenticator remains active until the new factor is verified.',
    mfaRecoveryReady: 'Recovery authorization succeeded. Set up a new Google Authenticator factor; the previous factor remains active until verification succeeds.',
    mfaRecoveryComplete: 'New authenticator verified and previous factor retired. Sign in again with the new Google Authenticator code.',
    mfaRetirementIncomplete: 'The new authenticator is verified, but the previous factor could not be retired. Do not continue until this is resolved.',
  },
};

function recoveryRequested(location) {
  const query = new URLSearchParams(location.search);
  const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
  return location.pathname === '/platform-owner/recover' || query.get('mode') === 'recovery' || fragment.get('type') === 'recovery';
}

function currentSessionIsUsable(session) {
  return Boolean(session && (!session.expires_at || session.expires_at * 1000 > Date.now()));
}

export default function PlatformOwnerLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { lang } = useLanguage();
  const text = copy.en;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recovery, setRecovery] = useState(() => recoveryRequested(location));
  const [recoverySessionReady, setRecoverySessionReady] = useState(() => !recoveryRequested(location));
  const [recoveryAuthorized, setRecoveryAuthorized] = useState(false);
  const [mfaStage, setMfaStage] = useState(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaFactor, setMfaFactor] = useState(null);
  const [enrollment, setEnrollment] = useState(null);
  const [priorFactorIds, setPriorFactorIds] = useState([]);
  const recoveryMode = useMemo(() => recovery || recoveryRequested(location), [location, recovery]);

  const clearEnrollment = () => {
    setMfaCode('');
    setMfaFactor(null);
    setEnrollment(null);
    setPriorFactorIds([]);
    setMfaStage(null);
  };

  const verifyPortalAccess = async () => {
    const snapshot = await platformOwnerApi.snapshot();
    if (!snapshot?.authorized || (snapshot.mfa_required && !snapshot.mfa_verified)) {
      await supabase.auth.signOut({ scope: 'local' });
      throw new Error(snapshot?.mfa_required ? 'PLATFORM_OWNER_MFA_REQUIRED' : 'PLATFORM_OWNER_REQUIRED');
    }
    navigate('/platform-owner', { replace: true });
  };

  const assertRecoveryEnrollmentAuthorized = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!currentSessionIsUsable(sessionData?.session)) throw new Error('MFA_RECOVERY_SESSION_REQUIRED');

    const snapshot = await platformOwnerApi.snapshot();
    if (!snapshot?.authorized || !snapshot.mfa_required || snapshot.mfa_verified) {
      throw new Error('PLATFORM_OWNER_MFA_RECOVERY_NOT_AUTHORIZED');
    }

    const { data, error } = await supabase.rpc('platform_owner_authorize_mfa_reenrollment');
    if (error || !data?.authorized) throw new Error('PLATFORM_OWNER_MFA_RECOVERY_NOT_AUTHORIZED');
    setRecoveryAuthorized(true);
  };

  const beginMfa = async ({ recoveryEnrollment = false } = {}) => {
    if (!recoveryEnrollment) {
      const snapshot = await platformOwnerApi.snapshot();
      if (!snapshot?.authorized) throw new Error('PLATFORM_OWNER_REQUIRED');
      if (!snapshot.mfa_required || snapshot.mfa_verified) {
        await verifyPortalAccess();
        return;
      }
    } else if (!recoveryAuthorized) {
      throw new Error('PLATFORM_OWNER_MFA_RECOVERY_NOT_AUTHORIZED');
    }

    const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError) throw factorsError;
    const verifiedFactors = (factors?.totp || []).filter((factor) => factor.status === 'verified');

    if (recoveryEnrollment) {
      if (!verifiedFactors.length) throw new Error('PLATFORM_OWNER_MFA_RECOVERY_NO_VERIFIED_FACTOR');
      const abandonedFactors = (factors?.totp || []).filter((factor) => factor.status === 'unverified');
      for (const factor of abandonedFactors) {
        const { error: discardError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
        if (discardError) throw discardError;
      }
      const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'BizCTRL Platform Owner — mybizctrl.site',
      });
      if (enrollError) throw enrollError;
      setPriorFactorIds(verifiedFactors.map((factor) => factor.id));
      setMfaFactor(enrolled);
      setEnrollment(enrolled?.totp || null);
      setMfaStage('enroll');
      return;
    }

    const verifiedFactor = verifiedFactors[0];
    if (verifiedFactor) {
      setMfaFactor(verifiedFactor);
      setMfaStage('verify');
      return;
    }

    const unverifiedFactor = (factors?.totp || []).find((factor) => factor.status === 'unverified');
    if (unverifiedFactor) {
      setMfaFactor(unverifiedFactor);
      setMfaStage('discard');
      return;
    }

    const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'BizCTRL Platform Owner — mybizctrl.site',
    });
    if (enrollError) throw enrollError;
    setMfaFactor(enrolled);
    setEnrollment(enrolled?.totp || null);
    setMfaStage('enroll');
  };

  const discardAndReEnroll = async (event) => {
    event.preventDefault();
    if (!mfaFactor?.id) { toast.error(text.mfaUnavailable); return; }
    setLoading(true);
    try {
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: mfaFactor.id });
      if (unenrollError) throw unenrollError;
      const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'BizCTRL Platform Owner — mybizctrl.site',
      });
      if (enrollError) throw enrollError;
      setMfaFactor(enrolled);
      setEnrollment(enrolled?.totp || null);
      setMfaStage('enroll');
      toast.success(text.mfaDiscarded);
    } catch {
      toast.error(text.mfaUnavailable);
    } finally {
      setLoading(false);
    }
  };

  const retirePriorFactors = async (newFactorId) => {
    const { data: verifiedAudit, error: verifiedAuditError } = await supabase.rpc('platform_owner_record_mfa_reenrollment_verified', {
      p_new_factor_id: newFactorId,
    });
    if (verifiedAuditError || !verifiedAudit?.verified) throw new Error('PLATFORM_OWNER_MFA_RECOVERY_NEW_FACTOR_UNVERIFIED');

    for (const factorId of priorFactorIds) {
      if (factorId === newFactorId) continue;
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId });
      if (unenrollError) throw new Error('PLATFORM_OWNER_MFA_RECOVERY_RETIREMENT_INCOMPLETE');
    }

    const { data: completionAudit, error: completionAuditError } = await supabase.rpc('platform_owner_record_mfa_reenrollment_completed', {
      p_new_factor_id: newFactorId,
    });
    if (completionAuditError || !completionAudit?.completed) throw new Error('PLATFORM_OWNER_MFA_RECOVERY_RETIREMENT_INCOMPLETE');
  };

  const completeMfa = async (event) => {
    event.preventDefault();
    if (!mfaFactor?.id || !/^\d{6}$/.test(mfaCode.trim())) { toast.error(text.invalidMfa); return; }
    setLoading(true);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: mfaFactor.id });
      if (challengeError) throw challengeError;
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: mfaFactor.id,
        challengeId: challenge.id,
        code: mfaCode.trim(),
      });
      if (verifyError) throw verifyError;

      if (recoveryAuthorized && mfaStage === 'enroll') {
        await retirePriorFactors(mfaFactor.id);
        await supabase.auth.signOut({ scope: 'local' });
        clearEnrollment();
        setRecoveryAuthorized(false);
        setRecovery(false);
        setRecoverySessionReady(false);
        toast.dismiss();
        navigate('/platform-owner/login', { replace: true });
        toast.success(text.mfaRecoveryComplete);
        return;
      }

      clearEnrollment();
      await verifyPortalAccess();
    } catch (error) {
      toast.error(error?.message === 'PLATFORM_OWNER_MFA_RECOVERY_RETIREMENT_INCOMPLETE' ? text.mfaRetirementIncomplete : text.invalidMfa);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setRecovery(true);
        setRecoverySessionReady(currentSessionIsUsable(session));
        setRecoveryAuthorized(false);
        clearEnrollment();
        toast.dismiss();
        window.history.replaceState(null, document.title, '/platform-owner/recover');
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      const session = data?.session;
      if (recoveryRequested(location)) {
        setRecoverySessionReady(currentSessionIsUsable(session));
        if (!currentSessionIsUsable(session)) toast.dismiss();
      } else if (session) {
        verifyPortalAccess().catch(() => {});
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const signIn = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      await beginMfa();
    } catch (error) {
      await supabase.auth.signOut({ scope: 'local' });
      toast.error(error?.message === 'PLATFORM_OWNER_REQUIRED' ? text.denied : error?.message === 'PLATFORM_OWNER_MFA_REQUIRED' ? text.mfaRequired : text.signInFailed);
    } finally {
      setLoading(false);
    }
  };

  const forgotPassword = async () => {
    if (!email.trim()) { toast.error(text.emailRequired); return; }
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('platform-owner-mfa-recovery-session', {
        body: { action: 'request', redirectTo: getPlatformOwnerRecoveryRedirectUrl() },
      });
      if (error) throw error;
      await supabase.auth.signOut({ scope: 'local' });
      clearEnrollment();
      setRecoveryAuthorized(false);
      navigate('/platform-owner/recover', { replace: true });
      toast.dismiss();
      toast.success(mfaStage === 'verify' ? text.mfaRecoverySent : text.resetSent);
    } catch {
      toast.error(text.signInFailed);
    } finally {
      setLoading(false);
    }
  };

  const completeRecovery = async (event) => {
    event.preventDefault();
    if (!recoveryMode) { toast.error(text.recoveryUnavailable); return; }
    const { data: sessionData } = await supabase.auth.getSession();
    if (!currentSessionIsUsable(sessionData?.session)) {
      setRecoverySessionReady(false);
      toast.error(text.recoverySessionRequired);
      return;
    }
    if (password.length < 12) { toast.error(text.passwordShort); return; }
    if (password !== confirmation) { toast.error(text.passwordMismatch); return; }

    setLoading(true);
    try {
      const { data: recoveryResult, error: passwordError } = await supabase.functions.invoke('platform-owner-mfa-recovery-session', {
        body: { action: 'complete', newPassword: password },
      });
      if (passwordError || !recoveryResult?.authorized) throw passwordError || new Error('MFA_RECOVERY_SESSION_NOT_AUTHORIZED');
      setPassword('');
      setConfirmation('');
      toast.dismiss();
      toast.success(text.passwordUpdated);
      await assertRecoveryEnrollmentAuthorized();
      await beginMfa({ recoveryEnrollment: true });
      toast.success(text.mfaRecoveryReady);
    } catch {
      setRecoveryAuthorized(false);
      toast.error(text.recoveryAuthorizationRequired);
    } finally {
      setLoading(false);
    }
  };

  const submit = mfaStage === 'discard' ? discardAndReEnroll : mfaStage ? completeMfa : recoveryMode ? completeRecovery : signIn;
  const pageTitle = mfaStage === 'verify' ? text.mfaTitle : mfaStage === 'enroll' ? text.enrollTitle : mfaStage === 'discard' ? text.compromisedTitle : recoveryMode ? text.recoveryTitle : text.title;
  const pageIntro = mfaStage === 'verify' ? text.mfaIntro : mfaStage === 'enroll' ? text.enrollIntro : mfaStage === 'discard' ? text.compromisedIntro : recoveryMode ? text.recoveryIntro : text.intro;

  return <main className="min-h-screen bg-slate-950 text-slate-100 grid lg:grid-cols-[1.1fr_.9fr]" dir={lang === 'en' ? 'ltr' : 'rtl'}>
    <section className="hidden lg:flex relative overflow-hidden p-12 bg-gradient-to-br from-cyan-950 via-slate-950 to-indigo-950 flex-col justify-between">
      <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(#22d3ee_1px,transparent_1px)] [background-size:26px_26px]" />
      <div className="relative flex items-center gap-3 font-black text-xl"><span className="grid size-11 place-items-center rounded-2xl bg-cyan-400 text-slate-950"><ShieldCheck /></span> BizCTRL <span className="text-cyan-300">Platform</span></div>
      <div className="relative max-w-lg"><p className="inline-flex rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-200">{text.badge}</p><h1 className="mt-6 text-5xl font-black leading-tight">{text.heroTitle} <span className="text-cyan-300">{text.heroAccent}</span></h1><p className="mt-5 text-slate-300 leading-7">{text.heroDescription}</p></div>
      <p className="relative text-xs text-slate-400">{text.boundary}</p>
    </section>
    <section className="flex items-center justify-center p-5 sm:p-10"><div className="w-full max-w-md">
      <button onClick={() => navigate('/erp-login')} className="mb-10 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft className="size-4" />{text.back}</button>
      <div className="mb-8 lg:hidden flex items-center gap-3 font-black text-xl"><span className="grid size-10 place-items-center rounded-xl bg-cyan-400 text-slate-950"><ShieldCheck /></span> BizCTRL Platform</div>
      <div className="rounded-3xl border border-slate-700/80 bg-slate-900/70 p-6 shadow-2xl sm:p-8"><div className="mb-7"><div className="mb-4 grid size-12 place-items-center rounded-2xl bg-cyan-400/15 text-cyan-300"><LockKeyhole /></div><h2 className="text-2xl font-bold">{pageTitle}</h2><p className="mt-2 text-sm leading-6 text-slate-400">{pageIntro}</p></div>
        <form onSubmit={submit} className="space-y-5">{mfaStage ? <>{mfaStage === 'discard' ? <Button type="submit" className="w-full bg-amber-400 font-bold text-slate-950 hover:bg-amber-300" disabled={loading}>{loading ? <><Loader2 className="me-2 size-4 animate-spin" />{text.checking}</> : text.discardMfa}</Button> : <>{mfaStage === 'enroll' && enrollment?.qr_code && <div className="space-y-3 rounded-2xl border border-slate-700 bg-slate-950/70 p-4 text-center"><img src={enrollment.qr_code} alt="Google Authenticator setup QR code" className="mx-auto size-56 rounded-lg bg-white p-2" referrerPolicy="no-referrer" /><p className="break-all text-xs text-slate-400"><span className="font-semibold text-slate-200">{text.secret}:</span> {enrollment.secret}</p></div>}<div><Label className="text-slate-200">{text.mfaCode}</Label><Input className="mt-2 border-slate-700 bg-slate-950 text-white tracking-[0.35em]" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, ''))} required autoComplete="one-time-code" /></div><Button type="submit" className="w-full bg-cyan-400 font-bold text-slate-950 hover:bg-cyan-300" disabled={loading || (recoveryMode && !recoveryAuthorized)}>{loading ? <><Loader2 className="me-2 size-4 animate-spin" />{text.checking}</> : mfaStage === 'enroll' ? text.enrollMfa : text.verifyMfa}</Button>{mfaStage === 'verify' && <button type="button" onClick={forgotPassword} className="w-full text-center text-xs font-semibold text-cyan-300 hover:text-cyan-200">{text.recoverAuthenticator}</button>}</>}</> : <>{!recoveryMode && <div><Label className="text-slate-200">{text.email}</Label><Input className="mt-2 border-slate-700 bg-slate-950 text-white" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></div>}<div><div className="flex items-center justify-between"><Label className="text-slate-200">{recoveryMode ? text.newPassword : text.password}</Label>{!recoveryMode && <button type="button" onClick={forgotPassword} className="text-xs font-semibold text-cyan-300 hover:text-cyan-200" disabled={loading}>{text.forgot}</button>}</div><div className="relative mt-2"><Input className="border-slate-700 bg-slate-950 pe-11 text-white" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete={recoveryMode ? 'new-password' : 'current-password'} /><button type="button" aria-label={text.password} onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 end-0 px-3 text-slate-400">{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></div>{recoveryMode && <div><Label className="text-slate-200">{text.confirmPassword}</Label><Input className="mt-2 border-slate-700 bg-slate-950 text-white" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required autoComplete="new-password" /></div>}<Button type="submit" className="w-full bg-cyan-400 font-bold text-slate-950 hover:bg-cyan-300" disabled={loading || (recoveryMode && !recoverySessionReady)}>{loading ? <><Loader2 className="me-2 size-4 animate-spin" />{text.checking}</> : recoveryMode ? text.savePassword : text.signIn}</Button></>}</form>
        {!recoveryMode && !mfaStage && <p className="mt-5 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs leading-5 text-slate-400">{text.mfa}</p>}
      </div>
    </div></section>
  </main>;
}
