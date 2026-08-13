/**
 * Online Ordering V2 — Core Service
 * Handles order lifecycle, real-time events, notifications, and business logic.
 * Integrated into Smart Restaurant ERP — shares the same DB, auth, and infra.
 */
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { createNotification } from '@/lib/notificationEngine';

// ── Order Status Pipeline ──────────────────────────────────────────────────
export const ORDER_STATUS = {
  PENDING:       'pending',
  ASSIGNED:      'assigned',
  PICKED_UP:     'picked_up',
  ON_THE_WAY:    'on_the_way',
  ARRIVED:       'arrived',
  DELIVERED:     'delivered',
  CANCELLED:     'cancelled',
  REFUNDED:      'refunded',
};

export const DELIVERY_STATUS = {
  UNASSIGNED: 'unassigned',
  ASSIGNED:   'assigned',
  PICKED_UP:  'picked_up',
  ON_THE_WAY: 'on_the_way',
  ARRIVED:    'arrived',
  DELIVERED:  'delivered',
};

export const PAYMENT_METHODS = [
  { id: 'cash',         label_en: 'Cash on Delivery',    label_ar: 'الدفع عند الاستلام', icon: '💵' },
  { id: 'mada',         label_en: 'Mada',                label_ar: 'مدى',                icon: '🏦' },
  { id: 'visa',         label_en: 'Visa',                label_ar: 'فيزا',               icon: '💳' },
  { id: 'mastercard',   label_en: 'Mastercard',          label_ar: 'ماستركارد',          icon: '💳' },
  { id: 'apple_pay',    label_en: 'Apple Pay',           label_ar: 'آبل باي',            icon: '🍎' },
  { id: 'stc_pay',      label_en: 'STC Pay',             label_ar: 'اس تي سي باي',       icon: '📱' },
  { id: 'wallet',       label_en: 'Wallet',              label_ar: 'المحفظة',            icon: '👛' },
  { id: 'network',      label_en: 'Network Account',     label_ar: 'حساب الشبكة',        icon: '🔗' },
];

// ── Order Number Generator ─────────────────────────────────────────────────
export function generateOrderNumber(prefix = 'ORD') {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

// ── Place Order ────────────────────────────────────────────────────────────
export async function placeOrder({
  restaurantId,
  branchId,
  customerId,
  items,
  deliveryAddressId,
  paymentMethod,
  promoCode,
  walletAmount = 0,
  loyaltyPointsToUse = 0,
  notes = '',
  orderType = 'delivery',
  orgId,
}) {
  // 1. Validate promo code
  let promoDiscount = 0;
  let promotionId = null;
  if (promoCode) {
    const promos = await base44.entities.Promotion.filter({
      code: promoCode,
      is_active: true,
    });
    const promo = promos?.[0];
    if (promo) {
      promotionId = promo.id;
      const subtotal = items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
      if (promo.type === 'percentage') {
        promoDiscount = Math.min((subtotal * promo.value) / 100, promo.max_discount || Infinity);
      } else if (promo.type === 'fixed') {
        promoDiscount = Math.min(promo.value, subtotal);
      } else if (promo.type === 'free_delivery') {
        promoDiscount = 0; // handled at delivery fee level
      }
    }
  }

  // 2. Calculate totals
  const subtotal = items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const deliveryFee = orderType === 'delivery' ? 10 : 0; // TODO: dynamic from branch settings
  const taxAmount = subtotal * 0.15; // 15% VAT
  const totalBeforeWallet = subtotal + deliveryFee + taxAmount - promoDiscount;
  const walletUsed = Math.min(walletAmount, totalBeforeWallet);
  const totalAmount = totalBeforeWallet - walletUsed;

  // 3. Create the order
  const orderData = {
    restaurant_id: restaurantId,
    branch_id: branchId,
    customer_id: customerId,
    order_number: generateOrderNumber(),
    order_type: orderType,
    status: ORDER_STATUS.PENDING,
    delivery_status: DELIVERY_STATUS.UNASSIGNED,
    payment_method: paymentMethod,
    payment_status: 'pending',
    subtotal,
    delivery_fee: deliveryFee,
    tax_amount: taxAmount,
    discount_amount: promoDiscount,
    wallet_used: walletUsed,
    total_amount: totalAmount,
    promotion_id: promotionId,
    delivery_address_id: deliveryAddressId,
    customer_notes: notes,
    priority: 'normal',
    created_by: orgId,
    created_date: new Date().toISOString(),
  };

  const order = await base44.entities.Order.create(orderData);

  // 4. Create order items
  await Promise.all(
    items.map(item =>
      base44.entities.OrderItem.create({
        order_id: order.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.unit_price * item.quantity,
        modifiers_json: JSON.stringify(item.modifiers || []),
        special_notes: item.notes || '',
      })
    )
  );

  // 5. Track initial event
  await trackOrderEvent(order.id, ORDER_STATUS.PENDING, 'Order placed by customer', null, 'customer');

  // 6. Deduct wallet if used
  if (walletUsed > 0 && customerId) {
    await deductCustomerWallet(customerId, walletUsed, order.id, 'Order payment');
  }

  // 7. Notify the branch manager
  await createNotification({
    orgId,
    restaurantId,
    type: 'new_order',
    title: `New Order ${order.order_number}`,
    message: `New ${orderType} order received. Total: ${totalAmount.toFixed(2)} SAR`,
    targetRole: 'manager',
    severity: 'info',
    metadata: { order_id: order.id, order_number: order.order_number },
  });

  return order;
}

// ── Track Order Event ──────────────────────────────────────────────────────
export async function trackOrderEvent(orderId, status, description, actorId = null, actorRole = null) {
  return base44.entities.OrderTracking.create({
    order_id: orderId,
    status,
    description,
    actor_id: actorId,
    actor_role: actorRole,
    created_at: new Date().toISOString(),
  });
}

// ── Update Order Status ────────────────────────────────────────────────────
export async function updateOrderStatus(orderId, newStatus, actorId, actorRole, orgId, restaurantId) {
  await base44.entities.Order.update(orderId, { status: newStatus, updated_date: new Date().toISOString() });
  await trackOrderEvent(orderId, newStatus, `Status updated to ${newStatus}`, actorId, actorRole);

  const statusMessages = {
    [ORDER_STATUS.ASSIGNED]:   { title: 'Driver Assigned', message: 'A driver has been assigned to your order.' },
    [ORDER_STATUS.PICKED_UP]:  { title: 'Picked Up', message: 'Your order has been picked up by the driver.' },
    [ORDER_STATUS.ON_THE_WAY]: { title: 'On the Way', message: 'Your driver is on the way.' },
    [ORDER_STATUS.ARRIVED]:    { title: 'Driver Near You', message: 'Your driver is almost there!' },
    [ORDER_STATUS.DELIVERED]:  { title: 'Delivered', message: 'Your order has been delivered. Enjoy!' },
    [ORDER_STATUS.CANCELLED]:  { title: 'Order Cancelled', message: 'Your order has been cancelled.' },
  };

  const msg = statusMessages[newStatus];
  if (msg && orgId) {
    await createNotification({
      orgId,
      restaurantId,
      type: 'order_status',
      title: msg.title,
      message: msg.message,
      targetRole: 'customer',
      severity: 'info',
      metadata: { order_id: orderId, status: newStatus },
    });
  }
}

// ── Assign Driver ──────────────────────────────────────────────────────────
export async function assignDriver(orderId, driverId, driverName, orgId, restaurantId) {
  await base44.entities.Order.update(orderId, {
    driver_id: driverId,
    delivery_status: DELIVERY_STATUS.ASSIGNED,
    updated_date: new Date().toISOString(),
  });
  await trackOrderEvent(orderId, ORDER_STATUS.ASSIGNED, `Driver ${driverName} assigned`, driverId, 'driver');
  await updateOrderStatus(orderId, ORDER_STATUS.ASSIGNED, driverId, 'driver', orgId, restaurantId);
}

// ── Update Driver Location ─────────────────────────────────────────────────
export async function updateDriverLocation(driverId, orderId, latitude, longitude, heading = null, speed = null) {
  return base44.entities.DriverLocation.create({
    driver_id: driverId,
    order_id: orderId,
    latitude,
    longitude,
    heading,
    speed,
    timestamp: new Date().toISOString(),
  });
}

// ── Apply Promotion ────────────────────────────────────────────────────────
export async function validatePromoCode(code, subtotal) {
  const promos = await base44.entities.Promotion.filter({ code, is_active: true });
  const promo = promos?.[0];
  if (!promo) return { valid: false, message: 'Invalid or expired promo code' };
  if (promo.end_date && new Date(promo.end_date) < new Date()) return { valid: false, message: 'Promo code has expired' };
  if (promo.usage_limit && promo.times_used >= promo.usage_limit) return { valid: false, message: 'Promo code usage limit reached' };
  if (subtotal < (promo.min_order_amount || 0)) return { valid: false, message: `Minimum order amount is ${promo.min_order_amount} SAR` };

  let discount = 0;
  if (promo.type === 'percentage') discount = Math.min((subtotal * promo.value) / 100, promo.max_discount || Infinity);
  else if (promo.type === 'fixed') discount = Math.min(promo.value, subtotal);
  else if (promo.type === 'free_delivery') discount = 0;

  return { valid: true, discount, promo };
}

// ── Loyalty Points ─────────────────────────────────────────────────────────
export async function awardLoyaltyPoints(customerId, orderId, orderTotal) {
  const pointsEarned = Math.floor(orderTotal / 10); // 1 point per 10 SAR
  if (pointsEarned <= 0) return;

  const customers = await base44.entities.Customer.filter({ id: customerId });
  const customer = customers?.[0];
  if (!customer) return;

  const newPoints = (customer.loyalty_points || 0) + pointsEarned;
  await base44.entities.Customer.update(customerId, { loyalty_points: newPoints });
  await base44.entities.LoyaltyTransaction.create({
    customer_id: customerId,
    order_id: orderId,
    type: 'earned',
    points: pointsEarned,
    description: `Earned from order`,
    created_at: new Date().toISOString(),
  });

  return pointsEarned;
}

// ── Wallet Operations ──────────────────────────────────────────────────────
export async function deductCustomerWallet(customerId, amount, orderId, description) {
  const customers = await base44.entities.Customer.filter({ id: customerId });
  const customer = customers?.[0];
  if (!customer || (customer.cashback_wallet || 0) < amount) return false;

  const newBalance = (customer.cashback_wallet || 0) - amount;
  await base44.entities.Customer.update(customerId, { cashback_wallet: newBalance });
  await base44.entities.WalletTransaction.create({
    customer_id: customerId,
    order_id: orderId,
    type: 'withdrawal',
    amount,
    balance_after: newBalance,
    description,
    created_at: new Date().toISOString(),
  });
  return true;
}

export async function addCashbackToWallet(customerId, amount, orderId, description) {
  const customers = await base44.entities.Customer.filter({ id: customerId });
  const customer = customers?.[0];
  if (!customer) return;

  const newBalance = (customer.cashback_wallet || 0) + amount;
  await base44.entities.Customer.update(customerId, { cashback_wallet: newBalance });
  await base44.entities.WalletTransaction.create({
    customer_id: customerId,
    order_id: orderId,
    type: 'cashback',
    amount,
    balance_after: newBalance,
    description,
    created_at: new Date().toISOString(),
  });
}

// ── Real-time Subscription Helpers ────────────────────────────────────────
export function subscribeToOrder(orderId, callback) {
  return supabase
    .channel(`order:${orderId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'orders',
      filter: `id=eq.${orderId}`,
    }, callback)
    .subscribe();
}

export function subscribeToOrderTracking(orderId, callback) {
  return supabase
    .channel(`tracking:${orderId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'order_tracking',
      filter: `order_id=eq.${orderId}`,
    }, callback)
    .subscribe();
}

export function subscribeToDriverLocation(orderId, callback) {
  return supabase
    .channel(`driver_loc:${orderId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'driver_locations',
      filter: `order_id=eq.${orderId}`,
    }, callback)
    .subscribe();
}

export function subscribeToBranchOrders(branchId, callback) {
  return supabase
    .channel(`branch_orders:${branchId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'orders',
      filter: `branch_id=eq.${branchId}`,
    }, callback)
    .subscribe();
}

// ── Order PDF Data Builder ─────────────────────────────────────────────────
export function buildOrderPDFData(order, items, restaurant, customer) {
  return {
    orderNumber: order.order_number,
    date: new Date(order.created_date).toLocaleString(),
    restaurant: {
      name: restaurant?.name || 'Restaurant',
      address: restaurant?.address || '',
      phone: restaurant?.phone || '',
    },
    customer: {
      name: customer?.name || order.customer_name || '',
      phone: customer?.phone || order.customer_phone || '',
      address: order.delivery_address || '',
    },
    items: items.map(i => ({
      name: i.name || i.product_name,
      qty: i.quantity,
      unitPrice: i.unit_price,
      total: i.total_price,
    })),
    subtotal: order.subtotal,
    deliveryFee: order.delivery_fee,
    tax: order.tax_amount,
    discount: order.discount_amount,
    walletUsed: order.wallet_used,
    total: order.total_amount,
    paymentMethod: order.payment_method,
    status: order.status,
  };
}

// ── Analytics Helpers ──────────────────────────────────────────────────────
export async function getOrderAnalytics(restaurantId, dateFrom, dateTo) {
  const orders = await base44.entities.Order.filter({
    restaurant_id: restaurantId,
  });

  const filtered = orders.filter(o => {
    const d = new Date(o.created_date);
    return d >= new Date(dateFrom) && d <= new Date(dateTo);
  });

  const completed = filtered.filter(o => o.status === ORDER_STATUS.DELIVERED);
  const cancelled = filtered.filter(o => o.status === ORDER_STATUS.CANCELLED);
  const revenue = completed.reduce((s, o) => s + (o.total_amount || 0), 0);
  const avgOrderValue = completed.length > 0 ? revenue / completed.length : 0;

  return {
    totalOrders: filtered.length,
    completedOrders: completed.length,
    cancelledOrders: cancelled.length,
    revenue,
    avgOrderValue,
    conversionRate: filtered.length > 0 ? (completed.length / filtered.length) * 100 : 0,
  };
}
