import React from 'react';
import {purchaseOrderSupplierMessage} from '@/lib/purchaseOrderSupplierMessage';
import { useLanguage } from '@/lib/LanguageContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Mail, MessageCircle } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';

const statusColors = {
  draft: 'bg-muted text-muted-foreground',
  sent: 'bg-blue-100 text-blue-700',
  received: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function PurchaseOrderDetail({ order, onBack }) {
  const { currency } = useLanguage();
  const items = (() => { try { return JSON.parse(order.items || '[]'); } catch { return []; } })();

  const getMessage = () => purchaseOrderSupplierMessage(order,currency);

  return (
    <div>
      <PageHeader
        title={`Order #${order.order_number || order.id.slice(-6).toUpperCase()}`}
        action={<Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>}
      />

      <div className="space-y-4">
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{order.supplier_name}</h3>
            <Badge className={statusColors[order.status]}>{order.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">Branch: {order.branch}</p>
          <p className="text-sm text-muted-foreground">Date: {order.date}</p>
          {order.expected_delivery && <p className="text-sm text-muted-foreground">Expected: {order.expected_delivery}</p>}
          {order.notes && <p className="text-sm italic text-muted-foreground">"{order.notes}"</p>}
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold mb-3">Items</h3>
          <div className="space-y-2">
            {items.map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium">{item.product_name}</p>
                  <p className="text-xs text-muted-foreground">{item.qty} {item.unit} × {currency}{item.unit_price || 0}</p>
                </div>
                <p className="text-sm font-semibold">{currency}{((item.qty || 0) * (item.unit_price || 0)).toFixed(2)}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t flex justify-between font-bold">
            <span>Total</span>
            <span>{currency}{(order.total_amount || 0).toFixed(2)}</span>
          </div>
        </Card>

        <Card className="p-4 space-y-2">
          <h3 className="font-semibold mb-2">Send Order</h3>
          <div className="flex gap-2">
            {order.supplier_email ? (
              <Button className="flex-1" variant="outline" onClick={() => window.open(`mailto:${order.supplier_email}?subject=Purchase Order&body=${encodeURIComponent(getMessage())}`)}>
                <Mail className="w-4 h-4 mr-2" /> Send via Email
              </Button>
            ) : <p className="text-xs text-muted-foreground">No email on file</p>}
            {order.supplier_phone ? (
              <Button className="flex-1 text-emerald-600 border-emerald-200" variant="outline" onClick={() => window.open(`https://wa.me/${(order.supplier_phone).replace(/\D/g,'')}?text=${encodeURIComponent(getMessage())}`)}>
                <MessageCircle className="w-4 h-4 mr-2" /> WhatsApp
              </Button>
            ) : <p className="text-xs text-muted-foreground">No phone on file</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}