import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { useTenant } from '@/lib/TenantContext';
import { useRole } from '@/lib/RoleContext';
import { useLanguage } from '@/lib/LanguageContext';
import { useSubscription } from '@/lib/SubscriptionContext';
import { subscriptionLimitErrorMessage, subscriptionLimitMessage } from '@/lib/subscriptionLimits';
import { formatCurrency } from '@/lib/helpers';
import PageHeader from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  GitBranch, Plus, Pencil, Trash2, Users, TrendingUp, DollarSign,
  ShoppingCart, Receipt, MapPin, Phone, Clock, UserCheck, UserX,
  BarChart3, AlertTriangle, CheckCircle2, Building2, Mail,
  Shield, ShieldCheck, ShieldOff, Key, RefreshCw, Copy,
  ArrowRightLeft, UserMinus, ChevronDown, ChevronUp, Search,
  History, Settings2, Globe
} from 'lucide-react';
import { subDays, format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { toast } from 'sonner';

// ─── Role definitions ─────────────────────────────────────────────────────────
const ALL_ROLES = [
  { value: 'owner',           label: 'Owner',           color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' },
  { value: 'general_manager', label: 'General Manager', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  { value: 'manager',         label: 'Branch Manager',  color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  { value: 'cashier',         label: 'Cashier',         color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300' },
  { value: 'accountant',      label: 'Accountant',      color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' },
  { value: 'procurement',     label: 'Procurement',     color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  { value: 'warehouse',       label: 'Warehouse',       color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  { value: 'delivery',        label: 'Delivery',        color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300' },
  { value: 'waiter',          label: 'Waiter',          color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300' },
  { value: 'auditor',         label: 'Auditor',         color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  { value: 'read_only',       label: 'Read Only',       color: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300' },
  // Legacy ERP roles
  { value: 'employee',        label: 'Employee',        color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  { value: 'supplier',        label: 'Supplier',        color: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300' },
];

const ROLE_MAP = Object.fromEntries(ALL_ROLES.map(r => [r.value, r]));

// ─── Module permissions ───────────────────────────────────────────────────────
const MODULE_PERMISSIONS = [
  { key: 'viewDashboard',       label: 'Dashboard' },
  { key: 'manageBranches',      label: 'Branch Management' },
  { key: 'viewTreasury',        label: 'Treasury' },
  { key: 'viewSales',           label: 'Sales' },
  { key: 'viewPurchases',       label: 'Purchases' },
  { key: 'viewSuppliers',       label: 'Suppliers' },
  { key: 'viewDebts',           label: 'Customers' },
  { key: 'viewInventory',       label: 'Products' },
  { key: 'viewInventory',       label: 'Inventory',   key2: 'viewInventoryMgmt' },
  { key: 'viewExpenses',        label: 'Expenses' },
  { key: 'viewPayroll',         label: 'Payroll' },
  { key: 'viewEmployees',       label: 'Employees' },
  { key: 'viewReports',         label: 'Reports' },
  { key: 'viewNetworkAccounts', label: 'Oracle Analytics' },
  { key: 'manageSettings',      label: 'Settings' },
  { key: 'manageUsers',         label: 'Users' },
  { key: 'viewAlerts',          label: 'Notifications' },
];

// Deduplicate by key
const UNIQUE_MODULE_PERMISSIONS = MODULE_PERMISSIONS.reduce((acc, m) => {
  if (!acc.find(x => x.key === m.key)) acc.push(m);
  return acc;
}, []);

const DATA_SCOPE_OPTIONS = [
  { value: 'all_branches',       label: 'All Branches' },
  { value: 'assigned_branch',    label: 'Assigned Branch Only' },
  { value: 'selected_branches',  label: 'Selected Branches' },
];

// ─── UI strings ───────────────────────────────────────────────────────────────
const UI = {
  en: {
    title: 'Branch Management & Role Control Center',
    subtitle: 'Manage branches, users, roles, and permissions from one place',
    add_branch: 'Add Branch',
    edit_branch: 'Edit Branch',
    delete_branch: 'Delete Branch',
    branch_name: 'Branch Name',
    branch_address: 'Address',
    branch_phone: 'Phone',
    working_hours: 'Working Hours',
    manager_email: 'Manager Email',
    manager_name: 'Manager Name',
    active: 'Active',
    inactive: 'Inactive',
    no_branches: 'No branches yet. Add your first branch.',
    performance: 'Performance (30d)',
    sales: 'Sales',
    expenses: 'Expenses',
    purchases: 'Purchases',
    employees: 'Employees',
    no_manager: 'No Manager Assigned',
    save: 'Save',
    cancel: 'Cancel',
    delete_confirm: 'This will remove the branch permanently.',
    overview: 'Overview',
    analytics: 'Analytics',
    compare: 'Compare',
    users: 'Users & Roles',
    audit: 'Audit Log',
    status: 'Status',
    branch_key: 'Branch Key (unique ID)',
    owner_only: 'Owner access required.',
    all_branches: 'All Branches',
    top_branch: 'Top Branch',
    total_sales_30: 'Total Sales (30d)',
    no_manager_assigned: 'Not Assigned',
    disable_branch: 'Disable Branch',
    enable_branch: 'Enable Branch',
    role_control: 'Role Control Center',
    user_management: 'User Management',
    role_assignment: 'Role Assignment',
    module_permissions: 'Module Permissions',
    data_scope: 'Data Scope',
    quick_actions: 'Quick Actions',
    audit_log: 'Audit Log',
    search_users: 'Search users...',
    no_users: 'No users found.',
    last_login: 'Last Login',
    never: 'Never',
    reset_password: 'Reset Password',
    deactivate: 'Deactivate',
    activate: 'Activate',
    transfer: 'Transfer',
    duplicate_perms: 'Duplicate Permissions',
    remove_user: 'Remove User',
    confirm_remove: 'This will permanently remove the user from the organization.',
    confirm_deactivate: 'This will suspend the user\'s access.',
    confirm_activate: 'This will restore the user\'s access.',
    permissions_saved: 'Permissions saved.',
    role_changed: 'Role updated.',
    scope_changed: 'Data scope updated.',
    user_transferred: 'User transferred.',
    user_removed: 'User removed.',
    user_activated: 'User activated.',
    user_deactivated: 'User deactivated.',
    perms_duplicated: 'Permissions duplicated.',
    select_branch: 'Select branch...',
    select_user: 'Select user to copy from...',
    action: 'Action',
    old_role: 'Old Role',
    new_role: 'New Role',
    permission: 'Permission',
    date: 'Date',
    performed_by: 'By',
    target_user: 'User',
    no_audit: 'No audit records yet.',
    filter_all: 'All Actions',
    filter_role: 'Role Changes',
    filter_perm: 'Permission Changes',
    filter_status: 'Status Changes',
  },
  ar: {
    title: 'مركز إدارة الفروع والصلاحيات',
    subtitle: 'إدارة الفروع والمستخدمين والأدوار والصلاحيات من مكان واحد',
    add_branch: 'إضافة فرع',
    edit_branch: 'تعديل الفرع',
    delete_branch: 'حذف الفرع',
    branch_name: 'اسم الفرع',
    branch_address: 'العنوان',
    branch_phone: 'الهاتف',
    working_hours: 'ساعات العمل',
    manager_email: 'بريد المدير',
    manager_name: 'اسم المدير',
    active: 'نشط',
    inactive: 'غير نشط',
    no_branches: 'لا توجد فروع بعد.',
    performance: 'الأداء (30 يوم)',
    sales: 'المبيعات',
    expenses: 'المصاريف',
    purchases: 'المشتريات',
    employees: 'الموظفون',
    no_manager: 'لم يُعيَّن مدير',
    save: 'حفظ',
    cancel: 'إلغاء',
    delete_confirm: 'سيتم حذف الفرع بشكل دائم.',
    overview: 'نظرة عامة',
    analytics: 'التحليلات',
    compare: 'مقارنة',
    users: 'المستخدمون والأدوار',
    audit: 'سجل التدقيق',
    status: 'الحالة',
    branch_key: 'معرف الفرع',
    owner_only: 'يتطلب صلاحية المالك.',
    all_branches: 'جميع الفروع',
    top_branch: 'أفضل فرع',
    total_sales_30: 'إجمالي المبيعات (30 يوم)',
    no_manager_assigned: 'غير مُعيَّن',
    disable_branch: 'تعطيل الفرع',
    enable_branch: 'تفعيل الفرع',
    role_control: 'مركز التحكم بالأدوار',
    user_management: 'إدارة المستخدمين',
    role_assignment: 'تعيين الأدوار',
    module_permissions: 'صلاحيات الوحدات',
    data_scope: 'نطاق البيانات',
    quick_actions: 'الإجراءات السريعة',
    audit_log: 'سجل التدقيق',
    search_users: 'بحث عن مستخدمين...',
    no_users: 'لا يوجد مستخدمون.',
    last_login: 'آخر تسجيل دخول',
    never: 'لم يسجل',
    reset_password: 'إعادة تعيين كلمة المرور',
    deactivate: 'تعطيل',
    activate: 'تفعيل',
    transfer: 'نقل',
    duplicate_perms: 'نسخ الصلاحيات',
    remove_user: 'إزالة المستخدم',
    confirm_remove: 'سيتم إزالة المستخدم نهائياً.',
    confirm_deactivate: 'سيتم تعليق وصول المستخدم.',
    confirm_activate: 'سيتم استعادة وصول المستخدم.',
    permissions_saved: 'تم حفظ الصلاحيات.',
    role_changed: 'تم تحديث الدور.',
    scope_changed: 'تم تحديث نطاق البيانات.',
    user_transferred: 'تم نقل المستخدم.',
    user_removed: 'تم إزالة المستخدم.',
    user_activated: 'تم تفعيل المستخدم.',
    user_deactivated: 'تم تعطيل المستخدم.',
    perms_duplicated: 'تم نسخ الصلاحيات.',
    select_branch: 'اختر فرعاً...',
    select_user: 'اختر مستخدماً للنسخ منه...',
    action: 'الإجراء',
    old_role: 'الدور القديم',
    new_role: 'الدور الجديد',
    permission: 'الصلاحية',
    date: 'التاريخ',
    performed_by: 'بواسطة',
    target_user: 'المستخدم',
    no_audit: 'لا توجد سجلات تدقيق بعد.',
    filter_all: 'جميع الإجراءات',
    filter_role: 'تغييرات الأدوار',
    filter_perm: 'تغييرات الصلاحيات',
    filter_status: 'تغييرات الحالة',
  },
  fa: {
    title: 'مرکز مدیریت شعب و کنترل نقش',
    subtitle: 'مدیریت شعب، کاربران، نقش‌ها و مجوزها از یک مکان',
    add_branch: 'افزودن شعبه',
    edit_branch: 'ویرایش شعبه',
    delete_branch: 'حذف شعبه',
    branch_name: 'نام شعبه',
    branch_address: 'آدرس',
    branch_phone: 'تلفن',
    working_hours: 'ساعت کاری',
    manager_email: 'ایمیل مدیر',
    manager_name: 'نام مدیر',
    active: 'فعال',
    inactive: 'غیرفعال',
    no_branches: 'هنوز شعبه‌ای ندارید.',
    performance: 'عملکرد (۳۰ روز)',
    sales: 'فروش',
    expenses: 'هزینه‌ها',
    purchases: 'خریدها',
    employees: 'کارمندان',
    no_manager: 'مدیری تخصیص نیافته',
    save: 'ذخیره',
    cancel: 'لغو',
    delete_confirm: 'این شعبه به طور دائم حذف خواهد شد.',
    overview: 'نمای کلی',
    analytics: 'تحلیل‌ها',
    compare: 'مقایسه',
    users: 'کاربران و نقش‌ها',
    audit: 'گزارش حسابرسی',
    status: 'وضعیت',
    branch_key: 'کلید شعبه',
    owner_only: 'دسترسی مالک لازم است.',
    all_branches: 'همه شعبه‌ها',
    top_branch: 'برترین شعبه',
    total_sales_30: 'کل فروش (۳۰ روز)',
    no_manager_assigned: 'تخصیص نیافته',
    disable_branch: 'غیرفعال کردن',
    enable_branch: 'فعال کردن',
    role_control: 'مرکز کنترل نقش',
    user_management: 'مدیریت کاربران',
    role_assignment: 'تخصیص نقش',
    module_permissions: 'مجوزهای ماژول',
    data_scope: 'محدوده داده',
    quick_actions: 'اقدامات سریع',
    audit_log: 'گزارش حسابرسی',
    search_users: 'جستجوی کاربران...',
    no_users: 'کاربری یافت نشد.',
    last_login: 'آخرین ورود',
    never: 'هرگز',
    reset_password: 'بازنشانی رمز عبور',
    deactivate: 'غیرفعال کردن',
    activate: 'فعال کردن',
    transfer: 'انتقال',
    duplicate_perms: 'کپی مجوزها',
    remove_user: 'حذف کاربر',
    confirm_remove: 'این کاربر به طور دائم حذف خواهد شد.',
    confirm_deactivate: 'دسترسی کاربر تعلیق خواهد شد.',
    confirm_activate: 'دسترسی کاربر بازیابی خواهد شد.',
    permissions_saved: 'مجوزها ذخیره شد.',
    role_changed: 'نقش به‌روزرسانی شد.',
    scope_changed: 'محدوده داده به‌روزرسانی شد.',
    user_transferred: 'کاربر منتقل شد.',
    user_removed: 'کاربر حذف شد.',
    user_activated: 'کاربر فعال شد.',
    user_deactivated: 'کاربر غیرفعال شد.',
    perms_duplicated: 'مجوزها کپی شد.',
    select_branch: 'شعبه را انتخاب کنید...',
    select_user: 'کاربر مبدا را انتخاب کنید...',
    action: 'اقدام',
    old_role: 'نقش قدیمی',
    new_role: 'نقش جدید',
    permission: 'مجوز',
    date: 'تاریخ',
    performed_by: 'توسط',
    target_user: 'کاربر',
    no_audit: 'هنوز سابقه‌ای ثبت نشده.',
    filter_all: 'همه اقدامات',
    filter_role: 'تغییرات نقش',
    filter_perm: 'تغییرات مجوز',
    filter_status: 'تغییرات وضعیت',
  },
};

const EMPTY_BRANCH = { key: '', label: '', address: '', phone: '', working_hours: '', manager_email: '', manager_name: '', is_active: true };

// ─── Branch Form ──────────────────────────────────────────────────────────────
function BranchForm({ initial, onSubmit, onCancel, u, saving }) {
  const [form, setForm] = useState(initial || EMPTY_BRANCH);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const isEdit = !!initial?.key;
  return (
    <div className="space-y-3">
      <div>
        <Label>{u.branch_name} *</Label>
        <Input value={form.label} onChange={e => { set('label', e.target.value); if (!isEdit) set('key', e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')); }} />
      </div>
      {!isEdit && (
        <div>
          <Label>{u.branch_key}</Label>
          <Input value={form.key} onChange={e => set('key', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} placeholder="branch_1" />
        </div>
      )}
      <div>
        <Label><MapPin className="w-3 h-3 inline mr-1" />{u.branch_address}</Label>
        <Input value={form.address || ''} onChange={e => set('address', e.target.value)} />
      </div>
      <div>
        <Label><Phone className="w-3 h-3 inline mr-1" />{u.branch_phone}</Label>
        <Input value={form.phone || ''} onChange={e => set('phone', e.target.value)} />
      </div>
      <div>
        <Label><Clock className="w-3 h-3 inline mr-1" />{u.working_hours}</Label>
        <Input value={form.working_hours || ''} onChange={e => set('working_hours', e.target.value)} placeholder="9:00 AM - 11:00 PM" />
      </div>
      <div className="border-t pt-3">
        <Label><Mail className="w-3 h-3 inline mr-1" />{u.manager_email}</Label>
        <Input type="email" value={form.manager_email || ''} onChange={e => set('manager_email', e.target.value)} />
      </div>
      <div>
        <Label><UserCheck className="w-3 h-3 inline mr-1" />{u.manager_name}</Label>
        <Input value={form.manager_name || ''} onChange={e => set('manager_name', e.target.value)} />
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={form.is_active !== false} onCheckedChange={v => set('is_active', v)} />
        <Label>{form.is_active !== false ? u.active : u.inactive}</Label>
      </div>
      <div className="flex gap-2 pt-2">
        <Button className="flex-1" onClick={() => form.label.trim() && onSubmit(form)} disabled={saving || !form.label.trim()}>{u.save}</Button>
        <Button variant="outline" onClick={onCancel}>{u.cancel}</Button>
      </div>
    </div>
  );
}

// ─── Role Badge ───────────────────────────────────────────────────────────────
function RoleBadge({ role }) {
  const meta = ROLE_MAP[role] || { label: role, color: 'bg-slate-100 text-slate-700' };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${meta.color}`}>{meta.label}</span>;
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = {
    approved:  'bg-emerald-100 text-emerald-700',
    pending:   'bg-amber-100 text-amber-700',
    suspended: 'bg-red-100 text-red-700',
    rejected:  'bg-slate-100 text-slate-600',
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg[status] || cfg.pending}`}>{status}</span>;
}

// ─── User Row (expandable) ────────────────────────────────────────────────────
function UserRow({ mem, branches, onRoleChange, onPermChange, onScopeChange, onQuickAction, u }) {
  const [expanded, setExpanded] = useState(false);
  const [localPerms, setLocalPerms] = useState(mem.permissions || {});
  const [permSaving, setPermSaving] = useState(false);

  const branchName = useMemo(() => {
    if (!mem.branch_id) return '—';
    const b = branches.find(x => x.id === mem.branch_id);
    return b ? b.name : '—';
  }, [mem.branch_id, branches]);

  const handlePermToggle = async (key) => {
    const newVal = !localPerms[key];
    const newPerms = { ...localPerms, [key]: newVal };
    setLocalPerms(newPerms);
    setPermSaving(true);
    try {
      await onPermChange(mem.id, newPerms, key, localPerms[key], newVal);
    } finally {
      setPermSaving(false);
    }
  };

  return (
    <Card className={`overflow-hidden transition-all ${mem.status === 'suspended' ? 'opacity-60' : ''}`}>
      {/* Summary row */}
      <div
        className="flex items-center gap-2 p-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-bold text-primary">
          {(mem.full_name || mem.email || '?')[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold truncate max-w-[120px]">{mem.full_name || '—'}</span>
            <RoleBadge role={mem.role} />
            <StatusBadge status={mem.status} />
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
            <span className="truncate max-w-[140px]">{mem.email}</span>
            {mem.phone && <><span>·</span><span>{mem.phone}</span></>}
            <span>·</span>
            <span className="flex items-center gap-0.5"><GitBranch className="w-2.5 h-2.5" />{branchName}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] text-muted-foreground hidden sm:block">
            {mem.last_login_at ? format(new Date(mem.last_login_at), 'MMM d') : u.never}
          </span>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div className="border-t bg-muted/10 p-3 space-y-4">
          {/* Section 2: Role Assignment */}
          <div>
            <p className="text-xs font-semibold mb-2 flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-primary" />{u.role_assignment}</p>
            <Select value={mem.role} onValueChange={val => onRoleChange(mem.id, val, mem.role)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_ROLES.filter(r => r.value !== 'owner').map(r => (
                  <SelectItem key={r.value} value={r.value} className="text-xs">{r.label}</SelectItem>
                ))}
                <SelectItem value="owner" className="text-xs font-semibold text-violet-600">Owner (Owner Only)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Section 3: Module Permissions */}
          <div>
            <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
              <Settings2 className="w-3.5 h-3.5 text-primary" />{u.module_permissions}
              {permSaving && <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />}
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {UNIQUE_MODULE_PERMISSIONS.map(mod => (
                <div key={mod.key} className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">{mod.label}</span>
                  <Switch
                    checked={!!localPerms[mod.key]}
                    onCheckedChange={() => handlePermToggle(mod.key)}
                    className="scale-75"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Section 4: Data Scope */}
          <div>
            <p className="text-xs font-semibold mb-2 flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 text-primary" />{u.data_scope}</p>
            <Select value={mem.data_scope || 'assigned_branch'} onValueChange={val => onScopeChange(mem.id, val)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATA_SCOPE_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {mem.data_scope === 'selected_branches' && (
              <div className="mt-2 space-y-1">
                <p className="text-[10px] text-muted-foreground">Select accessible branches:</p>
                {branches.map(b => (
                  <div key={b.id} className="flex items-center gap-2">
                    <Switch
                      checked={(mem.selected_branch_ids || []).includes(b.id)}
                      onCheckedChange={checked => {
                        const cur = mem.selected_branch_ids || [];
                        const next = checked ? [...cur, b.id] : cur.filter(id => id !== b.id);
                        onScopeChange(mem.id, 'selected_branches', next);
                      }}
                      className="scale-75"
                    />
                    <span className="text-[11px]">{b.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 5: Quick Actions */}
          <div>
            <p className="text-xs font-semibold mb-2 flex items-center gap-1.5"><Key className="w-3.5 h-3.5 text-primary" />{u.quick_actions}</p>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1"
                onClick={() => onQuickAction('reset_password', mem)}>
                <Key className="w-3 h-3" />{u.reset_password}
              </Button>
              {mem.status === 'approved' ? (
                <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1 text-amber-600 border-amber-300"
                  onClick={() => onQuickAction('deactivate', mem)}>
                  <ShieldOff className="w-3 h-3" />{u.deactivate}
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1 text-emerald-600 border-emerald-300"
                  onClick={() => onQuickAction('activate', mem)}>
                  <ShieldCheck className="w-3 h-3" />{u.activate}
                </Button>
              )}
              <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1"
                onClick={() => onQuickAction('transfer', mem)}>
                <ArrowRightLeft className="w-3 h-3" />{u.transfer}
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1"
                onClick={() => onQuickAction('duplicate', mem)}>
                <Copy className="w-3 h-3" />{u.duplicate_perms}
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1 text-destructive border-destructive/30"
                onClick={() => onQuickAction('remove', mem)}>
                <UserMinus className="w-3 h-3" />{u.remove_user}
              </Button>
            </div>
          </div>

          {/* Extra info */}
          <div className="text-[10px] text-muted-foreground border-t pt-2 flex gap-3 flex-wrap">
            <span>ID: {mem.id?.slice(0, 8)}…</span>
            <span>Joined: {mem.created_at ? format(new Date(mem.created_at), 'MMM d, yyyy') : '—'}</span>
            {mem.last_login_at && <span>Last Login: {format(new Date(mem.last_login_at), 'MMM d, yyyy HH:mm')}</span>}
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Audit Log Tab ────────────────────────────────────────────────────────────
function AuditLogTab({ restaurantId, u }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('permission_audit_log')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (!error) setLogs(data || []);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => { if (restaurantId) loadLogs(); }, [restaurantId, loadLogs]);

  const filtered = useMemo(() => {
    let list = logs;
    if (filter === 'role') list = list.filter(l => l.action === 'role_change');
    else if (filter === 'perm') list = list.filter(l => l.action === 'permission_change');
    else if (filter === 'status') list = list.filter(l => l.action === 'status_change');
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(l =>
        (l.target_email || '').toLowerCase().includes(q) ||
        (l.target_name || '').toLowerCase().includes(q) ||
        (l.owner_email || '').toLowerCase().includes(q) ||
        (l.action || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [logs, filter, search]);

  const ACTION_LABELS = {
    role_change: 'Role Change',
    permission_change: 'Permission Change',
    status_change: 'Status Change',
    transfer: 'Transfer',
    duplicate: 'Permissions Duplicated',
    reset_password: 'Password Reset',
    remove_user: 'User Removed',
  };

  const ACTION_COLORS = {
    role_change: 'bg-blue-100 text-blue-700',
    permission_change: 'bg-purple-100 text-purple-700',
    status_change: 'bg-amber-100 text-amber-700',
    transfer: 'bg-sky-100 text-sky-700',
    duplicate: 'bg-indigo-100 text-indigo-700',
    reset_password: 'bg-orange-100 text-orange-700',
    remove_user: 'bg-red-100 text-red-700',
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input className="pl-8 h-8 text-xs" placeholder={u.search_users} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="h-8 text-xs w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">{u.filter_all}</SelectItem>
            <SelectItem value="role" className="text-xs">{u.filter_role}</SelectItem>
            <SelectItem value="perm" className="text-xs">{u.filter_perm}</SelectItem>
            <SelectItem value="status" className="text-xs">{u.filter_status}</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={loadLogs}>
          <RefreshCw className="w-3 h-3 mr-1" />Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center border-dashed">
          <History className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-40" />
          <p className="text-sm text-muted-foreground">{u.no_audit}</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(log => (
            <Card key={log.id} className="p-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${ACTION_COLORS[log.action] || 'bg-slate-100 text-slate-700'}`}>
                      {ACTION_LABELS[log.action] || log.action}
                    </span>
                    <span className="text-xs font-medium truncate">{log.target_name || log.target_email || '—'}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                    {log.old_role && log.new_role && log.old_role !== log.new_role && (
                      <span><RoleBadge role={log.old_role} /> → <RoleBadge role={log.new_role} /></span>
                    )}
                    {log.permission_key && (
                      <span>Permission: <b>{log.permission_key}</b> {log.old_value ? '✓' : '✗'} → {log.new_value ? '✓' : '✗'}</span>
                    )}
                    {log.notes && <span className="italic">{log.notes}</span>}
                    <span>By: {log.owner_email || '—'}</span>
                    <span>{log.created_at ? format(new Date(log.created_at), 'MMM d, yyyy HH:mm') : '—'}</span>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function BranchManagement() {
  const { lang, currency } = useLanguage();
  const u = UI[lang] || UI.en;
  const { role } = useRole();
  const { allBranches, updateRestaurantBranches, ownerFilter, activeRestaurantId } = useTenant();
  const { withinLimit, usage, limits, planName } = useSubscription();

  // Branch form state
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);

  // User management state
  const [userSearch, setUserSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');

  // Quick action modals
  const [quickAction, setQuickAction] = useState(null); // { type, mem }
  const [transferBranchId, setTransferBranchId] = useState('');
  const [duplicateFromId, setDuplicateFromId] = useState('');
  const [actionSaving, setActionSaving] = useState(false);

  const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');

  // ── Data fetching ──────────────────────────────────────────────────────────
  // Branch Management is Owner-only. Scope analytics by restaurant instead of the
  // Owner's email so branch-created records participate in the comparison.
  const analyticsFilter = activeRestaurantId
    ? { restaurant_id: activeRestaurantId }
    : (ownerFilter || {});
  const analyticsEnabled = !!(activeRestaurantId || ownerFilter?.created_by || ownerFilter?.branch);
  const { data: sales = [] } = useQuery({
    queryKey: ['bm_sales', analyticsFilter],
    queryFn: () => base44.entities.DailySales.filter(analyticsFilter, '-date', 1000),
    staleTime: 120000,
    enabled: analyticsEnabled,
  });
  const { data: expenses = [] } = useQuery({
    queryKey: ['bm_expenses', analyticsFilter],
    queryFn: () => base44.entities.Expense.filter(analyticsFilter, '-date', 500),
    staleTime: 120000,
    enabled: analyticsEnabled,
  });
  const { data: purchases = [] } = useQuery({
    queryKey: ['bm_purchases', activeRestaurantId],
    queryFn: async () => {
      if (!activeRestaurantId) return [];
      const { data, error } = await supabase
        .from('supplier_invoices')
        .select('id, branch, date, total_amount, status')
        .eq('restaurant_id', activeRestaurantId)
        .in('status', ['approved', 'partial', 'paid'])
        .order('date', { ascending: false })
        .limit(500);
      return error ? [] : (data || []);
    },
    staleTime: 120000,
    enabled: !!activeRestaurantId,
  });
  const { data: employees = [] } = useQuery({
    queryKey: ['bm_employees', analyticsFilter],
    queryFn: () => base44.entities.Employee.filter(analyticsFilter, 'full_name', 200),
    staleTime: 120000,
    enabled: analyticsEnabled,
  });

  // Fetch all users (erp_memberships) for this restaurant
  const { data: memberships = [], refetch: refetchMembers } = useQuery({
    queryKey: ['bm_memberships', activeRestaurantId],
    queryFn: async () => {
      if (!activeRestaurantId) return [];
      const { data, error } = await supabase
        .from('erp_memberships')
        .select('*')
        .eq('restaurant_id', activeRestaurantId)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) { console.error('[BM] memberships load error', error); return []; }
      return data || [];
    },
    enabled: !!activeRestaurantId,
    staleTime: 30000,
  });

  // Fetch branches from DB (with UUIDs)
  const { data: dbBranches = [] } = useQuery({
    queryKey: ['bm_db_branches', activeRestaurantId],
    queryFn: async () => {
      if (!activeRestaurantId) return [];
      const { data } = await supabase
        .from('branches')
        .select('id, name, location, is_active')
        .eq('restaurant_id', activeRestaurantId)
        .order('name');
      return data || [];
    },
    enabled: !!activeRestaurantId,
    staleTime: 60000,
  });

  // ── Computed stats ─────────────────────────────────────────────────────────
  const recentSales = sales.filter(s => s.date >= thirtyDaysAgo);
  const recentExpenses = expenses.filter(e => e.date >= thirtyDaysAgo);
  const recentPurchases = purchases.filter(p => p.date >= thirtyDaysAgo);

  const branchStats = useMemo(() => {
    return allBranches.map(b => {
      const bSales = recentSales.filter(s => s.branch === b.key);
      const bExpenses = recentExpenses.filter(e => e.branch === b.key || e.branch === 'all');
      const bPurchases = recentPurchases.filter(p => p.branch === b.key);
      const bEmployees = employees.filter(e => e.branch === b.key);
      const totalSales = bSales.reduce((sum, sale) => {
        const explicitTotal = Number(sale.total);
        return sum + (Number.isFinite(explicitTotal)
          ? explicitTotal
          : (Number(sale.cash) || 0) + (Number(sale.network) || 0) + (Number(sale.credit) || 0));
      }, 0);
      const totalExpenses = bExpenses.reduce((s, e) => s + (e.amount || 0), 0);
      const totalPurchases = bPurchases.reduce((sum, purchase) => sum + (Number(purchase.total_amount) || 0), 0);
      return { ...b, totalSales, totalExpenses, totalPurchases, employeeCount: bEmployees.length };
    });
  }, [allBranches, recentSales, recentExpenses, recentPurchases, employees]);

  const compareData = branchStats.map(b => ({
    name: b.label,
    [u.sales]: Math.round(b.totalSales),
    [u.expenses]: Math.round(b.totalExpenses),
    [u.purchases]: Math.round(b.totalPurchases),
  }));
  const topBranch = branchStats.length > 0 ? [...branchStats].sort((a, b) => b.totalSales - a.totalSales)[0] : null;

  // ── Filtered members ───────────────────────────────────────────────────────
  const filteredMembers = useMemo(() => {
    let list = memberships;
    if (branchFilter !== 'all') list = list.filter(m => m.branch_id === branchFilter);
    if (roleFilter !== 'all') list = list.filter(m => m.role === roleFilter);
    if (userSearch) {
      const q = userSearch.toLowerCase();
      list = list.filter(m =>
        (m.full_name || '').toLowerCase().includes(q) ||
        (m.email || '').toLowerCase().includes(q) ||
        (m.phone || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [memberships, branchFilter, roleFilter, userSearch]);

  // ── Branch CRUD ────────────────────────────────────────────────────────────
  const handleSaveBranch = async (form) => {
    setSaving(true);
    try {
      const key = form.key || form.label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      if (editing) {
        const updated = allBranches.map(b => b.key === editing.key ? { ...b, ...form, key: b.key } : b);
        await updateRestaurantBranches(updated);
        toast.success(u.edit_branch);
      } else {
        if (allBranches.find(b => b.key === key)) { toast.error('Branch key already exists.'); return; }
        if (Number(limits?.branches || 0) > 0 && !withinLimit('branches')) {
          toast.error(subscriptionLimitMessage({
            resource: 'branches',
            used: usage?.branches,
            limit: limits?.branches,
            planName,
          }));
          return;
        }
        await updateRestaurantBranches([...allBranches, { ...form, key }]);
        toast.success(u.add_branch);
      }
      setShowForm(false); setEditing(null);
    } catch (error) {
      toast.error(subscriptionLimitErrorMessage(error, 'Unable to save branch.'));
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    try {
      await updateRestaurantBranches(allBranches.filter(b => b.key !== deleting.key));
      setDeleting(null); toast.success(u.delete_branch);
    } catch (error) {
      toast.error(error.message || 'Unable to delete branch.');
    } finally { setSaving(false); }
  };

  const handleToggle = async (branchKey) => {
    try {
      await updateRestaurantBranches(allBranches.map(b => b.key === branchKey ? { ...b, is_active: !b.is_active } : b));
    } catch (error) {
      toast.error(error.message || 'Unable to update branch.');
    }
  };

  // ── Role change ────────────────────────────────────────────────────────────
  const handleRoleChange = useCallback(async (membershipId, newRole, oldRole) => {
    try {
      const { error } = await supabase.rpc('update_user_role_and_permissions', {
        p_membership_id: membershipId,
        p_new_role: newRole,
        p_action: 'role_change',
        p_notes: `Role changed from ${oldRole} to ${newRole}`,
      });
      if (error) throw error;
      toast.success(u.role_changed);
      refetchMembers();
    } catch (err) {
      toast.error(err.message || 'Failed to change role.');
    }
  }, [u, refetchMembers]);

  // ── Permission change ──────────────────────────────────────────────────────
  const handlePermChange = useCallback(async (membershipId, newPerms, key, oldVal, newVal) => {
    try {
      const { error } = await supabase.rpc('update_user_role_and_permissions', {
        p_membership_id: membershipId,
        p_permissions: newPerms,
        p_action: 'permission_change',
        p_notes: `Permission '${key}' changed from ${oldVal} to ${newVal}`,
      });
      if (error) throw error;
      toast.success(u.permissions_saved);
      refetchMembers();
    } catch (err) {
      toast.error(err.message || 'Failed to save permissions.');
    }
  }, [u, refetchMembers]);

  // ── Scope change ───────────────────────────────────────────────────────────
  const handleScopeChange = useCallback(async (membershipId, scope, selectedBranches) => {
    try {
      const { error } = await supabase.rpc('update_user_role_and_permissions', {
        p_membership_id: membershipId,
        p_data_scope: scope,
        p_selected_branches: selectedBranches || null,
        p_action: 'permission_change',
        p_notes: `Data scope changed to ${scope}`,
      });
      if (error) throw error;
      toast.success(u.scope_changed);
      refetchMembers();
    } catch (err) {
      toast.error(err.message || 'Failed to update scope.');
    }
  }, [u, refetchMembers]);

  // ── Quick actions ──────────────────────────────────────────────────────────
  const handleQuickAction = useCallback((type, mem) => {
    setQuickAction({ type, mem });
    setTransferBranchId('');
    setDuplicateFromId('');
  }, []);

  const executeQuickAction = async () => {
    if (!quickAction) return;
    const { type, mem } = quickAction;
    setActionSaving(true);
    try {
      if (type === 'activate') {
        const { error } = await supabase.rpc('toggle_user_status', { p_membership_id: mem.id, p_status: 'approved' });
        if (error) throw error;
        toast.success(u.user_activated);
      } else if (type === 'deactivate') {
        const { error } = await supabase.rpc('toggle_user_status', { p_membership_id: mem.id, p_status: 'suspended' });
        if (error) throw error;
        toast.success(u.user_deactivated);
      } else if (type === 'transfer') {
        if (!transferBranchId) { toast.error('Please select a branch.'); return; }
        const { error } = await supabase.rpc('transfer_user_branch', { p_membership_id: mem.id, p_new_branch_id: transferBranchId });
        if (error) throw error;
        toast.success(u.user_transferred);
      } else if (type === 'duplicate') {
        if (!duplicateFromId) { toast.error('Please select a source user.'); return; }
        const src = memberships.find(m => m.id === duplicateFromId);
        if (!src) { toast.error('Source user not found.'); return; }
        const { error } = await supabase.rpc('update_user_role_and_permissions', {
          p_membership_id: mem.id,
          p_permissions: src.permissions,
          p_action: 'duplicate',
          p_notes: `Permissions duplicated from ${src.email}`,
        });
        if (error) throw error;
        toast.success(u.perms_duplicated);
      } else if (type === 'remove') {
        const { error } = await supabase.rpc('remove_user_from_org', { p_membership_id: mem.id });
        if (error) throw error;
        toast.success(u.user_removed);
      } else if (type === 'reset_password') {
        const { error } = await supabase.auth.resetPasswordForEmail(mem.email, {
          redirectTo: `${window.location.origin}/erp-login`,
        });
        if (error) throw error;
        toast.success(`Password reset email sent to ${mem.email}`);
      }
      setQuickAction(null);
      refetchMembers();
    } catch (err) {
      toast.error(err.message || 'Action failed.');
    } finally { setActionSaving(false); }
  };

  // ── Owner guard ────────────────────────────────────────────────────────────
  if (role !== 'owner') {
    return <div className="p-8 text-center text-muted-foreground">{u.owner_only}</div>;
  }

  return (
    <div>
      <PageHeader
        title={u.title}
        action={
          <Button size="sm" onClick={() => { setEditing(null); setShowForm(true); }}>
            <Plus className="w-4 h-4 mr-1" /> {u.add_branch}
          </Button>
        }
      />
      <p className="text-xs text-muted-foreground mb-4">{u.subtitle}</p>

      <Tabs defaultValue="overview">
        <div className="mb-4 overflow-x-auto pb-1" aria-label="Branch Management sections">
          <TabsList className="inline-flex h-9 min-w-full w-max gap-0.5">
            <TabsTrigger value="overview" className="min-w-[80px] text-xs"><GitBranch className="w-3 h-3 mr-1" />{u.overview}</TabsTrigger>
            <TabsTrigger value="analytics" className="min-w-[80px] text-xs"><BarChart3 className="w-3 h-3 mr-1" />{u.analytics}</TabsTrigger>
            <TabsTrigger value="compare" className="min-w-[80px] text-xs"><TrendingUp className="w-3 h-3 mr-1" />{u.compare}</TabsTrigger>
            <TabsTrigger value="users" className="min-w-[80px] text-xs"><Shield className="w-3 h-3 mr-1" />{u.users}</TabsTrigger>
            <TabsTrigger value="audit" className="min-w-[80px] text-xs"><History className="w-3 h-3 mr-1" />{u.audit}</TabsTrigger>
          </TabsList>
        </div>

        {/* ── OVERVIEW TAB ── */}
        <TabsContent value="overview">
          {branchStats.length > 0 && (
            <div className="grid grid-cols-2 gap-2 mb-4">
              <Card className="p-3 text-center">
                <p className="text-xs text-muted-foreground">{u.all_branches}</p>
                <p className="text-2xl font-black text-primary">{branchStats.length}</p>
              </Card>
              <Card className="p-3 text-center">
                <p className="text-xs text-muted-foreground">{u.top_branch}</p>
                <p className="text-sm font-bold truncate">{topBranch?.label || '—'}</p>
              </Card>
              <Card className="p-3 text-center col-span-2">
                <p className="text-xs text-muted-foreground">{u.total_sales_30}</p>
                <p className="text-xl font-black text-emerald-600">
                  {formatCurrency(branchStats.reduce((s, b) => s + b.totalSales, 0), currency)}
                </p>
              </Card>
            </div>
          )}
          {allBranches.length === 0 ? (
            <Card className="p-8 text-center border-dashed">
              <Building2 className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-40" />
              <p className="text-sm text-muted-foreground">{u.no_branches}</p>
              <Button size="sm" className="mt-3" onClick={() => setShowForm(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> {u.add_branch}
              </Button>
            </Card>
          ) : (
            <div className="space-y-3">
              {branchStats.map(b => {
                const stats = branchStats.find(s => s.key === b.key) || b;
                return (
                  <Card key={b.key} className={`p-4 ${b.is_active === false ? 'opacity-60' : ''}`}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                          <GitBranch className="w-4 h-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="font-semibold text-sm truncate">{b.label}</p>
                            <Badge className={`text-[10px] shrink-0 ${b.is_active !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                              {b.is_active !== false ? u.active : u.inactive}
                            </Badge>
                          </div>
                          {b.address && <p className="text-xs text-muted-foreground flex items-center gap-1 truncate"><MapPin className="w-2.5 h-2.5 shrink-0" />{b.address}</p>}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing(b); setShowForm(true); }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleting(b)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 mb-3">
                      <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-lg p-2 text-center">
                        <p className="text-[10px] text-muted-foreground">{u.sales}</p>
                        <p className="text-xs font-bold text-emerald-700">{formatCurrency(stats.totalSales, currency)}</p>
                      </div>
                      <div className="bg-red-50 dark:bg-red-950/20 rounded-lg p-2 text-center">
                        <p className="text-[10px] text-muted-foreground">{u.expenses}</p>
                        <p className="text-xs font-bold text-red-600">{formatCurrency(stats.totalExpenses, currency)}</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-2 text-center">
                        <p className="text-[10px] text-muted-foreground">{u.employees}</p>
                        <p className="text-xs font-bold">{stats.employeeCount}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {b.manager_email ? (
                          <>
                            <UserCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <p className="text-xs font-medium truncate">{b.manager_name || b.manager_email}</p>
                          </>
                        ) : (
                          <>
                            <UserX className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <p className="text-xs text-muted-foreground">{u.no_manager}</p>
                          </>
                        )}
                      </div>
                      <Switch checked={b.is_active !== false} onCheckedChange={() => handleToggle(b.key)} />
                    </div>
                    {(b.phone || b.working_hours) && (
                      <div className="flex gap-3 mt-2 text-[10px] text-muted-foreground">
                        {b.phone && <span className="flex items-center gap-0.5"><Phone className="w-2.5 h-2.5" /> {b.phone}</span>}
                        {b.working_hours && <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" /> {b.working_hours}</span>}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── ANALYTICS TAB ── */}
        <TabsContent value="analytics">
          <div className="space-y-3">
            {branchStats.length === 0 ? (
              <Card className="p-8 text-center border-dashed">
                <BarChart3 className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-40" />
                <p className="text-sm text-muted-foreground">{u.no_branches}</p>
              </Card>
            ) : branchStats.map(b => {
              const profit = b.totalSales - b.totalExpenses - b.totalPurchases;
              return (
                <Card key={b.key} className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <GitBranch className="w-4 h-4 text-primary" />
                    <p className="font-semibold text-sm">{b.label}</p>
                    <Badge className={`text-[10px] ${b.is_active !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                      {b.is_active !== false ? u.active : u.inactive}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-muted/40 rounded-lg p-2">
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1"><DollarSign className="w-2.5 h-2.5" />{u.sales}</p>
                      <p className="text-sm font-bold text-emerald-600">{formatCurrency(b.totalSales, currency)}</p>
                    </div>
                    <div className="bg-muted/40 rounded-lg p-2">
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Receipt className="w-2.5 h-2.5" />{u.expenses}</p>
                      <p className="text-sm font-bold text-red-500">{formatCurrency(b.totalExpenses, currency)}</p>
                    </div>
                    <div className="bg-muted/40 rounded-lg p-2">
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1"><ShoppingCart className="w-2.5 h-2.5" />{u.purchases}</p>
                      <p className="text-sm font-bold text-amber-600">{formatCurrency(b.totalPurchases, currency)}</p>
                    </div>
                    <div className={`rounded-lg p-2 ${profit >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/20' : 'bg-red-50 dark:bg-red-950/20'}`}>
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        {profit >= 0 ? <TrendingUp className="w-2.5 h-2.5 text-emerald-600" /> : <AlertTriangle className="w-2.5 h-2.5 text-red-500" />}
                        Profit
                      </p>
                      <p className={`text-sm font-bold ${profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatCurrency(profit, currency)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    <Users className="w-3 h-3" />
                    <span>{b.employeeCount} {u.employees}</span>
                    {b.manager_email && (
                      <>
                        <span className="text-muted-foreground/40">·</span>
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                        <span className="truncate">{b.manager_name || b.manager_email}</span>
                      </>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ── COMPARE TAB ── */}
        <TabsContent value="compare">
          {compareData.length === 0 ? (
            <Card className="p-8 text-center border-dashed">
              <TrendingUp className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-40" />
              <p className="text-sm text-muted-foreground">{u.no_branches}</p>
            </Card>
          ) : (
            <div className="space-y-4">
              <Card className="p-4">
                <p className="text-xs font-semibold mb-3">{u.performance}</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={compareData} margin={{ left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `${currency}${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={v => formatCurrency(v, currency)} />
                    <Bar dataKey={u.sales} fill="#10b981" radius={[2, 2, 0, 0]} />
                    <Bar dataKey={u.expenses} fill="#ef4444" radius={[2, 2, 0, 0]} />
                    <Bar dataKey={u.purchases} fill="#f59e0b" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
              <Card className="p-4">
                <p className="text-xs font-semibold mb-3">Branch Ranking by Sales</p>
                <div className="space-y-2">
                  {[...branchStats].sort((a, b) => b.totalSales - a.totalSales).map((b, i) => {
                    const total = branchStats.reduce((s, x) => s + x.totalSales, 0);
                    const pct = total > 0 ? (b.totalSales / total * 100) : 0;
                    return (
                      <div key={b.key} className="flex items-center gap-2">
                        <span className="text-xs font-bold text-muted-foreground w-4">#{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between text-xs mb-0.5">
                            <span className="font-medium truncate">{b.label}</span>
                            <span className="text-muted-foreground shrink-0 ml-1">{formatCurrency(b.totalSales, currency)}</span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-1.5">
                            <div className="h-1.5 rounded-full bg-primary" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ── USERS & ROLES TAB ── */}
        <TabsContent value="users">
          <div className="space-y-3">
            {/* KPIs */}
            <div className="grid grid-cols-3 gap-2">
              <Card className="p-2 text-center">
                <p className="text-[10px] text-muted-foreground">Total Users</p>
                <p className="text-lg font-black text-primary">{memberships.length}</p>
              </Card>
              <Card className="p-2 text-center">
                <p className="text-[10px] text-muted-foreground">Active</p>
                <p className="text-lg font-black text-emerald-600">{memberships.filter(m => m.status === 'approved').length}</p>
              </Card>
              <Card className="p-2 text-center">
                <p className="text-[10px] text-muted-foreground">Suspended</p>
                <p className="text-lg font-black text-amber-600">{memberships.filter(m => m.status === 'suspended').length}</p>
              </Card>
            </div>

            {/* Filters */}
            <div className="flex gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[140px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input className="pl-8 h-8 text-xs" placeholder={u.search_users} value={userSearch} onChange={e => setUserSearch(e.target.value)} />
              </div>
              <Select value={branchFilter} onValueChange={setBranchFilter}>
                <SelectTrigger className="h-8 text-xs w-[130px]">
                  <SelectValue placeholder="Branch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All Branches</SelectItem>
                  {dbBranches.map(b => (
                    <SelectItem key={b.id} value={b.id} className="text-xs">{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="h-8 text-xs w-[120px]">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All Roles</SelectItem>
                  {ALL_ROLES.map(r => (
                    <SelectItem key={r.value} value={r.value} className="text-xs">{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* User list */}
            {filteredMembers.length === 0 ? (
              <Card className="p-8 text-center border-dashed">
                <Users className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-40" />
                <p className="text-sm text-muted-foreground">{u.no_users}</p>
              </Card>
            ) : (
              <div className="space-y-2">
                {filteredMembers.map(mem => (
                  <UserRow
                    key={mem.id}
                    mem={mem}
                    branches={dbBranches}
                    onRoleChange={handleRoleChange}
                    onPermChange={handlePermChange}
                    onScopeChange={handleScopeChange}
                    onQuickAction={handleQuickAction}
                    u={u}
                  />
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── AUDIT LOG TAB ── */}
        <TabsContent value="audit">
          <AuditLogTab restaurantId={activeRestaurantId} u={u} />
        </TabsContent>
      </Tabs>

      {/* ── Add/Edit Branch Dialog ── */}
      <Dialog open={showForm} onOpenChange={v => { if (!v) { setShowForm(false); setEditing(null); } }}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? u.edit_branch : u.add_branch}</DialogTitle>
          </DialogHeader>
          <BranchForm
            initial={editing}
            u={u}
            saving={saving}
            onSubmit={handleSaveBranch}
            onCancel={() => { setShowForm(false); setEditing(null); }}
          />
        </DialogContent>
      </Dialog>

      {/* ── Delete Branch Confirm ── */}
      <AlertDialog open={!!deleting} onOpenChange={v => { if (!v) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{u.delete_branch}: {deleting?.label}?</AlertDialogTitle>
            <AlertDialogDescription>{u.delete_confirm}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{u.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={saving}>{u.delete_branch}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Quick Action Modals ── */}
      {quickAction && (
        <AlertDialog open onOpenChange={v => { if (!v) setQuickAction(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                {quickAction.type === 'remove' && <UserMinus className="w-4 h-4 text-destructive" />}
                {quickAction.type === 'deactivate' && <ShieldOff className="w-4 h-4 text-amber-600" />}
                {quickAction.type === 'activate' && <ShieldCheck className="w-4 h-4 text-emerald-600" />}
                {quickAction.type === 'transfer' && <ArrowRightLeft className="w-4 h-4 text-primary" />}
                {quickAction.type === 'duplicate' && <Copy className="w-4 h-4 text-primary" />}
                {quickAction.type === 'reset_password' && <Key className="w-4 h-4 text-primary" />}
                {quickAction.type === 'remove' ? u.remove_user :
                 quickAction.type === 'deactivate' ? u.deactivate :
                 quickAction.type === 'activate' ? u.activate :
                 quickAction.type === 'transfer' ? u.transfer :
                 quickAction.type === 'duplicate' ? u.duplicate_perms :
                 u.reset_password}
              </AlertDialogTitle>
              <AlertDialogDescription>
                <span className="font-medium">{quickAction.mem.full_name || quickAction.mem.email}</span>
                {' — '}
                {quickAction.type === 'remove' ? u.confirm_remove :
                 quickAction.type === 'deactivate' ? u.confirm_deactivate :
                 quickAction.type === 'activate' ? u.confirm_activate :
                 quickAction.type === 'transfer' ? 'Select the destination branch:' :
                 quickAction.type === 'duplicate' ? 'Select the user to copy permissions from:' :
                 `A password reset email will be sent to ${quickAction.mem.email}.`}
              </AlertDialogDescription>
            </AlertDialogHeader>

            {quickAction.type === 'transfer' && (
              <div className="px-1 pb-2">
                <Select value={transferBranchId} onValueChange={setTransferBranchId}>
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder={u.select_branch} />
                  </SelectTrigger>
                  <SelectContent>
                    {dbBranches.map(b => (
                      <SelectItem key={b.id} value={b.id} className="text-xs">{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {quickAction.type === 'duplicate' && (
              <div className="px-1 pb-2">
                <Select value={duplicateFromId} onValueChange={setDuplicateFromId}>
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder={u.select_user} />
                  </SelectTrigger>
                  <SelectContent>
                    {memberships.filter(m => m.id !== quickAction.mem.id).map(m => (
                      <SelectItem key={m.id} value={m.id} className="text-xs">
                        {m.full_name || m.email} ({ROLE_MAP[m.role]?.label || m.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <AlertDialogFooter>
              <AlertDialogCancel disabled={actionSaving}>{u.cancel}</AlertDialogCancel>
              <AlertDialogAction
                onClick={executeQuickAction}
                disabled={actionSaving}
                className={quickAction.type === 'remove' ? 'bg-destructive hover:bg-destructive/90' : ''}
              >
                {actionSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                {quickAction.type === 'remove' ? u.remove_user :
                 quickAction.type === 'deactivate' ? u.deactivate :
                 quickAction.type === 'activate' ? u.activate :
                 quickAction.type === 'transfer' ? u.transfer :
                 quickAction.type === 'duplicate' ? u.duplicate_perms :
                 u.reset_password}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
