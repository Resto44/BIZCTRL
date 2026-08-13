/**
 * Order Management V2 — Manager Dashboard
 * Smart Restaurant ERP — Integrated Module
 * Full order management, filters, bulk actions, analytics.
 */
import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTenant } from '@/lib/TenantContext';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';
import {
  Package, Search, Filter, RefreshCw, ChevronRight, CheckCircle2,
  X, Clock, Bike, ChefHat, Truck, Home, DollarSign, TrendingUp,
  Users, Star, BarChart2, Download, Printer, Eye, UserCheck,
  AlertTriangle, Calendar
} from 'lucide-react';
import { useBranchOrders } from '@/hooks/useOnlineOrdering';
import { updateOrderStatus, assignDriver, ORDER_STATUS, PAYMENT_METHODS } from '@/lib/onlineOrderingService';
import { useNavigate } from 'react-router-dom';

// ── Status Badge ───────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const config = {
    pending:     { label: 'Pending',     class: 'bg-slate-100 text-slate-700' },
    accepted:    { label: 'Accepted',    class: 'bg-blue-100 text-blue-700' },
    preparing:   { label: 'Preparing',   class: 'bg-amber-100 text-amber-700' },
    cooking:     { label: 'Cooking',     class: 'bg-orange-100 text-orange-700' },
    ready:       { label: 'Ready',       class: 'bg-green-100 text-green-700' },
    assigned:    { label: 'Assigned',    class: 'bg-indigo-100 text-indigo-700' },
    picked_up:   { label: 'Picked Up',   class: 'bg-violet-100 text-violet-700' },
    on_the_way:  { label: 'On the Way',  class: 'bg-blue-100 text-blue-700' },
    arrived:     { label: 'Arrived',     class: 'bg-purple-100 text-purple-700' },
    delivered:   { label: 'Delivered',   class: 'bg-emerald-100 text-emerald-700' },
    cancelled:   { label: 'Cancelled',   class: 'bg-red-100 text-red-700' },
    refunded:    { label: 'Refunded',    class: 'bg-pink-100 text-pink-700' },
  };
  const cfg = config[status] || { label: status, class: 'bg-gray-100 text-gray-700' };
  return <Badge className={`text-xs font-medium ${cfg.class}`}>{cfg.label}</Badge>;
}

// ── Order Row ──────────────────────────────────────────────────────────────
function OrderRow({ order, onView, onAssignDriver, drivers }) {
  return (
    <tr className="border-b hover:bg-muted/30 transition-colors">
      <td className="py-3 px-4">
        <div>
          <p className="font-medium text-sm">{order.order_number}</p>
          <p className="text-xs text-muted-foreground">{format(new Date(order.created_date), 'MMM d, HH:mm')}</p>
        </div>
      </td>
      <td className="py-3 px-4">
        <div>
          <p className="text-sm font-medium">{order.customer_name || '—'}</p>
          <p className="text-xs text-muted-foreground">{order.customer_phone || ''}</p>
        </div>
      </td>
      <td className="py-3 px-4">
        <StatusBadge status={order.status} />
      </td>
      <td className="py-3 px-4 text-sm">
        {PAYMENT_METHODS.find(p => p.id === order.payment_method)?.label_en || order.payment_method || '—'}
      </td>
      <td className="py-3 px-4">
        <span className="font-bold text-primary">{order.total_amount?.toFixed(2)} SAR</span>
      </td>
      <td className="py-3 px-4">
        {order.driver_name ? (
          <span className="text-sm">{order.driver_name}</span>
        ) : (
          order.status === ORDER_STATUS.READY ? (
            <Select onValueChange={driverId => onAssignDriver(order.id, driverId)}>
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue placeholder="Assign" />
              </SelectTrigger>
              <SelectContent>
                {drivers.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.full_name || d.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="py-3 px-4">
        <Button variant="ghost" size="sm" onClick={() => onView(order)}>
          <Eye className="w-4 h-4" />
        </Button>
      </td>
    </tr>
  );
}

// ── Order Detail Dialog ────────────────────────────────────────────────────
function OrderDetailDialog({ order, open, onClose, onStatusUpdate, drivers, orgId, restaurantId }) {
  const [items, setItems] = useState([]);

  React.useEffect(() => {
    if (order?.items_json) {
      try { setItems(JSON.parse(order.items_json)); } catch { setItems([]); }
    }
  }, [order?.items_json]);

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Order {order.order_number}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <StatusBadge status={order.status} />
            <span className="text-sm text-muted-foreground">{format(new Date(order.created_date), 'MMM d, yyyy HH:mm')}</span>
          </div>

          {/* Customer */}
          <div className="p-3 bg-muted/50 rounded-lg space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase">Customer</p>
            <p className="font-medium">{order.customer_name || '—'}</p>
            <p className="text-sm text-muted-foreground">{order.customer_phone}</p>
            <p className="text-sm text-muted-foreground">{order.customer_address}</p>
          </div>

          {/* Items */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase">Items</p>
            {items.map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm">
                <span>{item.qty}× {item.name}</span>
                <span>{(item.unit_price * item.qty)?.toFixed(2)} SAR</span>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="border-t pt-3 space-y-1 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span>{order.subtotal?.toFixed(2)} SAR</span></div>
            <div className="flex justify-between"><span>Delivery Fee</span><span>{order.delivery_fee?.toFixed(2)} SAR</span></div>
            <div className="flex justify-between"><span>VAT</span><span>{order.tax_amount?.toFixed(2)} SAR</span></div>
            {(order.discount_amount || 0) > 0 && (
              <div className="flex justify-between text-green-600"><span>Discount</span><span>-{order.discount_amount?.toFixed(2)} SAR</span></div>
            )}
            <div className="flex justify-between font-bold text-base border-t pt-1">
              <span>Total</span><span className="text-primary">{order.total_amount?.toFixed(2)} SAR</span>
            </div>
          </div>

          {/* Driver */}
          {order.driver_name && (
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-xs font-semibold text-blue-600 uppercase mb-1">Driver</p>
              <p className="font-medium">{order.driver_name}</p>
            </div>
          )}

          {/* Notes */}
          {order.customer_notes && (
            <div className="p-3 bg-amber-50 rounded-lg">
              <p className="text-xs font-semibold text-amber-600 uppercase mb-1">Notes</p>
              <p className="text-sm">{order.customer_notes}</p>
            </div>
          )}

          {/* Actions */}
          {order.status !== ORDER_STATUS.DELIVERED && order.status !== ORDER_STATUS.CANCELLED && (
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => { onStatusUpdate(order.id, ORDER_STATUS.CANCELLED); onClose(); }}
              >
                <X className="w-4 h-4 mr-1" /> Cancel Order
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Analytics Cards ────────────────────────────────────────────────────────
function AnalyticsCards({ orders }) {
  const delivered = orders.filter(o => o.status === ORDER_STATUS.DELIVERED);
  const cancelled = orders.filter(o => o.status === ORDER_STATUS.CANCELLED);
  const revenue = delivered.reduce((s, o) => s + (o.total_amount || 0), 0);
  const avgOrder = delivered.length > 0 ? revenue / delivered.length : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Package className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground">Total Orders</span>
          </div>
          <p className="text-2xl font-bold">{orders.length}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-green-600" />
            <span className="text-xs text-muted-foreground">Revenue</span>
          </div>
          <p className="text-2xl font-bold text-green-600">{revenue.toFixed(0)} SAR</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            <span className="text-xs text-muted-foreground">Avg Order</span>
          </div>
          <p className="text-2xl font-bold text-blue-600">{avgOrder.toFixed(0)} SAR</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <X className="w-4 h-4 text-red-500" />
            <span className="text-xs text-muted-foreground">Cancelled</span>
          </div>
          <p className="text-2xl font-bold text-red-500">{cancelled.length}</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Order Management V2 ───────────────────────────────────────────────
export default function OrderManagementV2() {
  const { user } = useAuth?.() || {};
  const { restaurant } = useTenant?.() || {};
  const { lang } = useLanguage?.() || { lang: 'en' };
  const qc = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('today');
  const [branchFilter, setBranchFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState(new Set());

  const branchId = restaurant?.branches?.[0]?.id || restaurant?.id;

  // Load all orders for this restaurant
  const { data: allOrders = [], isLoading } = useQuery({
    queryKey: ['all_orders', restaurant?.id],
    queryFn: () => base44.entities.Order.filter({ restaurant_id: restaurant?.id }),
    enabled: !!restaurant?.id,
    refetchInterval: 10000,
  });

  // Load active canonical drivers for the current branch. Drivers are managed
  // records; they are not authenticated portal users.
  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers', restaurant?.id, branchId],
    queryFn: async () => {
      const records = await base44.entities.Driver.filter({
        restaurant_id: restaurant?.id,
        branch_id: branchId,
      }, 'full_name', 500);
      return (records || []).filter((driver) => driver.is_active !== false && driver.status !== 'inactive');
    },
    enabled: !!restaurant?.id && !!branchId,
  });

  const updateMutation = useMutation({
    mutationFn: ({ orderId, status }) =>
      updateOrderStatus(orderId, status, user?.id, 'manager', user?.email, restaurant?.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all_orders'] });
      toast.success('Order updated');
    },
  });

  const assignMutation = useMutation({
    mutationFn: ({ orderId, driverId }) => {
      const driver = drivers.find(d => d.id === driverId);
      return assignDriver(orderId, driverId, driver?.full_name || driver?.email, user?.email, restaurant?.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all_orders'] });
      toast.success('Driver assigned');
    },
  });

  // Filter orders
  const filteredOrders = useMemo(() => {
    let list = allOrders;

    // Date filter
    const now = new Date();
    if (dateFilter === 'today') {
      list = list.filter(o => new Date(o.created_date) >= startOfDay(now));
    } else if (dateFilter === 'yesterday') {
      const yesterday = subDays(now, 1);
      list = list.filter(o => {
        const d = new Date(o.created_date);
        return d >= startOfDay(yesterday) && d <= endOfDay(yesterday);
      });
    } else if (dateFilter === 'week') {
      list = list.filter(o => new Date(o.created_date) >= subDays(now, 7));
    }

    // Status filter
    if (statusFilter !== 'all') list = list.filter(o => o.status === statusFilter);

    // Payment filter
    if (paymentFilter !== 'all') list = list.filter(o => o.payment_method === paymentFilter);

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(o =>
        (o.order_number || '').toLowerCase().includes(q) ||
        (o.customer_name || '').toLowerCase().includes(q) ||
        (o.customer_phone || '').includes(q)
      );
    }

    return list.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
  }, [allOrders, dateFilter, statusFilter, paymentFilter, searchQuery]);

  const activeOrders = allOrders.filter(o =>
    [ORDER_STATUS.PENDING, ORDER_STATUS.ACCEPTED, ORDER_STATUS.PREPARING, ORDER_STATUS.COOKING,
     ORDER_STATUS.READY, ORDER_STATUS.ASSIGNED, ORDER_STATUS.PICKED_UP, ORDER_STATUS.ON_THE_WAY, ORDER_STATUS.ARRIVED]
    .includes(o.status)
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-background sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="font-bold text-xl flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              Order Management V2
            </h1>
            <p className="text-xs text-muted-foreground">{restaurant?.name} · Real-time</p>
          </div>
          <div className="flex items-center gap-2">
            {activeOrders.length > 0 && (
              <Badge className="bg-primary text-white animate-pulse">
                {activeOrders.length} Active
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ['all_orders'] })}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-4 space-y-4">
        {/* Analytics */}
        <AnalyticsCards orders={filteredOrders} />

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search orders, customers..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="preparing">Preparing</SelectItem>
                  <SelectItem value="ready">Ready</SelectItem>
                  <SelectItem value="on_the_way">On the Way</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Payment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Payments</SelectItem>
                  {PAYMENT_METHODS.map(pm => (
                    <SelectItem key={pm.id} value={pm.id}>{pm.label_en}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Orders Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Orders ({filteredOrders.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center h-48">
                <RefreshCw className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No orders found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="py-3 px-4 text-left font-semibold text-xs text-muted-foreground uppercase">Order</th>
                      <th className="py-3 px-4 text-left font-semibold text-xs text-muted-foreground uppercase">Customer</th>
                      <th className="py-3 px-4 text-left font-semibold text-xs text-muted-foreground uppercase">Status</th>
                      <th className="py-3 px-4 text-left font-semibold text-xs text-muted-foreground uppercase">Payment</th>
                      <th className="py-3 px-4 text-left font-semibold text-xs text-muted-foreground uppercase">Total</th>
                      <th className="py-3 px-4 text-left font-semibold text-xs text-muted-foreground uppercase">Driver</th>
                      <th className="py-3 px-4 text-left font-semibold text-xs text-muted-foreground uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map(order => (
                      <OrderRow
                        key={order.id}
                        order={order}
                        onView={o => { setSelectedOrder(o); setShowDetail(true); }}
                        onAssignDriver={(orderId, driverId) => assignMutation.mutate({ orderId, driverId })}
                        drivers={drivers}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Order Detail Dialog */}
      <OrderDetailDialog
        order={selectedOrder}
        open={showDetail}
        onClose={() => setShowDetail(false)}
        onStatusUpdate={(orderId, status) => updateMutation.mutate({ orderId, status })}
        drivers={drivers}
        orgId={user?.email}
        restaurantId={restaurant?.id}
      />
    </div>
  );
}
