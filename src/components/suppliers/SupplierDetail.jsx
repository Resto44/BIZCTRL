import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useLanguage } from '@/lib/LanguageContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, Phone, Mail, Package, ShoppingCart, Send, Loader2, FileText } from 'lucide-react';
import { useTenant } from '@/lib/TenantContext';
import SupplierStatement from './SupplierStatement';
import { formatCurrency } from '@/lib/helpers';
import { format } from 'date-fns';
import SupplierInvoices from './SupplierInvoices';
import SupplierContractTab from './SupplierContractTab';
import SupplierPriceComparison from './SupplierPriceComparison';
import SupplierPriceTracker from './SupplierPriceTracker';

export default function SupplierDetail({ supplier, onBack }) {
  const { currency } = useLanguage();
  const { branches } = useTenant();
  const qc = useQueryClient();
  const [showPOForm, setShowPOForm] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [generatedPO, setGeneratedPO] = useState(null);

  const { data: purchases = [] } = useQuery({
    queryKey: ['purchases'],
    queryFn: () => base44.entities.Purchase.list('-date', 10000),
  });

  const { data: purchaseOrders = [] } = useQuery({
    queryKey: ['purchase_orders'],
    queryFn: () => base44.entities.PurchaseOrder.list('-date', 500),
  });

  const { data: inventory = [] } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => base44.entities.Inventory.list('-date', 5000),
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list('name', 500),
  });

  const createOrderMut = useMutation({
    mutationFn: d => base44.entities.PurchaseOrder.create(d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchase_orders'] }),
  });

  // Purchase history for this supplier (by name match, since purchases don't store supplier_id)
  const supplierPurchases = useMemo(() =>
    purchaseOrders.filter(po => po.supplier_id === supplier.id),
    [purchaseOrders, supplier.id]
  );

  // Low-stock products (to auto-suggest PO)
  const lowStockSuggestions = useMemo(() => {
    const stockMap = {};
    inventory.forEach(item => {
      const key = `${item.product_id}_${item.branch}`;
      if (!stockMap[key] || item.date > stockMap[key].date) stockMap[key] = { ...item };
    });
    purchases.forEach(p => {
      const key = `${p.product_id}_${p.branch}`;
      if (stockMap[key]) stockMap[key]._extra = (stockMap[key]._extra || 0) + p.qty;
    });
    return Object.values(stockMap)
      .map(i => ({ ...i, currentStock: (i.opening_stock || 0) + (i._extra || 0) }))
      .filter(i => i.currentStock <= (i.low_stock_threshold || 5));
  }, [inventory, purchases]);

  const totalSpend = supplierPurchases.reduce((s, po) => s + (po.total_amount || 0), 0);
  const branchLabel = (key) => branches.find(b => b.key === key)?.label || key;

  const handleGeneratePO = async () => {
    const items = lowStockSuggestions.slice(0, 10).map(i => ({
      product_id: i.product_id,
      product_name: i.product_name || i.product_id,
      qty: Math.max((i.low_stock_threshold || 5) * 3, 10),
      unit: i.unit || '',
      unit_price: products.find(p => p.product_id === i.product_id)?.default_cost || 0,
    }));

    const po = await createOrderMut.mutateAsync({
      supplier_id: supplier.id,
      supplier_name: supplier.name,
      supplier_email: supplier.email,
      supplier_phone: supplier.phone,
      branch: lowStockSuggestions[0]?.branch || '',
      date: format(new Date(), 'yyyy-MM-dd'),
      expected_delivery: format(new Date(Date.now() + 7 * 86400000), 'yyyy-MM-dd'),
      items: JSON.stringify(items),
      total_amount: items.reduce((s, i) => s + (i.qty * i.unit_price), 0),
      status: 'draft',
      order_number: `PO-${Date.now().toString().slice(-6)}`,
      notes: `Auto-generated for low-stock items`,
    });
    setGeneratedPO(po);
    setShowPOForm(true);
  };

  const handleSendPOEmail = async (po) => {
    if (!supplier.email) return;
    setSendingEmail(true);
    try {
      const items = JSON.parse(po.items || '[]');
      const lines = items.map(i => `• ${i.product_name}: ${i.qty} ${i.unit} × ${formatCurrency(i.unit_price, currency)} = ${formatCurrency(i.qty * i.unit_price, currency)}`).join('\n');
      await base44.integrations.Core.SendEmail({
        to: supplier.email,
        subject: `Purchase Order #${po.order_number} — ${po.date}`,
        body: `Dear ${supplier.contact_name || supplier.name},\n\nPlease find below our purchase order #${po.order_number} dated ${po.date}.\n\n${lines}\n\nTotal: ${formatCurrency(po.total_amount, currency)}\nExpected Delivery: ${po.expected_delivery || 'TBD'}\nBranch: ${branchLabel(po.branch)}\n\n${po.notes ? `Notes: ${po.notes}\n\n` : ''}Please confirm receipt and expected delivery date.\n\nThank you!`,
      });
      alert('Purchase order sent to ' + supplier.email);
    } finally {
      setSendingEmail(false);
    }
  };

  const handleWhatsAppPO = (po) => {
    if (!supplier.phone) return;
    const items = JSON.parse(po.items || '[]');
    const lines = items.map(i => `• ${i.product_name}: ${i.qty} ${i.unit}`).join('\n');
    const msg = encodeURIComponent(`Hi ${supplier.contact_name || supplier.name},\n\nPO #${po.order_number} (${po.date}):\n${lines}\n\nTotal: ${formatCurrency(po.total_amount, currency)}\nDelivery: ${po.expected_delivery || 'TBD'}\n\nPlease confirm. Thank you!`);
    window.open(`https://wa.me/${supplier.phone.replace(/\D/g, '')}?text=${msg}`, '_blank');
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Button size="icon" variant="ghost" onClick={onBack}><ArrowLeft className="w-4 h-4" /></Button>
        <div className="flex-1">
          <h2 className="font-bold text-base">{supplier.name}</h2>
          {supplier.category && <Badge variant="secondary" className="text-xs">{supplier.category}</Badge>}
        </div>
      </div>

      {/* Contact */}
      <Card className="p-3 mb-3 space-y-1.5">
        {supplier.phone && <a href={`tel:${supplier.phone}`} className="flex items-center gap-2 text-sm text-primary"><Phone className="w-4 h-4" />{supplier.phone}</a>}
        {supplier.email && <a href={`mailto:${supplier.email}`} className="flex items-center gap-2 text-sm text-primary"><Mail className="w-4 h-4" />{supplier.email}</a>}
        {supplier.contact_name && <p className="text-xs text-muted-foreground">Contact: {supplier.contact_name}</p>}
        {supplier.notes && <p className="text-xs text-muted-foreground">{supplier.notes}</p>}
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <Card className="p-3 text-center">
          <p className="text-xl font-bold text-primary">{supplierPurchases.length}</p>
          <p className="text-xs text-muted-foreground">Total Orders</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg font-bold">{formatCurrency(totalSpend, currency)}</p>
          <p className="text-xs text-muted-foreground">Total Spend</p>
        </Card>
      </div>

      {/* Low-stock alert + auto PO */}
      {lowStockSuggestions.length > 0 && (
        <Card className="p-3 mb-4 bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800 space-y-2">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5" /> {lowStockSuggestions.length} low-stock items need replenishment
          </p>
          <div className="space-y-0.5">
            {lowStockSuggestions.slice(0, 4).map(i => (
              <p key={`${i.product_id}_${i.branch}`} className="text-xs text-amber-600">
                {i.product_name || i.product_id} · {branchLabel(i.branch)}: <strong>{i.currentStock} {i.unit}</strong>
              </p>
            ))}
          </div>
          <Button size="sm" className="w-full bg-amber-600 hover:bg-amber-700 gap-1" onClick={handleGeneratePO} disabled={createOrderMut.isPending}>
            {createOrderMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShoppingCart className="w-3.5 h-3.5" />}
            Generate Purchase Order
          </Button>
        </Card>
      )}

      <Tabs defaultValue="orders">
        <TabsList className="w-full mb-3 grid grid-cols-3 gap-1 h-auto p-1">
          <TabsTrigger value="orders" className="text-xs">Orders</TabsTrigger>
          <TabsTrigger value="invoices" className="text-xs">Invoices</TabsTrigger>
          <TabsTrigger value="statement" className="text-xs">Statement</TabsTrigger>
          <TabsTrigger value="contract" className="text-xs">Contract</TabsTrigger>
          <TabsTrigger value="prices" className="text-xs">Prices</TabsTrigger>
          <TabsTrigger value="price-tracker" className="text-xs">Tracker</TabsTrigger>
        </TabsList>

        <TabsContent value="orders">
          {supplierPurchases.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No purchase orders yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {supplierPurchases.map(po => (
                <Card key={po.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-sm">{po.order_number}</p>
                      <p className="text-xs text-muted-foreground">{po.date} · {branchLabel(po.branch)}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant={po.status === 'received' ? 'default' : po.status === 'sent' ? 'secondary' : 'outline'} className="text-xs">{po.status}</Badge>
                        <span className="text-xs font-semibold">{formatCurrency(po.total_amount, currency)}</span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="outline" className="h-7 w-7" title="Send Email" onClick={() => handleSendPOEmail(po)} disabled={!supplier.email || sendingEmail}>
                        {sendingEmail ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                      </Button>
                      {supplier.phone && (
                        <Button size="icon" variant="outline" className="h-7 w-7 text-green-600" title="WhatsApp" onClick={() => handleWhatsAppPO(po)}>
                          <Phone className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="invoices">
          <SupplierInvoices supplier={supplier} onBack={onBack} embedded />
        </TabsContent>

        <TabsContent value="statement">
          <SupplierStatement supplier={supplier} />
        </TabsContent>

        <TabsContent value="contract">
          <SupplierContractTab supplier={supplier} />
        </TabsContent>

        <TabsContent value="prices">
          <SupplierPriceComparison supplier={supplier} />
        </TabsContent>
        <TabsContent value="price-tracker">
          <SupplierPriceTracker />
        </TabsContent>
      </Tabs>

      {/* PO Generated dialog */}
      <Dialog open={showPOForm} onOpenChange={setShowPOForm}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Purchase Order Created</DialogTitle></DialogHeader>
          {generatedPO && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">PO #{generatedPO.order_number} created for {branchLabel(generatedPO.branch)}.</p>
              <p className="text-sm font-semibold">Total: {formatCurrency(generatedPO.total_amount, currency)}</p>
              <div className="flex gap-2">
                {supplier.email && (
                  <Button className="flex-1" onClick={() => { handleSendPOEmail(generatedPO); setShowPOForm(false); }} disabled={sendingEmail}>
                    {sendingEmail ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />} Email to Supplier
                  </Button>
                )}
                {supplier.phone && (
                  <Button variant="outline" className="flex-1 text-green-600 border-green-300" onClick={() => { handleWhatsAppPO(generatedPO); setShowPOForm(false); }}>
                    <Phone className="w-3.5 h-3.5 mr-1" /> WhatsApp
                  </Button>
                )}
              </div>
              <Button variant="ghost" className="w-full" onClick={() => setShowPOForm(false)}>Close</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}