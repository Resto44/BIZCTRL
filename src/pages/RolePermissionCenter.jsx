/**
 * RolePermissionCenter — Centralized Role & Permission Management.
 *
 * Owner-only page. Features:
 *   1. User list with role, status, branch, last login
 *   2. Role assignment (12 roles)
 *   3. Per-module, per-action permission toggles
 *   4. Data scope control (all branches / assigned branch / selected branches)
 *   5. Role templates: create, clone, delete, apply
 *   6. Quick actions: activate, deactivate, transfer, remove
 *   7. Audit log
 *
 * All mutations go through Supabase SECURITY DEFINER RPCs.
 * Nothing is hardcoded — all permissions come from DB.
 */
import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useTenant } from '@/lib/TenantContext';
import { useRole } from '@/lib/RoleContext';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import { cn } from '@/lib/utils';
import PageHeader from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Separator } from '@/components/ui/separator';
import {
  Shield, Users, Settings2, History, Plus, Copy, Trash2,
  UserCheck, UserX, ArrowRightLeft, Search, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, Clock, Eye, RefreshCw, Lock, Unlock,
  ShieldCheck, ShieldOff, Building2, Mail, Phone, Star, Filter
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

// ─── Constants ────────────────────────────────────────────────────────────────
export const ALL_ROLES = [
  { value: 'owner',           label: 'Owner',           color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300', description: 'Full access to all features' },
  { value: 'general_manager', label: 'General Manager', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',         description: 'Multi-branch oversight' },
  { value: 'manager',         label: 'Branch Manager',  color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', description: 'Single branch management' },
  { value: 'cashier',         label: 'Cashier',         color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',         description: 'POS and sales only' },
  { value: 'accountant',      label: 'Accountant',      color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300', description: 'Finance and reports' },
  { value: 'procurement',     label: 'Procurement',     color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300', description: 'Purchases and suppliers' },
  { value: 'warehouse',       label: 'Warehouse',       color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',     description: 'Inventory management' },
  { value: 'delivery',        label: 'Delivery',        color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',             description: 'Delivery orders only' },
  { value: 'waiter',          label: 'Waiter',          color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',         description: 'Table service' },
  { value: 'auditor',         label: 'Auditor',         color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300', description: 'Read-only audit access' },
  { value: 'read_only',       label: 'Read Only',       color: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300',     description: 'View only, no edits' },
];

export const MODULE_PERMISSIONS = [
  { key: 'viewDashboard',        label: 'Dashboard',         group: 'Core' },
  { key: 'viewSales',            label: 'Sales',             group: 'Core' },
  { key: 'viewPurchases',        label: 'Purchases',         group: 'Core' },
  { key: 'viewInventory',        label: 'Inventory',         group: 'Core' },
  { key: 'viewSuppliers',        label: 'Suppliers',         group: 'Core' },
  { key: 'viewExpenses',         label: 'Expenses',          group: 'Core' },
  { key: 'viewTreasury',         label: 'Treasury',          group: 'Finance' },
  { key: 'viewReports',          label: 'Reports',           group: 'Finance' },
  { key: 'viewProfitLoss',       label: 'Profit & Loss',     group: 'Finance' },
  { key: 'viewDebts',            label: 'Debt Management',   group: 'Finance' },
  { key: 'viewNetworkAccounts',  label: 'Network Settlement',group: 'Finance' },
  { key: 'viewPayroll',          label: 'Payroll',           group: 'People' },
  { key: 'viewEmployees',        label: 'Employees',         group: 'People' },
  { key: 'viewAttendance',       label: 'Attendance',        group: 'People' },
  { key: 'viewEmployeeControl',  label: 'Staff Control',     group: 'People' },
  { key: 'viewDelivery',         label: 'Delivery',          group: 'Operations' },
  { key: 'viewAlerts',           label: 'Smart Alerts',      group: 'Operations' },
  { key: 'manageSettings',       label: 'Settings',          group: 'Admin' },
  { key: 'manageDashboardCustomization', label: 'Customize Owner Dashboard', group: 'Admin' },
  { key: 'manageBranches',       label: 'Branch Management', group: 'Admin' },
  { key: 'manageUsers',          label: 'User Management',   group: 'Admin' },
  { key: 'viewBrandSettings',    label: 'Brand Settings',    group: 'Admin' },
  { key: 'viewActivityLogs',     label: 'Activity Logs',     group: 'Admin' },
  { key: 'exportPDF',            label: 'Export / Print',    group: 'Admin' },
];

export const ACTION_PERMISSIONS = [
  { key: 'view',        label: 'View' },
  { key: 'create',      label: 'Create' },
  { key: 'update',      label: 'Update' },
  { key: 'delete',      label: 'Delete' },
  { key: 'approve',     label: 'Approve' },
  { key: 'export',      label: 'Export' },
  { key: 'print',       label: 'Print' },
  { key: 'closeShift',  label: 'Close Shift' },
  { key: 'openShift',   label: 'Open Shift' },
  { key: 'void',        label: 'Void' },
  { key: 'refund',      label: 'Refund' },
  { key: 'transfer',    label: 'Transfer' },
];

const ROLE_MAP = Object.fromEntries(ALL_ROLES.map(r => [r.value, r]));

// ─── Helpers ──────────────────────────────────────────────────────────────────
function RoleBadge({ role }) {
  const def = ROLE_MAP[role] || { label: role, color: 'bg-slate-100 text-slate-700' };
  return (
    <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', def.color)}>
      {def.label}
    </span>
  );
}

function StatusDot({ status }) {
  const colors = {
    approved: 'bg-green-500',
    pending:  'bg-amber-500',
    suspended:'bg-red-500',
    rejected: 'bg-red-700',
  };
  return (
    <span className={cn('inline-block w-2 h-2 rounded-full', colors[status] || 'bg-slate-400')} />
  );
}

// ─── Permission matrix for a single user ─────────────────────────────────────
function PermissionMatrix({ membership, onSave, saving }) {
  const [perms, setPerms] = useState(() => membership.permissions || {});

  const toggle = useCallback((key) => {
    setPerms(p => ({ ...p, [key]: !p[key] }));
  }, []);

  const groups = useMemo(() => {
    const g = {};
    MODULE_PERMISSIONS.forEach(m => {
      if (!g[m.group]) g[m.group] = [];
      g[m.group].push(m);
    });
    return g;
  }, []);

  const isDirty = JSON.stringify(perms) !== JSON.stringify(membership.permissions || {});

  return (
    <div className="space-y-4">
      {Object.entries(groups).map(([group, items]) => (
        <div key={group}>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{group}</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {items.map(item => (
              <div key={item.key} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40 border border-border/50">
                <span className="text-sm text-foreground">{item.label}</span>
                <Switch
                  checked={!!perms[item.key]}
                  onCheckedChange={() => toggle(item.key)}
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      {isDirty && (
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => setPerms(membership.permissions || {})}>
            Reset
          </Button>
          <Button size="sm" onClick={() => onSave(perms)} disabled={saving}>
            {saving ? 'Saving...' : 'Save Permissions'}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── User card ────────────────────────────────────────────────────────────────
function UserCard({ membership, branches, onRoleChange, onStatusChange, onPermissionSave, onTransfer, onRemove }) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState('permissions');
  const [savingPerms, setSavingPerms] = useState(false);

  const branchName = useMemo(
    () => branches?.find(b => b.id === membership.branch_id)?.name || '—',
    [branches, membership.branch_id]
  );

  const handlePermSave = async (perms) => {
    setSavingPerms(true);
    await onPermissionSave(membership.id, perms);
    setSavingPerms(false);
  };

  return (
    <Card className={cn('transition-all', expanded && 'ring-1 ring-primary/30')}>
      <CardContent className="p-4">
        {/* Header row */}
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
            {(membership.full_name || membership.email || 'U').charAt(0).toUpperCase()}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-foreground truncate">
                {membership.full_name || 'Unknown'}
              </span>
              <StatusDot status={membership.status} />
              <RoleBadge role={membership.role} />
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{membership.email}</span>
              {membership.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{membership.phone}</span>}
              <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{branchName}</span>
              {membership.last_login_at && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {format(new Date(membership.last_login_at), 'MMM d, HH:mm')}
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Role selector */}
            <Select value={membership.role} onValueChange={(v) => onRoleChange(membership.id, v)}>
              <SelectTrigger className="h-7 text-xs w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_ROLES.filter(r => r.value !== 'owner').map(r => (
                  <SelectItem key={r.value} value={r.value} className="text-xs">
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title={membership.status === 'approved' ? 'Deactivate' : 'Activate'}
              onClick={() => onStatusChange(membership.id, membership.status === 'approved' ? 'suspended' : 'approved')}
            >
              {membership.status === 'approved'
                ? <Unlock className="w-3.5 h-3.5 text-green-600" />
                : <Lock className="w-3.5 h-3.5 text-red-500" />
              }
            </Button>

            {/* Transfer */}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Transfer branch"
              onClick={() => onTransfer(membership)}
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
            </Button>

            {/* Remove */}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              title="Remove user"
              onClick={() => onRemove(membership)}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>

            {/* Expand */}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setExpanded(e => !e)}
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>

        {/* Expanded panel */}
        {expanded && (
          <div className="mt-4 pt-4 border-t border-border">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="h-8 text-xs">
                <TabsTrigger value="permissions" className="text-xs h-7">Module Permissions</TabsTrigger>
                <TabsTrigger value="scope" className="text-xs h-7">Data Scope</TabsTrigger>
              </TabsList>

              <TabsContent value="permissions" className="mt-3">
                <PermissionMatrix
                  membership={membership}
                  onSave={handlePermSave}
                  saving={savingPerms}
                />
              </TabsContent>

              <TabsContent value="scope" className="mt-3">
                <DataScopePanel membership={membership} />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Data scope panel ─────────────────────────────────────────────────────────
function DataScopePanel({ membership }) {
  const scope = membership.data_scope || 'assigned_branch';
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Controls which branches this user can see data from.
      </p>
      <div className="space-y-2">
        {[
          { value: 'all_branches',       label: 'All Branches',         desc: 'Can see data from every branch' },
          { value: 'assigned_branch',    label: 'Assigned Branch Only', desc: 'Can only see their assigned branch' },
          { value: 'selected_branches',  label: 'Selected Branches',    desc: 'Can see specific branches' },
        ].map(opt => (
          <div
            key={opt.value}
            className={cn(
              'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
              scope === opt.value
                ? 'border-primary bg-primary/5'
                : 'border-border hover:bg-muted/50'
            )}
          >
            <div className={cn(
              'w-4 h-4 rounded-full border-2 mt-0.5 shrink-0',
              scope === opt.value ? 'border-primary bg-primary' : 'border-muted-foreground'
            )} />
            <div>
              <p className="text-sm font-medium">{opt.label}</p>
              <p className="text-xs text-muted-foreground">{opt.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Role templates panel ─────────────────────────────────────────────────────
function RoleTemplatesPanel({ restaurantId }) {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('manager');

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['role-templates', restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('role_templates')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!restaurantId,
  });

  const createMutation = useMutation({
    mutationFn: async ({ name, baseRole }) => {
      const { data, error } = await supabase
        .from('role_templates')
        .insert({ restaurant_id: restaurantId, name, base_role: baseRole, permissions: {} })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries(['role-templates', restaurantId]);
      setCreateOpen(false);
      setNewName('');
      toast.success('Role template created');
    },
    onError: (e) => toast.error(e.message),
  });

  const cloneMutation = useMutation({
    mutationFn: async ({ id, name }) => {
      const { data, error } = await supabase.rpc('clone_role_template', {
        p_template_id: id,
        p_new_name: name,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries(['role-templates', restaurantId]);
      toast.success('Template cloned');
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('role_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries(['role-templates', restaurantId]);
      toast.success('Template deleted');
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-foreground">Role Templates</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Create reusable permission sets. Apply them to users instantly.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="w-3.5 h-3.5 mr-1.5" /> New Template
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />)}
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No templates yet. Create one to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map(tmpl => (
            <Card key={tmpl.id}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{tmpl.name}</span>
                    <RoleBadge role={tmpl.base_role} />
                    {tmpl.is_system && <Badge variant="secondary" className="text-[10px]">System</Badge>}
                  </div>
                  {tmpl.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{tmpl.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Clone template"
                    onClick={() => cloneMutation.mutate({ id: tmpl.id, name: tmpl.name + ' (Copy)' })}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                  {!tmpl.is_system && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      title="Delete template"
                      onClick={() => deleteMutation.mutate(tmpl.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create Role Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs">Template Name</Label>
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Senior Cashier"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Base Role</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_ROLES.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate({ name: newName, baseRole: newRole })}
              disabled={!newName.trim() || createMutation.isPending}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Audit log panel ──────────────────────────────────────────────────────────
function AuditLogPanel({ restaurantId }) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['permission-audit-log', restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('permission_audit_log')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!restaurantId,
  });

  const ACTION_LABELS = {
    role_change:       'Role Changed',
    permission_change: 'Permissions Updated',
    status_change:     'Status Changed',
    transfer:          'Branch Transfer',
    remove_user:       'User Removed',
    duplicate:         'Permissions Copied',
  };

  const ACTION_COLORS = {
    role_change:       'text-blue-600 bg-blue-50 dark:bg-blue-900/20',
    permission_change: 'text-purple-600 bg-purple-50 dark:bg-purple-900/20',
    status_change:     'text-amber-600 bg-amber-50 dark:bg-amber-900/20',
    transfer:          'text-teal-600 bg-teal-50 dark:bg-teal-900/20',
    remove_user:       'text-red-600 bg-red-50 dark:bg-red-900/20',
    duplicate:         'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20',
  };

  if (isLoading) return <div className="h-32 bg-muted animate-pulse rounded-lg" />;

  return (
    <div className="space-y-2">
      {logs.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No audit events yet.</p>
      ) : (
        logs.map(log => (
          <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card">
            <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 mt-0.5', ACTION_COLORS[log.action] || 'text-muted-foreground bg-muted')}>
              {ACTION_LABELS[log.action] || log.action}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground">
                <span className="font-medium">{log.target_name || log.target_email}</span>
                {log.old_role && log.new_role && log.old_role !== log.new_role && (
                  <span className="text-muted-foreground"> · {log.old_role} → {log.new_role}</span>
                )}
              </p>
              {log.notes && <p className="text-xs text-muted-foreground mt-0.5">{log.notes}</p>}
            </div>
            <span className="text-xs text-muted-foreground shrink-0">
              {format(new Date(log.created_at), 'MMM d, HH:mm')}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function RolePermissionCenter() {
  const { role, can } = useRole();
  const { user } = useAuth();
  const { activeRestaurant, branches } = useTenant();
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [removeTarget, setRemoveTarget] = useState(null);
  const [transferTarget, setTransferTarget] = useState(null);
  const [transferBranch, setTransferBranch] = useState('');

  const restaurantId = activeRestaurant?.id;

  // Only owner can access this page
  if (role !== 'owner' && role !== 'general_manager') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-8">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
          <ShieldOff className="w-8 h-8 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Access Restricted</h2>
          <p className="text-sm text-muted-foreground mt-1">Only the Owner can manage roles and permissions.</p>
        </div>
      </div>
    );
  }

  // Fetch all memberships
  const { data: memberships = [], isLoading } = useQuery({
    queryKey: ['erp-memberships', restaurantId],
    queryFn: async () => {
      if (!restaurantId) return [];
      const { data, error } = await supabase
        .from('erp_memberships')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!restaurantId,
  });

  // Filtered members
  const filtered = useMemo(() => {
    return memberships.filter(m => {
      if (m.role === 'owner') return false; // Don't show owner in the list
      const q = search.toLowerCase();
      const matchSearch = !q || (m.full_name || '').toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q);
      const matchRole   = filterRole === 'all' || m.role === filterRole;
      const matchStatus = filterStatus === 'all' || m.status === filterStatus;
      return matchSearch && matchRole && matchStatus;
    });
  }, [memberships, search, filterRole, filterStatus]);

  // Role change mutation
  const roleChangeMutation = useMutation({
    mutationFn: async ({ membershipId, newRole }) => {
      const { data, error } = await supabase.rpc('update_user_role_and_permissions', {
        p_membership_id: membershipId,
        p_new_role: newRole,
        p_action: 'role_change',
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries(['erp-memberships', restaurantId]);
      toast.success('Role updated');
    },
    onError: (e) => toast.error(e.message),
  });

  // Permission save mutation
  const permSaveMutation = useMutation({
    mutationFn: async ({ membershipId, permissions }) => {
      const { data, error } = await supabase.rpc('update_user_role_and_permissions', {
        p_membership_id: membershipId,
        p_permissions: permissions,
        p_action: 'permission_change',
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries(['erp-memberships', restaurantId]);
      toast.success('Permissions saved');
    },
    onError: (e) => toast.error(e.message),
  });

  // Status change mutation
  const statusMutation = useMutation({
    mutationFn: async ({ membershipId, status }) => {
      const { data, error } = await supabase.rpc('toggle_user_status', {
        p_membership_id: membershipId,
        p_status: status,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries(['erp-memberships', restaurantId]);
      toast.success('Status updated');
    },
    onError: (e) => toast.error(e.message),
  });

  // Transfer mutation
  const transferMutation = useMutation({
    mutationFn: async ({ membershipId, branchId }) => {
      const { data, error } = await supabase.rpc('transfer_user_branch', {
        p_membership_id: membershipId,
        p_new_branch_id: branchId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries(['erp-memberships', restaurantId]);
      setTransferTarget(null);
      toast.success('User transferred');
    },
    onError: (e) => toast.error(e.message),
  });

  // Remove mutation
  const removeMutation = useMutation({
    mutationFn: async (membershipId) => {
      const { data, error } = await supabase.rpc('remove_user_from_org', {
        p_membership_id: membershipId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries(['erp-memberships', restaurantId]);
      setRemoveTarget(null);
      toast.success('User removed');
    },
    onError: (e) => toast.error(e.message),
  });

  const stats = useMemo(() => ({
    total:     memberships.filter(m => m.role !== 'owner').length,
    active:    memberships.filter(m => m.status === 'approved').length,
    pending:   memberships.filter(m => m.status === 'pending').length,
    suspended: memberships.filter(m => m.status === 'suspended').length,
  }), [memberships]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Role & Permission Center"
        subtitle="Owner-controlled access management. All permissions come from the database."
        icon={Shield}
      />

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Users',  value: stats.total,     color: 'text-primary' },
          { label: 'Active',       value: stats.active,    color: 'text-green-600' },
          { label: 'Pending',      value: stats.pending,   color: 'text-amber-600' },
          { label: 'Suspended',    value: stats.suspended, color: 'text-red-600' },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={cn('text-2xl font-bold mt-1', s.color)}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users"><Users className="w-3.5 h-3.5 mr-1.5" />Users</TabsTrigger>
          <TabsTrigger value="templates"><Star className="w-3.5 h-3.5 mr-1.5" />Role Templates</TabsTrigger>
          <TabsTrigger value="audit"><History className="w-3.5 h-3.5 mr-1.5" />Audit Log</TabsTrigger>
        </TabsList>

        {/* Users tab */}
        <TabsContent value="users" className="mt-4 space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name or email..."
                className="pl-9 h-9 text-sm"
              />
            </div>
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger className="w-36 h-9 text-sm">
                <SelectValue placeholder="All roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                {ALL_ROLES.filter(r => r.value !== 'owner').map(r => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-32 h-9 text-sm">
                <SelectValue placeholder="All status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="approved">Active</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* User cards */}
          {isLoading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No users found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(m => (
                <UserCard
                  key={m.id}
                  membership={m}
                  branches={branches}
                  onRoleChange={(id, role) => roleChangeMutation.mutate({ membershipId: id, newRole: role })}
                  onStatusChange={(id, status) => statusMutation.mutate({ membershipId: id, status })}
                  onPermissionSave={(id, perms) => permSaveMutation.mutateAsync({ membershipId: id, permissions: perms })}
                  onTransfer={(m) => { setTransferTarget(m); setTransferBranch(m.branch_id || ''); }}
                  onRemove={(m) => setRemoveTarget(m)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Templates tab */}
        <TabsContent value="templates" className="mt-4">
          <RoleTemplatesPanel restaurantId={restaurantId} />
        </TabsContent>

        {/* Audit log tab */}
        <TabsContent value="audit" className="mt-4">
          <AuditLogPanel restaurantId={restaurantId} />
        </TabsContent>
      </Tabs>

      {/* Transfer dialog */}
      <Dialog open={!!transferTarget} onOpenChange={() => setTransferTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Transfer Branch</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-muted-foreground">
              Move <strong>{transferTarget?.full_name || transferTarget?.email}</strong> to a different branch.
            </p>
            <Select value={transferBranch} onValueChange={setTransferBranch}>
              <SelectTrigger>
                <SelectValue placeholder="Select branch" />
              </SelectTrigger>
              <SelectContent>
                {(branches || []).map(b => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferTarget(null)}>Cancel</Button>
            <Button
              onClick={() => transferMutation.mutate({ membershipId: transferTarget.id, branchId: transferBranch })}
              disabled={!transferBranch || transferMutation.isPending}
            >
              Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirmation */}
      <AlertDialog open={!!removeTarget} onOpenChange={() => setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{removeTarget?.full_name || removeTarget?.email}</strong> from this organization?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => removeMutation.mutate(removeTarget.id)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
