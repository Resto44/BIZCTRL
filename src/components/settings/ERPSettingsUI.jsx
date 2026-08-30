import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronLeft, ChevronRight, Store } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTenant } from '@/lib/TenantContext';
import { ALL_BRANCHES, useBranchScope } from '@/lib/BranchScopeContext';
import { cn } from '@/lib/utils';

export function SettingsPageFrame({ title, subtitle, badge, children, actions, backTo = '/settings' }) {
  return (
    <div className="mx-auto min-h-full w-full max-w-6xl px-3 pb-4 pt-3 sm:px-5 sm:pb-6 sm:pt-5 lg:px-8">
      <header className="mb-4 flex min-w-0 items-start gap-3 sm:mb-5">
        {backTo && (
          <Link
            to={backTo}
            aria-label="Back to settings"
            className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="break-words text-xl font-black tracking-tight text-slate-950 dark:text-white sm:text-2xl lg:text-3xl">{title}</h1>
            {badge}
          </div>
          {subtitle && <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-500 dark:text-slate-400 sm:text-base">{subtitle}</p>}
        </div>
      </header>
      {children}
      {actions && (
        <div className="sticky bottom-0 z-20 -mx-3 mt-5 border-t border-slate-200/80 bg-white/95 px-3 py-3 shadow-[0_-12px_30px_rgba(15,23,42,0.06)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:-mx-5 sm:px-5 lg:-mx-8 lg:px-8">
          <div className="mx-auto flex w-full max-w-6xl flex-col-reverse gap-2 sm:flex-row sm:justify-end">{actions}</div>
        </div>
      )}
    </div>
  );
}

export function SettingsScopeSelector({ className }) {
  const { restaurants, activeRestaurant, setActiveRestaurant, branches, isBranchScoped } = useTenant();
  const { selectedBranchId, setSelectedBranchId } = useBranchScope();
  const restaurantId = activeRestaurant?.id ? String(activeRestaurant.id) : '';

  return (
    <div className={cn('grid min-w-0 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-2', className)}>
      <div className="flex min-w-0 items-center gap-3 rounded-xl px-1">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300"><Store className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Store</p>
          <Select value={restaurantId} onValueChange={setActiveRestaurant} disabled={isBranchScoped || !restaurantId}>
            <SelectTrigger aria-label="Select store" className="h-7 w-full border-0 bg-transparent px-0 text-left text-sm font-bold text-slate-900 shadow-none focus:ring-0 dark:text-white">
              <SelectValue placeholder="Select store" />
            </SelectTrigger>
            <SelectContent>
              {(restaurants || []).map((restaurant) => <SelectItem key={restaurant.id} value={String(restaurant.id)}>{restaurant.name || 'Unnamed store'}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-3 rounded-xl bg-slate-50 px-3 py-1 dark:bg-slate-800/60">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Branch scope</p>
          <Select value={selectedBranchId || ALL_BRANCHES} onValueChange={setSelectedBranchId} disabled={isBranchScoped || !restaurantId}>
            <SelectTrigger aria-label="Select branch scope" className="h-7 w-full border-0 bg-transparent px-0 text-left text-sm font-bold text-slate-900 shadow-none focus:ring-0 dark:text-white">
              <SelectValue placeholder="Select branch" />
            </SelectTrigger>
            <SelectContent>
              {!isBranchScoped && <SelectItem value={ALL_BRANCHES}>All branches</SelectItem>}
              {(branches || []).map((branch) => <SelectItem key={branch.id} value={String(branch.id)}>{branch.name || branch.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

export function SettingsSection({ title, description, action, children, className }) {
  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex min-w-0 items-end justify-between gap-3 px-1">
        <div className="min-w-0">
          <h2 className="text-sm font-black text-slate-950 dark:text-white sm:text-base">{title}</h2>
          {description && <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function SettingsCard({ children, className }) {
  return <div className={cn('min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900', className)}>{children}</div>;
}

export function SettingRow({ icon: Icon, title, description, value, children, to, className }) {
  const body = (
    <div className={cn('flex min-w-0 items-center gap-3 px-4 py-3.5', className)}>
      {Icon && <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300"><Icon className="h-5 w-5" /></span>}
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-bold text-slate-900 dark:text-white">{title}</p>
        {description && <p className="mt-0.5 break-words text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>}
      </div>
      {value && <span className="max-w-[45%] shrink-0 break-words text-right text-sm font-bold text-slate-700 dark:text-slate-200">{value}</span>}
      {children}
      {to && <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 rtl:rotate-180" />}
    </div>
  );
  return to ? <Link to={to} className="block transition hover:bg-slate-50 dark:hover:bg-slate-800/70">{body}</Link> : body;
}

export function SavedBadge({ isDirty, isSaving }) {
  if (isSaving) return <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">Saving…</span>;
  if (isDirty) return <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">Unsaved changes</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" />All changes saved</span>;
}

export function SettingsSkeleton() {
  return <div className="space-y-4"><div className="h-16 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-800" /><div className="h-52 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-800" /><div className="h-40 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-800" /></div>;
}
