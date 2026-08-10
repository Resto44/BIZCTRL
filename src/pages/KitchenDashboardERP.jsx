/**
 * KitchenDashboardERP — Canonical Kitchen Portal
 *
 * CANONICAL: This is the single source of truth for the Kitchen ERP portal.
 * KitchenDashboardV2.jsx and KitchenDashboard.jsx have been removed.
 *
 * Kitchen workflow:
 *   RECEIVE ORDER (pending) → APPROVE / REJECT →
 *   START PREPARATION (preparing) → MARK READY (ready_for_pickup)
 *
 * Security:
 *   - Kitchen sees ONLY orders for their assigned branch
 *   - Only kitchen/manager/owner can approve or reject orders
 *   - Driver CANNOT set kitchen_status (enforced by DB RPC)
 *
 * Realtime:
 *   - Single channel scoped to branch_id on delivery_orders + kitchen_queues
 *   - No duplicate subscriptions; cleanup on unmount
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import BranchSelector from '@/components/shared/BranchSelector';
import {
  ChefHat, Clock, CheckCircle2, XCircle, Flame, Package,
  RefreshCw, LogOut, Loader2, AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const STATUS_CONFIG = {
  pending:          { label: 'New',       color: 'bg-amber-500/20 text-amber-400 border-amber-500/30',   dot: 'bg-amber-400' },
  sent_to_kitchen:  { label: 'New',       color: 'bg-amber-500/20 text-amber-400 border-amber-500/30',   dot: 'bg-amber-400' },
  preparing:        { label: 'Preparing', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',      dot: 'bg-blue-400' },
  ready_for_pickup: { label: 'Ready',     color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', dot: 'bg-emerald-400' },
  kitchen_approved: { label: 'Approved',  color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', dot: 'bg-emerald-400' },
  cancelled:        { label: 'Rejected',  color: 'bg-red-500/20 text-red-400 border-red-500/30',         dot: 'bg-red-400' },
};

// Statuses that kitchen needs to act on
const KITCHEN_ACTIVE_STATUSES = ['pending', 'sent_to_kitchen', 'kitchen_approved', 'preparing', 'ready_for_pickup'];

export default function KitchenDashboardERP() {
  const { user, logout } = useAuth();
  const qc = useQueryClient();
  const [activeBranch, setActiveBranch] = useState(null);
  const [branchSelected, setBranchSelected] = useState(false);
  const [rejectDialog, setRejectDialog] = useState(null); // { orderId, orderNumber }
  const [rejectReason, setRejectReason] = useState('');

  // Restore branch from session
  useEffect(() => {
    const id   = sessionStorage.getItem('erp_active_branch_id');
    const name = sessionStorage.getItem('erp_active_branch_name');
    if (id && name) { setActiveBranch({ id, name }); setBranchSelected(true); }
  }, []);

  if (!branchSelected) {
    return (
      <BranchSelector onSelect={b => {
        setActiveBranch(b);
        setBranchSelected(true);
        sessionStorage.setItem('erp_active_branch_id', b.id);
        sessionStorage.setItem('erp_active_branch_name', b.name);
      }} />
    );
  }

  const branchId = activeBranch?.id;

  return (
    <KitchenContent
      branchId={branchId}
      branchName={activeBranch?.name}
      user={user}
      logout={logout}
      qc={qc}
      rejectDialog={rejectDialog}
      setRejectDialog={setRejectDialog}
      rejectReason={rejectReason}
      setRejectReason={setRejectReason}
    />
  );
}

function KitchenContent({ branchId, branchName, user, logout, qc, rejectDialog, setRejectDialog, rejectReason, setRejectReason }) {
  // Fetch delivery orders for this branch that kitchen needs to handle
  const { data: orders = [], isLoading, refetch } = useQuery({
    queryKey: ['kitchen-orders', branchId],
    queryFn: async () => {
      if (!branchId) return [];
      const { data, error } = await supabase
        .from('delivery_orders')
        .select(`
          id, restaurant_id, branch_id, branch_key, branch,
          driver_id, driver_name, order_number,
          customer_name, customer_phone, customer_address,
          items_json, total_amount, delivery_fee, notes,
          status, kitchen_status, kitchen_approved_at, kitchen_rejected_at,
          kitchen_reject_reason, created_date, updated_date
        `)
        .eq('branch_id', branchId)
        .in('status', KITCHEN_ACTIVE_STATUSES)
        .order('created_date', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId,
    staleTime: 15000,
  });

  // Realtime subscription for this branch
  useEffect(() => {
    if (!branchId) return;
    const channel = supabase
      .channel(`kitchen-erp-${branchId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_orders', filter: `branch_id=eq.${branchId}` },
        () => qc.invalidateQueries({ queryKey: ['kitchen-orders', branchId] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kitchen_queues', filter: `branch_id=eq.${branchId}` },
        () => qc.invalidateQueries({ queryKey: ['kitchen-orders', branchId] }))
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [branchId, qc]);

  // Approve order (kitchen_approved → driver can pick up)
  const approveMutation = useMutation({
    mutationFn: async (orderId) => {
      const { error } = await supabase.rpc('approve_kitchen_order', { p_order_id: orderId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Order approved! Driver notified.');
      qc.invalidateQueries({ queryKey: ['kitchen-orders', branchId] });
    },
    onError: (err) => toast.error(err.message || 'Approval failed'),
  });

  // Reject order
  const rejectMutation = useMutation({
    mutationFn: async ({ orderId, reason }) => {
      const { error } = await supabase.rpc('reject_kitchen_order', { p_order_id: orderId, p_reason: reason });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Order rejected.');
      setRejectDialog(null);
      setRejectReason('');
      qc.invalidateQueries({ queryKey: ['kitchen-orders', branchId] });
    },
    onError: (err) => toast.error(err.message || 'Rejection failed'),
  });

  // Update status (preparing, ready_for_pickup)
  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, newStatus }) => {
      const order = orders.find(o => o.id === orderId);
      const { error } = await supabase
        .from('delivery_orders')
        .update({ status: newStatus, kitchen_status: newStatus === 'ready_for_pickup' ? 'ready' : 'preparing', updated_date: new Date().toISOString() })
        .eq('id', orderId)
        .eq('branch_id', branchId);
      if (error) throw error;
      // Update kitchen_queues
      await supabase.from('kitchen_queues')
        .update({ status: newStatus === 'ready_for_pickup' ? 'ready' : 'preparing', updated_at: new Date().toISOString() })
        .eq('order_id', orderId);
      // Write status history
      await supabase.from('order_status_history').insert({
        order_id: orderId, restaurant_id: order?.restaurant_id, branch_id: branchId,
        tenant_id: order?.restaurant_id, from_status: order?.status, to_status: newStatus,
        changed_by: user?.email, changed_by_role: 'kitchen',
      });
    },
    onSuccess: (_, { newStatus }) => {
      const labels = { preparing: 'Preparation started!', ready_for_pickup: 'Order ready for pickup!' };
      toast.success(labels[newStatus] || 'Updated');
      qc.invalidateQueries({ queryKey: ['kitchen-orders', branchId] });
    },
    onError: (err) => toast.error(err.message || 'Update failed'),
  });

  // Categorize orders
  const newOrders      = useMemo(() => orders.filter(o => ['pending','sent_to_kitchen'].includes(o.status)), [orders]);
  const approvedOrders = useMemo(() => orders.filter(o => o.status === 'kitchen_approved'), [orders]);
  const preparingOrders = useMemo(() => orders.filter(o => o.status === 'preparing'), [orders]);
  const readyOrders    = useMemo(() => orders.filter(o => o.status === 'ready_for_pickup'), [orders]);

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-600 to-rose-700 flex items-center justify-center">
              <ChefHat className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm">Kitchen Dashboard</p>
              <p className="text-slate-500 text-xs">{branchName}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              {newOrders.length} new
              <span className="w-2 h-2 rounded-full bg-blue-400 ml-2" />
              {preparingOrders.length} preparing
              <span className="w-2 h-2 rounded-full bg-emerald-400 ml-2" />
              {readyOrders.length} ready
            </div>
            <button onClick={() => refetch()} className="p-2 text-slate-500 hover:text-slate-300">
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={logout} className="p-2 text-slate-500 hover:text-slate-300">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading orders…
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-16">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
            <p className="text-white font-bold text-lg">Kitchen Clear!</p>
            <p className="text-slate-500 text-sm mt-1">No active orders right now.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

            {/* NEW ORDERS — require approve/reject */}
            <KitchenColumn
              title="NEW ORDERS"
              count={newOrders.length}
              dotColor="bg-amber-400 animate-pulse"
              titleColor="text-amber-400"
            >
              {newOrders.map(order => (
                <KitchenOrderCard key={order.id} order={order}>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" onClick={() => approveMutation.mutate(order.id)}
                      disabled={approveMutation.isPending}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8">
                      {approveMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <><CheckCircle2 className="w-3 h-3 mr-1" />Approve</>}
                    </Button>
                    <Button size="sm" onClick={() => setRejectDialog({ orderId: order.id, orderNumber: order.order_number })}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs h-8">
                      <XCircle className="w-3 h-3 mr-1" />Reject
                    </Button>
                  </div>
                </KitchenOrderCard>
              ))}
            </KitchenColumn>

            {/* APPROVED — ready to start preparing */}
            <KitchenColumn
              title="APPROVED"
              count={approvedOrders.length}
              dotColor="bg-emerald-400"
              titleColor="text-emerald-400"
            >
              {approvedOrders.map(order => (
                <KitchenOrderCard key={order.id} order={order}>
                  <Button size="sm" onClick={() => updateStatusMutation.mutate({ orderId: order.id, newStatus: 'preparing' })}
                    disabled={updateStatusMutation.isPending}
                    className="w-full mt-3 bg-blue-600 hover:bg-blue-700 text-white text-xs h-8">
                    <Flame className="w-3 h-3 mr-1" />Start Preparing
                  </Button>
                </KitchenOrderCard>
              ))}
            </KitchenColumn>

            {/* PREPARING */}
            <KitchenColumn
              title="PREPARING"
              count={preparingOrders.length}
              dotColor="bg-blue-400"
              titleColor="text-blue-400"
            >
              {preparingOrders.map(order => (
                <KitchenOrderCard key={order.id} order={order}>
                  <Button size="sm" onClick={() => updateStatusMutation.mutate({ orderId: order.id, newStatus: 'ready_for_pickup' })}
                    disabled={updateStatusMutation.isPending}
                    className="w-full mt-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8">
                    <CheckCircle2 className="w-3 h-3 mr-1" />Mark Ready
                  </Button>
                </KitchenOrderCard>
              ))}
            </KitchenColumn>

            {/* READY FOR PICKUP */}
            <KitchenColumn
              title="READY FOR PICKUP"
              count={readyOrders.length}
              dotColor="bg-teal-400"
              titleColor="text-teal-400"
            >
              {readyOrders.map(order => (
                <KitchenOrderCard key={order.id} order={order} readyPulse />
              ))}
            </KitchenColumn>

          </div>
        )}
      </main>

      {/* Reject Dialog */}
      {rejectDialog && (
        <Dialog open onOpenChange={() => { setRejectDialog(null); setRejectReason(''); }}>
          <DialogContent className="bg-slate-900 border-white/10 text-white max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-400" />
                Reject Order {rejectDialog.orderNumber}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label className="text-slate-300 text-xs">Reason for rejection</Label>
                <Textarea
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  placeholder="e.g. Item out of stock, unable to prepare…"
                  rows={3}
                  className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 mt-1 resize-none"
                />
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => { setRejectDialog(null); setRejectReason(''); }}
                  className="flex-1 border-white/10 text-slate-300">Cancel</Button>
                <Button onClick={() => rejectMutation.mutate({ orderId: rejectDialog.orderId, reason: rejectReason })}
                  disabled={rejectMutation.isPending}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white">
                  {rejectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Reject Order'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ── Kitchen Column ─────────────────────────────────────────────────────────────
function KitchenColumn({ title, count, dotColor, titleColor, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
        <h2 className={`${titleColor} font-bold text-xs`}>{title} ({count})</h2>
      </div>
      <div className="space-y-3">
        {count === 0
          ? <p className="text-slate-600 text-xs text-center py-4">No orders</p>
          : children
        }
      </div>
    </div>
  );
}

// ── Kitchen Order Card ─────────────────────────────────────────────────────────
function KitchenOrderCard({ order, children, readyPulse = false }) {
  const elapsed = order.created_date
    ? Math.floor((Date.now() - new Date(order.created_date).getTime()) / 60000)
    : 0;
  const isUrgent = elapsed > 15;
  const items = useMemo(() => {
    try { return JSON.parse(order.items_json || '[]'); } catch { return []; }
  }, [order.items_json]);

  return (
    <Card className={`border ${isUrgent ? 'border-red-500/40 bg-red-500/5' : readyPulse ? 'border-teal-500/40 bg-teal-500/5' : 'border-white/10 bg-white/5'}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="text-white font-bold text-sm">{order.order_number || `#${order.id?.slice(0,6)}`}</p>
            <div className={`flex items-center gap-1 text-xs mt-0.5 ${isUrgent ? 'text-red-400' : 'text-slate-500'}`}>
              <Clock className="w-3 h-3" />{elapsed}m ago{isUrgent && ' ⚠️'}
            </div>
          </div>
          {order.driver_name && (
            <Badge className="bg-white/10 text-slate-300 border-white/10 text-[10px]">
              🚴 {order.driver_name}
            </Badge>
          )}
        </div>

        {order.customer_name && (
          <p className="text-slate-400 text-xs mb-1">👤 {order.customer_name}</p>
        )}

        {items.length > 0 && (
          <div className="space-y-0.5 mb-2">
            {items.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-slate-300">{item.name || item.product_name}</span>
                <span className="text-white font-bold">×{item.qty || item.quantity}</span>
              </div>
            ))}
          </div>
        )}

        {order.notes && (
          <p className="text-amber-300 text-xs bg-amber-500/10 rounded-lg px-2 py-1 mb-2">
            📝 {order.notes}
          </p>
        )}

        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">Total</span>
          <span className="text-emerald-400 font-bold">${(Number(order.total_amount)||0).toFixed(2)}</span>
        </div>

        {children}
      </CardContent>
    </Card>
  );
}
