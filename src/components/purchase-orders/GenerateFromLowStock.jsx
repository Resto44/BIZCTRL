import { useTenant } from '@/lib/TenantContext';
import { useBranchScope } from '@/lib/BranchScopeContext';
import { supabase } from '@/api/supabaseClient';
import { readForecastInventory } from '@/lib/inventoryForecast';
import { buildLowStockDraft } from '@/lib/lowStockPurchaseOrder';
import React, { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useLanguage } from '@/lib/LanguageContext';
import { computeLiveStock } from '@/lib/stockEngine';
import { AlertTriangle, Zap } from 'lucide-react';

export default function GenerateFromLowStock({ open, onClose, onCreated }) {
  const { currency } = useLanguage();
  const queryClient = useQueryClient();
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [qtys, setQtys] = useState({});
  const [loading, setLoading] = useState(false);

  const { activeRestaurant, branches: tenantBranches = [] } = useTenant();
  const { selectedBranchKey, isAllBranches } = useBranchScope();
  const restaurantId = activeRestaurant?.id;
  const branch = tenantBranches.find(b => (b.key || b.branch_key) === selectedBranch);
  const [error, setError] = useState('');
  useEffect(() => {
    setSelectedBranch(isAllBranches ? '' : selectedBranchKey || '');
    setSelectedSupplier(''); setQtys({}); setError('');
  }, [open, restaurantId, isAllBranches, selectedBranchKey]);
  const query = useQuery({
    queryKey: ['low-stock-draft', restaurantId, branch?.id],
    enabled: Boolean(open && restaurantId && branch?.id),
    queryFn: async () => {
      const read = async table => {
        const {data, error, count} = await supabase.from(table).select('*', {count:'exact'})
          .eq('restaurant_id', restaurantId).limit(2001);
        if (error) throw error;
        if (!Array.isArray(data) || !Number.isInteger(count) || count > data.length || count > 2000) throw new Error('Incomplete catalog. Review products before ordering.');
        return data;
      };
      const [inventory, suppliers, products] = await Promise.all([
        readForecastInventory({db:supabase, restaurantId, branchId:branch.id}), read('suppliers'), read('products'),
      ]);
      return {inventory, suppliers, products};
    },
  });
  const products = query.data?.products || [];
  const suppliers = (query.data?.suppliers || []).filter(s => !s.branch_id || s.branch_id === branch?.id);
  const lowItems = useMemo(() => query.isError ? [] : computeLiveStock(query.data?.inventory || [], [], [])
    .filter(i => i.isLow && i.branch_id === branch?.id && products.some(p => p.supplier_id === selectedSupplier && [p.id,p.product_id].includes(i.product_id))),
    [query.data, query.isError, branch?.id, selectedSupplier]);
  const branches = tenantBranches.map(b => b.key || b.branch_key).filter(Boolean);
  const getDefaultQty = item => qtys[item.id] ?? Math.max(1, Number(item.low_stock_threshold ?? 5) * 2);
  const handleGenerate = async () => {
    if (loading || query.isFetching || query.isError || !query.data) return;
    setLoading(true); setError('');
    try {
      const payload = buildLowStockDraft({restaurantId, branch,
        supplier:suppliers.find(s => s.id === selectedSupplier), stock:lowItems, products,
        quantities:qtys, orderNumber:`PO-${crypto.randomUUID()}`});
      await base44.entities.PurchaseOrder.create(payload);
      queryClient.invalidateQueries({queryKey:['purchase_orders']});
      onCreated?.(); onClose();
    } catch (err) { setError(err.message || 'Could not create draft. Retry.'); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" /> Generate PO from Low Stock
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {(error || query.isError) && <p role="alert" className="text-sm text-red-600">{error || 'Could not load complete stock data.'}<button type="button" className="block min-h-11 underline" onClick={() => query.refetch()}>Retry</button></p>}
          {query.isFetching && <p role="status">Loading branch stock…</p>}
          {/* Branch filter */}
          <div>
            <Label>Branch</Label>
            <Select value={selectedBranch} onValueChange={value => {setSelectedBranch(value); setSelectedSupplier(''); setQtys({}); setError('');}}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>

                {branches.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Supplier */}
          <div>
            <Label>Assign to Supplier</Label>
            <Select value={selectedSupplier} onValueChange={value => {setSelectedSupplier(value); setQtys({}); setError('');}}>
              <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
              <SelectContent>
                {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Low stock items */}
          {lowItems.length === 0 ? (
            <div className="text-center text-muted-foreground py-6 text-sm">
              Select one branch and supplier. Only their matching low-stock products appear here.
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-amber-500" />
                {lowItems.length} low-stock item(s) found. Adjust reorder quantities:
              </p>
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {lowItems.map(it => {
                  const key = it.id;
                  return (
                    <div key={key} className="flex items-center gap-2 p-2 border rounded-lg bg-amber-50/50">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{it.product_name}</p>
                        <p className="text-xs text-muted-foreground">
                          Stock: <span className="text-red-500 font-semibold">{it.currentStock?.toFixed(1)}</span> / Min: {it.low_stock_threshold} {it.unit}
                          {selectedBranch === 'all' && <span className="text-muted-foreground"> · {it.branch}</span>}
                        </p>
                      </div>
                      <div className="w-16">
                        <Input
                          type="number"
                          className="h-7 text-xs text-center"
                          value={getDefaultQty(it)}
                          min={1}
                          onChange={e => setQtys(q => ({ ...q, [key]: parseFloat(e.target.value) || 1 }))}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              className="flex-1"
              onClick={handleGenerate}
              disabled={loading || query.isFetching || query.isError || !branch || !selectedSupplier || lowItems.length === 0}
            >
              {loading ? 'Creating...' : `Create Draft PO (${lowItems.length} items)`}
            </Button>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
