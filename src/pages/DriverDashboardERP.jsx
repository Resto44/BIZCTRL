import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertCircle, CheckCircle2, GitBranch, Home, History, Loader2,
  LogOut, MapPin, Package, Truck, Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const ORDER_STATUS = {
  pending:    { label: 'Assigned', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  assigned:   { label: 'Assigned', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  picked_up:  { label: 'Picked Up', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  delivered:  { label: 'Delivered', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  cancelled:  { label: 'Cancelled', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  failed:     { label: 'Failed', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
};

const COMPLETED_STATUSES = new Set(['delivered', 'completed', 'complete']);

export default function DriverDashboardERP() {
  const { user, logout } = useAuth();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState('home');
  const today = format(new Date(), 'yyyy-MM-dd');

  // This lookup is intentionally performed before any conditional render. The
  // previous BranchSelector early return changed the hook order after login and
  // caused React to throw "Rendered more hooks than during the previous render".
  const { data: driverProfile, isLoading: loadingDriver, error: driverError } = useQuery({
    queryKey: ['driver-profile', user?.id, user?.email],
    queryFn: async () => {
      if (!user?.email) return null;
      const { data, error } = await supabase
        .from('drivers')
        .select('id, restaurant_id, branch_id, full_name, email, is_active, status')
        .eq('email', user.email)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    },
    enabled: !!user?.email,
    staleTime: 60000,
  });

  const driverId = driverProfile?.id || null;
  const restaurantId = driverProfile?.restaurant_id || user?.restaurant_id || user?.organization_id || null;
  const branchId = driverProfile?.branch_id || user?.branch_id || null;

  const { data: assignedBranch } = useQuery({
    queryKey: ['driver-branch', branchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name, branch_key, restaurant_id')
        .eq('id', branchId)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    },
    enabled: !!branchId,
    staleTime: 60000,
  });

  // Every read is bound to the authenticated driver's own driver_id, restaurant
  // and assigned branch. Session storage is display-only and cannot widen scope.
  const { data: myOrders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ['driver-orders', driverId, restaurantId, branchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('delivery_orders')
        .select('id, restaurant_id, branch, branch_key, branch_id, driver_id, driver_name, status, total_amount, delivery_fee, customer_address, created_date, updated_date')
        .eq('driver_id', driverId)
        .eq('restaurant_id', restaurantId)
        .eq('branch_id', branchId)
        .order('created_date', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: !!driverId && !!restaurantId && !!branchId,
    staleTime: 30000,
  });

  const todayEarnings = useMemo(() => {
    const completed = myOrders.filter((order) =>
      COMPLETED_STATUSES.has(String(order.status || '').toLowerCase())
      && String(order.updated_date || '').startsWith(today),
    );
    return {
      total: completed.reduce((sum, order) => sum + (Number(order.delivery_fee) || 0), 0),
      deliveries: completed.length,
    };
  }, [myOrders, today]);

  useEffect(() => {
    if (!driverId || !restaurantId) return undefined;
    const channel = supabase
      .channel(`driver-dashboard-orders-${driverId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'delivery_orders',
          filter: `driver_id=eq.${driverId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ['driver-orders', driverId] });
        },
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [driverId, restaurantId, qc]);

  const updateOrderMutation = useMutation({
    mutationFn: async ({ orderId, status }) => {
      const { error } = await supabase
        .from('delivery_orders')
        .update({ status, updated_date: new Date().toISOString() })
        .eq('id', orderId)
        .eq('driver_id', driverId)
        .eq('restaurant_id', restaurantId)
        .eq('branch_id', branchId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Order updated.');
      qc.invalidateQueries({ queryKey: ['driver-orders', driverId] });
    },
    onError: (err) => toast.error(err.message || 'Order update failed.'),
  });

  const activeOrders = myOrders.filter((order) => ['pending', 'assigned', 'picked_up'].includes(String(order.status || '').toLowerCase()));
  const completedToday = myOrders.filter((order) =>
    COMPLETED_STATUSES.has(String(order.status || '').toLowerCase())
    && String(order.updated_date || '').startsWith(today),
  );

  const tabs = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'orders', label: 'Orders', icon: Package },
    { id: 'history', label: 'History', icon: History },
    { id: 'earnings', label: 'Earnings', icon: Wallet },
  ];

  if (loadingDriver) return <DashboardLoader />;

  if (driverError || !driverProfile || !restaurantId || !branchId) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <Card className="max-w-md w-full bg-white/5 border-white/10">
          <CardContent className="p-6 text-center">
            <AlertCircle className="w-8 h-8 text-amber-400 mx-auto mb-3" />
            <h1 className="font-bold text-white">Driver profile needs attention</h1>
            <p className="text-sm text-slate-400 mt-2">Your account is not linked to an active driver record and branch. Please contact your restaurant owner.</p>
            <Button variant="ghost" className="mt-4 text-slate-300" onClick={logout}>Sign out</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 pb-20">
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur border-b border-white/10">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-600 to-blue-700 flex items-center justify-center">
              <Truck className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm">{driverProfile.full_name || user?.email}</p>
              <div className="flex items-center gap-1 text-slate-500 text-xs">
                <GitBranch className="w-3 h-3" />{assignedBranch?.name || 'Assigned branch'}
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={logout} className="text-slate-400" aria-label="Sign out">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {loadingOrders && <DashboardLoader compact />}

        {!loadingOrders && activeTab === 'home' && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <StatCard value={activeOrders.length} label="Active" color="text-sky-400" />
              <StatCard value={completedToday.length} label="Done Today" color="text-emerald-400" />
              <StatCard value={`$${todayEarnings.total.toFixed(0)}`} label="Earned" color="text-amber-400" />
            </div>
            {activeOrders.length === 0 ? (
              <Card className="bg-white/5 border-white/10">
                <CardContent className="p-6 text-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                  <p className="text-white font-medium">No active deliveries</p>
                  <p className="text-slate-500 text-sm mt-1">Waiting for new orders…</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                <h2 className="text-white font-bold text-sm">Active Deliveries</h2>
                {activeOrders.map((order) => <DeliveryCard key={order.id} order={order} onUpdate={(status) => updateOrderMutation.mutate({ orderId: order.id, status })} loading={updateOrderMutation.isPending} />)}
              </div>
            )}
          </>
        )}

        {!loadingOrders && activeTab === 'orders' && (
          <div className="space-y-3">
            <h2 className="text-white font-bold">All Orders</h2>
            {myOrders.length === 0 ? <p className="text-slate-500 text-sm text-center py-6">No orders yet.</p> : myOrders.map((order) => <DeliveryCard key={order.id} order={order} onUpdate={(status) => updateOrderMutation.mutate({ orderId: order.id, status })} loading={updateOrderMutation.isPending} />)}
          </div>
        )}

        {!loadingOrders && activeTab === 'history' && (
          <div className="space-y-3">
            <h2 className="text-white font-bold">Delivery History</h2>
            {completedToday.length === 0 ? <p className="text-slate-500 text-sm text-center py-6">No deliveries completed today.</p> : completedToday.map((order) => <HistoryCard key={order.id} order={order} />)}
          </div>
        )}

        {!loadingOrders && activeTab === 'earnings' && (
          <Card className="bg-gradient-to-br from-sky-600/20 to-blue-700/20 border-sky-500/30">
            <CardContent className="p-6 text-center">
              <p className="text-slate-400 text-sm mb-1">Today's Earnings</p>
              <p className="text-4xl font-black text-white">${todayEarnings.total.toFixed(2)}</p>
              <p className="text-sky-400 text-sm mt-2">{todayEarnings.deliveries} deliveries completed</p>
            </CardContent>
          </Card>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-slate-950/90 backdrop-blur border-t border-white/10 z-40">
        <div className="max-w-2xl mx-auto px-4 flex">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors ${activeTab === tab.id ? 'text-sky-400' : 'text-slate-500 hover:text-slate-300'}`}><Icon className="w-5 h-5" /><span className="text-[10px] font-medium">{tab.label}</span></button>;
          })}
        </div>
      </nav>
    </div>
  );
}

function DashboardLoader({ compact = false }) {
  return <div className={compact ? 'flex justify-center py-8' : 'min-h-screen bg-slate-950 flex items-center justify-center'}><Loader2 className="w-7 h-7 text-sky-400 animate-spin" /></div>;
}

function StatCard({ value, label, color }) {
  return <Card className="bg-white/5 border-white/10"><CardContent className="p-3 text-center"><p className={`text-2xl font-black ${color}`}>{value}</p><p className="text-slate-500 text-xs mt-0.5">{label}</p></CardContent></Card>;
}

function HistoryCard({ order }) {
  return <Card className="bg-white/5 border-white/10"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-white text-sm font-medium">Order #{order.id?.slice(0, 8)}</p><p className="text-slate-500 text-xs">{order.updated_date ? format(new Date(order.updated_date), 'h:mm a') : ''}</p></div><div className="text-right"><p className="text-emerald-400 text-sm font-bold">${(Number(order.delivery_fee) || 0).toFixed(2)}</p><Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">Delivered</Badge></div></div></CardContent></Card>;
}

function DeliveryCard({ order, onUpdate, loading }) {
  const status = String(order.status || '').toLowerCase();
  const statusConf = ORDER_STATUS[status] || ORDER_STATUS.pending;
  const nextAction = ['pending', 'assigned'].includes(status)
    ? { label: 'Picked Up', status: 'picked_up', color: 'bg-blue-600 hover:bg-blue-700' }
    : status === 'picked_up'
      ? { label: 'Mark Delivered', status: 'delivered', color: 'bg-emerald-600 hover:bg-emerald-700' }
      : null;

  return (
    <Card className="bg-white/5 border-white/10">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3"><div><p className="text-white font-bold text-sm">Order #{order.id?.slice(0, 8)}</p><p className="text-slate-500 text-xs">{order.created_date ? format(new Date(order.created_date), 'h:mm a') : ''}</p></div><Badge className={`text-[10px] border ${statusConf.color}`}>{statusConf.label}</Badge></div>
        {order.customer_address && <div className="flex items-start gap-2 mb-3"><MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" /><p className="text-slate-300 text-xs">{order.customer_address}</p></div>}
        <div className="flex items-center justify-between mb-3"><span className="text-slate-400 text-xs">Delivery fee</span><span className="text-emerald-400 text-sm font-bold">${(Number(order.delivery_fee) || 0).toFixed(2)}</span></div>
        {nextAction && <Button size="sm" onClick={() => onUpdate(nextAction.status)} disabled={loading} className={`w-full ${nextAction.color} text-white text-xs h-8`}>{nextAction.label}</Button>}
      </CardContent>
    </Card>
  );
}
