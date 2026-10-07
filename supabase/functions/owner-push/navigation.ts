// Destinations are application-owned routes, never URLs supplied by record data.
export function recordRoute(entity: string): string {
 if(entity==='sales_invoices') return '/sales/invoices';
 if(entity==='daily_sales' || entity==='driver_sales_entries') return '/sales';
 if(entity==='sales_sources' || entity==='sales_categories') return '/sales-sources';
 if(entity.startsWith('sales_closing_')) return '/sales';
 if(entity==='supplier_invoices' || entity==='purchases') return '/purchases';
 if(entity==='purchase_orders') return '/purchase-orders';
 if(entity==='supplier_payments') return '/supplier-ledger';
 if(entity==='suppliers') return '/suppliers';
 if(entity==='expenses' || entity==='expense_categories') return '/expenses';
 if(entity.startsWith('product') || entity==='categories' || entity==='online_order_categories' || entity==='branch_product_assortments') return '/product-management';
 if(entity.startsWith('inventory') || entity.startsWith('retail_inventory') || /^(recipe|ingredient|production)/.test(entity)) return '/inventory';
 if(entity.startsWith('network_') || entity==='pos_reconciliation') return '/network-management';
 if(entity.startsWith('driver') || entity==='delivery_orders') return '/driver-management';
 if(entity.startsWith('debt') || entity==='customer_collections' || entity==='collection_actions') return '/debt-management';
 if(entity.startsWith('customer') || entity.startsWith('loyalty')) return '/customer-management';
 if(/^(cash_|daily_cash|owner_cash|owner_personal|treasury|wallet|settlement)/.test(entity)) return '/treasury';
 if(entity.startsWith('sponsor_')) return '/sponsor-treasury';
 if(/^(payroll|salary|deduction|employee_bonus)/.test(entity)) return '/payroll';
 if(entity==='attendance' || entity==='staff_attendance') return '/employee-attendance';
 if(/^(employee|staff|manager_invite)/.test(entity)) return '/employees';
 if(entity==='branches' || entity==='branch_assignments') return '/branch-management';
 if(entity==='brand_settings') return '/brand';
 if(entity==='approval_policies') return '/approval-policy';
 if(entity==='erp_role_permissions' || entity==='role_templates') return '/role-permissions';
 if(entity.startsWith('erp_')) return '/erp-approval-center';
 if(entity.startsWith('subscription')) return '/billing';
 if(entity==='payment_methods' || entity==='app_settings') return '/settings';
 if(entity==='tasks') return '/tasks';
 if(entity==='support_tickets') return '/support';
 if(entity==='scheduled_reports') return '/scheduled-reports';
 if(entity==='active_alerts' || entity==='announcements') return '/alerts';
 if(entity==='promotions') return '/promotions';
 if(entity.startsWith('retail_pos_')) return '/retail/pos-control';
 if(['orders','order_items','payments','reservations','dining_tables'].includes(entity)) return '/restaurant/pos';
 return '/activity-logs';
}
export const validEventId=(value: unknown)=>typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function notificationTarget(event: any) {
 const path=recordRoute(String(event?.entity || ''));
 return validEventId(event?.id) ? `${path}?notification=${encodeURIComponent(event.id)}` : path;
}
