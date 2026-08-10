/**
 * DriverDashboardERP — Canonical Driver Portal
 *
 * CANONICAL: This is the single source of truth for the Driver ERP portal.
 * DriverDashboardV2.jsx and DriverPortal.jsx have been removed.
 *
 * Order flow:
 *   DRIVER CREATES ORDER → sent_to_kitchen →
 *   KITCHEN APPROVES (kitchen_approved) → KITCHEN PREPARES (preparing) →
 *   READY FOR PICKUP (ready_for_pickup) → DRIVER PICKS UP (picked_up) →
 *   OUT FOR DELIVERY (out_for_delivery) → DELIVERED → COMPLETED
 *
 * Security:
 *   - Driver sees ONLY their own orders (RLS + query filter on driver_id)
 *   - Driver CANNOT set kitchen_status (enforced by DB + UI guards)
 *   - All mutations verified against driver_id = erp_current_linked_entity_id()
 *
 * Realtime:
 *   - Single channel scoped to driver_id on delivery_orders
 *   - Prevents duplicate subscriptions via cleanup on unmount
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Home, History, Wallet, LogOut, MapPin, Loader2,
  Plus, ChefHat, Truck, CheckCircle2, XCircle, AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

// ── Status configuration ──────────────────────────────────────────────────────
const ORDER_STATUS = {
  pending:          { label: 'New Order',         color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  sent_to_kitchen:  { label: 'Sent to Kitchen',   color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  kitchen_approved: { label: 'Kitchen Approved',  color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  preparing:        { label: 'Preparing',          color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  ready_for_pickup: { label: 'Ready for Pickup',  color: 'bg-teal-500/20 text-teal-400 border-teal-500/30' },
  picked_up:        { label: 'Picked Up',          color: 'bg-sky-500/20 text-sky-400 border-sky-500/30' },
  out_for_delivery: { label: 'Out for Delivery',  color: 'bg-violet-500/20 text-violet-400 border-violet-500/30' },
  delivered:        { label: 'Delivered',          color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  completed:        { label: 'Completed',          color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  cancelled:        { label: 'Cancelled',          color: 'bg-red-500/20 text-red-400 border-red-500/30' },
};

const ACTIVE_STATUSES    = new Set(['pending','sent_to_kitchen','kitchen_approved','preparing','ready_for_pickup','picked_up','out_for_delivery']);
const COMPLETED_STATUSES = new Set(['delivered','completed']);

// Driver-allowed next transitions (kitchen_approved is set by kitchen only)
const DRIVER_NEXT_ACTIONS = {
  pending:          { label: 'Send to Kitchen',   status: 'sent_to_kitchen',  color: 'bg-blue-600 hover:bg-blue-700' },
  kitchen_approved: { label: 'Pick Up Order',     status: 'picked_up',        color: 'bg-sky-600 hover:bg-sky-700' },
  ready_for_pickup: { label: 'Pick Up Order',     status: 'picked_up',        color: 'bg-sky-600 hover:bg-sky-700' },
  picked_up:        { label: 'Out for Delivery',  status: 'out_for_delivery', color: 'bg-violet-600 hover:bg-violet-700' },
  out_for_delivery: { label: 'Mark Delivered',    status: 'delivered',        color: 'bg-emerald-600 hover:bg-emerald-700' },
};

function generateOrderNumber() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `DRV-${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${Math.floor(Math.random()*9000)+1000}`;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DriverDashboardERP() {
  const { user, logout } = useAuth();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState('home');
  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const today = format(new Date(), 'yyyy-MM-dd');

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

  const driverId     = driverProfile?.id || null;
  const restaurantId = driverProfile?.restaurant_id || user?.restaurant_id || user?.organization_id || null;
  const branchId     = driverProfile?.branch_id || user?.branch_id || null;
  const driverName   = driverProfile?.full_name || user?.full_name || user?.email || 'Driver';

  const { data: assignedBranch } = useQuery({
    queryKey: ['driver-branch', branchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches').select('id, name, branch_key, restaurant_id')
        .eq('id', branchId).maybeSingle();
      if (error) throw error;
      return data || null;
    },
    enabled: !!branchId,
    staleTime: 60000,
  });

  const { data: myOrders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ['driver-orders', driverId, restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('delivery_orders')
        .select(`
          id, restaurant_id, branch, branch_key, branch_id,
          driver_id, driver_name, status, kitchen_status,
          total_amount, delivery_fee, subtotal, discount,
          payment_method, payment_collected, payment_status, partial_amount,
          customer_name, customer_phone, customer_address,
          items_json, notes, cancelled_reason, order_number, shift_id,
          kitchen_approved_at, kitchen_rejected_at, kitchen_reject_reason,
          picked_up_at, delivered_at, actual_delivery_time,
          created_date, updated_date
        `)
        .eq('driver_id', driverId)
        .eq('restaurant_id', restaurantId)
        .order('created_date', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
    enabled: !!driverId && !!restaurantId,
    staleTime: 20000,
  });

  // Realtime subscription scoped to this driver only
  useEffect(() => {
    if (!driverId || !restaurantId) return;
    const channel = supabase
      .channel(`driver-erp-${driverId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_orders', filter: `driver_id=eq.${driverId}` },
        () => qc.invalidateQueries({ queryKey: ['driver-orders', driverId] }))
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [driverId, restaurantId, qc]);

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, newStatus }) => {
      const order = myOrders.find(o => o.id === orderId);
      const { error } = await supabase
        .from('delivery_orders')
        .update({
          status: newStatus,
          updated_date: new Date().toISOString(),
          ...(newStatus === 'picked_up'        ? { picked_up_at: new Date().toISOString() } : {}),
          ...(newStatus === 'delivered'        ? { delivered_at: new Date().toISOString(), actual_delivery_time: new Date().toISOString() } : {}),
        })
        .eq('id', orderId)
        .eq('driver_id', driverId)
        .eq('restaurant_id', restaurantId);
      if (error) throw error;
      // Write status history (non-blocking)
      supabase.from('order_status_history').insert({
        order_id: orderId, restaurant_id: restaurantId, branch_id: branchId,
        tenant_id: restaurantId, from_status: order?.status || null,
        to_status: newStatus, changed_by: user?.email, changed_by_role: 'driver',
      }).then(() => {});
    },
    onSuccess: (_, { newStatus }) => {
      const labels = { sent_to_kitchen: 'Sent to kitchen!', picked_up: 'Order picked up!', out_for_delivery: 'Out for delivery!', delivered: 'Delivered!' };
      toast.success(labels[newStatus] || 'Order updated');
      qc.invalidateQueries({ queryKey: ['driver-orders', driverId] });
    },
    onError: (err) => toast.error(err.message || 'Update failed'),
  });

  const activeOrders   = useMemo(() => myOrders.filter(o => ACTIVE_STATUSES.has(o.status)), [myOrders]);
  const completedToday = useMemo(() => myOrders.filter(o =>
    COMPLETED_STATUSES.has(o.status) && String(o.updated_date || '').startsWith(today)
  ), [myOrders, today]);
  const pendingPayment = useMemo(() => myOrders.filter(o =>
    COMPLETED_STATUSES.has(o.status) && !o.payment_collected
  ), [myOrders]);
  const allStats = useMemo(() => ({
    total:     myOrders.length,
    completed: myOrders.filter(o => COMPLETED_STATUSES.has(o.status)).length,
    cancelled: myOrders.filter(o => o.status === 'cancelled').length,
  }), [myOrders]);
  const todayEarnings = useMemo(() => ({
    total:      completedToday.reduce((s, o) => s + (Number(o.delivery_fee) || 0), 0),
    deliveries: completedToday.length,
  }), [completedToday]);

  const tabs = [
    { id: 'home',     label: 'Home',     icon: Home },
    { id: 'active',   label: 'Active',   icon: Truck,    badge: activeOrders.length },
    { id: 'history',  label: 'History',  icon: History },
    { id: 'earnings', label: 'Earnings', icon: Wallet },
  ];

  if (loadingDriver) return <Spinner />;

  if (driverError || (!loadingDriver && !driverProfile)) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <Card className="bg-white/5 border-white/10 max-w-sm w-full">
          <CardContent className="p-6 text-center">
            <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <p className="text-white font-bold mb-1">Driver profile not found</p>
            <p className="text-slate-400 text-sm mb-4">Your account is not linked to a driver record. Contact your manager.</p>
            <Button onClick={logout} variant="outline" size="sm" className="text-slate-300 border-white/20">Sign Out</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 pb-20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur border-b border-white/10">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-blue-700 flex items-center justify-center">
              <Truck className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-tight">{driverName}</p>
              <p className="text-slate-500 text-xs">{assignedBranch?.name || 'Driver Portal'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setShowCreateOrder(true)}
              className="bg-sky-600 hover:bg-sky-700 text-white h-8 px-3 text-xs gap-1">
              <Plus className="w-3.5 h-3.5" /> New Order
            </Button>
            <button onClick={logout} className="p-2 text-slate-500 hover:text-slate-300">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">

        {/* HOME */}
        {activeTab === 'home' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <StatCard value={todayEarnings.deliveries} label="Today's Deliveries" color="text-sky-400" />
              <StatCard value={`$${todayEarnings.total.toFixed(0)}`} label="Today's Earnings" color="text-emerald-400" />
              <StatCard value={activeOrders.length} label="Active Orders" color="text-amber-400" />
              <StatCard value={pendingPayment.length} label="Pending Payment" color="text-orange-400" />
            </div>
            {activeOrders.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-white font-bold text-sm">Active Orders</h2>
                  <button onClick={() => setActiveTab('active')} className="text-sky-400 text-xs">View all →</button>
                </div>
                <div className="space-y-3">
                  {activeOrders.slice(0, 3).map(order => (
                    <OrderCard key={order.id} order={order}
                      onAction={(s) => updateStatusMutation.mutate({ orderId: order.id, newStatus: s })}
                      loading={updateStatusMutation.isPending} />
                  ))}
                </div>
              </div>
            )}
            {activeOrders.length === 0 && !loadingOrders && (
              <div className="text-center py-12">
                <Truck className="w-12 h-12 text-slate-700 mx-auto mb-3" />
                <p className="text-slate-400 font-medium">No active orders</p>
                <p className="text-slate-600 text-sm mt-1">Tap "New Order" to create one</p>
              </div>
            )}
          </>
        )}

        {/* ACTIVE */}
        {activeTab === 'active' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-bold">Active Orders ({activeOrders.length})</h2>
              {loadingOrders && <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />}
            </div>
            {activeOrders.length === 0
              ? <EmptyState icon={Truck} title="No active orders" />
              : activeOrders.map(order => (
                <OrderCard key={order.id} order={order} expanded
                  onAction={(s) => updateStatusMutation.mutate({ orderId: order.id, newStatus: s })}
                  loading={updateStatusMutation.isPending} />
              ))
            }
          </div>
        )}

        {/* HISTORY */}
        {activeTab === 'history' && (
          <div className="space-y-3">
            <h2 className="text-white font-bold">Order History</h2>
            <div className="flex gap-2">
              <Badge className="bg-white/10 text-slate-300 border-white/10 text-xs">Completed: {allStats.completed}</Badge>
              <Badge className="bg-white/10 text-slate-300 border-white/10 text-xs">Cancelled: {allStats.cancelled}</Badge>
            </div>
            {myOrders.filter(o => COMPLETED_STATUSES.has(o.status) || o.status === 'cancelled').length === 0
              ? <EmptyState icon={History} title="No history yet" />
              : myOrders
                  .filter(o => COMPLETED_STATUSES.has(o.status) || o.status === 'cancelled')
                  .slice(0, 50)
                  .map(order => <HistoryCard key={order.id} order={order} />)
            }
          </div>
        )}

        {/* EARNINGS */}
        {activeTab === 'earnings' && (
          <div className="space-y-4">
            <Card className="bg-gradient-to-br from-sky-600/20 to-blue-700/20 border-sky-500/30">
              <CardContent className="p-6 text-center">
                <p className="text-slate-400 text-sm mb-1">Today's Earnings</p>
                <p className="text-4xl font-black text-white">${todayEarnings.total.toFixed(2)}</p>
                <p className="text-sky-400 text-sm mt-2">{todayEarnings.deliveries} deliveries completed today</p>
              </CardContent>
            </Card>
            <div className="grid grid-cols-2 gap-3">
              <StatCard value={allStats.completed} label="Total Completed" color="text-emerald-400" />
              <StatCard value={allStats.cancelled} label="Total Cancelled" color="text-red-400" />
              <StatCard value={pendingPayment.length} label="Pending Payment" color="text-orange-400" />
              <StatCard
                value={`${allStats.completed > 0 ? Math.round((allStats.completed / allStats.total) * 100) : 0}%`}
                label="Completion Rate" color="text-sky-400" />
            </div>
            {pendingPayment.length > 0 && (
              <div>
                <h3 className="text-white font-bold text-sm mb-2">Pending Payment Collection</h3>
                {pendingPayment.map(order => (
                  <Card key={order.id} className="bg-orange-500/10 border-orange-500/30 mb-2">
                    <CardContent className="p-3 flex items-center justify-between">
                      <div>
                        <p className="text-white text-sm font-medium">{order.order_number || `#${order.id?.slice(0,8)}`}</p>
                        <p className="text-slate-400 text-xs">{order.customer_name}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-orange-400 font-bold">${(Number(order.total_amount)||0).toFixed(2)}</p>
                        <p className="text-slate-500 text-xs">{order.payment_method}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-slate-950/95 backdrop-blur border-t border-white/10 z-40">
        <div className="max-w-2xl mx-auto px-4 flex">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors relative ${
                  activeTab === tab.id ? 'text-sky-400' : 'text-slate-500 hover:text-slate-300'}`}>
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{tab.label}</span>
                {tab.badge > 0 && (
                  <span className="absolute top-2 right-1/4 w-4 h-4 bg-sky-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold">
                    {tab.badge > 9 ? '9+' : tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {showCreateOrder && (
        <CreateOrderDialog
          driverId={driverId} driverName={driverName}
          restaurantId={restaurantId} branchId={branchId}
          branchKey={assignedBranch?.branch_key} branchName={assignedBranch?.name}
          userEmail={user?.email}
          onClose={() => setShowCreateOrder(false)}
          onCreated={() => {
            setShowCreateOrder(false);
            qc.invalidateQueries({ queryKey: ['driver-orders', driverId] });
            toast.success('Order created and sent to kitchen!');
          }}
        />
      )}
    </div>
  );
}

// ── Order Card ─────────────────────────────────────────────────────────────────
function OrderCard({ order, onAction, loading, expanded = false }) {
  const status = String(order.status || '').toLowerCase();
  const statusConf = ORDER_STATUS[status] || ORDER_STATUS.pending;
  const nextAction = DRIVER_NEXT_ACTIONS[status] || null;
  const items = useMemo(() => {
    try { return JSON.parse(order.items_json || '[]'); } catch { return []; }
  }, [order.items_json]);

  return (
    <Card className="bg-white/5 border-white/10">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="text-white font-bold text-sm">{order.order_number || `#${order.id?.slice(0,8)}`}</p>
            <p className="text-slate-500 text-xs">{order.created_date ? format(new Date(order.created_date), 'h:mm a') : ''}</p>
          </div>
          <Badge className={`text-[10px] border ${statusConf.color}`}>{statusConf.label}</Badge>
        </div>
        {order.customer_name && <p className="text-slate-300 text-xs mb-1 font-medium">{order.customer_name}</p>}
        {order.customer_address && (
          <div className="flex items-start gap-1.5 mb-2">
            <MapPin className="w-3 h-3 text-slate-500 shrink-0 mt-0.5" />
            <p className="text-slate-400 text-xs">{order.customer_address}</p>
          </div>
        )}
        {expanded && items.length > 0 && (
          <div className="bg-white/5 rounded-lg p-2 mb-2 space-y-0.5">
            {items.map((item, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="text-slate-300">{item.name || item.product_name}</span>
                <span className="text-white font-bold">×{item.qty || item.quantity}</span>
              </div>
            ))}
          </div>
        )}
        {status === 'sent_to_kitchen' && (
          <div className="flex items-center gap-1.5 mb-2 text-blue-400">
            <ChefHat className="w-3.5 h-3.5" />
            <p className="text-xs">Waiting for kitchen approval…</p>
          </div>
        )}
        {status === 'cancelled' && order.kitchen_reject_reason && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-2 py-1 mb-2">
            <p className="text-red-400 text-xs">Rejected: {order.kitchen_reject_reason}</p>
          </div>
        )}
        <div className="flex items-center justify-between mt-2">
          <div>
            <span className="text-slate-400 text-xs">Total: </span>
            <span className="text-emerald-400 text-sm font-bold">${(Number(order.total_amount)||0).toFixed(2)}</span>
            {order.delivery_fee > 0 && (
              <span className="text-slate-500 text-xs ml-1">(+${Number(order.delivery_fee).toFixed(2)} fee)</span>
            )}
          </div>
          {nextAction && (
            <Button size="sm" onClick={() => onAction(nextAction.status)} disabled={loading}
              className={`${nextAction.color} text-white text-xs h-7 px-3`}>
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : nextAction.label}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── History Card ───────────────────────────────────────────────────────────────
function HistoryCard({ order }) {
  const status = String(order.status || '').toLowerCase();
  const statusConf = ORDER_STATUS[status] || ORDER_STATUS.pending;
  return (
    <Card className="bg-white/5 border-white/10">
      <CardContent className="p-3 flex items-center justify-between">
        <div>
          <p className="text-white text-sm font-medium">{order.order_number || `#${order.id?.slice(0,8)}`}</p>
          <p className="text-slate-500 text-xs">
            {order.customer_name && `${order.customer_name} · `}
            {order.updated_date ? format(new Date(order.updated_date), 'MMM d, h:mm a') : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="text-emerald-400 text-sm font-bold">${(Number(order.delivery_fee)||0).toFixed(2)}</p>
          <Badge className={`text-[9px] border ${statusConf.color}`}>{statusConf.label}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Create Order Dialog ────────────────────────────────────────────────────────
function CreateOrderDialog({ driverId, driverName, restaurantId, branchId, branchKey, branchName, userEmail, onClose, onCreated }) {
  const [form, setForm] = useState({
    customer_name: '', customer_phone: '', customer_address: '',
    items: [{ name: '', qty: 1, unit_price: 0 }],
    delivery_fee: 0, discount: 0, payment_method: 'cash', notes: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const updateItem = (idx, field, value) => setForm(f => {
    const items = [...f.items];
    items[idx] = { ...items[idx], [field]: value };
    return { ...f, items };
  });
  const addItem    = () => setForm(f => ({ ...f, items: [...f.items, { name: '', qty: 1, unit_price: 0 }] }));
  const removeItem = (idx) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const subtotal = form.items.reduce((s, i) => s + (Number(i.qty)||0)*(Number(i.unit_price)||0), 0);
  const total    = subtotal + Number(form.delivery_fee||0) - Number(form.discount||0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.customer_name.trim()) { toast.error('Customer name required'); return; }
    if (form.items.every(i => !i.name.trim())) { toast.error('At least one item required'); return; }
    setSubmitting(true);
    try {
      const orderNumber = generateOrderNumber();
      const itemsJson = JSON.stringify(
        form.items.filter(i => i.name.trim()).map(i => ({
          name: i.name, qty: Number(i.qty)||1,
          unit_price: Number(i.unit_price)||0,
          total: (Number(i.qty)||1)*(Number(i.unit_price)||0),
        }))
      );

      const { data: order, error: orderError } = await supabase
        .from('delivery_orders')
        .insert({
          order_number: orderNumber, restaurant_id: restaurantId,
          branch_id: branchId, branch: branchName || branchKey, branch_key: branchKey,
          tenant_id: restaurantId, driver_id: driverId, driver_name: driverName,
          customer_name: form.customer_name, customer_phone: form.customer_phone,
          customer_address: form.customer_address, items_json: itemsJson,
          subtotal, delivery_fee: Number(form.delivery_fee)||0,
          discount: Number(form.discount)||0, total_amount: total,
          payment_method: form.payment_method, notes: form.notes,
          status: 'sent_to_kitchen', kitchen_status: 'pending',
          payment_status: 'pending', created_by: userEmail,
        })
        .select('id')
        .single();
      if (orderError) throw orderError;

      // Create kitchen queue entry
      await supabase.from('kitchen_queues').insert({
        restaurant_id: restaurantId, branch_id: branchId, branch_key: branchKey,
        tenant_id: restaurantId, order_id: order.id, order_number: orderNumber,
        customer_name: form.customer_name, driver_id: driverId, driver_name: driverName,
        items_json: itemsJson, total_amount: total, notes: form.notes,
        status: 'pending', created_by: userEmail,
      });

      // Write status history
      await supabase.from('order_status_history').insert({
        order_id: order.id, restaurant_id: restaurantId, branch_id: branchId,
        tenant_id: restaurantId, from_status: null, to_status: 'sent_to_kitchen',
        changed_by: userEmail, changed_by_role: 'driver', notes: 'Order created by driver',
      });

      onCreated();
    } catch (err) {
      toast.error(err.message || 'Failed to create order');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-white/10 text-white max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Plus className="w-5 h-5 text-sky-400" /> New Delivery Order
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wide">Customer</h3>
            <div>
              <Label className="text-slate-300 text-xs">Name *</Label>
              <Input value={form.customer_name} onChange={e => setForm(f => ({...f, customer_name: e.target.value}))}
                placeholder="Customer name" required
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 mt-1" />
            </div>
            <div>
              <Label className="text-slate-300 text-xs">Phone</Label>
              <Input value={form.customer_phone} onChange={e => setForm(f => ({...f, customer_phone: e.target.value}))}
                placeholder="+1 234 567 8900"
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 mt-1" />
            </div>
            <div>
              <Label className="text-slate-300 text-xs">Delivery Address</Label>
              <Textarea value={form.customer_address} onChange={e => setForm(f => ({...f, customer_address: e.target.value}))}
                placeholder="Full delivery address" rows={2}
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 mt-1 resize-none" />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wide">Items</h3>
              <button type="button" onClick={addItem} className="text-sky-400 text-xs hover:text-sky-300">+ Add item</button>
            </div>
            {form.items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-5">
                  {idx === 0 && <Label className="text-slate-400 text-[10px]">Item name</Label>}
                  <Input value={item.name} onChange={e => updateItem(idx, 'name', e.target.value)}
                    placeholder="Item" className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 text-xs h-8" />
                </div>
                <div className="col-span-2">
                  {idx === 0 && <Label className="text-slate-400 text-[10px]">Qty</Label>}
                  <Input type="number" min="1" value={item.qty} onChange={e => updateItem(idx, 'qty', e.target.value)}
                    className="bg-white/5 border-white/10 text-white text-xs h-8" />
                </div>
                <div className="col-span-3">
                  {idx === 0 && <Label className="text-slate-400 text-[10px]">Price</Label>}
                  <Input type="number" min="0" step="0.01" value={item.unit_price} onChange={e => updateItem(idx, 'unit_price', e.target.value)}
                    className="bg-white/5 border-white/10 text-white text-xs h-8" />
                </div>
                <div className="col-span-2 flex justify-end">
                  {form.items.length > 1 && (
                    <button type="button" onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-300 p-1">
                      <XCircle className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-slate-300 text-xs">Delivery Fee</Label>
              <Input type="number" min="0" step="0.01" value={form.delivery_fee}
                onChange={e => setForm(f => ({...f, delivery_fee: e.target.value}))}
                className="bg-white/5 border-white/10 text-white mt-1" />
            </div>
            <div>
              <Label className="text-slate-300 text-xs">Discount</Label>
              <Input type="number" min="0" step="0.01" value={form.discount}
                onChange={e => setForm(f => ({...f, discount: e.target.value}))}
                className="bg-white/5 border-white/10 text-white mt-1" />
            </div>
          </div>

          <div>
            <Label className="text-slate-300 text-xs">Payment Method</Label>
            <Select value={form.payment_method} onValueChange={v => setForm(f => ({...f, payment_method: v}))}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white mt-1"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-slate-800 border-white/10">
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="network">Network / Card</SelectItem>
                <SelectItem value="credit">Credit</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-slate-300 text-xs">Notes (optional)</Label>
            <Textarea value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))}
              placeholder="Special instructions…" rows={2}
              className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 mt-1 resize-none" />
          </div>

          <div className="bg-white/5 rounded-lg p-3 flex items-center justify-between">
            <span className="text-slate-400 text-sm">Total</span>
            <span className="text-white font-black text-lg">${total.toFixed(2)}</span>
          </div>

          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1 border-white/10 text-slate-300">Cancel</Button>
            <Button type="submit" disabled={submitting} className="flex-1 bg-sky-600 hover:bg-sky-700 text-white">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create & Send to Kitchen'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Utility components ─────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <Loader2 className="w-7 h-7 text-sky-400 animate-spin" />
    </div>
  );
}
function StatCard({ value, label, color }) {
  return (
    <Card className="bg-white/5 border-white/10">
      <CardContent className="p-3 text-center">
        <p className={`text-2xl font-black ${color}`}>{value}</p>
        <p className="text-slate-500 text-xs mt-0.5">{label}</p>
      </CardContent>
    </Card>
  );
}
function EmptyState({ icon: Icon, title }) {
  return (
    <div className="text-center py-12">
      <Icon className="w-12 h-12 text-slate-700 mx-auto mb-3" />
      <p className="text-slate-400 font-medium">{title}</p>
    </div>
  );
}
