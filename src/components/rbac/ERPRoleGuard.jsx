import React from 'react';
import { Navigate } from 'react-router-dom';
import { useRole, ROLE_HOME } from '@/lib/RoleContext';
import { useAuth } from '@/lib/AuthContext';
import { ShieldOff, Loader2 } from 'lucide-react';

/**
 * ERPRoleGuard — strict role-based access control for ERP dashboards.
 *
 * Usage:
 *   <ERPRoleGuard allowedRoles={['manager']}>
 *     <ManagerDashboard />
 *   </ERPRoleGuard>
 *
 * Rules:
 *   - Unauthenticated → redirect to /erp-login
 *   - Suspended / rejected → redirect to /erp-login
 *   - Wrong role → redirect to their own home dashboard
 *   - Correct role + approved → render children
 */
export default function ERPRoleGuard({ allowedRoles = [], children }) {
  const { role } = useRole();
  const { user, isLoadingAuth } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-950">
        <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    return <Navigate to="/erp-login" replace />;
  }

  // Account suspended or rejected
  const approvalStatus = user.status || user.approval_status;
  if (approvalStatus === 'suspended' || approvalStatus === 'rejected') {
    return <Navigate to="/erp-login" replace />;
  }

  // Pending approval
  if (approvalStatus === 'pending') {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-950 p-8">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto mb-4">
            <ShieldOff className="w-8 h-8 text-amber-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Pending Approval</h2>
          <p className="text-slate-400 text-sm">
            Your account is awaiting approval from the Organization Owner.
            You will be notified once your account is approved.
          </p>
        </div>
      </div>
    );
  }

  // Role not in allowed list
  if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    // Redirect to their correct home
    const correctHome = ROLE_HOME[role] || '/erp-login';
    return <Navigate to={correctHome} replace />;
  }

  return children;
}
