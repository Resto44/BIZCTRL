/**
 * SKUManagement — Retail Mode Exclusive Module
 *
 * Manages Stock Keeping Units (SKUs) for retail products.
 * Features:
 * - SKU auto-generation and manual assignment
 * - SKU search and lookup
 * - SKU-to-product mapping
 * - Bulk SKU operations
 *
 * Architecture: Retail Mode only.
 */

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useTenant } from '@/lib/TenantContext';
import { useBusinessMode } from '@/lib/BusinessModeContext';
import PageHeader from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Hash, Search, Package, Edit2, RefreshCw, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

function RetailModeRequired() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Hash className="w-12 h-12 text-muted-foreground/30 mb-4" />
      <h3 className="text-base font-semibold text-foreground mb-1">Retail Mode Required</h3>
      <p className="text-sm text-muted-foreground max-w-xs">
        SKU Management is only available in Retail Mode.
      </p>
    </div>
  );
}

function generateSKU(name, category) {
  const prefix = (category || 'PRD').substring(0, 3).toUpperCase().replace(/\s/g, '');
  const namePart = (name || 'ITEM').substring(0, 4).toUpperCase().replace(/\s/g, '');
  const num = Math.floor(Math.random() * 9000) + 1000;
  return `${prefix}-${namePart}-${num}`;
}

export default function SKUManagement() {
  const { activeRestaurantId } = useTenant();
  const { isRetail } = useBusinessMode();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [editProduct, setEditProduct] = useState(null);
  const [newSKU, setNewSKU] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  // ── Fetch products ──────────────────────────────────────────────────────────
  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products-sku', activeRestaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, category, sku, barcode, current_stock, unit, default_price')
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeRestaurantId && isRetail,
  });

  const filtered = useMemo(() => {
    if (!search) return products;
    const q = search.toLowerCase();
    return products.filter(p =>
      p.name?.toLowerCase().includes(q) ||
      p.sku?.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q)
    );
  }, [products, search]);

  const withSKU = products.filter(p => p.sku).length;
  const withoutSKU = products.filter(p => !p.sku).length;

  // ── Update SKU ──────────────────────────────────────────────────────────────
  const updateSKUMutation = useMutation({
    mutationFn: async ({ id, sku }) => {
      // Check uniqueness
      if (sku) {
        const { data: existing } = await supabase
          .from('products')
          .select('id')
          .eq('sku', sku)
          .neq('id', id)
          .limit(1);
        if (existing?.length > 0) throw new Error('SKU already in use by another product');
      }
      const { error } = await supabase.from('products').update({ sku: sku || null }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products-sku'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('SKU updated');
      setEditProduct(null);
      setNewSKU('');
    },
    onError: (err) => toast.error(err.message),
  });

  // ── Bulk auto-generate SKUs ─────────────────────────────────────────────────
  const bulkGenerateMutation = useMutation({
    mutationFn: async () => {
      const noSKU = products.filter(p => !p.sku);
      for (const product of noSKU) {
        const sku = generateSKU(product.name, product.category);
        await supabase.from('products').update({ sku }).eq('id', product.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products-sku'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(`Generated SKUs for ${withoutSKU} products`);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleCopy = (sku, id) => {
    navigator.clipboard.writeText(sku);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!isRetail) return <RetailModeRequired />;

  return (
    <div>
      <PageHeader
        title="SKU Management"
        subtitle={`${withSKU} with SKU · ${withoutSKU} without SKU`}
        action={
          withoutSKU > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => bulkGenerateMutation.mutate()}
              disabled={bulkGenerateMutation.isPending}
            >
              <RefreshCw className={cn('w-4 h-4 mr-1', bulkGenerateMutation.isPending && 'animate-spin')} />
              Auto-Generate ({withoutSKU})
            </Button>
          )
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Card className="bg-emerald-50 dark:bg-emerald-950/20 border-0">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-emerald-600">{withSKU}</p>
            <p className="text-xs text-muted-foreground">With SKU</p>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 dark:bg-amber-950/20 border-0">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-amber-600">{withoutSKU}</p>
            <p className="text-xs text-muted-foreground">Without SKU</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, SKU, category..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Product list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-14 bg-muted animate-pulse rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(product => (
            <Card key={product.id} className={cn('border', !product.sku && 'border-amber-200 bg-amber-50/30 dark:bg-amber-950/10')}>
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Package className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{product.name}</p>
                    <p className="text-xs text-muted-foreground">{product.category || 'No category'}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {product.sku ? (
                      <div className="flex items-center gap-1">
                        <code className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 px-2 py-0.5 rounded font-mono">
                          {product.sku}
                        </code>
                        <button
                          onClick={() => handleCopy(product.sku, product.id)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          {copiedId === product.id
                            ? <Check className="w-3.5 h-3.5 text-emerald-500" />
                            : <Copy className="w-3.5 h-3.5" />
                          }
                        </button>
                      </div>
                    ) : (
                      <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                        No SKU
                      </Badge>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => {
                        setEditProduct(product);
                        setNewSKU(product.sku || generateSKU(product.name, product.category));
                      }}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Edit SKU Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={!!editProduct} onOpenChange={() => { setEditProduct(null); setNewSKU(''); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit SKU</DialogTitle>
          </DialogHeader>
          {editProduct && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-sm font-medium">{editProduct.name}</p>
                <p className="text-xs text-muted-foreground">{editProduct.category}</p>
              </div>
              <div>
                <Label>SKU Code</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={newSKU}
                    onChange={e => setNewSKU(e.target.value)}
                    placeholder="e.g. CAT-PROD-0001"
                    className="font-mono"
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => setNewSKU(generateSKU(editProduct.name, editProduct.category))}
                    title="Auto-generate"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Format: CATEGORY-PRODUCT-NUMBER. Must be unique across all products.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() => updateSKUMutation.mutate({ id: editProduct.id, sku: newSKU })}
                  disabled={updateSKUMutation.isPending}
                >
                  {updateSKUMutation.isPending ? 'Saving...' : 'Save SKU'}
                </Button>
                {editProduct.sku && (
                  <Button
                    variant="outline"
                    className="text-destructive border-destructive/30"
                    onClick={() => updateSKUMutation.mutate({ id: editProduct.id, sku: '' })}
                    disabled={updateSKUMutation.isPending}
                  >
                    Remove
                  </Button>
                )}
                <Button variant="outline" onClick={() => setEditProduct(null)}>Cancel</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
