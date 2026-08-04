import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { format } from 'date-fns';
import { PackageCheck } from 'lucide-react';

export default function ReceiveOrderDialog({ order, open, onClose }) {
  const { currency } = useLanguage();
  const queryClient = useQueryClient();
  const { activeRestaurantId, branches } = useTenant();

  const orderedItems = (() => { try { return JSON.parse(order?.items || '[]'); } catch { return []; } })();

  const [receivedQtys, setReceivedQtys] = useState(() =>
    Object.fromEntries(orderedItems.map(it => [it.product_id, it.qty]))
  );
  const [receiveDate, setReceiveDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(false);

  const handleReceive = async () => {
    setLoading(true);
    const today = receiveDate;

    // Determine if full or partial
    const isPartial = orderedItems.some(it => {
      const received = parseFloat(receivedQtys[it.product_id] || 0);
      return received < it.qty;
    });
    const isNoneReceived = orderedItems.every(it => parseFloat(receivedQtys[it.product_id] || 0) === 0);

    if (isNoneReceived) { setLoading(false); return; }

    // Resolve branch_id UUID from order.branch key string for RLS scope
    const orderBranch = branches.find(b => b.key === order.branch || b.branch_key === order.branch);
    const orderBranchId = order.branch_id || orderBranch?.id || null;
    // Create Purchase records for each received item
    const purchasePromises = orderedItems
      .filter(it => parseFloat(receivedQtys[it.product_id] || 0) > 0)
      .map(it => base44.entities.Purchase.create({
        date: today,
        branch: order.branch,
        product_id: it.product_id,
        product_name: it.product_name,
        qty: parseFloat(receivedQtys[it.product_id]),
        current_price: it.unit_price || 0,
        used_price: it.unit_price || 0,
        // RLS required scope fields
        restaurant_id: activeRestaurantId || null,
        branch_id: orderBranchId,
      }));

    await Promise.all(purchasePromises);

    // Build received_items snapshot
    const receivedItems = orderedItems.map(it => ({
      ...it,
      qty_received: parseFloat(receivedQtys[it.product_id] || 0),
    }));

    await base44.entities.PurchaseOrder.update(order.id, {
      status: isPartial ? 'partial' : 'received',
      received_items: JSON.stringify(receivedItems),
    });

    queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
    queryClient.invalidateQueries({ queryKey: ['purchases'] });
    setLoading(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="w-4 h-4" /> Receive Order
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Receipt Date</Label>
            <Input type="date" value={receiveDate} onChange={e => setReceiveDate(e.target.value)} />
          </div>

          <p className="text-xs text-muted-foreground">Enter the quantity actually received for each item. Items received will be added to inventory as purchases.</p>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {orderedItems.map(it => (
              <div key={it.product_id} className="flex items-center gap-2 p-2 border rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{it.product_name}</p>
                  <p className="text-xs text-muted-foreground">Ordered: {it.qty} {it.unit}</p>
                </div>
                <div className="w-20">
                  <Input
                    type="number"
                    className="h-8 text-xs text-center"
                    value={receivedQtys[it.product_id] ?? it.qty}
                    min={0}
                    max={it.qty}
                    onChange={e => setReceivedQtys(q => ({ ...q, [it.product_id]: e.target.value }))}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Status preview */}
          {orderedItems.some(it => parseFloat(receivedQtys[it.product_id] || 0) < it.qty) && (
            <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 p-2 rounded-lg">
              <Badge className="bg-amber-100 text-amber-700 text-xs">Partial</Badge>
              Some quantities are less than ordered — will be marked as Partially Received.
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button className="flex-1" onClick={handleReceive} disabled={loading}>
              {loading ? 'Updating...' : 'Confirm Receipt & Update Stock'}
            </Button>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}