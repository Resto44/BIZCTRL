import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useTenant } from '@/lib/TenantContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  Users, Truck, Building2, TrendingUp, Wallet, FileText,
  ShieldCheck, LogOut, RefreshCw, Eye, Phone, Mail
} from 'lucide-react';
import { toast } from 'sonner';
import { format, subDays } from 'date-fns';

function StatCard({ label, value, sub, icon: Icon, color = 'text-white', bg = 'bg-slate-800' }) {
  return (
    <div className={`${bg} rounded-2xl p-4 border border-slate-700`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">{label}</p>
        {Icon && <Icon className={`w-5 h-5 ${color} opacity-70`} />}
      </div>
      <p className={`text-2xl font-black ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

function EmployeeRow({ emp }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
      <div className="w-10 h-10 rounded-full bg-violet-600/30 border border-violet-500/30 flex items-center justify-center shrink-0">
        <span className="text-sm font-bold text-violet-300">{(emp.full_name || '?')[0]}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{emp.full_name}</p>
        <p className="text-xs text-slate-400">{emp.position || 'Employee'} · {emp.branch}</p>
      </div>
      <div className="text-right shrink-0">
        <Badge className={`text-xs ${emp.is_active ? 'bg-emerald-900/60 text-emerald-300 border-emerald-700' : 'bg-red-900/60 text-red-300 border-red-700'}`}>
          {emp.is_active ? 'Active' : 'Inactive'}
        </Badge>
        {emp.joining_date && (
          <p className="text-xs text-slate-500 mt-1">{format(new Date(emp.joining_date), 'MMM yyyy')}</p>
        )}
      </div>
    </div>
  );
}

function DriverRow({ driver }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
      <div className="w-10 h-10 rounded-full bg-blue-600/30 border border-blue-500/30 flex items-center justify-center shrink-0">
        <Truck className="w-4 h-4 text-blue-300" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{driver.full_name}</p>
        <p className="text-xs text-slate-400">{driver.branch_name || 'Assigned branch'}</p>
      </div>
      <div className="text-right shrink-0">
        <Badge className={`text-xs ${driver.status === 'active' && driver.is_active !== false ? 'bg-emerald-900/60 text-emerald-300 border-emerald-700' : 'bg-amber-900/60 text-amber-300 border-amber-700'}`}>
          {driver.is_active === false ? 'inactive' : driver.status || 'active'}
        </Badge>
        {driver.phone && (
          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1 justify-end">
            <Phone className="w-3 h-3" />{driver.phone}
          </p>
        )}
      </div>
    </div>
  );
}

export default function SponsorDashboard() {
  const { user } = useAuth();
  const { restaurants, branches } = useTenant();
  const [tab, setTab] = useState('overview');

  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');

  const { data: employees = [], isLoading: loadingEmps } = useQuery({
    queryKey: ['sponsor-employees'],
    queryFn: () => base44.entities.Employee.list('-created_date', 200),
  });

  const { data: drivers = [], isLoading: loadingDrivers } = useQuery({
    queryKey: ['sponsor-drivers'],
    queryFn: () => base44.entities.Driver.list('full_name', 500),
  });

  const { data: sales = [], refetch: refetchSales } = useQuery({
    queryKey: ['sponsor-sales'],
    queryFn: () => base44.entities.DailySales.list('-date', 90),
  });

  const { data: settlements = [] } = useQuery({
    queryKey: ['sponsor-settlements'],
    queryFn: () => base44.entities.SettlementRecord.filter({ flow_type: 'MANAGER_TO_SPONSOR' }, '-date', 50),
  });

  const activeEmployees = employees.filter(e => e.is_active);
  const recentSales = sales.filter(s => s.date >= thirtyDaysAgo);
  const totalRevenue30d = recentSales.reduce((sum, s) => sum + (s.cash || 0) + (s.network || 0) + (s.credit || 0), 0);
  const pendingSettlements = settlements.filter(s => s.status === 'pending');

  const branchList = (() => {
    try {
      const r = restaurants[0];
      if (!r?.branches) return [];
      return typeof r.branches === 'string' ? JSON.parse(r.branches) : r.branches;
    } catch { return []; }
  })();

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-20">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700 px-4 py-3">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-base font-black">كفيل Dashboard</h1>
              <p className="text-xs text-slate-400">Sponsor View · Read-Only</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" className="text-slate-400 hover:text-white"
              onClick={() => { refetchSales(); toast.success('Refreshed'); }}>
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="ghost" className="text-slate-400 hover:text-white"
              onClick={() => base44.auth.logout('/')}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 max-w-5xl mx-auto space-y-4">

        {/* KPI Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Active Staff" value={activeEmployees.length} icon={Users} color="text-violet-300" bg="bg-violet-950/60" />
          <StatCard label="Drivers" value={drivers.length} icon={Truck} color="text-blue-300" bg="bg-blue-950/60" />
          <StatCard label="Branches" value={branchList.length} icon={Building2} color="text-emerald-300" bg="bg-emerald-950/60" />
          <StatCard
            label="Revenue (30d)"
            value={totalRevenue30d.toLocaleString()}
            sub="SAR — all branches"
            icon={TrendingUp}
            color="text-amber-300"
            bg="bg-amber-950/40"
          />
        </div>

        {/* Pending settlements alert */}
        {pendingSettlements.length > 0 && (
          <div className="bg-amber-900/40 border border-amber-600/50 rounded-2xl p-3 flex items-center gap-3">
            <Wallet className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <p className="text-sm font-bold text-amber-300">{pendingSettlements.length} Pending Settlement{pendingSettlements.length !== 1 ? 's' : ''}</p>
              <p className="text-xs text-amber-500">Awaiting your review in the Settlement tab</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full grid grid-cols-4 bg-slate-800 mb-2">
            <TabsTrigger value="overview" className="text-xs text-slate-300 data-[state=active]:bg-violet-600 data-[state=active]:text-white">
              Overview
            </TabsTrigger>
            <TabsTrigger value="employees" className="text-xs text-slate-300 data-[state=active]:bg-violet-600 data-[state=active]:text-white">
              Staff ({activeEmployees.length})
            </TabsTrigger>
            <TabsTrigger value="drivers" className="text-xs text-slate-300 data-[state=active]:bg-violet-600 data-[state=active]:text-white">
              Drivers ({drivers.length})
            </TabsTrigger>
            <TabsTrigger value="branches" className="text-xs text-slate-300 data-[state=active]:bg-violet-600 data-[state=active]:text-white">
              Branches
            </TabsTrigger>
          </TabsList>

          {/* OVERVIEW */}
          <TabsContent value="overview" className="space-y-4">
            <Card className="bg-slate-900 border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-violet-400" /> Revenue by Branch (Last 30 Days)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {branchList.length === 0 && (
                  <p className="text-xs text-slate-500 py-4 text-center">No branches configured</p>
                )}
                {branchList.map(br => {
                  const branchSales = recentSales.filter(s => s.branch === br.key);
                  const total = branchSales.reduce((sum, s) => sum + (s.cash || 0) + (s.network || 0) + (s.credit || 0), 0);
                  const pct = totalRevenue30d > 0 ? (total / totalRevenue30d) * 100 : 0;
                  return (
                    <div key={br.key}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-slate-300">{br.label || br.key}</span>
                        <span className="text-sm font-bold text-white">{total.toLocaleString()} SAR</span>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-violet-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="bg-slate-900 border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-violet-400" /> Recent Settlements
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {settlements.slice(0, 5).map(s => (
                  <div key={s.id} className="flex items-center justify-between p-2 rounded-xl bg-slate-800/60">
                    <div>
                      <p className="text-xs font-semibold text-slate-200">{s.branch} · {s.date}</p>
                      <p className="text-xs text-slate-500">{s.submitted_by_name || s.submitted_by}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-white">{(s.amount || 0).toLocaleString()} SAR</p>
                      <Badge className={`text-xs ${s.status === 'pending' ? 'bg-amber-900/60 text-amber-300' : s.status === 'approved' ? 'bg-emerald-900/60 text-emerald-300' : 'bg-red-900/60 text-red-300'}`}>
                        {s.status}
                      </Badge>
                    </div>
                  </div>
                ))}
                {settlements.length === 0 && (
                  <p className="text-xs text-slate-500 py-4 text-center">No settlements yet</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* EMPLOYEES */}
          <TabsContent value="employees" className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">{activeEmployees.length} active employees · read-only view</p>
              <Eye className="w-4 h-4 text-slate-500" />
            </div>
            {loadingEmps && <p className="text-sm text-slate-500 text-center py-8">Loading…</p>}
            {employees.map(emp => (
              <EmployeeRow key={emp.id} emp={emp} />
            ))}
            {!loadingEmps && employees.length === 0 && (
              <p className="text-xs text-slate-500 text-center py-8">No employee records found</p>
            )}
          </TabsContent>

          {/* DRIVERS */}
          <TabsContent value="drivers" className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">{drivers.length} drivers · read-only view</p>
              <Eye className="w-4 h-4 text-slate-500" />
            </div>
            {loadingDrivers && <p className="text-sm text-slate-500 text-center py-8">Loading…</p>}
            {drivers.map(d => (
              <DriverRow key={d.id} driver={d} />
            ))}
            {!loadingDrivers && drivers.length === 0 && (
              <p className="text-xs text-slate-500 text-center py-8">No driver records found</p>
            )}
          </TabsContent>

          {/* BRANCHES */}
          <TabsContent value="branches" className="space-y-3">
            {branchList.length === 0 && (
              <p className="text-xs text-slate-500 text-center py-8">No branches configured</p>
            )}
            {branchList.map(br => {
              const branchEmps = employees.filter(e => e.branch === br.key);
              const branchRecord = branches.find(b => b.key === br.key || b.branch_key === br.key);
              const branchDrivers = drivers.filter(d => String(d.branch_id || '') === String(branchRecord?.id || ''));
              return (
                <Card key={br.key} className="bg-slate-900 border-slate-700">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-bold text-white">{br.label || br.key}</p>
                        <p className="text-xs text-slate-400 font-mono">{br.key}</p>
                      </div>
                      <Badge className={`text-xs ${br.is_active !== false ? 'bg-emerald-900/60 text-emerald-300' : 'bg-red-900/60 text-red-300'}`}>
                        {br.is_active !== false ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-slate-800 rounded-lg p-2 text-center">
                        <p className="font-bold text-violet-300">{branchEmps.filter(e => e.is_active).length}</p>
                        <p className="text-slate-500">Staff</p>
                      </div>
                      <div className="bg-slate-800 rounded-lg p-2 text-center">
                        <p className="font-bold text-blue-300">{branchDrivers.length}</p>
                        <p className="text-slate-500">Drivers</p>
                      </div>
                    </div>
                    {br.manager_email && (
                      <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                        <Mail className="w-3 h-3" /> Manager: {br.manager_email}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}