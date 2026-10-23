import { driverSourcePaymentBreakdown } from '../salesSourceClosingLifecycle';
import { paymentMethodForCode, sumClosingMoney } from './CashReconciliationLedger';

/**
 * Current shift only. Source snapshots and 'previous' amounts must never be
 * added to current revenue twice; funding and cash movements are not sales.
 * "Manual / Counter" is the stored closing's restaurant cash bucket with
 * already-snapshotted custom source amounts removed by UnifiedSalesClosing.
 */
export function closingCashSalesSources({ baseCashSales = 0, summaries = [] } = {}) {
  const rows = [{
    id: 'restaurant_cash',
    label: 'Counter / manual cash',
    labelFa: 'نقد کانتر / دستی',
    labelAr: 'نقد الكاونتر / يدوي',
    amount: sumClosingMoney(baseCashSales),
  }];
  for (const { source, sourceLabel, today, driverEntries = [] } of summaries || []) {
    if (!source || source.included_in_revenue === false) continue;
    const cash = source.allows_driver_entries === true
      ? driverSourcePaymentBreakdown(driverEntries).cash
      : paymentMethodForCode(source.default_payment_method) === 'cash' ? today : 0;
    const amount = sumClosingMoney(cash);
    // A card, credit or wallet-only source is not a physical Cash Sales row.
    if (amount <= 0) continue;
    rows.push({
      id: 'source:' + String(source.id),
      label: sourceLabel || source.name_en || source.name || 'Cash source',
      labelFa: source.name_fa || sourceLabel || source.name_en || 'منبع نقدی',
      labelAr: source.name_ar || sourceLabel || source.name_en || 'مصدر نقدي',
      amount,
    });
  }
  return { rows, total: sumClosingMoney(...rows.map(row => row.amount)) };
}
