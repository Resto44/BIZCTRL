/**
 * BarcodeScanner — Retail Mode Exclusive Module
 *
 * Provides barcode scanning interface for:
 * - Product lookup by barcode
 * - Quick stock check
 * - Add to sale / POS integration
 * - Barcode-based inventory adjustment
 *
 * Architecture: Retail Mode only. Uses useBusinessMode guard.
 */

import React, { useState, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useTenant } from '@/lib/TenantContext';
import { useBusinessMode } from '@/lib/BusinessModeContext';
import PageHeader from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Barcode, Search, Package, AlertTriangle, CheckCircle2,
  ScanLine, X, Plus, Minus, ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

function RetailModeRequired() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Barcode className="w-12 h-12 text-muted-foreground/30 mb-4" />
      <h3 className="text-base font-semibold text-foreground mb-1">Retail Mode Required</h3>
      <p className="text-sm text-muted-foreground max-w-xs">
        Barcode scanning is only available in Retail Mode.
        Switch to a Retail business to access this module.
      </p>
    </div>
  );
}

function StockIndicator({ stock, minStock }) {
  if (stock <= 0) return (
    <Badge className="bg-red-100 text-red-700 border-red-200">
      <X className="w-3 h-3 mr-1" /> Out of Stock
    </Badge>
  );
  if (stock <= (minStock || 5)) return (
    <Badge className="bg-amber-100 text-amber-700 border-amber-200">
      <AlertTriangle className="w-3 h-3 mr-1" /> Low Stock ({stock})
    </Badge>
  );
  return (
    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
      <CheckCircle2 className="w-3 h-3 mr-1" /> In Stock ({stock})
    </Badge>
  );
}

export default function BarcodeScanner() {
  const { activeRestaurantId } = useTenant();
  const { isRetail } = useBusinessMode();
  const queryClient = useQueryClient();

  const [barcode, setBarcode] = useState('');
  const [scannedProduct, setScannedProduct] = useState(null);
  const [searchMode, setSearchMode] = useState('barcode'); // 'barcode' | 'sku'
  const [recentScans, setRecentScans] = useState([]);
  const [adjustQty, setAdjustQty] = useState(1);
  const inputRef = useRef(null);

  // Auto-focus input on mount
  useEffect(() => {
    if (isRetail) inputRef.current?.focus();
  }, [isRetail]);

  // ── Product lookup ──────────────────────────────────────────────────────────
  const lookupProduct = async (code) => {
    if (!code.trim()) return;

    const field = searchMode === 'sku' ? 'sku' : 'barcode';
    const { data, error } = await supabase
      .from('products')
      .select(`
        id, name, barcode, sku, category, unit,
        default_price, default_cost, current_stock, min_stock,
        batch_tracked, expiry_tracked, serial_tracked, is_variant
      `)
      .eq(field, code.trim())
      .limit(1)
      .single();

    if (error || !data) {
      toast.error(`No product found for ${searchMode === 'sku' ? 'SKU' : 'barcode'}: ${code}`);
      setScannedProduct(null);
      return;
    }

    setScannedProduct(data);
    setRecentScans(prev => {
      const filtered = prev.filter(s => s.id !== data.id);
      return [{ ...data, scanned_at: new Date() }, ...filtered].slice(0, 10);
    });
    setBarcode('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') lookupProduct(barcode);
  };

  // ── Quick stock adjust ──────────────────────────────────────────────────────
  const adjustMutation = useMutation({
    mutationFn: async ({ productId, qty, type }) => {
      const product = scannedProduct;
      const newStock = type === 'add'
        ? (product.current_stock || 0) + qty
        : Math.max(0, (product.current_stock || 0) - qty);

      const { error } = await supabase
        .from('products')
        .update({ current_stock: newStock })
        .eq('id', productId);
      if (error) throw error;

      // Log inventory transaction
      await supabase.from('inventory_transactions').insert({
        restaurant_id: activeRestaurantId,
        product_id: productId,
        transaction_type: type === 'add' ? 'adjustment_in' : 'adjustment_out',
        quantity: qty,
        notes: `Manual barcode adjustment`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Stock adjusted');
      // Refresh scanned product
      if (scannedProduct) lookupProduct(scannedProduct.barcode || scannedProduct.sku);
    },
    onError: (err) => toast.error('Failed: ' + err.message),
  });

  if (!isRetail) return <RetailModeRequired />;

  return (
    <div>
      <PageHeader
        title="Barcode Scanner"
        subtitle="Scan barcodes to look up products, check stock, and adjust inventory"
      />

      {/* ── Scanner Input ─────────────────────────────────────────────────── */}
      <Card className="mb-5 border-2 border-dashed border-primary/30 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <ScanLine className="w-5 h-5 text-primary" />
            <h3 className="text-sm font-semibold">Scan or Enter Code</h3>
            <div className="flex gap-1 ml-auto">
              {['barcode', 'sku'].map(mode => (
                <button
                  key={mode}
                  onClick={() => setSearchMode(mode)}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                    searchMode === mode
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {mode === 'sku' ? 'SKU' : 'Barcode'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={barcode}
                onChange={e => setBarcode(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={searchMode === 'sku' ? 'Enter SKU...' : 'Scan or type barcode...'}
                className="pl-9 text-base font-mono"
                autoComplete="off"
              />
            </div>
            <Button onClick={() => lookupProduct(barcode)} disabled={!barcode.trim()}>
              <Search className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Press Enter or click Search after scanning. Input auto-focuses for continuous scanning.
          </p>
        </CardContent>
      </Card>

      {/* ── Scanned Product Result ────────────────────────────────────────── */}
      {scannedProduct && (
        <Card className="mb-5 border-2 border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-800">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-white dark:bg-background border border-border flex items-center justify-center">
                  <Package className="w-6 h-6 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">{scannedProduct.name}</h3>
                  <p className="text-xs text-muted-foreground">{scannedProduct.category}</p>
                </div>
              </div>
              <button onClick={() => setScannedProduct(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Product details */}
            <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
              <div className="bg-background rounded-lg p-2">
                <p className="text-muted-foreground">Barcode</p>
                <p className="font-mono font-medium">{scannedProduct.barcode || '—'}</p>
              </div>
              <div className="bg-background rounded-lg p-2">
                <p className="text-muted-foreground">SKU</p>
                <p className="font-mono font-medium">{scannedProduct.sku || '—'}</p>
              </div>
              <div className="bg-background rounded-lg p-2">
                <p className="text-muted-foreground">Sell Price</p>
                <p className="font-bold text-primary">{scannedProduct.default_price}</p>
              </div>
              <div className="bg-background rounded-lg p-2">
                <p className="text-muted-foreground">Cost Price</p>
                <p className="font-medium">{scannedProduct.default_cost}</p>
              </div>
            </div>

            {/* Stock status */}
            <div className="flex items-center justify-between mb-3">
              <StockIndicator stock={scannedProduct.current_stock || 0} minStock={scannedProduct.min_stock} />
              <div className="flex gap-1">
                {scannedProduct.batch_tracked && <Badge variant="outline" className="text-xs">Batch</Badge>}
                {scannedProduct.expiry_tracked && <Badge variant="outline" className="text-xs">Expiry</Badge>}
                {scannedProduct.serial_tracked && <Badge variant="outline" className="text-xs">Serial</Badge>}
                {scannedProduct.is_variant && <Badge variant="outline" className="text-xs">Variant</Badge>}
              </div>
            </div>

            {/* Quick stock adjust */}
            <div className="border-t border-border pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Quick Stock Adjustment</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAdjustQty(q => Math.max(1, q - 1))}
                  className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-muted"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <Input
                  type="number"
                  min="1"
                  value={adjustQty}
                  onChange={e => setAdjustQty(parseInt(e.target.value) || 1)}
                  className="w-16 text-center h-8 text-sm"
                />
                <button
                  onClick={() => setAdjustQty(q => q + 1)}
                  className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-muted"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-8 text-xs"
                  onClick={() => adjustMutation.mutate({ productId: scannedProduct.id, qty: adjustQty, type: 'add' })}
                  disabled={adjustMutation.isPending}
                >
                  <Plus className="w-3 h-3 mr-1" /> Add Stock
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-8 text-xs text-destructive border-destructive/30"
                  onClick={() => adjustMutation.mutate({ productId: scannedProduct.id, qty: adjustQty, type: 'remove' })}
                  disabled={adjustMutation.isPending}
                >
                  <Minus className="w-3 h-3 mr-1" /> Remove
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Recent Scans ──────────────────────────────────────────────────── */}
      {recentScans.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Recent Scans
          </h3>
          <div className="space-y-2">
            {recentScans.map(product => (
              <button
                key={product.id}
                onClick={() => setScannedProduct(product)}
                className="w-full flex items-center gap-3 p-3 bg-card border border-border rounded-xl hover:bg-muted/50 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Package className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{product.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{product.barcode || product.sku}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn(
                    'text-xs font-medium',
                    (product.current_stock || 0) <= 0 ? 'text-red-600' : 'text-emerald-600'
                  )}>
                    {product.current_stock || 0} {product.unit}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
