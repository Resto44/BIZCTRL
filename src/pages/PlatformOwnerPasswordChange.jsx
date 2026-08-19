import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/api/supabaseClient';
import { platformOwnerApi } from '@/lib/platformOwnerApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function hasUsableSession(session) {
  return Boolean(
    session?.access_token
    && session?.user?.id
    && (!session.expires_at || session.expires_at * 1000 > Date.now())
  );
}

export default function PlatformOwnerPasswordChange() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('checking');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const authorize = async () => {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        const session = sessionData?.session;
        if (sessionError || !hasUsableSession(session)) throw new Error('SESSION_REQUIRED');

        const { data: userData, error: userError } = await supabase.auth.getUser(session.access_token);
        if (userError || userData?.user?.id !== session.user.id) throw new Error('SESSION_REQUIRED');

        const snapshot = await platformOwnerApi.snapshot();
        if (!snapshot?.authorized || !snapshot.mfa_required || !snapshot.mfa_verified) {
          throw new Error('AAL2_PLATFORM_OWNER_REQUIRED');
        }
        if (!cancelled) setStatus('ready');
      } catch {
        await supabase.auth.signOut({ scope: 'local' });
        if (!cancelled) setStatus('denied');
      }
    };

    void authorize();
    return () => { cancelled = true; };
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    if (password.length < 12) {
      toast.error('Use at least 12 characters for the new password.');
      return;
    }
    if (password !== confirmation) {
      toast.error('The passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPassword('');
      setConfirmation('');
      toast.success('Password updated. Your Google Authenticator protection remains active.');
      navigate('/platform-owner', { replace: true });
    } catch {
      toast.error('Unable to update the password securely. Please try again from this verified session.');
    } finally {
      setSaving(false);
    }
  };

  if (status === 'checking') {
    return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100"><Loader2 className="size-8 animate-spin text-cyan-300" /></main>;
  }

  if (status === 'denied') {
    return <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-slate-100"><section className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-8 text-center"><ShieldCheck className="mx-auto size-12 text-cyan-300" /><h1 className="mt-5 text-2xl font-bold">Verified Platform Owner session required</h1><p className="mt-3 text-sm leading-6 text-slate-300">For security, password changes are available only from an active Platform Owner session verified with Google Authenticator.</p><Button className="mt-6 w-full bg-cyan-400 font-bold text-slate-950 hover:bg-cyan-300" onClick={() => navigate('/platform-owner/login', { replace: true })}>Return to Platform Owner sign in</Button></section></main>;
  }

  return <main className="grid min-h-screen place-items-center bg-slate-950 p-5 text-slate-100"><section className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900/80 p-6 shadow-2xl sm:p-8"><button type="button" onClick={() => navigate('/platform-owner', { replace: true })} className="mb-8 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft className="size-4" />Return to Platform Owner</button><div className="mb-7"><div className="grid size-12 place-items-center rounded-2xl bg-cyan-400/15 text-cyan-300"><KeyRound /></div><h1 className="mt-4 text-2xl font-bold">Set a new password</h1><p className="mt-2 text-sm leading-6 text-slate-400">Your active Google Authenticator-verified Platform Owner session authorizes this password change. MFA remains enabled.</p></div><form onSubmit={submit} className="space-y-5"><div><Label className="text-slate-200">New password</Label><div className="relative mt-2"><Input className="border-slate-700 bg-slate-950 pe-11 text-white" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="new-password" /><button type="button" aria-label="Show or hide password" onClick={() => setShowPassword((visible) => !visible)} className="absolute inset-y-0 end-0 px-3 text-slate-400">{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></div><div><Label className="text-slate-200">Confirm new password</Label><Input className="mt-2 border-slate-700 bg-slate-950 text-white" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required autoComplete="new-password" /></div><Button type="submit" className="w-full bg-cyan-400 font-bold text-slate-950 hover:bg-cyan-300" disabled={saving}>{saving ? <><Loader2 className="me-2 size-4 animate-spin" />Updating password…</> : 'Update password securely'}</Button></form></section></main>;
}
