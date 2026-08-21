import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_WIDGET_IDS,
  getDashboardWidgetDefaults,
  normalizeDashboardWidgetConfiguration,
  resetDashboardWidgetOverride,
} from '../src/lib/dashboardCustomization.js';

const ownerDashboardPath = new URL('../src/pages/OwnerDashboard.jsx', import.meta.url);
const driverPerformancePath = new URL('../src/components/dashboard/DriverPerformance.jsx', import.meta.url);
const migrationPath = new URL('../src/supabase/20260821_dashboard_customization.sql', import.meta.url);

const translations = {
  driver_analytics: 'Driver Analytics',
  all_branches: 'All Branches',
  executive_summary: 'Executive Summary',
  todays_kpi: "Today's KPIs",
  operating_result: 'Operating Result',
  sales_revenue_minus_purchases: 'Sales revenue minus approved purchases',
  cash_reconciliation: 'Cash Reconciliation',
  todays_cash_position: "Today's cash position",
  sales_analytics: 'Sales Analytics',
  multi_period_sales: 'Today, yesterday, week, month, and year',
  additional_sales_sources: 'Additional Sales Sources',
  delivery_catering_subtitle: 'Delivery, catering, online orders, and order channels',
  purchase_analytics: 'Purchase Analytics',
  approved_invoices_branch: 'Approved invoices · branch-filtered',
  product_consumption_analytics: 'Product Consumption Analytics',
  purchase_items_branch: 'Purchase items',
  inventory_analytics: 'Inventory Analytics',
  stock_health_overview: 'Stock health overview',
  cash_flow: 'Cash Flow',
  todays_money_movement: "Today's money movement",
  price_intelligence: 'Product Price Intelligence',
  price_changes_subtitle: 'Price changes and trends (last 30 days)',
  alerts_label: 'Alerts',
  active_alert: 'active alert',
  active_alerts: 'active alerts',
  price_changes_title: 'Price Changes',
  mode_specific_insights: 'Mode-specific insights',
  mode_specific_subtitle: 'Widgets are adjusted automatically for the business type',
};

const t = (key) => translations[key] || key;
const defaults = () => getDashboardWidgetDefaults({
  lang: 'en',
  t,
  selectedBranch: 'all',
  selectedBranchLabel: 'All Branches',
  activeAlertCount: 2,
});

describe('Owner dashboard customization', () => {
  it('keeps the existing Driver Analytics defaults for new restaurant accounts', () => {
    const driver = defaults().find((widget) => widget.id === DASHBOARD_WIDGET_IDS.DRIVER_ANALYTICS);
    expect(driver).toMatchObject({
      id: 'driver-analytics',
      title: 'Driver Analytics',
      description: 'Branch and driver sales performance',
      isOptional: true,
    });
  });

  it('preserves owner-entered Arabic, English, and Persian text exactly without changing the widget ID', () => {
    const configured = normalizeDashboardWidgetConfiguration(defaults(), {
      [DASHBOARD_WIDGET_IDS.DRIVER_ANALYTICS]: {
        title: 'تحليل التوصيل',
        description: 'Delivery · راننده · تحویل',
      },
      [DASHBOARD_WIDGET_IDS.FINANCIAL_CENTER]: {
        title: 'Delivery',
        description: 'گزارش سفارشی',
      },
    });
    const driver = configured.find((widget) => widget.id === DASHBOARD_WIDGET_IDS.DRIVER_ANALYTICS);
    const financial = configured.find((widget) => widget.id === DASHBOARD_WIDGET_IDS.FINANCIAL_CENTER);
    expect(driver.id).toBe('driver-analytics');
    expect(driver.title).toBe('تحليل التوصيل');
    expect(driver.description).toBe('Delivery · راننده · تحویل');
    expect(financial.title).toBe('Delivery');
    expect(financial.description).toBe('گزارش سفارشی');
  });

  it('hides only optional widgets and keeps required widgets visible', () => {
    const configured = normalizeDashboardWidgetConfiguration(defaults(), {
      [DASHBOARD_WIDGET_IDS.DRIVER_ANALYTICS]: { is_visible: false },
      [DASHBOARD_WIDGET_IDS.EXECUTIVE_SUMMARY]: { is_visible: false },
    });
    expect(configured.find((widget) => widget.id === DASHBOARD_WIDGET_IDS.DRIVER_ANALYTICS)?.isVisible).toBe(false);
    expect(configured.find((widget) => widget.id === DASHBOARD_WIDGET_IDS.EXECUTIVE_SUMMARY)?.isVisible).toBe(true);
  });

  it('resets a widget by removing only its override, retaining all other restaurant-scoped overrides', () => {
    const before = {
      [DASHBOARD_WIDGET_IDS.DRIVER_ANALYTICS]: { title: 'Delivery Analytics', is_visible: false },
      [DASHBOARD_WIDGET_IDS.FINANCIAL_CENTER]: { title: 'Reports Hub' },
    };
    expect(resetDashboardWidgetOverride(before, DASHBOARD_WIDGET_IDS.DRIVER_ANALYTICS)).toEqual({
      [DASHBOARD_WIDGET_IDS.FINANCIAL_CENTER]: { title: 'Reports Hub' },
    });
  });

  it('uses a restaurant-scoped RLS table and permits mutation only for owners or explicit members', async () => {
    const migration = await readFile(migrationPath, 'utf8');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.dashboard_configurations');
    expect(migration).toContain('restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE');
    expect(migration).toContain('UNIQUE (restaurant_id)');
    expect(migration).toContain('dashboard_configurations_member_select');
    expect(migration).toContain('erp_can_access_scope(restaurant_id, NULL)');
    expect(migration).toContain('erp_can_manage_dashboard_customization');
    expect(migration).toContain("membership.permissions ->> 'manageDashboardCustomization'");
  });

  it('keeps DriverPerformance and its branch-aware metrics intact while routing section metadata through the reusable system', async () => {
    const [ownerDashboard, driverPerformance] = await Promise.all([
      readFile(ownerDashboardPath, 'utf8'),
      readFile(driverPerformancePath, 'utf8'),
    ]);
    expect(ownerDashboard).toContain("import DriverPerformance from '@/components/dashboard/DriverPerformance';");
    expect(ownerDashboard).toContain('restaurantId={activeRestaurant?.id}');
    expect(ownerDashboard).toContain('branches={branches}');
    expect(ownerDashboard).toContain('selectedBranch={selectedBranch}');
    expect(ownerDashboard).toContain('currency={currency}');
    expect(ownerDashboard).toContain("title={dashboardCustomization.widgetsById['driver-analytics']?.title}");
    expect(ownerDashboard).toContain("description={dashboardCustomization.widgetsById['driver-analytics']?.description}");
    expect(driverPerformance).toContain('<h2 className="text-sm font-bold text-foreground leading-tight">{title}</h2>');
    expect(driverPerformance).not.toContain('>Driver Analytics</h2>');
    expect(driverPerformance).not.toContain('Branch and driver sales performance, refreshed from canonical driver and sales records.');
    expect(ownerDashboard).toContain('DashboardCustomizationContext.Provider');
    expect(ownerDashboard).toContain('configuredWidget?.title ?? title');
    expect(ownerDashboard).not.toContain('title="Driver Analytics"');
    expect(ownerDashboard).not.toContain('subtitle="Branch and driver sales performance"');
  });
});
