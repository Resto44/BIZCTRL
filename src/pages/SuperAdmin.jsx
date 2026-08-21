import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { ROLES } from '@/lib/RoleContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Shield, Users, Building2, TrendingUp,
  Search, Settings, Eye, Ban, CheckCircle,
  DollarSign, FileText, Zap, Star, Crown, RefreshCw,
  Activity, Unlock
} from 'lucide-react';
import { XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import { format, subMonths } from 'date-fns';

// ─── Plan definitions ─────────────────────────────────────────────────────────
// Presentation metadata only. Canonical prices and capacities are read and enforced
// exclusively from public.subscription_plans through the subscription control plane.
const PLANS = {
  starter_20: { label: 'Starter', color: 'bg-emerald-100 text-emerald-700', icon: Zap },
  growth_40: { label: 'Growth', color: 'bg-blue-100 text-blue-700', icon: Star },
  enterprise_100: { label: 'Enterprise', color: 'bg-violet-100 text-violet-700', icon: Crown },
};

const STATUS_COLORS = {
  trial:     'bg-blue-100 text-blue-700',
  active:    'bg-green-100 text-green-700',
  suspended: 'bg-red-100 text-red-700',
  canceled:  'bg-slate-100 text-slate-600',
};

const CHART_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function MrrCard({ tenants }) {
  const mrr = tenants.filter(t => t.status === 'active')
    .reduce((s, t) => s + (t.monthly_revenue || 0), 0);
  const activeTrial = tenants.filter(t => t.status === 'trial').length;
  const activePaid = tenants.filter(t => t.status === 'active').length;
  const suspended = tenants.filter(t => t.status === 'suspended').length;
  const churn = tenants.filter(t => t.status === 'canceled').length;

  const kpis = [
    { label: 'MRR', value: `$${mrr.toLocaleString()}`, icon: DollarSign, color: 'text-green-600 bg-green-50 border-green-200' },
    { label: 'Active', value: activePaid, icon: CheckCircle, color: 'text-blue-600 bg-blue-50 border-blue-200' },
    { label: 'Trials', value: activeTrial, icon: Zap, color: 'text-amber-600 bg-amber-50 border-amber-200' },
    { label: 'Suspended', value: suspended, icon: Ban, color: 'text-red-600 bg-red-50 border-red-200' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {kpis.map(k => (
        <Card key={k.label} className={`border ${k.color}`}>
          <CardContent className="p-4 flex items-center gap-3">
            <k.icon className={`w-5 h-5 ${k.color.split(' ')[0]}`} />
            <div>
              <div className="text-xl font-black">{k.value}</div>
              <div className="text-xs text-muted-foreground">{k.label}</div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function PlanDistribution({ tenants }) {
  const data = Object.entries(PLANS).map(([key, p]) => ({
    name: p.label,
    value: tenants.filter(t => t.plan === key).length,
  })).filter(d => d.value > 0);

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm">Plan Distribution</CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-4">
        <ResponsiveContainer width="100%" height={160}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
              {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function SuperAdmin() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [editingTenant, setEditingTenant] = useState(null);
  const [suspendDialog, setSuspendDialog] = useState(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  const { data: tenants = [], isLoading, refetch } = useQuery({
    queryKey: ['tenant_profiles'],
    queryFn: () => base44.entities.TenantProfile.list('-created_date', 500),
  });

  const { data: usageLogs = [] } = useQuery({
    queryKey: ['usage_logs'],
    queryFn: () => base44.entities.UsageLog.list('-created_date', 1000),
  });

  const updateTenantMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.TenantProfile.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tenant_profiles'] }); setEditingTenant(null); },
  });

  const createTenantMut = useMutation({
    mutationFn: (data) => base44.entities.TenantProfile.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tenant_profiles'] }); setEditingTenant(null); },
  });

  // Filtered list
  const filtered = useMemo(() => tenants.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (planFilter !== 'all' && t.plan !== planFilter) return false;
    if (search && !t.owner_email?.toLowerCase().includes(search.toLowerCase()) &&
        !t.business_name?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [tenants, statusFilter, planFilter, search]);

  // Synthetic MRR growth (last 6 months bucketed)
  const mrrTrend = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(new Date(), 5 - i);
      return { month: format(d, 'MMM'), mrr: 0, tenants: 0 };
    });
    // Add current MRR as latest month
    const activeMRR = tenants.filter(t => t.status === 'active')
      .reduce((s, t) => s + (t.monthly_revenue || 0), 0);
    months[months.length - 1].mrr = activeMRR;
    months[months.length - 1].tenants = tenants.filter(t => t.status === 'active').length;
    return months;
  }, [tenants]);

  // Usage stats
  const ocrTotal = usageLogs.filter(l => l.action === 'ocr_scan').reduce((s, l) => s + (l.count || 0), 0);
  const pdfTotal = usageLogs.filter(l => l.action === 'pdf_export').reduce((s, l) => s + (l.count || 0), 0);

  const handleSuspend = async () => {
    if (!suspendDialog) return;
    await updateTenantMut.mutateAsync({
      id: suspendDialog.id,
      data: { status: 'suspended', is_suspended: true, suspension_reason: suspendReason },
    });
    setSuspendDialog(null);
    setSuspendReason('');
  };

  const handleUnsuspend = async (tenant) => {
    await updateTenantMut.mutateAsync({
      id: tenant.id,
      data: { status: 'active', is_suspended: false, suspension_reason: '' },
    });
  };

  const SUPER_ADMIN_EMAIL = import.meta.env.VITE_SUPER_ADMIN_EMAIL;
  const isSuperAdmin = SUPER_ADMIN_EMAIL
    ? user?.email === SUPER_ADMIN_EMAIL
    : user?.role === ROLES.OWNER; // fallback if env not set

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Shield className="w-12 h-12 text-red-400 mb-3" />
        <h2 className="text-lg font-bold text-red-600">Access Denied</h2>
        <p className="text-sm text-muted-foreground">Super Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black">Super Admin</h1>
            <p className="text-xs text-muted-foreground">Platform Control Center</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button size="sm" onClick={() => setEditingTenant({ _new: true, plan: 'starter', status: 'trial' })}>
            <Users className="w-4 h-4 mr-1" /> Add Tenant
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="overview" className="text-xs">📊 Overview</TabsTrigger>
          <TabsTrigger value="tenants" className="text-xs">🏢 Tenants</TabsTrigger>
          <TabsTrigger value="usage" className="text-xs">⚡ Usage</TabsTrigger>
        </TabsList>

        {/* ═══ OVERVIEW ═══ */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <MrrCard tenants={tenants} />

          {/* MRR Trend Chart */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-600" /> MRR Trend
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-4">
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={mrrTrend}>
                  <defs>
                    <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} />
                  <Tooltip formatter={v => [`$${v}`, 'MRR']} />
                  <Area type="monotone" dataKey="mrr" stroke="#3b82f6" fill="url(#mrrGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <PlanDistribution tenants={tenants} />

          {/* Top Tenants by Revenue */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Crown className="w-4 h-4 text-amber-500" /> Top Revenue Tenants
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {tenants
                .filter(t => t.status === 'active')
                .sort((a, b) => (b.monthly_revenue || 0) - (a.monthly_revenue || 0))
                .slice(0, 5)
                .map((t, i) => (
                  <div key={t.id} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{t.business_name}</div>
                      <div className="text-[10px] text-muted-foreground">{t.owner_email}</div>
                    </div>
                    <Badge className={PLANS[t.plan]?.color || ''}>{PLANS[t.plan]?.label || t.plan}</Badge>
                    <span className="text-xs font-bold text-green-600">${(t.monthly_revenue || 0)}/mo</span>
                  </div>
                ))}
              {tenants.filter(t => t.status === 'active').length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No active tenants yet</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ TENANTS ═══ */}
        <TabsContent value="tenants" className="mt-4 space-y-3">
          {/* Filters */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pr-9 text-sm" placeholder="Search by email or business name..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="canceled">Canceled</SelectItem>
                </SelectContent>
              </Select>
              <Select value={planFilter} onValueChange={setPlanFilter}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Plans</SelectItem>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">{filtered.length} tenants</p>
          </div>

          {/* Tenant List */}
          {isLoading ? (
            <div className="flex justify-center py-10">
              <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Building2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No tenants found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(tenant => {
                const PlanIcon = PLANS[tenant.plan]?.icon || Zap;
                return (
                  <Card key={tenant.id} className={`${tenant.is_suspended ? 'border-red-200 bg-red-50/30' : ''}`}>
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${PLANS[tenant.plan]?.color || 'bg-slate-100'}`}>
                            <PlanIcon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate">{tenant.business_name}</div>
                            <div className="text-[11px] text-muted-foreground truncate">{tenant.owner_email}</div>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <Badge className={`text-[10px] ${STATUS_COLORS[tenant.status] || ''}`}>{tenant.status}</Badge>
                              <Badge className={`text-[10px] ${PLANS[tenant.plan]?.color || ''}`}>{PLANS[tenant.plan]?.label || tenant.plan}</Badge>
                              {tenant.restaurant_count > 0 && <span className="text-[10px] text-muted-foreground">{tenant.restaurant_count} restaurants · {tenant.branch_count} branches</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="View Details" onClick={() => setSelectedTenant(tenant)}>
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit" onClick={() => setEditingTenant(tenant)}>
                            <Settings className="w-3.5 h-3.5" />
                          </Button>
                          {tenant.is_suspended ? (
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" title="Unsuspend" onClick={() => handleUnsuspend(tenant)}>
                              <Unlock className="w-3.5 h-3.5" />
                            </Button>
                          ) : (
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" title="Suspend" onClick={() => setSuspendDialog(tenant)}>
                              <Ban className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ═══ USAGE ═══ */}
        <TabsContent value="usage" className="mt-4 space-y-4">
          {/* Global Usage KPIs */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span className="text-xs text-blue-700 font-medium">Total OCR Scans</span>
                </div>
                <div className="text-2xl font-bold text-blue-700">{ocrTotal.toLocaleString()}</div>
                <div className="text-xs text-blue-500">platform-wide</div>
              </CardContent>
            </Card>
            <Card className="border-violet-200 bg-violet-50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-4 h-4 text-violet-600" />
                  <span className="text-xs text-violet-700 font-medium">PDF Exports</span>
                </div>
                <div className="text-2xl font-bold text-violet-700">{pdfTotal.toLocaleString()}</div>
                <div className="text-xs text-violet-500">platform-wide</div>
              </CardContent>
            </Card>
          </div>

          {/* Per-Tenant Usage */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="w-4 h-4" /> Tenant Usage Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              {tenants.filter(t => t.status === 'active' || t.status === 'trial').slice(0, 10).map(tenant => {
                const ocrUsed = tenant.used_ocr_scans || 0;
                const ocrMax = tenant.max_ocr_scans || 100;
                const pdfUsed = tenant.used_pdf_exports || 0;
                const pdfMax = tenant.max_pdf_exports || 50;
                const ocrPct = Math.min(100, (ocrUsed / ocrMax) * 100);
                const pdfPct = Math.min(100, (pdfUsed / pdfMax) * 100);
                return (
                  <div key={tenant.id} className="space-y-1.5 pb-3 border-b last:border-0 last:pb-0">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium truncate max-w-[60%]">{tenant.business_name}</span>
                      <Badge className={`text-[10px] ${PLANS[tenant.plan]?.color || ''}`}>{PLANS[tenant.plan]?.label}</Badge>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="w-10">OCR</span>
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full">
                        <div className={`h-full rounded-full ${ocrPct > 80 ? 'bg-red-400' : 'bg-blue-400'}`} style={{ width: `${ocrPct}%` }} />
                      </div>
                      <span>{ocrUsed}/{ocrMax}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="w-10">PDF</span>
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full">
                        <div className={`h-full rounded-full ${pdfPct > 80 ? 'bg-red-400' : 'bg-violet-400'}`} style={{ width: `${pdfPct}%` }} />
                      </div>
                      <span>{pdfUsed}/{pdfMax}</span>
                    </div>
                  </div>
                );
              })}
              {tenants.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No tenants yet</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ─── Tenant Detail Sheet ─── */}
      {selectedTenant && (
        <Dialog open={!!selectedTenant} onOpenChange={() => setSelectedTenant(null)}>
          <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="w-4 h-4" /> {selectedTenant.business_name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-50 rounded-lg p-2.5">
                  <div className="text-[10px] text-muted-foreground">Email</div>
                  <div className="text-xs font-medium break-all">{selectedTenant.owner_email}</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-2.5">
                  <div className="text-[10px] text-muted-foreground">Plan</div>
                  <Badge className={`text-[10px] mt-0.5 ${PLANS[selectedTenant.plan]?.color || ''}`}>{PLANS[selectedTenant.plan]?.label}</Badge>
                </div>
                <div className="bg-slate-50 rounded-lg p-2.5">
                  <div className="text-[10px] text-muted-foreground">Status</div>
                  <Badge className={`text-[10px] mt-0.5 ${STATUS_COLORS[selectedTenant.status] || ''}`}>{selectedTenant.status}</Badge>
                </div>
                <div className="bg-slate-50 rounded-lg p-2.5">
                  <div className="text-[10px] text-muted-foreground">MRR</div>
                  <div className="text-xs font-bold text-green-600">${selectedtenant.monthly_revenue || 0}/mo</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-2.5">
                  <div className="text-[10px] text-muted-foreground">Restaurants</div>
                  <div className="text-sm font-bold">{selectedTenant.restaurant_count || 0} / {selectedTenant.max_restaurants || '?'}</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-2.5">
                  <div className="text-[10px] text-muted-foreground">Branches</div>
                  <div className="text-sm font-bold">{selectedTenant.branch_count || 0} / {selectedTenant.max_branches || '?'}</div>
                </div>
              </div>
              {selectedTenant.suspension_reason && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="text-xs font-semibold text-red-700 mb-1">Suspension Reason</div>
                  <div className="text-xs text-red-600">{selectedTenant.suspension_reason}</div>
                </div>
              )}
              {selectedTenant.notes && (
                <div className="bg-slate-50 rounded-lg p-3 text-xs text-muted-foreground">{selectedTenant.notes}</div>
              )}
              <div className="flex gap-2 pt-1">
                <Button size="sm" className="flex-1" onClick={() => { setSelectedTenant(null); setEditingTenant(selectedTenant); }}>
                  <Settings className="w-3.5 h-3.5 mr-1" /> Edit
                </Button>
                {selectedTenant.is_suspended ? (
                  <Button size="sm" variant="outline" className="flex-1 text-green-600" onClick={() => { handleUnsuspend(selectedTenant); setSelectedTenant(null); }}>
                    <Unlock className="w-3.5 h-3.5 mr-1" /> Unsuspend
                  </Button>
                ) : (
                  <Button size="sm" variant="destructive" className="flex-1" onClick={() => { setSelectedTenant(null); setSuspendDialog(selectedTenant); }}>
                    <Ban className="w-3.5 h-3.5 mr-1" /> Suspend
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ─── Edit / Create Tenant Dialog ─── */}
      {editingTenant && (
        <TenantEditDialog
          tenant={editingTenant}
          onSave={(data) => {
            const nonSubscriptionData = {
              owner_email: data.owner_email,
              business_name: data.business_name,
              phone: data.phone,
              country: data.country,
              notes: data.notes,
            };
            // Subscription plans, status, pricing, and capacities are canonical
            // server data. This legacy editor may update profile fields only.
            if (editingTenant._new) createTenantMut.mutate(nonSubscriptionData);
            else updateTenantMut.mutate({ id: editingTenant.id, data: nonSubscriptionData });
          }}
          onClose={() => setEditingTenant(null)}
          saving={updateTenantMut.isPending || createTenantMut.isPending}
        />
      )}

      {/* ─── Suspend Dialog ─── */}
      <Dialog open={!!suspendDialog} onOpenChange={() => setSuspendDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Ban className="w-4 h-4" /> Suspend Tenant
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Suspending <strong>{suspendDialog?.business_name}</strong> will block their access immediately.</p>
          <div className="space-y-2">
            <Label className="text-xs">Reason for suspension</Label>
            <Textarea rows={3} value={suspendReason} onChange={e => setSuspendReason(e.target.value)} placeholder="e.g. Payment failed, abuse, etc." />
          </div>
          <div className="flex gap-2">
            <Button variant="destructive" className="flex-1" onClick={handleSuspend} disabled={updateTenantMut.isPending}>Confirm Suspend</Button>
            <Button variant="outline" className="flex-1" onClick={() => setSuspendDialog(null)}>Cancel</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Tenant Edit Dialog ─────────────────────────────────────────────────────
function TenantEditDialog({ tenant, onSave, onClose, saving }) {
  const [form, setForm] = useState({
    owner_email: tenant.owner_email || '',
    business_name: tenant.business_name || '',
    notes: tenant.notes || '',
    phone: tenant.phone || '',
    country: tenant.country || '',
  });

  const fields = [
    ['owner_email', 'Owner Email', 'email'],
    ['business_name', 'Business Name', 'text'],
    ['phone', 'Phone', 'text'],
    ['country', 'Country', 'text'],
  ];

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tenant._new ? 'Create Tenant' : 'Edit Tenant'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            Subscription plan, pricing, and capacity are managed only through the canonical Platform Owner subscription controls.
          </div>
          {fields.map(([key, label, type]) => (
            <div key={key}>
              <Label className="text-xs">{label}</Label>
              <Input
                type={type} className="h-8 text-sm"
                value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
              />
            </div>
          ))}

          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea rows={2} className="text-sm" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>

          <div className="flex gap-2 pt-1">
            <Button className="flex-1" onClick={() => onSave(form)} disabled={saving}>
              {saving ? 'Saving...' : tenant._new ? 'Create' : 'Save Changes'}
            </Button>
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}