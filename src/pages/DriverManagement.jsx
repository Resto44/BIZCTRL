import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { buildDriverSalesAnalytics, DRIVER_ANALYTICS_PERIODS, getDriverAnalyticsDateRange, getDriverSaleEntries } from '@/lib/driverAnalytics';
import BranchSelect from '@/components/shared/BranchSelect';
import DriverTrendAnalytics from '@/components/dashboard/DriverTrendAnalytics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Search, Plus, Truck, Users, Activity, ReceiptText, Pencil, Phone, BarChart3, WalletCards, Award, CreditCard, DollarSign } from 'lucide-react';
import { toast } from 'sonner';

const emptyForm = {
  full_name: '',
  phone: '',
  email: '',
  driver_id: '',
  vehicle_type: '',
  vehicle_plate: '',
  notes: '',
  branch_id: '',
};

const asArray = (value) => Array.isArray(value) ? value.filter(Boolean) : [];

function money(value, currency) {
  return `${currency}${(Number(value) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function branchKeyFor(branch) {
  return branch?.key || branch?.branch_key || '';
}

function DriverDetailsDialog({ driver, analytics, sales, currency, onOpenChange }) {
  if (!driver) return null;

  const row = analytics.driverRows.find((item) => String(item.driverId) === String(driver.id));
  const history = sales
    .flatMap((sale) => getDriverSaleEntries(sale)
      .filter((entry) => String(entry.driver_id || '') === String(driver.id))
      .map((entry, index) => ({ ...sale, driverAmounts: entry, historyKey: `${sale.id}-${entry.driver_id || index}` })))
    .sort((left, right) => String(right.date || '').localeCompare(String(left.date || '')))
    .slice(0, 25);

  return (
    <Dialog open={!!driver} onOpenChange={(open) => !open && onOpenChange(null)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">
              {(driver.full_name || 'D').charAt(0).toUpperCase()}
            </span>
            <span>{driver.full_name}</span>
            <Badge variant={driver.is_active !== false && driver.status !== 'inactive' ? 'default' : 'secondary'}>
              {driver.is_active !== false && driver.status !== 'inactive' ? 'Active' : 'Inactive'}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <MetricCard label="Sales / Orders" value={`${row?.orders || 0}`} icon={ReceiptText} />
          <MetricCard label="Cash Sales" value={money(row?.cash, currency)} icon={WalletCards} />
          <MetricCard label="Network / POS" value={money(row?.network, currency)} icon={Activity} />
          <MetricCard label="Credit Sales" value={money(row?.credit, currency)} icon={CreditCard} />
          <MetricCard label="Total Revenue" value={money(row?.revenue, currency)} icon={BarChart3} />
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Driver Profile</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <ProfileLine label="Branch" value={driver.branch_name || 'Assigned branch'} />
            <ProfileLine label="Phone" value={driver.phone || '—'} />
            <ProfileLine label="Driver ID" value={driver.driver_id || '—'} />
            <ProfileLine label="Vehicle" value={[driver.vehicle_type, driver.vehicle_plate].filter(Boolean).join(' · ') || '—'} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Sales History</CardTitle>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="py-5 text-center text-sm text-muted-foreground">No sales have been linked to this driver yet.</p>
            ) : (
              <div className="space-y-2">
                {history.map((sale) => {
                  const amounts = sale.driverAmounts;
                  return (
                    <div key={sale.historyKey} className="grid grid-cols-[1fr_auto] gap-3 rounded-lg border border-border/70 p-3 text-sm">
                      <div>
                        <p className="font-semibold">{sale.date || 'Undated sale'}</p>
                        <p className="text-xs text-muted-foreground">{sale.branch || 'Branch'} · Cash {money(amounts.cash, currency)} · POS {money(amounts.network, currency)} · Credit {money(amounts.credit, currency)}</p>
                        {amounts.notes && <p className="mt-1 text-xs text-muted-foreground">Notes: {amounts.notes}</p>}
                      </div>
                      <p className="font-bold text-primary">{money(amounts.revenue, currency)}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}

function MetricCard({ label, value, icon: Icon }) {
  return (
    <Card>
      <CardContent className="p-3">
        <Icon className="mb-2 h-4 w-4 text-primary" />
        <p className="text-base font-bold truncate">{value}</p>
        <p className="text-[11px] text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function ProfileLine({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 py-1.5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-right">{value}</span>
    </div>
  );
}

export default function DriverManagement() {
  const { currency } = useLanguage();
  const { user } = useAuth();
  const { activeRestaurant, branches: tenantBranches, isManager, managerBranch } = useTenant();
  const queryClient = useQueryClient();
  const branches = asArray(tenantBranches);
  const managerBranchRecord = useMemo(() => branches.find((branch) =>
    branchKeyFor(branch) === managerBranch || String(branch.id || '') === String(user?.branch_id || ''),
  ) || null, [branches, managerBranch, user?.branch_id]);

  const [selectedBranch, setSelectedBranch] = useState(() =>
    isManager ? branchKeyFor(managerBranchRecord) || managerBranch || '' : 'all',
  );
  const [period, setPeriod] = useState('month');
  const [search, setSearch] = useState('');
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editingDriver, setEditingDriver] = useState(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!isManager) return;
    const branch = branchKeyFor(managerBranchRecord) || managerBranch;
    if (branch) setSelectedBranch(branch);
  }, [isManager, managerBranch, managerBranchRecord]);

  const selectedBranchRecord = useMemo(() => branches.find((branch) =>
    branchKeyFor(branch) === selectedBranch || String(branch.id || '') === String(selectedBranch || ''),
  ) || null, [branches, selectedBranch]);
  const effectiveBranch = isManager ? managerBranchRecord || selectedBranchRecord : selectedBranchRecord;
  const effectiveBranchId = effectiveBranch?.id || null;
  const effectiveBranchKey = branchKeyFor(effectiveBranch) || (selectedBranch === 'all' ? '' : selectedBranch);
  const canLoad = !!activeRestaurant?.id && (!isManager || !!effectiveBranchId);
  const dateRange = useMemo(() => getDriverAnalyticsDateRange(period), [period]);
  const periodLabel = useMemo(() => DRIVER_ANALYTICS_PERIODS.find((item) => item.id === period)?.label || 'Selected period', [period]);

  const { data: driversData = [], isLoading: driversLoading } = useQuery({
    queryKey: ['drivers', activeRestaurant?.id, effectiveBranchId, isManager],
    queryFn: () => base44.entities.Driver.filter(
      isManager
        ? { restaurant_id: activeRestaurant.id, branch_id: effectiveBranchId }
        : effectiveBranchId
          ? { restaurant_id: activeRestaurant.id, branch_id: effectiveBranchId }
          : { restaurant_id: activeRestaurant.id },
      'full_name',
      500,
    ),
    enabled: canLoad,
    staleTime: 0,
  });
  const drivers = asArray(driversData);

  const { data: salesData = [] } = useQuery({
    queryKey: ['driver-sales', activeRestaurant?.id, effectiveBranchId, isManager, dateRange.startDate, dateRange.endDate],
    queryFn: async () => {
      let query = supabase
        .from('daily_sales')
        .select('id, date, branch, branch_id, driver_id, driver_name, driver_cash, driver_network, drivers_json, restaurant_cash, restaurant_network, cash, network, credit, sales_sources_json, custom_sources_total')
        .eq('restaurant_id', activeRestaurant.id)
        .or('driver_id.not.is.null,drivers_json.not.is.null')
        .gte('date', dateRange.startDate)
        .lte('date', dateRange.endDate)
        .order('date', { ascending: false })
        .limit(5000);
      if (effectiveBranchId) query = query.eq('branch_id', effectiveBranchId);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: canLoad,
    staleTime: 0,
  });
  const sales = asArray(salesData);

  const analytics = useMemo(() => buildDriverSalesAnalytics({
    drivers,
    sales,
    branchKey: effectiveBranchKey,
    branchId: effectiveBranchId,
    dateFrom: dateRange.startDate,
    dateTo: dateRange.endDate,
  }), [drivers, sales, effectiveBranchId, effectiveBranchKey, dateRange.startDate, dateRange.endDate]);

  const visibleDrivers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return drivers;
    return drivers.filter((driver) => [driver.full_name, driver.phone, driver.driver_id]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)));
  }, [drivers, search]);

  const openCreate = () => {
    setEditingDriver(null);
    setForm({
      ...emptyForm,
      branch_id: effectiveBranchId || '',
    });
    setShowEditor(true);
  };

  const openEdit = (driver) => {
    setEditingDriver(driver);
    setForm({
      full_name: driver.full_name || '',
      phone: driver.phone || '',
      email: driver.email || '',
      driver_id: driver.driver_id || '',
      vehicle_type: driver.vehicle_type || '',
      vehicle_plate: driver.vehicle_plate || '',
      notes: driver.notes || '',
      branch_id: driver.branch_id || effectiveBranchId || '',
    });
    setShowEditor(true);
  };

  const invalidateDriverData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['drivers'] });
    queryClient.invalidateQueries({ queryKey: ['driver-sales'] });
    queryClient.invalidateQueries({ queryKey: ['driver-performance'] });
  }, [queryClient]);

  useEffect(() => {
    if (!activeRestaurant?.id) return undefined;
    const refresh = () => invalidateDriverData();
    const channel = supabase
      .channel(`driver-management-${activeRestaurant.id}-${effectiveBranchId || 'all'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers', filter: `restaurant_id=eq.${activeRestaurant.id}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_sales', filter: `restaurant_id=eq.${activeRestaurant.id}` }, refresh)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [activeRestaurant?.id, effectiveBranchId, invalidateDriverData]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.full_name.trim() || !form.branch_id) throw new Error('Full name and branch are required.');
      const branch = branches.find((item) => String(item.id) === String(form.branch_id));
      if (!branch) throw new Error('Select a valid branch.');
      const payload = {
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        driver_id: form.driver_id.trim(),
        vehicle_type: form.vehicle_type.trim(),
        vehicle_plate: form.vehicle_plate.trim(),
        notes: form.notes.trim(),
        branch_id: branch.id,
        restaurant_id: activeRestaurant.id,
        tenant_id: activeRestaurant.id,
        status: editingDriver?.is_active === false ? 'inactive' : 'active',
        is_active: editingDriver?.is_active !== false,
      };
      return editingDriver
        ? base44.entities.Driver.update(editingDriver.id, payload)
        : base44.entities.Driver.create(payload);
    },
    onSuccess: () => {
      toast.success(editingDriver ? 'Driver updated' : 'Driver created');
      invalidateDriverData();
      setShowEditor(false);
      setEditingDriver(null);
      setForm(emptyForm);
    },
    onError: (error) => toast.error(error?.message || 'Unable to save driver'),
  });

  const toggleMutation = useMutation({
    mutationFn: (driver) => {
      const nextActive = driver.is_active === false;
      return base44.entities.Driver.update(driver.id, {
        is_active: nextActive,
        status: nextActive ? 'active' : 'inactive',
      });
    },
    onSuccess: () => {
      toast.success('Driver status updated');
      invalidateDriverData();
    },
    onError: (error) => toast.error(error?.message || 'Unable to update driver status'),
  });

  const selectedAnalytics = useMemo(() => buildDriverSalesAnalytics({
    drivers,
    sales,
    branchKey: effectiveBranchKey,
    branchId: effectiveBranchId,
    dateFrom: dateRange.startDate,
    dateTo: dateRange.endDate,
  }), [drivers, sales, effectiveBranchId, effectiveBranchKey, dateRange.startDate, dateRange.endDate]);

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-24">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Driver Management</h1>
          <p className="text-sm text-muted-foreground">Canonical branch-scoped driver directory, sales history, and performance.</p>
        </div>
        <Button onClick={openCreate} disabled={!canLoad} className="gap-2"><Plus className="h-4 w-4" />Add Driver</Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <Label className="mb-2 block text-xs font-semibold uppercase text-muted-foreground">Branch Scope</Label>
          <BranchSelect value={selectedBranch} onChange={setSelectedBranch} includeAll />
          {isManager && <p className="mt-2 text-xs text-muted-foreground">Your access is restricted to your assigned branch.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Analytics Period</Label>
            <span className="text-xs text-muted-foreground">{periodLabel}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {DRIVER_ANALYTICS_PERIODS.map((item) => (
              <Button key={item.id} type="button" variant={period === item.id ? 'default' : 'outline'} size="sm" onClick={() => setPeriod(item.id)}>
                {item.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-7">
        <MetricCard label="Total Drivers" value={analytics.totals.drivers} icon={Users} />
        <MetricCard label="Active Drivers" value={analytics.totals.activeDrivers} icon={Truck} />
        <MetricCard label="Sales / Orders" value={analytics.totals.orders} icon={ReceiptText} />
        <MetricCard label="Cash Sales" value={money(analytics.totals.cash, currency)} icon={DollarSign} />
        <MetricCard label="Network / POS" value={money(analytics.totals.network, currency)} icon={Activity} />
        <MetricCard label="Credit Sales" value={money(analytics.totals.credit, currency)} icon={CreditCard} />
        <MetricCard label="Total Revenue" value={money(analytics.totals.revenue, currency)} icon={BarChart3} />
      </div>

      <DriverTrendAnalytics
        drivers={drivers}
        sales={sales}
        branches={branches}
        branchKey={effectiveBranchKey}
        branchId={effectiveBranchId}
        dateFrom={dateRange.startDate}
        dateTo={dateRange.endDate}
        periodLabel={periodLabel}
        currency={currency}
      />

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Search drivers by name, ID, or phone" />
          </div>
        </CardContent>
      </Card>

      {driversLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading drivers…</p>
      ) : visibleDrivers.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><Truck className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" /><p className="text-sm text-muted-foreground">No drivers are assigned to this branch.</p></CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {visibleDrivers.map((driver) => {
            const row = analytics.driverRows.find((item) => String(item.driverId) === String(driver.id));
            const active = driver.is_active !== false && driver.status !== 'inactive';
            return (
              <Card key={driver.id} className="transition-shadow hover:shadow-md">
                <CardContent className="space-y-4 p-4">
                  <div className="flex items-start gap-3">
                    <button type="button" onClick={() => setSelectedDriver(driver)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">{(driver.full_name || 'D').charAt(0).toUpperCase()}</span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{driver.full_name}</span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="h-3 w-3" />{driver.phone || 'No phone'}</span>
                      </span>
                    </button>
                    <Badge variant={active ? 'default' : 'secondary'}>{active ? 'Active' : 'Inactive'}</Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/45 p-3 text-center sm:grid-cols-4">
                    <div><p className="text-sm font-bold">{money(row?.cash, currency)}</p><p className="text-[10px] text-muted-foreground">Cash</p></div>
                    <div><p className="text-sm font-bold">{money(row?.network, currency)}</p><p className="text-[10px] text-muted-foreground">Network / POS</p></div>
                    <div><p className="text-sm font-bold">{money(row?.credit, currency)}</p><p className="text-[10px] text-muted-foreground">Credit</p></div>
                    <div><p className="text-sm font-bold">{money(row?.revenue, currency)}</p><p className="text-[10px] text-muted-foreground">Total Revenue</p></div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground"><Switch checked={active} onCheckedChange={() => toggleMutation.mutate(driver)} disabled={toggleMutation.isPending} />{active ? 'Active' : 'Inactive'}</div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setSelectedDriver(driver)}>History</Button>
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => openEdit(driver)}><Pencil className="h-3 w-3" />Edit</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-2"><Award className="h-4 w-4 text-amber-600" /><div><h2 className="text-sm font-bold">Top 10 Drivers</h2><p className="text-xs text-muted-foreground">Ranked by total revenue for {periodLabel.toLowerCase()}.</p></div></div>
          {analytics.rankedDrivers.length === 0 ? (
            <p className="py-5 text-center text-sm text-muted-foreground">No driver-linked sales have been recorded for this period.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/70">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="bg-muted/50 text-muted-foreground"><tr><th className="px-3 py-2 font-semibold">#</th><th className="px-3 py-2 font-semibold">Driver</th><th className="px-3 py-2 font-semibold">Sales / Orders</th><th className="px-3 py-2 font-semibold">Cash</th><th className="px-3 py-2 font-semibold">Network / POS</th><th className="px-3 py-2 font-semibold">Credit</th><th className="px-3 py-2 font-semibold">Total Revenue</th></tr></thead>
                <tbody>{analytics.rankedDrivers.map((driver, index) => <tr key={driver.driverId} className="border-t border-border/60"><td className="px-3 py-2 font-bold text-muted-foreground">{index + 1}</td><td className="px-3 py-2 font-semibold">{driver.name}</td><td className="px-3 py-2">{driver.orders}</td><td className="px-3 py-2">{money(driver.cash, currency)}</td><td className="px-3 py-2">{money(driver.network, currency)}</td><td className="px-3 py-2">{money(driver.credit, currency)}</td><td className="px-3 py-2 font-bold text-primary">{money(driver.revenue, currency)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <DriverDetailsDialog driver={selectedDriver} analytics={selectedAnalytics} sales={sales} currency={currency} onOpenChange={setSelectedDriver} />

      <Dialog open={showEditor} onOpenChange={(open) => !open && setShowEditor(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingDriver ? 'Edit Driver' : 'Add Driver'}</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label>Full Name *</Label><Input value={form.full_name} onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))} /></div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></div>
            <div><Label>Driver ID</Label><Input value={form.driver_id} onChange={(event) => setForm((current) => ({ ...current, driver_id: event.target.value }))} /></div>
            <div className="sm:col-span-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></div>
            <div><Label>Vehicle Type</Label><Input value={form.vehicle_type} onChange={(event) => setForm((current) => ({ ...current, vehicle_type: event.target.value }))} /></div>
            <div><Label>Vehicle Plate</Label><Input value={form.vehicle_plate} onChange={(event) => setForm((current) => ({ ...current, vehicle_plate: event.target.value }))} /></div>
            <div className="sm:col-span-2">
              <Label>Branch *</Label>
              <Select value={form.branch_id} onValueChange={(value) => setForm((current) => ({ ...current, branch_id: value }))} disabled={isManager}>
                <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.label || branch.name || branchKeyFor(branch)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2"><Label>Notes</Label><Input value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowEditor(false)}>Cancel</Button><Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>{saveMutation.isPending ? 'Saving…' : editingDriver ? 'Save Changes' : 'Create Driver'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
