/**
 * CashRegister — READ ONLY cash reconciliation panel.
 *
 * Displays reconciliation data saved by SalesForm.
 * Revenue is displayed separately from the persisted ledger-backed Expected Cash.
 * This panel never recomputes Expected Cash from revenue.
 * Shortage/Overage = Actual Count − Expected.
 * These figures do NOT affect Sales Total.
 */
import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { format } from 'date-fns';
import {
  Banknote, CheckCircle2, TrendingDown, TrendingUp, Lock,
  Clock, User, ShieldCheck, SunMedium, Moon, Scale
} from 'lucide-react';

const LABELS = {
  en: {
    title: 'Cash Reconciliation',
    opening_cash: 'Opening Cash',
    cash_sales: 'Cash Sales (Revenue)',
    expected_cash: 'Expected Cash',
    actual_cash: 'Actual Cash Count',
    cash_difference: 'Cash Difference',
    cash_status: 'Status',
    balanced: 'Balanced',
    shortage: 'Shortage',
    overage: 'Overage',
    no_data: 'No sale record found for this date/branch.',
    read_only_note: 'Auto-synced from Add Sale records',
    shift: 'Shift',
    cashier: 'Cashier',
    notes: 'Notes',
    manager_approved: 'Manager Approved',
    shortage_approved: 'Shortage approved by manager',
    daily_total: 'Daily Cash Total',
    morning: 'Morning',
    evening: 'Evening',
    owner_contrib: 'Owner Contribution',
    note_no_sales_impact: 'Reconciliation items do not affect Sales Total.',
  },
  ar: {
    title: 'تسوية النقد',
    opening_cash: 'النقد الافتتاحي',
    cash_sales: 'المبيعات النقدية (إيراد)',
    expected_cash: 'النقد المتوقع',
    actual_cash: 'العد الفعلي',
    cash_difference: 'فرق النقد',
    cash_status: 'الحالة',
    balanced: 'متوازن',
    shortage: 'عجز',
    overage: 'زيادة',
    no_data: 'لا يوجد سجل مبيعات لهذا التاريخ/الفرع.',
    read_only_note: 'تُزامن تلقائياً من سجلات إضافة المبيعات',
    shift: 'الوردية',
    cashier: 'الكاشير',
    notes: 'ملاحظات',
    manager_approved: 'موافقة المدير',
    shortage_approved: 'تمت الموافقة على العجز من قِبل المدير',
    daily_total: 'إجمالي النقد اليومي',
    morning: 'صباحية',
    evening: 'مسائية',
    owner_contrib: 'مساهمة المالك',
    note_no_sales_impact: 'بنود التسوية لا تؤثر على إجمالي المبيعات.',
  },
  fa: {
    title: 'تطبیق نقد',
    opening_cash: 'نقد ابتدایی',
    cash_sales: 'فروش نقدی (درآمد)',
    expected_cash: 'نقد مورد انتظار',
    actual_cash: 'شمارش واقعی',
    cash_difference: 'اختلاف نقد',
    cash_status: 'وضعیت',
    balanced: 'متعادل',
    shortage: 'کسری',
    overage: 'مازاد',
    no_data: 'هیچ رکورد فروشی برای این تاریخ/شعبه یافت نشد.',
    read_only_note: 'همگام‌سازی خودکار از رکوردهای افزودن فروش',
    shift: 'شیفت',
    cashier: 'صندوقدار',
    notes: 'یادداشت',
    manager_approved: 'تأیید مدیر',
    shortage_approved: 'کسری توسط مدیر تأیید شد',
    daily_total: 'جمع نقد روزانه',
    morning: 'صبح',
    evening: 'عصر',
    owner_contrib: 'سرمایه مالک',
    note_no_sales_impact: 'اقلام تطبیق بر جمع فروش تأثیر نمی‌گذارند.',
  },
};

function CashStatusBadge({ status, lbl }) {
  if (!status) return null;
  const config = {
    Balanced: { color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
    Shortage: { color: 'bg-red-100 text-red-700 border-red-200', icon: TrendingDown },
    Overage:  { color: 'bg-amber-100 text-amber-700 border-amber-200', icon: TrendingUp },
  };
  const c = config[status] || config.Balanced;
  const Icon = c.icon;
  const label = lbl[status.toLowerCase()] || status;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${c.color}`}>
      <Icon className="w-3.5 h-3.5" />{label}
    </span>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2 py-1">
      <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <span className="text-xs text-muted-foreground">{label}:</span>
      <span className="text-xs font-medium text-foreground">{value}</span>
    </div>
  );
}

function ReconcRow({ label, value, currency, valueColor }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-xs font-bold ${valueColor || 'text-foreground'}`}>{currency}{Number(value || 0).toLocaleString()}</span>
    </div>
  );
}

function ShiftCard({ sale, currency, lbl }) {
  const cashSalesRevenue = Number(sale.restaurant_cash ?? sale.cash ?? 0);
  const opening          = Number(sale.opening_cash ?? 0);
  // Expected Cash is the server-persisted, ledger-derived snapshot only.
  const expectedCash     = Number(sale.expected_cash ?? 0);
  const actualCash       = Number(sale.actual_cash ?? 0);
  // Cash Difference = Actual − Expected
  const cashDiff         = actualCash - expectedCash;
  const cashShortage     = Number(sale.cash_shortage_amount) || Math.max(0, -cashDiff);
  const cashOverage      = Number(sale.cash_overage_amount)  || Math.max(0, cashDiff);
  const ownerContrib     = Number(sale.owner_cash_injection || 0);

  const status = sale.cash_status || (cashDiff === 0 ? 'Balanced' : cashDiff < 0 ? 'Shortage' : 'Overage');
  const isEvening = sale.shift === 'Evening';
  const ShiftIcon = isEvening ? Moon : SunMedium;

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {/* Shift header */}
      <div className={`flex items-center gap-2 px-3 py-2 ${isEvening ? 'bg-indigo-50 dark:bg-indigo-950/30' : 'bg-amber-50 dark:bg-amber-950/30'}`}>
        <ShiftIcon className={`w-3.5 h-3.5 ${isEvening ? 'text-indigo-600' : 'text-amber-600'}`} />
        <span className={`text-xs font-bold ${isEvening ? 'text-indigo-700' : 'text-amber-700'}`}>
          {sale.shift === 'Evening' ? lbl.evening : lbl.morning}
        </span>
        <span className="ms-auto">
          <CashStatusBadge status={status} lbl={lbl} />
        </span>
      </div>

      <div className="p-3 space-y-2">
        {/* Reconciliation grid */}
        <div className="rounded-lg bg-muted/30 border border-border p-2 space-y-0.5">
          <ReconcRow label={lbl.opening_cash}  value={opening}         currency={currency} />
          <ReconcRow label={lbl.cash_sales}    value={cashSalesRevenue} currency={currency} valueColor="text-blue-600" />
          <ReconcRow label={lbl.expected_cash} value={expectedCash}    currency={currency} valueColor="text-muted-foreground" />
          <ReconcRow label={lbl.actual_cash}   value={actualCash}      currency={currency} />
        </div>

        {/* Cash Difference */}
        <div className="rounded-lg bg-muted/30 border border-border px-3 py-2 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{lbl.cash_difference}</span>
          <span className={`text-sm font-extrabold ${cashDiff > 0 ? 'text-amber-600' : cashDiff < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {cashDiff >= 0 ? '+' : ''}{currency}{Math.abs(cashDiff).toLocaleString()}
          </span>
        </div>

        {/* Shortage / Overage */}
        {cashShortage > 0 && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-red-700">{lbl.shortage}</span>
            <span className="text-sm font-bold text-red-600">{currency}{cashShortage.toLocaleString()}</span>
          </div>
        )}
        {cashOverage > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-amber-700">{lbl.overage}</span>
            <span className="text-sm font-bold text-amber-600">{currency}{cashOverage.toLocaleString()}</span>
          </div>
        )}
        {ownerContrib > 0 && (
          <div className="rounded-lg bg-purple-50 border border-purple-200 px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-purple-700">{lbl.owner_contrib}</span>
            <span className="text-sm font-bold text-purple-600">{currency}{ownerContrib.toLocaleString()}</span>
          </div>
        )}

        {/* Note: reconciliation does not affect sales */}
        {status !== 'Balanced' && (
          <p className="text-[9px] text-muted-foreground italic">{lbl.note_no_sales_impact}</p>
        )}

        {/* Shift info */}
        <div className="space-y-0.5">
          <InfoRow icon={User}  label={lbl.cashier} value={sale.cashier_name} />
          {sale.cash_notes  && <InfoRow icon={Banknote} label={lbl.cash_status} value={sale.cash_notes} />}
          {sale.sales_notes && <InfoRow icon={Clock}    label={lbl.notes}       value={sale.sales_notes} />}
        </div>

        {/* Manager Approval */}
        {sale.manager_approval && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 px-3 py-2">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-emerald-700">{lbl.manager_approved}</p>
              {sale.manager_approved_by && (
                <p className="text-[10px] text-muted-foreground">{sale.manager_approved_by}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CashRegister({ date, branch }) {
  const { language, currency } = useLanguage();
  const lbl = LABELS[language] || LABELS.en;
  const { ownerFilter } = useTenant();
  const todayStr = date || format(new Date(), 'yyyy-MM-dd');

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ['sales_daily', ownerFilter, todayStr],
    queryFn: () => base44.entities.DailySales.filter({ ...(ownerFilter || {}), date: todayStr }, '-date', 100),
    enabled: !!(ownerFilter?.created_by || ownerFilter?.branch),
    staleTime: 15000,
  });

  const filteredSales = useMemo(() => {
    const filtered = (!branch || branch === 'all')
      ? sales
      : sales.filter(s => s.branch === branch);
    return filtered.sort((a, b) => new Date(a.created_date || 0) - new Date(b.created_date || 0));
  }, [sales, branch]);

  // Daily totals — cash sales revenue (NOT closing-opening diff)
  const dailyTotals = useMemo(() => {
    return filteredSales.reduce((acc, sale) => {
      const cashSalesRevenue = Number(sale.restaurant_cash || sale.cash || 0);
      return {
        totalCashSales: acc.totalCashSales + cashSalesRevenue,
        latestActual: Number(sale.actual_cash ?? 0),
      };
    }, { totalCashSales: 0, latestActual: 0 });
  }, [filteredSales]);

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-secondary/60">
        <Scale className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold">{lbl.title}</span>
        <Lock className="w-3 h-3 text-muted-foreground ms-auto" />
      </div>

      <div className="p-3 space-y-3">
        <p className="text-[10px] text-muted-foreground text-center italic">{lbl.read_only_note}</p>

        {isLoading ? (
          <p className="text-xs text-muted-foreground text-center py-4">Loading...</p>
        ) : filteredSales.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">{lbl.no_data}</p>
        ) : (
          <>
            {filteredSales.map(sale => (
              <ShiftCard key={sale.id} sale={sale} currency={currency} lbl={lbl} />
            ))}

            {/* Daily Total — cash sales revenue */}
            {filteredSales.length > 1 && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-muted-foreground">{lbl.daily_total}</span>
                <span className="text-xl font-extrabold text-primary">{currency}{dailyTotals.totalCashSales.toLocaleString()}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
