/**
 * Online Ordering Redesign Module
 * Integrated dashboards for Customer, Driver, and Admin
 * Real-time order flow: Customer → Manager Dispatch → Driver
 */

import { base44 } from '@/api/base44Client';

/**
 * Customer Dashboard Features:
 * - Browse menu by category
 * - Add items to cart
 * - Place order with delivery address
 * - Track order in real-time
 * - View order history
 * - Manage wallet and loyalty points
 */
export const CustomerDashboardFeatures = {
  menuBrowsing: {
    description: 'Browse restaurant menu by category',
    features: ['Category filter', 'Search', 'Item details', 'Price display', 'Availability status'],
  },
  cart: {
    description: 'Manage shopping cart',
    features: ['Add items', 'Remove items', 'Modify quantity', 'Special instructions', 'Cart summary'],
  },
  checkout: {
    description: 'Place order',
    features: ['Delivery address', 'Payment method', 'Promo code', 'Wallet balance', 'Loyalty points'],
  },
  tracking: {
    description: 'Real-time order tracking',
    features: ['Order status', 'Driver location', 'Estimated delivery', 'Live notifications', 'Contact driver'],
  },
  history: {
    description: 'Order history and management',
    features: ['Past orders', 'Reorder', 'Ratings & reviews', 'Invoice download', 'Refund requests'],
  },
  wallet: {
    description: 'Wallet and loyalty management',
    features: ['Balance display', 'Transaction history', 'Cashback earned', 'Loyalty points', 'Redemption'],
  },
};

/**
 * Admin Dispatch Center Features:
 * - Live dispatch map
 * - Driver management
 * - Order assignment
 * - Performance analytics
 * - Customer support
 */
export const AdminDispatchFeatures = {
  liveMap: {
    description: 'Real-time dispatch map',
    features: ['Driver locations', 'Unassigned orders', 'Order markers', 'Heatmap', 'Cluster view'],
  },
  driverManagement: {
    description: 'Manage active drivers',
    features: ['Driver list', 'Status filter', 'Availability', 'Ratings', 'Earnings', 'Deactivate'],
  },
  orderAssignment: {
    description: 'Assign orders to drivers',
    features: ['Smart assignment', 'Manual assignment', 'Batch assignment', 'Reassignment', 'Optimization'],
  },
  analytics: {
    description: 'Performance analytics',
    features: ['Delivery time', 'Acceptance rate', 'Cancellation rate', 'Customer ratings', 'Driver efficiency'],
  },
  support: {
    description: 'Customer support tools',
    features: ['Chat with customer', 'Chat with driver', 'Order history', 'Issue resolution', 'Refund management'],
  },
};

/**
 * Real-time Order Flow
 * delivery status pipeline
 */
export const OrderStatusPipeline = [
  { status: 'pending', label: 'Order Received', icon: 'Clock', color: 'slate' },
  { status: 'assigned', label: 'Driver Assigned', icon: 'Bike', color: 'purple' },
  { status: 'picked_up', label: 'Picked Up', icon: 'MapPin', color: 'indigo' },
  { status: 'on_the_way', label: 'On the Way', icon: 'Navigation', color: 'cyan' },
  { status: 'arrived', label: 'Driver Arrived', icon: 'AlertCircle', color: 'orange' },
  { status: 'delivered', label: 'Delivered', icon: 'CheckCircle2', color: 'emerald' },
  { status: 'cancelled', label: 'Cancelled', icon: 'X', color: 'red' },
];

/**
 * Real-time Notification Events
 */
export const RealtimeEvents = {
  ORDER_CREATED: 'order:created',
  DRIVER_ASSIGNED: 'driver:assigned',
  DRIVER_PICKED_UP: 'driver:picked_up',
  DRIVER_ON_WAY: 'driver:on_the_way',
  DRIVER_ARRIVED: 'driver:arrived',
  ORDER_DELIVERED: 'order:delivered',
  ORDER_CANCELLED: 'order:cancelled',
};

/**
 * Create order with all required fields
 */
export async function createOrder(orderData) {
  try {
    const order = {
      ...orderData,
      order_number: `ORD-${Date.now()}`,
      order_source: 'online',
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    return await base44.entities.Order.create(order);
  } catch (err) {
    console.error('[OnlineOrdering] createOrder error:', err);
    throw err;
  }
}

/**
 * Update order status with tracking
 */
export async function updateOrderStatus(orderId, newStatus, metadata = {}) {
  try {
    const tracking = {
      order_id: orderId,
      status: newStatus,
      timestamp: new Date().toISOString(),
      ...metadata,
    };

    // Create tracking record
    await base44.entities.OrderTracking.create(tracking);

    // Update order status
    return await base44.entities.Order.update(orderId, {
      status: newStatus,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[OnlineOrdering] updateOrderStatus error:', err);
    throw err;
  }
}

/**
 * Assign order to driver
 */
export async function assignOrderToDriver(orderId, driverId, estimatedTime) {
  try {
    return await updateOrderStatus(orderId, 'assigned', {
      driver_id: driverId,
      estimated_delivery_time: estimatedTime,
      assigned_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[OnlineOrdering] assignOrderToDriver error:', err);
    throw err;
  }
}

/**
 * Get active orders for dashboard
 */
export async function getActiveOrders(restaurantId, status = null) {
  try {
    const filter = { restaurant_id: restaurantId };
    if (status) filter.status = status;

    const { data: orders } = await base44.entities.Order.filter(filter, '-created_at', 100);
    return orders || [];
  } catch (err) {
    console.error('[OnlineOrdering] getActiveOrders error:', err);
    throw err;
  }
}

/**
 * Get order tracking history
 */
export async function getOrderTracking(orderId) {
  try {
    const { data: tracking } = await base44.entities.OrderTracking.filter(
      { order_id: orderId },
      'timestamp',
      100
    );
    return tracking || [];
  } catch (err) {
    console.error('[OnlineOrdering] getOrderTracking error:', err);
    throw err;
  }
}

/**
 * Send real-time notification
 */
export async function sendNotification(orderId, event, recipients) {
  try {
    const notification = {
      order_id: orderId,
      event,
      recipients: JSON.stringify(recipients),
      sent_at: new Date().toISOString(),
      status: 'sent',
    };

    return await base44.entities.Notification.create(notification);
  } catch (err) {
    console.error('[OnlineOrdering] sendNotification error:', err);
    throw err;
  }
}

export default {
  CustomerDashboardFeatures,
  AdminDispatchFeatures,
  OrderStatusPipeline,
  RealtimeEvents,
  createOrder,
  updateOrderStatus,
  assignOrderToDriver,
  getActiveOrders,
  getOrderTracking,
  sendNotification,
};
