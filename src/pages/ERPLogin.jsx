import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { ROLES, ROLE_HOME } from '@/lib/RoleContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Building2, Users, UserCheck, User, Package,
  Eye, EyeOff, Loader2, ArrowLeft, ShieldCheck, LogIn
} from 'lucide-react';
import { toast } from 'sonner';

const ROLE_CONFIG = [
  {
    role: ROLES.OWNER,
    label: 'Owner',
    description: 'Full access to all branches and settings',
    icon: Building2,
    color: 'from-violet-600 to-purple-700',
    border: 'border-violet-500/40',
    bg: 'bg-violet-500/10',
    textColor: 'text-violet-300',
  },
  {
    role: ROLES.GENERAL_MANAGER,
    label: 'General Manager',
    description: 'Cross-branch management and analytics',
    icon: Users,
    color: 'from-blue-600 to-cyan-700',
    border: 'border-blue-500/40',
    bg: 'bg-blue-500/10',
    textColor: 'text-blue-300',
  },
  {
    role: ROLES.MANAGER,
    label: 'Branch Manager',
    description: 'Manage your assigned branch',
    icon: UserCheck,
    color: 'from-emerald-600 to-teal-700',
    border: 'border-emerald-500/40',
    bg: 'bg-emerald-500/10',
    textColor: 'text-emerald-300',
  },
  {
    role: ROLES.EMPLOYEE,
    label: 'Employee',
    description: 'Attendance, tasks and schedule',
    icon: User,
    color: 'from-amber-600 to-orange-700',
    border: 'border-amber-500/40',
    bg: 'bg-amber-500/10',
    textColor: 'text-amber-300',
  },
  {
    role: ROLES.SUPPLIER,
    label: 'Supplier',
    description: 'Purchase orders and invoices',
    icon: Package,
    color: 'from-slate-600 to-slate-700',
    border: 'border-slate-500/40',
    bg: 'bg-slate-500/10',
    textColor: 'text-slate-300',
  },
];

export default function ERPLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [selectedRole, setSelectedRole] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('role'); // 'role' | 'credentials'

  // Pre-select role from URL param (e.g. /erp-login?role=manager)
  useEffect(() => {
    const roleParam = searchParams.get('role');
    if (roleParam) {
      const found = ROLE_CONFIG.find(r => r.role === roleParam);
      if (found) { setSelectedRole(found); setStep('credentials'); }
    }
  }, []);

  // Redirect if already authenticated
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role, approval_status, branch_id, restaurant_id, organization_id')
            .eq('id', session.user.id)
            .single();
          if (profile?.role && profile.approval_status === 'approved') {
            // Pre-populate sessionStorage so dashboard opens on the correct branch
            if (profile.branch_id && profile.role !== ROLES.OWNER) {
              const orgId = profile.organization_id || profile.restaurant_id || '';
              if (!sessionStorage.getItem('erp_active_branch_id')) {
                const { data: branchRow } = await supabase
                  .from('branches').select('name').eq('id', profile.branch_id).single();
                sessionStorage.setItem('erp_active_branch_id', profile.branch_id);
                sessionStorage.setItem('erp_active_branch_name', branchRow?.name || '');
                sessionStorage.setItem('erp_active_restaurant_id', orgId);
              }
            }
            const home = ROLE_HOME[profile.role] || '/owner-command-center';
            navigate(home, { replace: true });
          }
        } catch (_) {}
      }
    });
  }, [navigate]);

  const handleRoleSelect = (roleConfig) => {
    setSelectedRole(roleConfig);
    setStep('credentials');
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter your email and password');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }

      // Fetch profile to validate role and approval status, and to pre-populate branch sessionStorage
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, approval_status, full_name, branch_id, restaurant_id, organization_id')
        .eq('id', data.user.id)
        .single();

      if (profileError || !profile) {
        // No profile yet — check erp_memberships for pending/rejected/suspended status
        const { data: mem } = await supabase
          .from('erp_memberships')
          .select('status, role')
          .eq('user_id', data.user.id)
          .single();

        if (mem?.status === 'pending') {
          toast.info('Your registration is pending approval. Please wait for the Owner to approve your account.');
          await supabase.auth.signOut();
          setLoading(false);
          return;
        }
        if (mem?.status === 'rejected') {
          toast.error('Your account registration was rejected. Please contact the Owner.');
          await supabase.auth.signOut();
          setLoading(false);
          return;
        }
        if (mem?.status === 'suspended') {
          toast.error('Your account has been suspended. Please contact the Owner.');
          await supabase.auth.signOut();
          setLoading(false);
          return;
        }
        await supabase.auth.signOut();
        toast.error('This identity is not active yet. Open the secure invitation link issued by your organization owner.');
        setLoading(false);
        return;
      }

      // Validate role matches selected portal (skip for owner)
      if (selectedRole && selectedRole.role !== ROLES.OWNER) {
        const actualRole = profile.role;
        if (actualRole !== selectedRole.role) {
          toast.error(`This account is registered as "${actualRole}", not "${selectedRole.label}". Please select the correct portal.`);
          await supabase.auth.signOut();
          setLoading(false);
          return;
        }
      }

      // Check approval status for non-owner roles
      // NULL approval_status = legacy user, treat as approved
      const approvalStatus = profile.approval_status || 'approved';
      if (profile.role !== ROLES.OWNER && approvalStatus === 'pending') {
        toast.info('Your account is pending approval by the Owner.');
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      if (approvalStatus === 'rejected') {
        toast.error('Your account registration was rejected. Please contact the Owner.');
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      if (approvalStatus === 'suspended') {
        toast.error('Your account has been suspended. Please contact the Owner.');
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      const home = ROLE_HOME[profile.role] || '/owner-command-center';

      // Pre-populate sessionStorage with the assigned branch so the dashboard
      // skips BranchSelector and opens directly on the correct branch.
      if (profile.branch_id && profile.role !== ROLES.OWNER) {
        const orgId = profile.organization_id || profile.restaurant_id || '';
        // Fetch branch name for the session label
        const { data: branchRow } = await supabase
          .from('branches')
          .select('name')
          .eq('id', profile.branch_id)
          .single();
        sessionStorage.setItem('erp_active_branch_id', profile.branch_id);
        sessionStorage.setItem('erp_active_branch_name', branchRow?.name || '');
        sessionStorage.setItem('erp_active_restaurant_id', orgId);
      }

      toast.success(`Welcome back, ${profile.full_name || email}!`);
      navigate(home, { replace: true });
    } catch (err) {
      toast.error('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const roleConfig = selectedRole;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      {/* Background pattern */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 mb-4">
            <ShieldCheck className="w-4 h-4 text-violet-400" />
            <span className="text-slate-300 text-sm font-medium">Secure ERP Portal</span>
          </div>
          <h1 className="text-3xl font-black text-white mb-2">
            {step === 'role' ? 'Select Your Portal' : `${roleConfig?.label} Login`}
          </h1>
          <p className="text-slate-400 text-sm">
            {step === 'role'
              ? 'Choose the portal that matches your role to continue'
              : `Sign in to your ${roleConfig?.label} account`}
          </p>
        </div>

        {step === 'role' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ROLE_CONFIG.map((rc) => {
              const Icon = rc.icon;
              return (
                <button
                  key={rc.role}
                  onClick={() => handleRoleSelect(rc)}
                  className={`group flex items-center gap-4 p-4 rounded-2xl border ${rc.border} ${rc.bg} hover:border-opacity-80 hover:scale-[1.02] transition-all duration-200 text-left`}
                >
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${rc.color} flex items-center justify-center shrink-0 shadow-lg`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className={`font-bold text-sm ${rc.textColor}`}>{rc.label}</p>
                    <p className="text-slate-500 text-xs mt-0.5 leading-tight">{rc.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className={`bg-white/5 border ${roleConfig?.border} rounded-2xl p-6`}>
            {/* Role badge */}
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/10">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${roleConfig?.color} flex items-center justify-center`}>
                {roleConfig && React.createElement(roleConfig.icon, { className: 'w-5 h-5 text-white' })}
              </div>
              <div>
                <p className={`font-bold text-sm ${roleConfig?.textColor}`}>{roleConfig?.label} Portal</p>
                <p className="text-slate-500 text-xs">{roleConfig?.description}</p>
              </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <Label htmlFor="email" className="text-slate-300 text-sm">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="mt-1.5 bg-white/5 border-white/10 text-white placeholder:text-slate-600 focus:border-violet-500"
                  required
                />
              </div>
              <div>
                <Label htmlFor="password" className="text-slate-300 text-sm">Password</Label>
                <div className="relative mt-1.5">
                  <Input
                    id="password"
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 focus:border-violet-500 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className={`w-full bg-gradient-to-r ${roleConfig?.color} text-white font-bold h-11 rounded-xl`}
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Signing in…</>
                ) : (
                  <><LogIn className="w-4 h-4 mr-2" />Sign In</>
                )}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <p className="text-slate-500 text-sm">Staff accounts are invitation-only. Ask your organization owner for a secure activation link.</p>
              <button onClick={() => navigate('/erp-register?owner=1')} className="mt-2 text-xs font-medium text-violet-400 hover:text-violet-300">Create a new owner organization account</button>
            </div>
          </div>
        )}

        {step === 'credentials' && (
          <button
            onClick={() => { setStep('role'); setSelectedRole(null); setEmail(''); setPassword(''); }}
            className="flex items-center gap-2 text-slate-500 hover:text-slate-300 text-sm mt-4 mx-auto transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to portal selection
          </button>
        )}

        <p className="text-center text-slate-600 text-xs mt-6">
          © 2026 BizCTRL · All rights reserved
        </p>
      </div>
    </div>
  );
}
