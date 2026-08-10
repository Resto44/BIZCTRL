import React, { useState, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Building2, GitBranch, ChevronRight, Loader2 } from 'lucide-react';

/**
 * BranchSelector — shown after login when a manager/employee is assigned to multiple branches.
 * Stores the selected branch in sessionStorage so the app can use it for RLS filtering.
 *
 * Resolution order:
 *   1. branch_assignments (active=true) with branches join
 *   2. profiles.branch_id with branches join (fallback when join is blocked by RLS)
 *   3. Direct branches fetch by profile.branch_id (last resort)
 */
export default function BranchSelector({ onSelect }) {
  const { user } = useAuth();
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      setLoading(true);
      loadAssignedBranches();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const loadAssignedBranches = async () => {
    try {
      // ── Step 1: branch_assignments (active only) ──────────────────────────────
      const { data: assignments } = await supabase
        .from('branch_assignments')
        .select('branch_id, branches(id, name, restaurant_id, restaurants(name))')
        .eq('user_id', user.id)
        .eq('active', true);

      // Filter out rows where the branches join returned null (RLS edge case)
      const branchList = (assignments || [])
        .map(a => a.branches)
        .filter(Boolean);

      if (branchList.length > 0) {
        setBranches(branchList);
        if (branchList.length === 1) {
          handleSelect(branchList[0]);
        }
        return;
      }

      // ── Step 2: profile branch_id with join ───────────────────────────────────
      const { data: profile } = await supabase
        .from('profiles')
        .select('branch_id, restaurant_id, organization_id, branches(id, name, restaurant_id, restaurants(name))')
        .eq('id', user.id)
        .single();

      if (profile?.branches) {
        setBranches([profile.branches]);
        handleSelect(profile.branches);
        return;
      }

      // ── Step 3: direct branch fetch by profile.branch_id ─────────────────────
      if (profile?.branch_id) {
        const { data: branch } = await supabase
          .from('branches')
          .select('id, name, restaurant_id, restaurants(name)')
          .eq('id', profile.branch_id)
          .single();

        if (branch) {
          // Attach restaurant_id from profile if missing on the branch row
          const enriched = {
            ...branch,
            restaurant_id: branch.restaurant_id
              || profile.organization_id
              || profile.restaurant_id
              || '',
          };
          setBranches([enriched]);
          handleSelect(enriched);
          return;
        }
      }
    } catch (err) {
      console.error('[BranchSelector]', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (branch) => {
    sessionStorage.setItem('erp_active_branch_id', branch.id);
    sessionStorage.setItem('erp_active_branch_name', branch.name || '');
    sessionStorage.setItem('erp_active_restaurant_id', branch.restaurant_id || '');
    // BUG FIX: also persist branch_key so manager dashboard can query expenses by branch_key
    sessionStorage.setItem('erp_active_branch_key', branch.branch_key || branch.key || '');
    onSelect?.(branch);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading your branches…
        </div>
      </div>
    );
  }

  if (branches.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
        <div className="max-w-sm w-full text-center">
          <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-amber-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">No Branch Assigned</h2>
          <p className="text-slate-400 text-sm">
            You haven't been assigned to any branch yet. Please contact your Owner or Manager.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center mx-auto mb-4">
            <GitBranch className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-black text-white mb-2">Select Branch</h1>
          <p className="text-slate-400 text-sm">You have access to multiple branches. Choose one to continue.</p>
        </div>

        <div className="space-y-3">
          {branches.map(branch => (
            <button
              key={branch.id}
              onClick={() => handleSelect(branch)}
              className="w-full flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 hover:border-emerald-500/30 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-white" />
                </div>
                <div className="text-left">
                  <p className="text-white font-bold text-sm">{branch.name}</p>
                  {branch.restaurants?.name && (
                    <p className="text-slate-500 text-xs">{branch.restaurants.name}</p>
                  )}
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-emerald-400 transition-colors" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
