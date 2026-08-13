import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { useAuth } from '@/lib/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  ShoppingCart, Search, Star, Heart, Plus, Minus, X, ChevronRight,
  MapPin, Clock, CheckCircle2, Bike, ArrowLeft,
  Truck, CreditCard, Wallet, Phone, Home, Zap, Tag, Gift,
  Award, Sparkles, Filter, ChevronDown, Info, AlertCircle, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

// ── Order status pipeline ──────────────────────────────────────────────────────
const ORDER_STEPS = [
  { key: 'pending',       label_en: 'Order Received',   label_ar: 'تم استلام الطلب',   label_fa: 'سفارش دریافت شد',   icon: CheckCircle2 },
  { key: 'assigned',      label_en: 'Driver Assigned',   label_ar: 'تم تعيين السائق',    label_fa: 'راننده تعیین شد',   icon: Bike },
  { key: 'picked_up',     label_en: 'Picked Up',         label_ar: 'تم الاستلام',        label_fa: 'تحویل گرفته شد',   icon: Truck },
  { key: 'on_the_way',    label_en: 'On The Way',        label_ar: 'في الطريق',          label_fa: 'در راه است',        icon: Bike },
  { key: 'delivered',     label_en: 'Delivered',         label_ar: 'تم التوصيل',         label_fa: 'تحویل داده شد',    icon: Home },
];

const PAYMENT_METHODS = [
  { id: 'cash',           label_en: 'Cash On Delivery',  label_ar: 'الدفع عند الاستلام', label_fa: 'پرداخت نقدی',      icon: '💵' },
  { id: 'visa',           label_en: 'Visa',              label_ar: 'فيزا',               label_fa: 'ویزا',             icon: '💳' },
  { id: 'mastercard',     label_en: 'Mastercard',        label_ar: 'ماستركارد',          label_fa: 'مسترکارت',         icon: '💳' },
  { id: 'mada',           label_en: 'Mada',              label_ar: 'مدى',                label_fa: 'مدا',              icon: '🏦' },
  { id: 'apple_pay',      label_en: 'Apple Pay',         label_ar: 'آبل باي',            label_fa: 'اپل پی',           icon: '🍎' },
  { id: 'google_pay',     label_en: 'Google Pay',        label_ar: 'جوجل باي',           label_fa: 'گوگل پی',          icon: '🔵' },
  { id: 'wallet',         label_en: 'Restaurant Wallet', label_ar: 'المحفظة',            label_fa: 'کیف پول',          icon: '👛' },
];

// ── Product Customization Dialog ──────────────────────────────────────────────
function ProductCustomizeDialog({ product, modifiers, open, onClose, onAddToCart, lang }) {
  const { t } = useLanguage();
  const [selections, setSelections] = useState({});
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setQty(1);
    setNotes('');
    const defaults = {};
    (modifiers || []).forEach(mod => {
      const defOpts = (mod.options || []).filter(o => o.is_default).map(o => o.id);
      if (defOpts.length > 0) defaults[mod.id] = mod.type === 'single' ? defOpts[0] : defOpts;
    });
    setSelections(defaults);
  }, [open, modifiers]);

  const toggleOption = (modId, optId, type) => {
    setSelections(prev => {
      if (type === 'single') return { ...prev, [modId]: optId };
      const current = Array.isArray(prev[modId]) ? prev[modId] : [];
      if (current.includes(optId)) return { ...prev, [modId]: current.filter(id => id !== optId) };
      return { ...prev, [modId]: [...current, optId] };
    });
  };

  const extraCost = useMemo(() => {
    let extra = 0;
    (modifiers || []).forEach(mod => {
      const sel = selections[mod.id];
      const selArr = Array.isArray(sel) ? sel : (sel ? [sel] : []);
      selArr.forEach(optId => {
        const opt = (mod.options || []).find(o => o.id === optId);
        if (opt?.price_adjustment) extra += parseFloat(opt.price_adjustment) || 0;
      });
    });
    return extra;
  }, [selections, modifiers]);

  const unitPrice = (parseFloat(product?.selling_price) || 0) + extraCost;
  const totalPrice = unitPrice * qty;

  const handleAdd = () => {
    const selectedMods = (modifiers || []).map(mod => {
      const sel = selections[mod.id];
      const selArr = Array.isArray(sel) ? sel : (sel ? [sel] : []);
      const selectedOptions = (mod.options || []).filter(o => selArr.includes(o.id));
      return { modifier_id: mod.id, modifier_name: mod[`name_${lang}`] || mod.name_en, options: selectedOptions };
    }).filter(m => m.options.length > 0);

    onAddToCart({ ...product, qty, notes, selectedModifiers: selectedMods, unitPrice, totalPrice });
    onClose();
  };

  const productName = product?.[`name_${lang}`] || product?.name_ar || product?.name || '';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm mx-auto max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">{productName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Product image / info */}
          {product?.image && (
            <img src={product.image} alt={productName} className="w-full h-40 object-cover rounded-xl" />
          )}
          {product?.description && (
            <p className="text-xs text-muted-foreground">{product.description}</p>
          )}
          {(product?.calories || product?.preparation_time) && (
            <div className="flex gap-3 text-xs text-muted-foreground">
              {product.calories && <span>🔥 {product.calories} kcal</span>}
              {product.preparation_time && <span>⏱ {product.preparation_time} min</span>}
            </div>
          )}

          {/* Modifiers */}
          {(modifiers || []).map(mod => {
            const modName = mod[`name_${lang}`] || mod.name_en;
            return (
              <div key={mod.id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">{modName}</p>
                  {mod.is_required && <Badge className="text-[9px] h-4 px-1 bg-red-100 text-red-600 border-0">Required</Badge>}
                  {mod.type === 'multiple' && <Badge className="text-[9px] h-4 px-1 bg-blue-100 text-blue-600 border-0">Multi-select</Badge>}
                </div>
                <div className="space-y-1.5">
                  {(mod.options || []).map(opt => {
                    const optName = opt[`name_${lang}`] || opt.name_en;
                    const sel = selections[mod.id];
                    const isSelected = mod.type === 'single' ? sel === opt.id : (Array.isArray(sel) && sel.includes(opt.id));
                    return (
                      <button
                        key={opt.id}
                        onClick={() => toggleOption(mod.id, opt.id, mod.type)}
                        className={`w-full flex items-center justify-between p-2.5 rounded-xl border-2 transition-all ${isSelected ? 'border-primary bg-primary/5' : 'border-border'}`}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-primary bg-primary' : 'border-muted-foreground'}`}>
                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                          <span className="text-sm">{optName}</span>
                        </div>
                        {opt.price_adjustment > 0 && (
                          <span className="text-xs font-semibold text-primary">+{parseFloat(opt.price_adjustment).toFixed(2)}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Special Notes */}
          <div>
            <Label className="text-xs">{t('notes') || 'Special Instructions'}</Label>
            <Textarea
              className="mt-1 text-sm resize-none"
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any special requests..."
            />
          </div>

          {/* Qty + Add */}
          <div className="flex items-center gap-3 pt-1">
            <div className="flex items-center gap-2 border border-border rounded-xl p-1">
              <button onClick={() => setQty(q => Math.max(1, q - 1))} className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="text-sm font-bold w-6 text-center">{qty}</span>
              <button onClick={() => setQty(q => q + 1)} className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Plus className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
            <Button className="flex-1 h-10 font-bold" onClick={handleAdd}>
              {t('add_to_cart') || 'Add'} · {totalPrice.toFixed(2)}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Product Card ──────────────────────────────────────────────────────────────
function ProductCard({ product, onAdd, isFavorite, onToggleFavorite, lang }) {
  const { t, currency } = useLanguage();
  const name = product[`name_${lang}`] || product.name_ar || product.name || '';
  const badges = [];
  if (product.is_featured) badges.push({ label: 'Featured', color: 'bg-purple-100 text-purple-700' });
  if (product.is_popular) badges.push({ label: 'Popular', color: 'bg-orange-100 text-orange-700' });
  if (product.is_new) badges.push({ label: 'New', color: 'bg-green-100 text-green-700' });
  if (product.is_best_seller) badges.push({ label: 'Best Seller', color: 'bg-yellow-100 text-yellow-700' });

  return (
    <Card className="overflow-hidden hover:shadow-md transition-all active:scale-[0.98]">
      <CardContent className="p-0">
        {product.image && (
          <div className="relative">
            <img src={product.image} alt={name} className="w-full h-32 object-cover" />
            <button onClick={() => onToggleFavorite(product.id)} className="absolute top-2 right-2 w-8 h-8 bg-white/90 rounded-full flex items-center justify-center shadow">
              <Heart className={`w-4 h-4 ${isFavorite ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}`} />
            </button>
            {badges.length > 0 && (
              <div className="absolute bottom-2 left-2 flex gap-1 flex-wrap">
                {badges.slice(0, 2).map(b => (
                  <span key={b.label} className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${b.color}`}>{b.label}</span>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight">{name}</p>
              {product.description && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{product.description}</p>}
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {!product.image && badges.map(b => (
                  <span key={b.label} className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${b.color}`}>{b.label}</span>
                ))}
                {product.calories && <span className="text-[10px] text-muted-foreground">🔥 {product.calories}kcal</span>}
                {product.preparation_time && <span className="text-[10px] text-muted-foreground">⏱ {product.preparation_time}m</span>}
              </div>
            </div>
            {!product.image && (
              <button onClick={() => onToggleFavorite(product.id)} className="shrink-0 p-1">
                <Heart className={`w-4 h-4 ${isFavorite ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}`} />
              </button>
            )}
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-sm font-black text-primary">{currency}{parseFloat(product.selling_price || 0).toFixed(2)}</span>
            <Button size="sm" className="h-8 px-3 rounded-xl font-bold text-xs" onClick={() => onAdd(product)}>
              <Plus className="w-3.5 h-3.5 mr-1" />{t('add') || 'Add'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Cart Item ─────────────────────────────────────────────────────────────────
function CartItem({ item, onAdd, onRemove, lang, currency }) {
  const name = item[`name_${lang}`] || item.name_ar || item.name || '';
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{name}</p>
        {item.selectedModifiers?.length > 0 && (
          <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
            {item.selectedModifiers.flatMap(m => m.options.map(o => o[`name_${lang}`] || o.name_en)).join(', ')}
          </p>
        )}
        {item.notes && <p className="text-[10px] text-muted-foreground italic">"{item.notes}"</p>}
        <p className="text-xs text-primary font-bold mt-1">{currency}{(item.unitPrice * item.qty).toFixed(2)}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0 mt-0.5">
        <button onClick={() => onRemove(item.cartId)} className="w-7 h-7 rounded-full bg-muted flex items-center justify-center">
          <Minus className="w-3 h-3" />
        </button>
        <span className="text-sm font-bold w-4 text-center">{item.qty}</span>
        <button onClick={() => onAdd(item)} className="w-7 h-7 rounded-full bg-primary flex items-center justify-center">
          <Plus className="w-3 h-3 text-white" />
        </button>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function OnlineOrdering() {
  const { t, currency, lang } = useLanguage();
  const { ownerFilter } = useTenant();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [tab, setTab] = useState('menu');
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [cart, setCart] = useState([]);
  const [favorites, setFavorites] = useState(new Set());
  const [showCart, setShowCart] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [customizeDialog, setCustomizeDialog] = useState({ open: false, product: null, modifiers: [] });
  const [promoCode, setPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [placingOrder, setPlacingOrder] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState(null);

  // Load categories from Menu (not from OnlineOrderCategory)
  // Categories are now unified in MenuCategory for both Delivery and Online Ordering

  // Load menu categories
  const { data: menuCategories = [] } = useQuery({
    queryKey: ['menu_categories', ownerFilter],
    queryFn: () => base44.entities.MenuCategory.filter({ active: true }, 'sort_order', 200),
    staleTime: 60000,
  });

  // Load menu subcategories
  const { data: menuSubcategories = [] } = useQuery({
    queryKey: ['menu_subcategories', ownerFilter],
    queryFn: () => base44.entities.MenuSubcategory.filter({ active: true }, 'sort_order', 200),
    staleTime: 60000,
  });

  // Load menu products
  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['menu_products', ownerFilter],
    queryFn: () => base44.entities.MenuProduct.filter({ active: true }, 'name', 200),
    enabled: true,
    staleTime: 60000,
  });

  // Load active order for tracking
  const { data: activeOrder } = useQuery({
    queryKey: ['active_order', activeOrderId],
    queryFn: () => base44.entities.Order.get(activeOrderId),
    enabled: !!activeOrderId,
    refetchInterval: 15000,
  });

  // Load customer record
  const { data: customer } = useQuery({
    queryKey: ['customer_for_ordering', user?.email],
    queryFn: async () => {
      const r = await base44.entities.Customer.filter({ email: user?.email }, '-created_date', 1);
      return r?.[0] || null;
    },
    enabled: !!user?.email,
  });

  // Load customer addresses
  const { data: addresses = [] } = useQuery({
    queryKey: ['customer_addresses_ordering', customer?.id],
    queryFn: () => base44.entities.CustomerAddress.filter({ customer_id: customer.id }, '-created_at', 10),
    enabled: !!customer?.id,
  });

  // Load promotions
  const { data: promotions = [] } = useQuery({
    queryKey: ['promotions', ownerFilter],
    queryFn: () => base44.entities.Promotion.filter({ ...ownerFilter, is_active: true }, '-created_at', 20),
    enabled: !!ownerFilter?.created_by,
  });

  // Filtered products
  const filteredProducts = useMemo(() => {
    let p = products;
    if (selectedCategory !== 'all') p = p.filter(prod => prod.menu_category_id === selectedCategory);
    if (search) p = p.filter(prod => {
      const n = (prod.name || '') + (prod.description || '');
      return n.toLowerCase().includes(search.toLowerCase());
    });
    return p;
  }, [products, selectedCategory, search]);

  // Note: Featured, Popular, New, Best Seller flags should be added to MenuProduct schema if needed
  const featuredProducts = useMemo(() => products.filter(p => p.is_featured), [products]);
  const popularProducts = useMemo(() => products.filter(p => p.is_popular), [products]);
  const newProducts = useMemo(() => products.filter(p => p.is_new), [products]);
  const bestSellers = useMemo(() => products.filter(p => p.is_best_seller), [products]);

  // Cart calculations
  const cartSubtotal = cart.reduce((s, i) => s + (i.unitPrice * i.qty), 0);
  const deliveryFee = cartSubtotal > 0 ? 5 : 0;
  const serviceFee = cartSubtotal > 0 ? 1.5 : 0;
  const tax = cartSubtotal * 0.15;
  const promoDiscount = appliedPromo
    ? appliedPromo.type === 'percentage' ? Math.min(cartSubtotal * (appliedPromo.value / 100), appliedPromo.max_discount || Infinity)
    : appliedPromo.type === 'fixed' ? appliedPromo.value
    : appliedPromo.type === 'free_delivery' ? deliveryFee
    : 0
    : 0;
  const cartTotal = cartSubtotal + deliveryFee + serviceFee + tax - promoDiscount;
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  const openCustomize = async (product) => {
    try {
      const mods = await base44.entities.ProductModifier.filter({ product_id: product.id }, 'sort_order', 20);
      for (const mod of mods) {
        mod.options = await base44.entities.ProductModifierOption.filter({ modifier_id: mod.id }, 'sort_order', 20);
      }
      setCustomizeDialog({ open: true, product, modifiers: mods });
    } catch {
      // No modifiers — add directly
      addToCart({ ...product, qty: 1, notes: '', selectedModifiers: [], unitPrice: parseFloat(product.selling_price) || 0, totalPrice: parseFloat(product.selling_price) || 0 });
    }
  };

  const addToCart = useCallback((item) => {
    const cartId = `${item.id}_${Date.now()}`;
    setCart(prev => {
      // If same product with no modifiers, increment
      if (!item.selectedModifiers?.length) {
        const existing = prev.find(i => i.id === item.id && !i.selectedModifiers?.length);
        if (existing) return prev.map(i => i.cartId === existing.cartId ? { ...i, qty: i.qty + (item.qty || 1) } : i);
      }
      return [...prev, { ...item, cartId, qty: item.qty || 1 }];
    });
    const name = item[`name_${lang}`] || item.name_ar || item.name || '';
    toast.success(`${name} ${t('add_to_cart') || 'added'}`);
  }, [lang, t]);

  const removeFromCart = useCallback((cartId) => {
    setCart(prev => {
      const item = prev.find(i => i.cartId === cartId);
      if (!item) return prev;
      if (item.qty <= 1) return prev.filter(i => i.cartId !== cartId);
      return prev.map(i => i.cartId === cartId ? { ...i, qty: i.qty - 1 } : i);
    });
  }, []);

  const toggleFavorite = useCallback((id) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const applyPromo = () => {
    const promo = promotions.find(p => p.code?.toLowerCase() === promoCode.toLowerCase());
    if (!promo) { toast.error('Invalid promo code'); return; }
    if (promo.min_order_amount && cartSubtotal < promo.min_order_amount) {
      toast.error(`Minimum order: ${currency}${promo.min_order_amount}`);
      return;
    }
    setAppliedPromo(promo);
    toast.success(`Promo applied: ${promo.code}`);
  };

  const placeOrder = async () => {
    if (cart.length === 0) return;
    setPlacingOrder(true);
    try {
      // Create order
      const order = await base44.entities.Order.create({
        ...ownerFilter,
        customer_id: customer?.id || null,
        subtotal: cartSubtotal,
        tax_amount: tax,
        delivery_fee: deliveryFee,
        service_fee: serviceFee,
        promo_discount: promoDiscount,
        promo_code: appliedPromo?.code || null,
        total_amount: cartTotal,
        status: 'pending',
        delivery_status: 'unassigned',
        payment_status: 'pending',
        order_type: 'delivery',
        notes: deliveryAddress,
        priority: customer?.loyalty_tier === 'Platinum' || customer?.loyalty_tier === 'Gold' ? 'VIP' : 'Normal',
      });

      // Create order items
      for (const item of cart) {
        await base44.entities.OrderItem.create({
          order_id: order.id,
          product_id: item.id,
          quantity: item.qty,
          unit_price: item.unitPrice,
          total_price: item.unitPrice * item.qty,
          modifiers_json: item.selectedModifiers || [],
          special_notes: item.notes || null,
        });
      }

      // Create payment record
      await base44.entities.Payment.create({
        order_id: order.id,
        amount: cartTotal,
        payment_method: paymentMethod,
        status: paymentMethod === 'cash' ? 'pending' : 'paid',
      });

      // Update loyalty points
      if (customer?.id) {
        const pointsEarned = Math.floor(cartTotal);
        const newPoints = (customer.loyalty_points || 0) + pointsEarned;
        const newTier = newPoints >= 5000 ? 'Platinum' : newPoints >= 1500 ? 'Gold' : newPoints >= 500 ? 'Silver' : 'Bronze';
        await base44.entities.Customer.update(customer.id, { loyalty_points: newPoints, loyalty_tier: newTier });
        qc.invalidateQueries(['customer_for_ordering']);
      }

      setActiveOrderId(order.id);
      setCart([]);
      setAppliedPromo(null);
      setPromoCode('');
      setShowCheckout(false);
      setTab('tracking');
      toast.success(t('order_placed') || 'Order placed successfully!');
    } catch (e) {
      toast.error('Failed to place order. Please try again.');
      console.error(e);
    }
    setPlacingOrder(false);
  };

  const getStepLabel = (step) => {
    if (lang === 'ar') return step.label_ar;
    if (lang === 'fa') return step.label_fa;
    return step.label_en;
  };

  const currentStepIndex = activeOrder
    ? ORDER_STEPS.findIndex(s => s.key === (activeOrder.delivery_status || activeOrder.status))
    : -1;

  return (
    <div className="space-y-4 pb-32">
      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-xl font-bold">{t('online_ordering') || 'Order Online'}</h1>
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
            <MapPin className="w-3 h-3" />
            <span>{t('main_branch') || 'Main Branch'}</span>
            <span>·</span>
            <Clock className="w-3 h-3" />
            <span>30-45 min</span>
          </div>
        </div>
        <button onClick={() => setShowCart(true)} className="relative p-2.5 rounded-xl bg-primary/10 active:scale-95 transition-transform">
          <ShoppingCart className="w-5 h-5 text-primary" />
          {cartCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-white text-[10px] font-black rounded-full flex items-center justify-center">
              {cartCount}
            </span>
          )}
        </button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full grid grid-cols-3 h-9">
          <TabsTrigger value="menu" className="text-xs">{t('menu_page') || 'Menu'}</TabsTrigger>
          <TabsTrigger value="tracking" className="text-xs">{t('order_tracking') || 'Tracking'}</TabsTrigger>
          <TabsTrigger value="history" className="text-xs">{t('order_history') || 'History'}</TabsTrigger>
        </TabsList>

        {/* ── MENU TAB ── */}
        <TabsContent value="menu" className="mt-3 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('search') + '...'} className="pl-9 h-10 text-sm rounded-xl" />
          </div>

          {/* Categories */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${selectedCategory === 'all' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}
            >
              {t('all') || 'All'}
            </button>
            {menuCategories.map(cat => {
              const catName = cat[`name_${lang}`] || cat.name_en || cat.name_ar || '';
              return (
                <button key={cat.id} onClick={() => setSelectedCategory(cat.id)}
                  className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${selectedCategory === cat.id ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>
                  {cat.icon && <span>{cat.icon}</span>}
                  {catName}
                </button>
              );
            })}
          </div>

          {loadingProducts ? (
            <div className="flex justify-center py-10"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : (
            <>
              {/* Featured */}
              {selectedCategory === 'all' && featuredProducts.length > 0 && (
                <section>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1"><Sparkles className="w-3 h-3" /> {t('featured') || 'Featured'}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {featuredProducts.map(p => (
                      <ProductCard key={p.id} product={p} onAdd={openCustomize} isFavorite={favorites.has(p.id)} onToggleFavorite={toggleFavorite} lang={lang} />
                    ))}
                  </div>
                </section>
              )}

              {/* Popular */}
              {selectedCategory === 'all' && popularProducts.length > 0 && (
                <section>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1"><Flame className="w-3 h-3" /> {t('popular') || 'Popular'}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {popularProducts.map(p => (
                      <ProductCard key={p.id} product={p} onAdd={openCustomize} isFavorite={favorites.has(p.id)} onToggleFavorite={toggleFavorite} lang={lang} />
                    ))}
                  </div>
                </section>
              )}

              {/* New Items */}
              {selectedCategory === 'all' && newProducts.length > 0 && (
                <section>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1"><Zap className="w-3 h-3" /> {t('new_items') || 'New'}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {newProducts.map(p => (
                      <ProductCard key={p.id} product={p} onAdd={openCustomize} isFavorite={favorites.has(p.id)} onToggleFavorite={toggleFavorite} lang={lang} />
                    ))}
                  </div>
                </section>
              )}

              {/* All / Filtered */}
              <section>
                {selectedCategory !== 'all' && (
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">
                    {categories.find(c => c.id === selectedCategory)?.[`name_${lang}`] || categories.find(c => c.id === selectedCategory)?.name_en || ''}
                  </p>
                )}
                {selectedCategory === 'all' && filteredProducts.length > 0 && (
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">{t('all_items') || 'All Items'}</p>
                )}
                {filteredProducts.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">{t('no_data')}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {filteredProducts.map(p => (
                      <ProductCard key={p.id} product={p} onAdd={openCustomize} isFavorite={favorites.has(p.id)} onToggleFavorite={toggleFavorite} lang={lang} />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </TabsContent>

        {/* ── TRACKING TAB ── */}
        <TabsContent value="tracking" className="mt-3">
          {!activeOrder ? (
            <div className="text-center py-10 text-muted-foreground">
              <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">{t('no_active_order') || 'No active order'}</p>
              <p className="text-xs mt-1">{t('place_order_to_track') || 'Place an order to track it here'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <Card>
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Bike className="w-4 h-4 text-primary" />
                    {t('order') || 'Order'} #{activeOrder.id?.slice(-6)?.toUpperCase()}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="space-y-3">
                    {ORDER_STEPS.map((step, i) => {
                      const isDone = i <= currentStepIndex;
                      const isCurrent = i === currentStepIndex;
                      return (
                        <div key={step.key} className="flex items-start gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all ${isDone ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'} ${isCurrent ? 'ring-2 ring-primary ring-offset-2' : ''}`}>
                            <step.icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 pt-1">
                            <p className={`text-sm font-medium ${isDone ? 'text-foreground' : 'text-muted-foreground'}`}>{getStepLabel(step)}</p>
                            {i < ORDER_STEPS.length - 1 && (
                              <div className={`w-0.5 h-5 ms-3.5 mt-1 ${isDone ? 'bg-primary' : 'bg-border'}`} />
                            )}
                          </div>
                          {isCurrent && <Badge className="text-[10px] bg-primary/10 text-primary border-0 shrink-0 mt-1">Now</Badge>}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t('total')}</span>
                    <span className="font-black text-primary">{currency}{activeOrder.total_amount?.toFixed(2)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ── HISTORY TAB ── */}
        <TabsContent value="history" className="mt-3">
          {!customer ? (
            <div className="text-center py-10 text-muted-foreground">
              <Clock className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">{t('login_to_view_history') || 'Login to view order history'}</p>
            </div>
          ) : (
            <PastOrders customerId={customer.id} currency={currency} t={t} lang={lang} onReorder={(items) => {
              items.forEach(item => addToCart(item));
              setTab('menu');
              toast.success('Items added to cart!');
            }} />
          )}
        </TabsContent>
      </Tabs>

      {/* ── STICKY CHECKOUT BUTTON ── */}
      {cartCount > 0 && !showCart && !showCheckout && (
        <div className="fixed bottom-16 left-0 right-0 z-40 px-4 pb-2">
          <Button
            className="w-full h-14 rounded-2xl font-black text-base shadow-2xl bg-primary hover:bg-primary/90 active:scale-[0.98] transition-all"
            onClick={() => setShowCart(true)}
          >
            <ShoppingCart className="w-5 h-5 mr-2" />
            {t('view_cart') || 'View Cart'} ({cartCount}) · {currency}{cartTotal.toFixed(2)}
          </Button>
        </div>
      )}

      {/* ── CART DRAWER ── */}
      {showCart && (
        <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setShowCart(false)}>
          <div className="absolute bottom-0 left-0 right-0 bg-background rounded-t-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
              <h2 className="text-base font-black">{t('cart') || 'Cart'} ({cartCount})</h2>
              <button onClick={() => setShowCart(false)} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {cart.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">{t('cart_empty') || 'Your cart is empty'}</p>
              ) : (
                <>
                  {cart.map(item => (
                    <CartItem key={item.cartId} item={item} onAdd={addToCart} onRemove={removeFromCart} lang={lang} currency={currency} />
                  ))}
                  <div className="mt-4 pt-3 border-t border-border space-y-1.5">
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t('subtotal') || 'Subtotal'}</span><span className="font-semibold">{currency}{cartSubtotal.toFixed(2)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t('tax') || 'Tax (15%)'}</span><span className="font-semibold">{currency}{tax.toFixed(2)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t('delivery_fee') || 'Delivery Fee'}</span><span className="font-semibold">{currency}{deliveryFee.toFixed(2)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t('service_fee') || 'Service Fee'}</span><span className="font-semibold">{currency}{serviceFee.toFixed(2)}</span></div>
                    {promoDiscount > 0 && (
                      <div className="flex justify-between text-sm text-emerald-600"><span>{t('promo_discount') || 'Promo Discount'}</span><span className="font-bold">-{currency}{promoDiscount.toFixed(2)}</span></div>
                    )}
                    <div className="flex justify-between text-base font-black pt-1 border-t border-border">
                      <span>{t('total')}</span>
                      <span className="text-primary">{currency}{cartTotal.toFixed(2)}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
            {cart.length > 0 && (
              <div className="p-4 border-t border-border shrink-0">
                <Button className="w-full h-12 rounded-xl font-black text-base" onClick={() => { setShowCart(false); setShowCheckout(true); }}>
                  {t('proceed_to_checkout') || 'Proceed to Checkout'} · {currency}{cartTotal.toFixed(2)}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CHECKOUT DIALOG ── */}
      <Dialog open={showCheckout} onOpenChange={setShowCheckout}>
        <DialogContent className="max-w-sm mx-auto max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-black">{t('checkout') || 'Checkout'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Order Summary */}
            <div className="bg-muted/50 rounded-xl p-3 space-y-1.5">
              <p className="text-xs font-bold uppercase text-muted-foreground mb-2">{t('order_summary') || 'Order Summary'}</p>
              {cart.map(item => {
                const name = item[`name_${lang}`] || item.name_ar || item.name || '';
                return (
                  <div key={item.cartId} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{name} × {item.qty}</span>
                    <span className="font-semibold">{currency}{(item.unitPrice * item.qty).toFixed(2)}</span>
                  </div>
                );
              })}
              <div className="border-t border-border pt-1.5 mt-1.5 space-y-1">
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">{t('subtotal') || 'Subtotal'}</span><span>{currency}{cartSubtotal.toFixed(2)}</span></div>
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">{t('tax') || 'Tax'}</span><span>{currency}{tax.toFixed(2)}</span></div>
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">{t('delivery_fee') || 'Delivery'}</span><span>{currency}{deliveryFee.toFixed(2)}</span></div>
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">{t('service_fee') || 'Service'}</span><span>{currency}{serviceFee.toFixed(2)}</span></div>
                {promoDiscount > 0 && <div className="flex justify-between text-xs text-emerald-600"><span>{t('discount') || 'Discount'}</span><span>-{currency}{promoDiscount.toFixed(2)}</span></div>}
                <div className="flex justify-between text-sm font-black pt-1 border-t border-border">
                  <span>{t('total')}</span>
                  <span className="text-primary">{currency}{cartTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Delivery Address */}
            <div>
              <Label className="text-xs font-bold">{t('delivery_address') || 'Delivery Address'}</Label>
              {addresses.length > 0 ? (
                <div className="space-y-1.5 mt-1">
                  {addresses.map(addr => (
                    <button key={addr.id} onClick={() => setDeliveryAddress(addr.address_line1 + (addr.city ? ', ' + addr.city : ''))}
                      className={`w-full text-left p-2.5 rounded-xl border-2 text-sm transition-all ${deliveryAddress === addr.address_line1 + (addr.city ? ', ' + addr.city : '') ? 'border-primary bg-primary/5' : 'border-border'}`}>
                      <span className="font-medium">{addr.label}</span> — {addr.address_line1}
                    </button>
                  ))}
                </div>
              ) : (
                <Input className="mt-1 h-9 text-sm" value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} placeholder="Enter delivery address..." />
              )}
            </div>

            {/* Promo Code */}
            <div>
              <Label className="text-xs font-bold">{t('promo_code') || 'Promo Code'}</Label>
              <div className="flex gap-2 mt-1">
                <Input className="flex-1 h-9 text-sm" value={promoCode} onChange={e => setPromoCode(e.target.value)} placeholder="Enter code..." disabled={!!appliedPromo} />
                {appliedPromo ? (
                  <Button size="sm" variant="outline" className="h-9 px-3" onClick={() => { setAppliedPromo(null); setPromoCode(''); }}>
                    <X className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button size="sm" className="h-9 px-3" onClick={applyPromo} disabled={!promoCode}>
                    <Tag className="w-4 h-4" />
                  </Button>
                )}
              </div>
              {appliedPromo && <p className="text-xs text-emerald-600 mt-1 font-medium">✓ {appliedPromo.code} applied — save {currency}{promoDiscount.toFixed(2)}</p>}
            </div>

            {/* Payment Method */}
            <div>
              <Label className="text-xs font-bold">{t('payment_method') || 'Payment Method'}</Label>
              <div className="grid grid-cols-2 gap-1.5 mt-1">
                {PAYMENT_METHODS.map(pm => {
                  const pmLabel = pm[`label_${lang}`] || pm.label_en;
                  return (
                    <button key={pm.id} onClick={() => setPaymentMethod(pm.id)}
                      className={`flex items-center gap-2 p-2.5 rounded-xl border-2 text-xs font-medium transition-all ${paymentMethod === pm.id ? 'border-primary bg-primary/5' : 'border-border'}`}>
                      <span>{pm.icon}</span>
                      <span className="truncate">{pmLabel}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Place Order Button */}
            <Button
              className="w-full h-12 rounded-xl font-black text-base"
              onClick={placeOrder}
              disabled={placingOrder || cart.length === 0}
            >
              {placingOrder ? (
                <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />{t('placing_order') || 'Placing...'}</>
              ) : (
                <>{t('place_order') || 'Place Order'} · {currency}{cartTotal.toFixed(2)}</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── PRODUCT CUSTOMIZE DIALOG ── */}
      <ProductCustomizeDialog
        open={customizeDialog.open}
        product={customizeDialog.product}
        modifiers={customizeDialog.modifiers}
        onClose={() => setCustomizeDialog({ open: false, product: null, modifiers: [] })}
        onAddToCart={addToCart}
        lang={lang}
      />
    </div>
  );
}

// ── Past Orders Component ─────────────────────────────────────────────────────
function PastOrders({ customerId, currency, t, lang, onReorder }) {
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['past_orders', customerId],
    queryFn: () => base44.entities.Order.filter({ customer_id: customerId }, '-created_date', 30),
    enabled: !!customerId,
  });

  if (isLoading) return <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  if (orders.length === 0) return (
    <div className="text-center py-10 text-muted-foreground">
      <Clock className="w-10 h-10 mx-auto mb-2 opacity-30" />
      <p className="text-sm">{t('no_data')}</p>
    </div>
  );

  return (
    <div className="space-y-3">
      {orders.map(order => (
        <Card key={order.id} className="overflow-hidden">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-bold">#{order.id?.slice(-6)?.toUpperCase()}</p>
                <p className="text-xs text-muted-foreground">{order.created_date ? format(new Date(order.created_date), 'dd MMM yyyy') : '—'}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-black text-primary">{currency}{order.total_amount?.toFixed(2)}</p>
                <Badge variant="outline" className={`text-[10px] ${order.status === 'delivered' ? 'text-emerald-600 border-emerald-300' : 'text-amber-600 border-amber-300'}`}>
                  {order.status}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
