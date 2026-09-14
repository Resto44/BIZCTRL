/**
 * CashRegisterCenter.jsx — Redesigned Cash Register Module
 *
 * This is the financial center of the ERP.
 * It automatically reflects every cash transaction across the system.
 *
 * Features:
 * - Dashboard: Today's opening, closing, shortage, overage, injections
 * - Daily Settlement: Mobile-first with large numeric keypad
 * - Shortage Management: Owner approval workflow
 * - Owner Cash Injection: Direct cash injection with treasury posting
 * - Reports: Daily, Monthly, Movement, Shortage, Injection, Branch Comparison
 * - Audit Log: Every cash movement tracked with source module + record ID
 */
import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { isRestaurantPOSPortal } from '@/lib/productImportAccess';
import { useWorkspaceCustomization } from '@/lib/WorkspaceCustomizationContext';
import { isWorkspacePathEnabled } from '@/lib/workspaceCustomization';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { useAuth } from '@/lib/AuthContext';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  Wallet, LayoutDashboard, ClipboardList, AlertTriangle,
  Banknote, BarChart3, Plus, RefreshCw
} from 'lucide-react';
import { format } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

import CashRegisterDashboard from '@/components/cashregister/CashRegisterDashboard';
import DailyCashSettlementForm from '@/components/cashregister/DailyCashSettlementForm';
import CashShortageManager from '@/components/cashregister/CashShortageManager';
import OwnerCashInjectionForm from '@/components/cashregister/OwnerCashInjectionForm';
import CashRegisterReports from '@/components/cashregister/CashRegisterReports';

export default function CashRegisterCenter() {
  const { currency, t } = useLanguage();
  const { branches, activeRestaurantId, activeRestaurant } = useTenant();
  const { configuration } = useWorkspaceCustomization();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [tab, setTab] = useState('dashboard');
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [showInjectionForm, setShowInjectionForm] = useState(false);
  const today = format(new Date(), 'yyyy-MM-dd');

  const isOwner = user?.role === 'owner';
  const isManager = user?.role === 'manager';
  const effectiveBranch = isManager ? (user?.branch || selectedBranch) : selectedBranch;

  const { data: pendingShortages = [] } = useQuery({
    queryKey: ['cash_shortages_pending_count', user?.email],
    queryFn: () => base44.entities.CashShortage.filter({
      created_by: user?.email,
      status: 'Pending',
    }, '-date', 50),
    enabled: !!user?.email,
    staleTime: 60000,
  });

  const pendingCount = pendingShortages.length;

  const settlementBranches = useMemo(() => {
    if (isManager && user?.branch) return [{ key: user.branch, label: user.branch }];
    if (selectedBranch !== 'all') return [{ key: selectedBranch, label: selectedBranch }];
    return branches;
  }, [branches, isManager, user?.branch, selectedBranch]);

  return (
    <div className="space-y-4 pb-24">
      {isRestaurantPOSPortal(activeRestaurant) && isWorkspacePathEnabled(configuration, '/restaurant/pos') && (
        <Link to="/restaurant/pos" className="flex min-h-14 items-center justify-between rounded-2xl bg-blue-600 px-5 py-4 font-bold text-white shadow-sm hover:bg-blue-700">
          <span>{t('restaurant_pos')}</span><span aria-hidden="true">←</span>
        </Link>
      )}
      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">Cash Register</h1>
            <p className="text-xs text-muted-foreground">{format(new Date(), 'EEEE, MMMM d')}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {isOwner && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5 border-green-200 text-green-700 hover:bg-green-50"
              onClick={() => setShowInjectionForm(!showInjectionForm)}
            >
              <Banknote className="w-3.5 h-3.5" />
              Inject
            </Button>
          )}
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => qc.invalidateQueries()}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Quick Injection Form */}
      {showInjectionForm && (
        <OwnerCashInjectionForm
          defaultBranch={selectedBranch !== 'all' ? selectedBranch : (branches[0]?.key || '')}
          onSuccess={() => {
            setShowInjectionForm(false);
            qc.invalidateQueries({ queryKey: ['daily_cash_settlements'] });
          }}
          onCancel={() => setShowInjectionForm(false)}
        />
      )}

      {/* Branch Selector (Owner only) */}
      {isOwner && (
        <Select value={selectedBranch} onValueChange={setSelectedBranch}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="All Branches" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            {branches.map(b => (
              <SelectItem key={b.key} value={b.key}>{b.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Integration Notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
        <p className="text-xs text-blue-700">
          <span className="font-semibold">Auto-Sync Active.</span>{' '}
          Cash movements from Sales, Purchases, Expenses, and Payments are automatically posted here. No manual entry required.
        </p>
      </div>

      {/* Main Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full grid grid-cols-5 h-9">
          <TabsTrigger value="dashboard" className="text-[10px] px-1">
            <LayoutDashboard className="w-3 h-3 mr-0.5" />
            <span className="hidden sm:inline">Dashboard</span>
          </TabsTrigger>
          <TabsTrigger value="settlement" className="text-[10px] px-1">
            <ClipboardList className="w-3 h-3 mr-0.5" />
            <span className="hidden sm:inline">Settle</span>
          </TabsTrigger>
          <TabsTrigger value="shortages" className="text-[10px] px-1 relative">
            <AlertTriangle className="w-3 h-3 mr-0.5" />
            <span className="hidden sm:inline">Shortages</span>
            {pendingCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] rounded-full flex items-center justify-center font-bold">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="injection" className="text-[10px] px-1">
            <Banknote className="w-3 h-3 mr-0.5" />
            <span className="hidden sm:inline">Inject</span>
          </TabsTrigger>
          <TabsTrigger value="reports" className="text-[10px] px-1">
            <BarChart3 className="w-3 h-3 mr-0.5" />
            <span className="hidden sm:inline">Reports</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-3">
          <CashRegisterDashboard selectedBranch={effectiveBranch} />
        </TabsContent>

        <TabsContent value="settlement" className="mt-3 space-y-4">
          {settlementBranches.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ClipboardList className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
              <p className="text-sm">No branches configured.</p>
            </div>
          ) : (
            settlementBranches.map(b => (
              <DailyCashSettlementForm
                key={b.key}
                branch={b.key}
                date={today}
                onSettlementChange={() => qc.invalidateQueries({ queryKey: ['daily_cash_settlements'] })}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="shortages" className="mt-3">
          <CashShortageManager branch={effectiveBranch} />
        </TabsContent>

        <TabsContent value="injection" className="mt-3">
          <OwnerInjectionHistory branch={effectiveBranch} user={user} currency={currency} />
        </TabsContent>

        <TabsContent value="reports" className="mt-3">
          <CashRegisterReports selectedBranch={effectiveBranch} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OwnerInjectionHistory({ branch, user, currency }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const { branches } = useTenant();
  const fmt = (n) => `${currency}${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  const { data: injections = [], isLoading } = useQuery({
    queryKey: ['owner_cash_injections_all', user?.email, branch],
    queryFn: () => base44.entities.OwnerCashInjection.filter({
      created_by: user?.email,
      ...(branch !== 'all' ? { branch } : {}),
    }, '-date', 200),
    enabled: !!user?.email,
    staleTime: 30000,
  });

  const total = injections.reduce((s, r) => s + Number(r.amount || 0), 0);

  return (
    <div className="space-y-3">
      <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-green-700 font-medium">Total Owner Injections</p>
            <p className="text-xl font-bold text-green-700">{fmt(total)}</p>
            <p className="text-xs text-green-600">{injections.length} transactions</p>
          </div>
          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-700 text-xs h-9"
            onClick={() => setShowForm(!showForm)}
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            New Injection
          </Button>
        </div>
      </div>

      {showForm && (
        <OwnerCashInjectionForm
          defaultBranch={branch !== 'all' ? branch : (branches[0]?.key || '')}
          onSuccess={() => {
            setShowForm(false);
            qc.invalidateQueries({ queryKey: ['owner_cash_injections_all'] });
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <div className="w-5 h-5 border-2 border-muted border-t-primary rounded-full animate-spin" />
        </div>
      ) : injections.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Banknote className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
          <p className="text-sm">No cash injections yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {injections.map(inj => (
            <div key={inj.id} className="rounded-xl border border-border bg-card px-4 py-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-green-600">{fmt(inj.amount)}</p>
                  <p className="text-xs text-muted-foreground">{inj.branch} · {format(new Date(inj.date), 'MMM d, yyyy')}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{inj.reason}</p>
                  {inj.notes && <p className="text-xs text-muted-foreground italic mt-0.5">{inj.notes}</p>}
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  inj.approval_status === 'Approved' ? 'bg-emerald-100 text-emerald-700' :
                  inj.approval_status === 'Pending' ? 'bg-amber-100 text-amber-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {inj.approval_status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
