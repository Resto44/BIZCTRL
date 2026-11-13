import { purchaseOrderSupplierMessage } from '@/lib/purchaseOrderSupplierMessage';
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { toast } from 'sonner';
import { useLanguage } from '@/lib/LanguageContext';
import { useAuth } from '@/lib/AuthContext';
import PageHeader from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Plus, Mail, MessageCircle, Eye, Trash2, FileText, Zap, PackageCheck } from 'lucide-react';
import PurchaseOrderForm from '@/components/purchase-orders/PurchaseOrderForm';
import PurchaseOrderDetail from '@/components/purchase-orders/PurchaseOrderDetail';
import ReceiveOrderDialog from '@/components/purchase-orders/ReceiveOrderDialog';
import GenerateFromLowStock from '@/components/purchase-orders/GenerateFromLowStock';
import SupplierOrderOwnerVerification from '@/components/purchase-orders/SupplierOrderOwnerVerification';

const statusColors = {
  draft: 'bg-muted text-muted-foreground',
  sent: 'bg-blue-100 text-blue-700',
  partial: 'bg-amber-100 text-amber-700',
  received: 'bg-emerald-100 text-emerald-700',
  approved: 'bg-blue-100 text-blue-700',
  shipped: 'bg-violet-100 text-violet-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function PurchaseOrders() {
  const { t, currency } = useLanguage();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [viewingOrder, setViewingOrder] = useState(null);
  const [receivingOrder, setReceivingOrder] = useState(null);
  const [verifyingOrderId,setVerifyingOrderId]=useState(null);
  const [showLowStock, setShowLowStock] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(null);

  // The canonical purchase_orders table has created_date, not date.
  // Keep the Owner's read strictly tenant-scoped so shipped supplier orders
  // remain visible for verification. RLS still enforces the caller's scope.
  const { data: orders = [], isLoading, isError:ordersError, refetch:refetchOrders } = useQuery({
    queryKey: ['purchase_orders',user?.restaurant_id],
    enabled: Boolean(user?.restaurant_id),
    queryFn: async () => {
      const {data,error}=await supabase.from('purchase_orders').select('*')
        .eq('restaurant_id',user.restaurant_id)
        .order('created_date',{ascending:false}).limit(500);
      if(error)throw error;
      return data||[];
    },
    refetchInterval: 12000,
    refetchOnWindowFocus: true,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.PurchaseOrder.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchase_orders'] }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }) => base44.entities.PurchaseOrder.update(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchase_orders'] }),
  });


  const handleSendEmail = async (order) => {
    const body = purchaseOrderSupplierMessage(order,currency);

    setSendingEmail(order.id);
    await base44.integrations.Core.SendEmail({
      to: order.supplier_email,
      subject: `Purchase Order #${order.order_number || order.id.slice(-6).toUpperCase()} from ${order.branch}`,
      body,
    });
    updateStatusMutation.mutate({ id: order.id, status: 'sent' });
    setSendingEmail(null);
  };

  const handleWhatsApp = (order) => {
    const message = purchaseOrderSupplierMessage(order,currency);
    const phone = (order.supplier_phone || '').replace(/\D/g, '');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`);
    updateStatusMutation.mutate({ id: order.id, status: 'sent' });
  };

  if (viewingOrder) {
    return <PurchaseOrderDetail order={viewingOrder} onBack={() => setViewingOrder(null)} />;
  }

  if (showForm || editingOrder) {
    return (
      <PurchaseOrderForm
        order={editingOrder}
        onClose={() => { setShowForm(false); setEditingOrder(null); }}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
          setShowForm(false);
          setEditingOrder(null);
        }}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Purchase Orders"
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowLowStock(true)}>
              <Zap className="w-4 h-4 mr-1 text-amber-500" /> From Low Stock
            </Button>
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4 mr-1" /> New Order
            </Button>
          </div>
        }
      />

      {ordersError && <div role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        Could not load purchase orders. <Button type="button" variant="outline" size="sm"
          className="ms-2 min-h-10" onClick={()=>refetchOrders()}>Retry</Button>
      </div>}
      {isLoading ? (
        <div className="text-center text-muted-foreground py-10">Loading...</div>
      ) : ordersError ? null : orders.length === 0 ? (
        <div className="text-center text-muted-foreground py-16">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No purchase orders yet</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowLowStock(true)}>
            <Zap className="w-4 h-4 mr-1 text-amber-500" /> Generate from Low Stock
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map(order => {
            const items = (() => { try { return JSON.parse(order.items || '[]'); } catch { return []; } })();
            const canReceive = order.status === 'sent' || order.status === 'partial';
            return (
              <Card key={order.id} className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="font-semibold text-sm">#{order.order_number || order.id.slice(-6).toUpperCase()}</p>
                    <p className="text-sm text-muted-foreground">{order.supplier_name}</p>
                    <p className="text-xs text-muted-foreground">{order.branch} · {order.date}</p>
                    {order.expected_delivery && (
                      <p className="text-xs text-muted-foreground">Expected: {order.expected_delivery}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge className={`text-xs ${statusColors[order.status]}`}>{order.status}</Badge>
                    <p className="text-sm font-semibold">{currency}{(order.total_amount || 0).toFixed(2)}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-3">{items.length} item(s)</p>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => setViewingOrder(order)}>
                    <Eye className="w-3 h-3 mr-1" /> View
                  </Button>

                  {order.status === 'draft' && (
                    <Button size="sm" variant="outline" onClick={() => setEditingOrder(order)}>
                      Edit
                    </Button>
                  )}

                  {/* Send via Email (uses integration) */}
                  {(order.status === 'draft' || order.status === 'sent') && order.supplier_email && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={sendingEmail === order.id}
                      onClick={() => handleSendEmail(order)}
                    >
                      <Mail className="w-3 h-3 mr-1" />
                      {sendingEmail === order.id ? 'Sending...' : 'Email'}
                    </Button>
                  )}

                  {/* Send via WhatsApp */}
                  {(order.status === 'draft' || order.status === 'sent') && order.supplier_phone && (
                    <Button size="sm" variant="outline" className="text-emerald-600" onClick={() => handleWhatsApp(order)}>
                      <MessageCircle className="w-3 h-3 mr-1" /> WhatsApp
                    </Button>
                  )}

                  {/* Supplier marked shipment: only Owner can verify every delivered product. */}
                  {order.status==='shipped' && order.supplier_id && user?.role==='owner' && (
                    <Button type="button" size="sm" variant="outline"
                      className="min-h-11 border-emerald-300 text-emerald-800"
                      onClick={()=>setVerifyingOrderId(v=>v===order.id?null:order.id)}>
                      <PackageCheck className="me-1 size-4"/>Verify delivered products
                    </Button>
                  )}
                  {/* Receive — opens partial receipt dialog */}
                  {canReceive && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-emerald-600"
                      onClick={() => setReceivingOrder(order)}
                    >
                      <PackageCheck className="w-3 h-3 mr-1" /> Receive
                    </Button>
                  )}

                  <Button size="sm" variant="ghost" className="text-destructive ml-auto" onClick={() => deleteMutation.mutate(order.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
                {verifyingOrderId===order.id && user?.role==='owner' &&
                  <SupplierOrderOwnerVerification order={order} onCancel={()=>setVerifyingOrderId(null)}
                    onConfirmed={()=>{setVerifyingOrderId(null);queryClient.invalidateQueries({queryKey:['purchase_orders']});}}/>}
              </Card>
            );
          })}
        </div>
      )}

      {/* Receive Order Dialog */}
      {receivingOrder && (
        <ReceiveOrderDialog
          order={receivingOrder}
          open={!!receivingOrder}
          onClose={() => setReceivingOrder(null)}
        />
      )}

      {/* Generate from Low Stock Dialog */}
      <GenerateFromLowStock
        open={showLowStock}
        onClose={() => setShowLowStock(false)}
        onCreated={() => setShowLowStock(false)}
      />
    </div>
  );
}