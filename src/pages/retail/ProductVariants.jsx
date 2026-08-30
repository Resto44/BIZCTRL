/**
 * ProductVariants — Retail Mode Exclusive Module
 *
 * Manages product variants (Size, Color, Weight, etc.) for retail products.
 * Each variant has its own SKU, barcode, price, and stock level.
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Layers, Plus, Trash2, Search, ChevronDown, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const VARIANT_ATTRIBUTES = ['Size', 'Color', 'Weight', 'Material', 'Style', 'Flavor', 'Pack Size', 'Custom'];

function RetailModeRequired() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Layers className="w-12 h-12 text-muted-foreground/30 mb-4" />
      <h3 className="text-base font-semibold text-foreground mb-1">Retail Mode Required</h3>
      <p className="text-sm text-muted-foreground max-w-xs">
        Product Variants are only available in Retail Mode.
      </p>
    </div>
  );
}

export default function ProductVariants() {
  const { activeRestaurantId } = useTenant();
  const { isRetail } = useBusinessMode();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [expandedProduct, setExpandedProduct] = useState(null);
  const [showVariantForm, setShowVariantForm] = useState(false);
  const [selectedParent, setSelectedParent] = useState(null);
  const [variantForm, setVariantForm] = useState({
    attribute_name: 'Size',
    attribute_value: '',
    sku: '',
    barcode: '',
    price: '',
    cost: '',
    stock: 0,
  });

  // ── Fetch parent products (variant-enabled) ─────────────────────────────────
  const { data: parentProducts = [], isLoading } = useQuery({
    queryKey: ['variant-products', activeRestaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, category, sku, default_price, default_cost, current_stock')
        .eq('is_variant', true)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeRestaurantId && isRetail,
  });

  // ── Fetch variants ──────────────────────────────────────────────────────────
  const { data: allVariants = [] } = useQuery({
    queryKey: ['product-variants', activeRestaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_variants')
        .select('*')
        .order('attribute_name, attribute_value');
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeRestaurantId && isRetail,
  });

  const filtered = useMemo(() => {
    if (!search) return parentProducts;
    const q = search.toLowerCase();
    return parentProducts.filter(p =>
      p.name?.toLowerCase().includes(q) ||
      p.sku?.toLowerCase().includes(q)
    );
  }, [parentProducts, search]);

  const getVariantsForProduct = (productId) =>
    allVariants.filter(v => v.product_id === productId);

  // ── Create variant ──────────────────────────────────────────────────────────
  const createVariantMutation = useMutation({
    mutationFn: async (data) => {
      const { error } = await supabase.from('product_variants').insert({
        product_id: selectedParent.id,
        attribute_name: data.attribute_name,
        attribute_value: data.attribute_value,
        sku: data.sku || null,
        barcode: data.barcode || null,
        price: parseFloat(data.price) || selectedParent.default_price || 0,
        cost: parseFloat(data.cost) || selectedParent.default_cost || 0,
        stock: parseInt(data.stock) || 0,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-variants'] });
      toast.success('Variant added');
      setShowVariantForm(false);
      setVariantForm({ attribute_name: 'Size', attribute_value: '', sku: '', barcode: '', price: '', cost: '', stock: 0 });
    },
    onError: (err) => toast.error(err.message),
  });

  // ── Delete variant ──────────────────────────────────────────────────────────
  const deleteVariantMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('product_variants').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-variants'] });
      toast.success('Variant removed');
    },
    onError: (err) => toast.error(err.message),
  });

  if (!isRetail) return <RetailModeRequired />;

  return (
    <div>
      <PageHeader
        title="Product Variants"
        subtitle={`${parentProducts.length} variant-enabled products · ${allVariants.length} total variants`}
      />

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search products..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {parentProducts.length === 0 && !isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          <Layers className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No variant-enabled products</p>
          <p className="text-sm mt-1">
            Go to Product Management and enable "Product has Variants" for products that have multiple options.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(product => {
            const variants = getVariantsForProduct(product.id);
            const isExpanded = expandedProduct === product.id;

            return (
              <Card key={product.id} className="border border-border/60">
                <CardContent className="p-0">
                  {/* Product header */}
                  <button
                    className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
                    onClick={() => setExpandedProduct(isExpanded ? null : product.id)}
                  >
                    <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
                      <Layers className="w-4.5 h-4.5 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {variants.length} variant{variants.length !== 1 ? 's' : ''}
                        {product.sku && ` · ${product.sku}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedParent(product);
                          setVariantForm(f => ({ ...f, price: product.default_price || '', cost: product.default_cost || '' }));
                          setShowVariantForm(true);
                        }}
                      >
                        <Plus className="w-3 h-3 mr-0.5" /> Add
                      </Button>
                      {isExpanded
                        ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        : <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      }
                    </div>
                  </button>

                  {/* Variants list */}
                  {isExpanded && (
                    <div className="border-t border-border">
                      {variants.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">
                          No variants yet. Click "Add" to create the first variant.
                        </p>
                      ) : (
                        <div className="divide-y divide-border">
                          {variants.map(variant => (
                            <div key={variant.id} className="flex items-center gap-3 px-4 py-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge variant="outline" className="text-xs">
                                    {variant.attribute_name}: {variant.attribute_value}
                                  </Badge>
                                  {variant.sku && (
                                    <code className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 px-1.5 py-0.5 rounded font-mono">
                                      {variant.sku}
                                    </code>
                                  )}
                                  {variant.barcode && (
                                    <code className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                                      {variant.barcode}
                                    </code>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                  <span>Price: <strong className="text-foreground">{variant.price}</strong></span>
                                  <span>Stock: <strong className={cn(
                                    (variant.stock || 0) <= 0 ? 'text-red-600' : 'text-emerald-600'
                                  )}>{variant.stock || 0}</strong></span>
                                </div>
                              </div>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-destructive shrink-0"
                                onClick={() => {
                                  if (window.confirm('Remove this variant?')) {
                                    deleteVariantMutation.mutate(variant.id);
                                  }
                                }}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Add Variant Dialog ──────────────────────────────────────────────── */}
      <Dialog open={showVariantForm} onOpenChange={setShowVariantForm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Variant — {selectedParent?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Attribute</Label>
                <Select value={variantForm.attribute_name} onValueChange={v => setVariantForm(f => ({ ...f, attribute_name: v }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VARIANT_ATTRIBUTES.map(a => (
                      <SelectItem key={a} value={a}>{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Value *</Label>
                <Input
                  value={variantForm.attribute_value}
                  onChange={e => setVariantForm(f => ({ ...f, attribute_value: e.target.value }))}
                  placeholder="e.g. Large, Red"
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>SKU</Label>
                <Input value={variantForm.sku} onChange={e => setVariantForm(f => ({ ...f, sku: e.target.value }))} className="mt-1 font-mono text-sm" />
              </div>
              <div>
                <Label>Barcode</Label>
                <Input value={variantForm.barcode} onChange={e => setVariantForm(f => ({ ...f, barcode: e.target.value }))} className="mt-1 font-mono text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Price</Label>
                <Input type="number" value={variantForm.price} onChange={e => setVariantForm(f => ({ ...f, price: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>Cost</Label>
                <Input type="number" value={variantForm.cost} onChange={e => setVariantForm(f => ({ ...f, cost: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>Stock</Label>
                <Input type="number" value={variantForm.stock} onChange={e => setVariantForm(f => ({ ...f, stock: e.target.value }))} className="mt-1" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={() => createVariantMutation.mutate(variantForm)}
                disabled={createVariantMutation.isPending || !variantForm.attribute_value}
              >
                {createVariantMutation.isPending ? 'Adding...' : 'Add Variant'}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setShowVariantForm(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
