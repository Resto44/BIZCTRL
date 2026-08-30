import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { ROLE_HOME } from '@/lib/RoleContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { publicCheckoutReturnTo, safeInternalReturnTo } from '@/lib/publicPlanCheckout';
import { BUSINESS_TEMPLATE_KEYS, BUSINESS_TEMPLATE_PRESETS } from '@/lib/workspaceCustomization';
import { ArrowLeft, Building2, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, LockKeyhole, MailCheck, ShieldCheck, Smartphone, UserRoundCheck } from 'lucide-react';

const validPassword = (password) => password.length >= 10 && /[A-Za-z]/.test(password) && /\d/.test(password);
const Shell = ({ children }) => <div className="flex min-h-dvh items-start justify-center overflow-x-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 py-8 sm:items-center"><div className="pointer-events-none fixed inset-0 overflow-hidden"><div className="absolute -right-40 -top-40 h-96 w-96 rounded-full bg-violet-600/10 blur-3xl" /><div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-blue-600/10 blur-3xl" /></div><main className="relative w-full min-w-0 max-w-lg">{children}</main></div>;
const Panel = ({ children }) => <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-6 shadow-2xl backdrop-blur-sm">{children}</div>;

function PasswordInput({ id, value, onChange, autoComplete = 'new-password' }) {
  const [visible, setVisible] = useState(false);
  return <div className="relative"><Input id={id} type={visible ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete} placeholder="At least 10 characters" className="h-11 border-white/10 bg-white/5 pr-11 text-white placeholder:text-slate-600 focus:border-violet-500" required /><button type="button" aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible((current) => !current)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">{visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>;
}

function OwnerPortalSelect({ value, onValueChange }) {
  const selectedPortal = value ? BUSINESS_TEMPLATE_PRESETS[value] : null;

  return <div>
    <Label htmlFor="owner-portal" className="text-slate-300">Select portal</Label>
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        id="owner-portal"
        aria-required="true"
        className="mt-1.5 h-12 rounded-xl border-white/10 bg-white/5 px-3 text-left text-white shadow-none focus:ring-violet-500"
      >
        <SelectValue placeholder="Choose your business portal" />
      </SelectTrigger>
      <SelectContent className="z-[100] max-h-80 border-white/10 bg-slate-900 text-white shadow-2xl">
        {BUSINESS_TEMPLATE_KEYS.map((key) => {
          const portal = BUSINESS_TEMPLATE_PRESETS[key];
          return <SelectItem key={key} value={key} className="py-2.5 focus:bg-violet-500/20 focus:text-white">
            <span className="mr-2" aria-hidden="true">{portal.icon}</span>{portal.label}
          </SelectItem>;
        })}
      </SelectContent>
    </Select>
    {selectedPortal ? <div className="mt-2.5 flex min-w-0 gap-3 rounded-xl border border-violet-400/20 bg-violet-400/10 p-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-xl" aria-hidden="true">{selectedPortal.icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-bold text-white"><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />{selectedPortal.label} ERP</div>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">{selectedPortal.description}</p>
      </div>
    </div> : <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">Your portal sets the recommended ERP modules. You can customize them later without losing records.</p>}
  </div>;
}

export default function ERPRegister() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token')?.trim() || '';
  const isOwnerSetup = params.get('owner') === '1';
  const selectedPlanId = params.get('plan')?.trim() || '';
  const postAuthenticationDestination = safeInternalReturnTo(
    params.get('returnTo'),
    selectedPlanId ? publicCheckoutReturnTo(selectedPlanId) : '/owner-command-center',
  );
  const ownerRegistrationPath = `/erp-register?owner=1${selectedPlanId ? `&plan=${encodeURIComponent(selectedPlanId)}` : ''}&returnTo=${encodeURIComponent(postAuthenticationDestination)}`;
  const signInPath = `/erp-login?returnTo=${encodeURIComponent(postAuthenticationDestination)}`;
  const started = useRef(false);
  const [session, setSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [mode, setMode] = useState('create');
  const [contact, setContact] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [awaitingEmail, setAwaitingEmail] = useState(false);
  const [awaitingSms, setAwaitingSms] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activationError, setActivationError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [owner, setOwner] = useState({ fullName: '', email: '', password: '', confirm: '', organization: '', branch: 'Main Branch', portal: '' });
  const emailMode = contact.includes('@');
  const activationUrl = `/erp-register?token=${encodeURIComponent(token)}`;

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => { if (alive) { setSession(data.session || null); setLoadingSession(false); } });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => { if (alive) setSession(next || null); });
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (isOwnerSetup && !token && session?.user?.id && !loadingSession) {
      navigate(postAuthenticationDestination, { replace: true });
    }
  }, [isOwnerSetup, loadingSession, navigate, postAuthenticationDestination, session?.user?.id, token]);

  const activate = useCallback(async () => {
    if (!token || !session?.user?.id || started.current) return;
    started.current = true;
    setActivating(true);
    setActivationError('');
    try {
      const { data, error } = await supabase.rpc('activate_erp_invitation', { p_token: token });
      if (error) throw error;
      // The database session context is the sole source of role and branch
      // scope. Never seed authorization scope from browser-controlled storage.
      toast.success('Account activated. Opening your assigned workspace…');
      window.setTimeout(() => navigate(data?.dashboard || ROLE_HOME[data?.role] || '/erp-login', { replace: true }), 600);
    } catch (error) {
      started.current = false;
      setActivationError(error.message || 'This invitation cannot be activated.');
      setActivating(false);
    }
  }, [navigate, session?.user?.id, token]);

  useEffect(() => { if (token && session?.user?.id && !loadingSession) activate(); }, [activate, loadingSession, session?.user?.id, token]);

  const createInvitationAccount = async (event) => {
    event.preventDefault();
    if (!contact.trim()) return toast.error('Enter the email address or phone number that received the invitation.');
    if (!validPassword(password)) return toast.error('Use at least 10 characters with letters and numbers.');
    if (password !== confirmPassword) return toast.error('Passwords do not match.');
    setSubmitting(true);
    try {
      const identifier = contact.trim();
      const payload = emailMode
        ? { email: identifier.toLowerCase(), password, options: { emailRedirectTo: `${window.location.origin}${activationUrl}`, data: { invitation_token: token } } }
        : { phone: identifier, password, options: { data: { invitation_token: token } } };
      const { data, error } = await supabase.auth.signUp(payload);
      if (error) throw error;
      if (data.session) { setSession(data.session); return; }
      if (emailMode) { setAwaitingEmail(true); toast.success('Verify the email sent to the invited address to activate your account.'); }
      else { setAwaitingSms(true); toast.success('Enter the SMS verification code to activate your account.'); }
    } catch (error) { toast.error(error.message || 'Unable to create this invited account.'); } finally { setSubmitting(false); }
  };

  const signInInvitationAccount = async (event) => {
    event.preventDefault();
    if (!contact.trim() || !password) return toast.error('Enter your invited identity and password.');
    setSubmitting(true);
    try {
      const credentials = emailMode ? { email: contact.trim().toLowerCase(), password } : { phone: contact.trim(), password };
      const { data, error } = await supabase.auth.signInWithPassword(credentials);
      if (error) throw error;
      setSession(data.session);
    } catch (error) { toast.error(error.message || 'Unable to verify this identity.'); } finally { setSubmitting(false); }
  };

  const verifySms = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({ phone: contact.trim(), token: smsCode.trim(), type: 'sms' });
      if (error) throw error;
      setSession(data.session);
      setAwaitingSms(false);
    } catch (error) { toast.error(error.message || 'The verification code was not accepted.'); } finally { setSubmitting(false); }
  };

  const createOwner = async (event) => {
    event.preventDefault();
    const clean = { fullName: owner.fullName.trim(), email: owner.email.trim().toLowerCase(), organization: owner.organization.trim(), branch: owner.branch.trim(), portal: owner.portal.trim().toLowerCase() };
    if (!clean.fullName || !clean.email || !clean.organization || !clean.branch) return toast.error('Complete all owner organization fields.');
    if (!BUSINESS_TEMPLATE_KEYS.includes(clean.portal)) return toast.error('Select the ERP portal for your business.');
    if (!validPassword(owner.password)) return toast.error('Use at least 10 characters with letters and numbers.');
    if (owner.password !== owner.confirm) return toast.error('Passwords do not match.');
    setSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signUp({ email: clean.email, password: owner.password, options: { emailRedirectTo: `${window.location.origin}${ownerRegistrationPath}`, data: { role: 'owner', full_name: clean.fullName, company_name: clean.organization, branch_name: clean.branch, business_type: clean.portal, business_mode: clean.portal } } });
      if (error) throw error;
      if (data.session) navigate(postAuthenticationDestination, { replace: true });
      else { toast.success('Verify your email, then sign in as the organization owner.'); navigate(signInPath, { replace: true }); }
    } catch (error) { toast.error(error.message || 'Unable to create the owner account.'); } finally { setSubmitting(false); }
  };

  if (loadingSession) return <Shell><Panel><div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-300"><Loader2 className="h-4 w-4 animate-spin" /> Checking secure access…</div></Panel></Shell>;

  if (token && session?.user?.id) return <Shell><Panel><div className="py-8 text-center">{activationError ? <LockKeyhole className="mx-auto mb-4 h-11 w-11 text-red-400" /> : <Loader2 className="mx-auto mb-4 h-11 w-11 animate-spin text-violet-400" />}<h1 className="text-xl font-black text-white">{activationError ? 'Invitation cannot be activated' : 'Activating your assigned workspace'}</h1><p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-400">{activationError || 'Your verified identity is receiving the organization, branch, role, and permissions issued by the owner.'}</p>{activationError && <div className="mt-5 flex justify-center gap-2"><Button variant="outline" onClick={() => supabase.auth.signOut().then(() => setSession(null))}>Use another identity</Button><Button onClick={activate}>Try again</Button></div>}{!activationError && !activating && <Loader2 className="mx-auto mt-4 h-4 w-4 animate-spin text-violet-300" />}</div></Panel></Shell>;

  if (token) return <Shell><div className="mb-6 text-center"><div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-1.5 text-sm font-medium text-emerald-200"><ShieldCheck className="h-4 w-4" /> Secure staff activation</div><h1 className="text-3xl font-black text-white">Activate your invited account</h1><p className="mt-2 text-sm leading-relaxed text-slate-400">Verify the invited identity, create a password, and access only the workspace assigned by the owner.</p></div><Panel>{awaitingEmail ? <div className="py-5 text-center"><MailCheck className="mx-auto mb-4 h-11 w-11 text-emerald-300" /><h2 className="text-lg font-bold text-white">Verify your email</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-400">Open the verification link sent to your invited email address. You will return here and your account will activate automatically.</p></div> : awaitingSms ? <form onSubmit={verifySms} className="space-y-4"><div className="mb-2 flex items-center gap-3 border-b border-white/10 pb-4"><Smartphone className="h-6 w-6 text-violet-300" /><div><h2 className="font-bold text-white">Verify your phone</h2><p className="text-xs text-slate-400">Enter the code sent to the invited phone number.</p></div></div><div><Label htmlFor="sms-code" className="text-slate-300">SMS verification code</Label><Input id="sms-code" inputMode="numeric" autoComplete="one-time-code" value={smsCode} onChange={(event) => setSmsCode(event.target.value)} className="mt-1.5 h-11 border-white/10 bg-white/5 text-white" required /></div><Button type="submit" disabled={submitting} className="h-11 w-full">{submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Verify and activate</Button></form> : <><div className="mb-5 flex gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3"><UserRoundCheck className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" /><p className="text-xs leading-relaxed text-slate-300">Organization and branch lists are intentionally unavailable. The owner’s invitation is the sole source of your organization, branch, role, and permissions.</p></div><div className="mb-5 grid grid-cols-2 rounded-xl bg-white/[0.04] p-1 text-xs"><button type="button" onClick={() => setMode('create')} className={`rounded-lg px-3 py-2 font-semibold ${mode === 'create' ? 'bg-violet-600 text-white' : 'text-slate-400'}`}>Create password</button><button type="button" onClick={() => setMode('signin')} className={`rounded-lg px-3 py-2 font-semibold ${mode === 'signin' ? 'bg-violet-600 text-white' : 'text-slate-400'}`}>Already have an account</button></div><form onSubmit={mode === 'create' ? createInvitationAccount : signInInvitationAccount} className="space-y-4"><div><Label htmlFor="invited-contact" className="text-slate-300">Invited email address or phone number</Label><Input id="invited-contact" value={contact} onChange={(event) => setContact(event.target.value)} type={emailMode ? 'email' : 'text'} placeholder="you@company.com or +1 555 0100" autoComplete="username" className="mt-1.5 h-11 border-white/10 bg-white/5 text-white placeholder:text-slate-600" required /></div><div><Label htmlFor="invited-password" className="text-slate-300">{mode === 'create' ? 'Create password' : 'Password'}</Label><div className="mt-1.5"><PasswordInput id="invited-password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'create' ? 'new-password' : 'current-password'} /></div>{mode === 'create' && <p className="mt-1.5 text-[11px] text-slate-500">At least 10 characters with letters and numbers.</p>}</div>{mode === 'create' && <div><Label htmlFor="confirm-password" className="text-slate-300">Confirm password</Label><div className="mt-1.5"><PasswordInput id="confirm-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></div></div>}<Button type="submit" disabled={submitting} className="h-11 w-full bg-gradient-to-r from-violet-600 to-indigo-600 font-bold text-white">{submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}{mode === 'create' ? 'Verify identity and create account' : 'Verify identity and activate'}</Button></form></>}</Panel><p className="mt-4 text-center text-xs text-slate-500">Need help? Contact the owner who sent the invitation.</p></Shell>;

  if (!isOwnerSetup) return <Shell><Panel><div className="py-6 text-center"><LockKeyhole className="mx-auto mb-4 h-11 w-11 text-violet-300" /><h1 className="text-xl font-black text-white">Staff accounts are invitation-only</h1><p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-400">Ask your organization owner to create a secure invitation. Public organization and branch selection are not available.</p><Button className="mt-5" onClick={() => navigate('/erp-login')}><ArrowLeft className="mr-2 h-4 w-4" /> Go to sign in</Button><button onClick={() => navigate('/erp-register?owner=1')} className="mt-5 block w-full text-xs font-medium text-violet-300 hover:text-violet-200">Create a new owner organization account</button></div></Panel></Shell>;

  return <Shell>
    <div className="mb-6 text-center">
      <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-400/10 px-4 py-1.5 text-sm font-medium text-violet-200"><Building2 className="h-4 w-4" /> Owner organization setup</div>
      <h1 className="text-3xl font-black text-white">Create your organization</h1>
      <p className="mt-2 text-sm text-slate-400">Choose your business portal and create the first secure owner workspace.</p>
    </div>
    <Panel>
      <form onSubmit={createOwner} className="space-y-4">
        <div><Label htmlFor="owner-name" className="text-slate-300">Your name</Label><Input id="owner-name" autoComplete="name" value={owner.fullName} onChange={(event) => setOwner((current) => ({ ...current, fullName: event.target.value }))} className="mt-1.5 h-11 border-white/10 bg-white/5 text-white" required /></div>
        <div><Label htmlFor="owner-email" className="text-slate-300">Email address</Label><Input id="owner-email" type="email" autoComplete="email" value={owner.email} onChange={(event) => setOwner((current) => ({ ...current, email: event.target.value }))} className="mt-1.5 h-11 border-white/10 bg-white/5 text-white" required /></div>
        <div><Label htmlFor="owner-org" className="text-slate-300">Organization name</Label><Input id="owner-org" autoComplete="organization" value={owner.organization} onChange={(event) => setOwner((current) => ({ ...current, organization: event.target.value }))} className="mt-1.5 h-11 border-white/10 bg-white/5 text-white" required /></div>
        <OwnerPortalSelect value={owner.portal} onValueChange={(portal) => setOwner((current) => ({ ...current, portal }))} />
        <div><Label htmlFor="owner-branch" className="text-slate-300">Initial branch name</Label><Input id="owner-branch" value={owner.branch} onChange={(event) => setOwner((current) => ({ ...current, branch: event.target.value }))} className="mt-1.5 h-11 border-white/10 bg-white/5 text-white" required /></div>
        <div><Label htmlFor="owner-password" className="text-slate-300">Create password</Label><div className="mt-1.5"><PasswordInput id="owner-password" value={owner.password} onChange={(event) => setOwner((current) => ({ ...current, password: event.target.value }))} /></div></div>
        <div><Label htmlFor="owner-confirm" className="text-slate-300">Confirm password</Label><div className="mt-1.5"><PasswordInput id="owner-confirm" value={owner.confirm} onChange={(event) => setOwner((current) => ({ ...current, confirm: event.target.value }))} /></div></div>
        <Button type="submit" disabled={submitting} className="h-11 w-full bg-gradient-to-r from-violet-600 to-indigo-600 font-bold text-white">{submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Building2 className="mr-2 h-4 w-4" />}Create owner account and organization</Button>
      </form>
    </Panel>
    <button onClick={() => navigate(signInPath)} className="mx-auto mt-4 flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200"><ArrowLeft className="h-3.5 w-3.5" /> Return to sign in</button>
  </Shell>;
}
