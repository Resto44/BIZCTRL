/**
 * FinancialKPIs — ERP Dashboard.
 *
 * Four independent cards (Requirement 8):
 *   A. Sales Summary        — Cash + Network + Credit (NEVER affected by reconciliation)
 *   B. Cash Reconciliation  — Opening / Expected / Actual / Shortage / Overage / Owner Contribution
 *   C. Purchases            — Only APPROVED supplier invoices for today
 *   D. Operating Result     — Total Sales − Approved Purchases
 *
 * Plus secondary KPIs: Cash Available, Customer Receivables, Supplier Payables, Inventory Value.
 * Plus Smart Alerts.
 */
import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { useSalesSources } from '@/hooks/useSalesSources';
import { format } from 'date-fns';
import {
  TrendingUp, DollarSign, Users, Truck, Package,
  AlertTriangle, ShoppingCart,
  Scale
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { calculateSalesRevenue } from '@/lib/helpers';

const LABELS = {
  en: {
    // Card A
    card_a_title: 'Sales Summary',
    cash_sales: 'Cash Sales',
    network_sales: 'Network / POS Sales',
    credit_sales: 'Customer Credit Sales',
    total_sales: 'Total Sales',
    vs_yesterday: 'vs yesterday',
    // Card B
    card_b_title: 'Cash Reconciliation',
    opening_cash: 'Opening Cash',
    expected_cash: 'Expected Cash',
    actual_cash: 'Actual Cash Count',
    cash_difference: 'Cash Difference',
    cash_shortage: 'Cash Shortage',
    cash_overage: 'Cash Overage',
    owner_contrib_cash: 'Owner Contribution (Cash)',
    balanced: 'Balanced',
    shortage: 'Shortage',
    overage: 'Overage',
    // Card C
    card_c_title: 'Purchases (Approved)',
    approved_invoices: 'Approved Invoices',
    // Card D
    card_d_title: 'Operating Result',
    operating_result: 'Operating Result',
    owner_capital_purchases: 'Owner Capital (Purchases Gap)',
    // Secondary KPIs
    cash_available: 'Cash Available',
    customer_receivables: 'Customer Receivables',
    supplier_payables: 'Supplier Payables',
    inventory_value: 'Inventory Value',
    // Alerts
    alerts: 'Smart Alerts',
    overdue_customers: 'overdue customer debts',
    overdue_suppliers: 'overdue supplier balances',
    low_inventory: 'low inventory items',
  },
  ar: {
    card_a_title: 'ملخص المبيعات',
    cash_sales: 'المبيعات النقدية',
    network_sales: 'مبيعات الشبكة / POS',
    credit_sales: 'مبيعات الآجل',
    total_sales: 'إجمالي المبيعات',
    vs_yesterday: 'مقارنة بالأمس',
    card_b_title: 'تسوية النقد',
    opening_cash: 'النقد الافتتاحي',
    expected_cash: 'النقد المتوقع',
    actual_cash: 'العد الفعلي',
    cash_difference: 'فرق النقد',
    cash_shortage: 'عجز نقدي',
    cash_overage: 'زيادة نقدية',
    owner_contrib_cash: 'مساهمة المالك (نقد)',
    balanced: 'متوازن',
    shortage: 'عجز',
    overage: 'زيادة',
    card_c_title: 'المشتريات (معتمدة)',
    approved_invoices: 'فواتير معتمدة',
    card_d_title: 'النتيجة التشغيلية',
    operating_result: 'النتيجة التشغيلية',
    owner_capital_purchases: 'رأس مال المالك (فجوة المشتريات)',
    cash_available: 'النقد المتاح',
    customer_receivables: 'المستحقات من العملاء',
    supplier_payables: 'المستحق للموردين',
    inventory_value: 'قيمة المخزون',
    alerts: 'تنبيهات ذكية',
    overdue_customers: 'ديون عملاء متأخرة',
    overdue_suppliers: 'أرصدة موردين متأخرة',
    low_inventory: 'مخزون منخفض',
  },
  fa: {
    card_a_title: 'خلاصه فروش',
    cash_sales: 'فروش نقدی',
    network_sales: 'فروش شبکه / POS',
    credit_sales: 'فروش اعتباری مشتری',
    total_sales: 'جمع فروش',
    vs_yesterday: 'در مقایسه با دیروز',
    card_b_title: 'تطبیق نقد',
    opening_cash: 'نقد ابتدایی',
    expected_cash: 'نقد مورد انتظار',
    actual_cash: 'شمارش واقعی',
    cash_difference: 'اختلاف نقد',
    cash_shortage: 'کسری نقد',
    cash_overage: 'مازاد نقد',
    owner_contrib_cash: 'سرمایه مالک (نقد)',
    balanced: 'متعادل',
    shortage: 'کسری',
    overage: 'مازاد',
    card_c_title: 'خریدها (تأیید شده)',
    approved_invoices: 'فاکتورهای تأیید شده',
    card_d_title: 'نتیجه عملیاتی',
    operating_result: 'نتیجه عملیاتی',
    owner_capital_purchases: 'سرمایه مالک (شکاف خرید)',
    cash_available: 'نقد موجود',
    customer_receivables: 'مطالبات مشتریان',
    supplier_payables: 'قابل پرداخت تامین‌کننده',
    inventory_value: 'ارزش موجودی',
    alerts: 'هشدارهای هوشمند',
    overdue_customers: 'بدهی‌های معوق مشتریان',
    overdue_suppliers: 'موجودی‌های معوق تامین‌کننده',
    low_inventory: 'موجودی کم',
  },
};

// ── Sub-components ─────────────────────────────────────────────────────────────
function SectionCard({ icon: Icon, title, badge, borderColor = 'border-border', headerBg = 'bg-muted/50', children }) {
  return (
    <div className={`rounded-xl border-2 ${borderColor} overflow-hidden bg-card shadow-sm`}>
      <div className={`flex items-center justify-between px-3 py-2.5 ${headerBg}`}>
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold">{title}</span>
        </div>
        {badge}
      </div>
      <div className="px-3 py-2.5 space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value, highlight, indent, valueColor }) {
  return (
    <div className={`flex justify-between items-center py-1 ${indent ? 'pl-3' : ''} ${highlight ? 'border-t border-border mt-1 pt-2' : ''}`}>
      <span className={`text-xs ${indent ? 'text-muted-foreground' : 'font-semibold text-foreground'}`}>{label}</span>
      <span className={`text-sm font-bold ${valueColor || (highlight ? 'text-primary' : 'text-foreground')}`}>{value}</span>
    </div>
  );
}

function StatusPill({ status, lbl }) {
  if (!status) return null;
  const cfg = {
    Balanced: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    Shortage:  'bg-red-100 text-red-700 border-red-200',
    Overage:   'bg-amber-100 text-amber-700 border-amber-200',
  };
  const label = status === 'Balanced' ? lbl.balanced : status === 'Shortage' ? lbl.shortage : lbl.overage;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg[status] || cfg.Balanced}`}>
      {label}
    </span>
  );
}

function KPICard({ label, value, icon: Icon, color = 'text-primary', bgColor = 'bg-primary/10', trend, sublabel }) {
  return (
    <Card className="p-4 flex items-start gap-3 bg-card border-border/50 shadow-sm">
      <div className={`p-2.5 rounded-xl ${bgColor} ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-muted-foreground truncate">{label}</p>
        <p className="text-lg font-bold text-foreground mt-0.5 truncate">{value}</p>
        {sublabel && <p className="text-xs text-muted-foreground mt-0.5">{sublabel}</p>}
        {trend !== undefined && (
          <p className={`text-xs mt-0.5 font-medium ${trend >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {trend >= 0 ? '+' : ''}{trend.toFixed(1)}%
          </p>
        )}
      </div>
    </Card>
  );
}

function AlertItem({ icon: Icon, text, severity = 'warning' }) {
  const colors = {
    warning: 'text-amber-700 bg-amber-50 border-amber-200',
    error:   'text-red-700 bg-red-50 border-red-200',
    info:    'text-blue-700 bg-blue-50 border-blue-200',
  };
  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${colors[severity]}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="text-xs font-medium">{text}</span>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function FinancialKPIs({ branch }) {
  const { language, currency } = useLanguage();
  const lbl = LABELS[language] || LABELS.en;
  const { ownerFilter } = useTenant();
  const { revenueSources, kpiSources, sources: allSalesSources } = useSalesSources({ branchKey: branch });
  const todayStr      = format(new Date(), 'yyyy-MM-dd');
  const yesterdayStr  = format(new Date(Date.now() - 86400000), 'yyyy-MM-dd');

  const filterBranch = (items) => {
    if (!branch || branch === 'all') return items;
    return items.filter(i => i.branch === branch);
  };

  // Today's sales records
  const { data: todaySales = [] } = useQuery({
    queryKey: ['sales_daily', ownerFilter, todayStr],
    queryFn: () => base44.entities.DailySales.filter({ ...(ownerFilter || {}), date: todayStr }, '-date', 100),
    enabled: !!(ownerFilter?.created_by || ownerFilter?.branch),
    staleTime: 15000,
  });

  // Yesterday's sales (for trend)
  const { data: yesterdaySales = [] } = useQuery({
    queryKey: ['sales_daily', ownerFilter, yesterdayStr],
    queryFn: () => base44.entities.DailySales.filter({ ...(ownerFilter || {}), date: yesterdayStr }, '-date', 100),
    enabled: !!(ownerFilter?.created_by || ownerFilter?.branch),
    staleTime: 60000,
  });

  // Today's APPROVED supplier invoices (authoritative purchase source)
  const { data: todayApprovedPurchases = [] } = useQuery({
    queryKey: ['approved_purchases_kpi', ownerFilter, todayStr],
    queryFn: async () => {
      if (!ownerFilter?.created_by) return [];
      const { data, error } = await supabase
        .from('supplier_invoices')
        .select('id, total_amount, approval_status, status, branch, date')
        .eq('created_by', ownerFilter.created_by)
        .eq('date', todayStr)
        .or(`approval_status.in.(approved,auto_approved),status.eq.approved`)
        .limit(200);
      if (error) return [];
      return data || [];
    },
    enabled: !!ownerFilter?.created_by,
    staleTime: 15000,
  });

  // All supplier invoices (for payables balance)
  const { data: allInvoices = [] } = useQuery({
    queryKey: ['supplier_invoices', ownerFilter],
    queryFn: () => base44.entities.SupplierInvoice.filter(ownerFilter || {}, '-date', 500),
    enabled: !!(ownerFilter?.created_by || ownerFilter?.branch),
    staleTime: 30000,
  });

  const { data: customerDebts = [] } = useQuery({
    queryKey: ['debts_customer', ownerFilter],
    queryFn: () => base44.entities.DebtRecord.filter({ ...(ownerFilter || {}), type: 'receivable', party_type: 'customer' }, '-date', 500),
    enabled: !!(ownerFilter?.created_by || ownerFilter?.branch),
    staleTime: 30000,
  });

  const { data: inventory = [] } = useQuery({
    queryKey: ['inventory', ownerFilter],
    queryFn: () => base44.entities.Inventory.filter(ownerFilter || {}, 'product_name', 500),
    enabled: !!(ownerFilter?.created_by || ownerFilter?.branch),
    staleTime: 60000,
  });

  const metrics = useMemo(() => {
    const daySales  = filterBranch(todaySales);
    const prevSales = filterBranch(yesterdaySales);

        // ── Card A: Sales Summary ─────────────────────────────────────────────────
    // Total Sales = Cash + Network + Credit + Custom Sources.
    // NEVER affected by reconciliation.
    let cashSalesToday = 0;
    let networkSalesToday = 0;
    let creditSalesToday = 0;
    let customSalesToday = 0;
    let totalSalesToday = 0;

    daySales.forEach(r => {
      const rev = calculateSalesRevenue(r, revenueSources);
      cashSalesToday += rev.cash;
      networkSalesToday += rev.network;
      creditSalesToday += rev.credit;
      customSalesToday += rev.customSources;
      totalSalesToday += rev.total;
    });

    const totalSalesYesterday = prevSales.reduce((s, r) => s + calculateSalesRevenue(r, revenueSources).total, 0);
    const salesTrend = totalSalesYesterday > 0
      ? ((totalSalesToday - totalSalesYesterday) / totalSalesYesterday) * 100
      : 0;

    // ── Card B: Cash Reconciliation ───────────────────────────────────────────
    // Read reconciliation fields saved by SalesForm (separate from sales revenue)
    const openingCash    = daySales.reduce((s, r) => s + (Number(r.opening_cash) || 0), 0);
    const expectedCash   = daySales.reduce((s, r) => s + (Number(r.expected_cash) || 0), 0);
    const actualCash     = daySales.reduce((s, r) => s + (Number(r.actual_cash_count) || Number(r.closing_cash) || 0), 0);
    const cashShortage   = daySales.reduce((s, r) => s + (Number(r.cash_shortage_amount) || 0), 0);
    const cashOverage    = daySales.reduce((s, r) => s + (Number(r.cash_overage_amount) || 0), 0);
    const ownerCashContrib = daySales.reduce((s, r) => s + (Number(r.owner_cash_injection) || 0), 0);

    // Overall reconciliation status for today
    const cashDiff = actualCash - expectedCash;
    const reconcStatus = daySales.length === 0 ? null
      : cashDiff === 0 ? 'Balanced'
      : cashDiff < 0   ? 'Shortage'
      : 'Overage';

    // ── Card C: Purchases (Approved) ──────────────────────────────────────────
    const purchasesToday = filterBranch(todayApprovedPurchases).reduce(
      (s, p) => s + (Number(p.total_amount) || 0), 0
    );
    const approvedInvoiceCount = filterBranch(todayApprovedPurchases).length;

    // ── Card D: Operating Result ──────────────────────────────────────────────
    // Operating Result = Total Sales − Approved Purchases
    const operatingResult = totalSalesToday - purchasesToday;
    // Owner capital contribution from purchases gap (NOT sales revenue)
    const ownerCapitalPurchases = Math.max(0, purchasesToday - totalSalesToday);

    // ── Secondary KPIs ────────────────────────────────────────────────────────
    const customerReceivables = customerDebts
      .filter(d => d.status !== 'paid' && d.status !== 'written_off')
      .reduce((s, d) => s + (Number(d.remaining_amount) || 0), 0);

    const supplierPayables = allInvoices
      .filter(inv => inv.status !== 'paid')
      .reduce((s, inv) => s + Math.max(0, (inv.amount || 0) - (inv.paid_amount || 0)), 0);

    const inventoryValue = inventory.reduce((s, item) =>
      s + ((item.quantity || 0) * (item.unit_cost || item.avg_cost || 0)), 0);

    // ── Smart Alerts ──────────────────────────────────────────────────────────
    const alerts = [];
    const overdueCustomers = customerDebts.filter(d =>
      d.status !== 'paid' && d.status !== 'written_off' && d.due_date && d.due_date < todayStr
    );
    if (overdueCustomers.length > 0)
      alerts.push({ icon: Users, text: `${overdueCustomers.length} ${lbl.overdue_customers}`, severity: 'error' });

    const overdueSuppliers = allInvoices.filter(inv =>
      inv.status !== 'paid' && inv.due_date && inv.due_date < todayStr
    );
    if (overdueSuppliers.length > 0)
      alerts.push({ icon: Truck, text: `${overdueSuppliers.length} ${lbl.overdue_suppliers}`, severity: 'error' });

    const lowInventory = inventory.filter(item => {
      const qty = item.quantity || 0;
      const min = item.min_quantity || item.reorder_point || 0;
      return min > 0 && qty <= min;
    });
    if (lowInventory.length > 0)
      alerts.push({ icon: Package, text: `${lowInventory.length} ${lbl.low_inventory}`, severity: 'warning' });

    return {
      // Card A
      cashSalesToday, networkSalesToday, creditSalesToday, customSalesToday, customSourcesMap, totalSalesToday, salesTrend,
      // Card B
      openingCash, expectedCash, actualCash, cashShortage, cashOverage,
      ownerCashContrib, reconcStatus, cashDiff,
      // Card C
      purchasesToday, approvedInvoiceCount,
      // Card D
      operatingResult, ownerCapitalPurchases,
      // Secondary
      customerReceivables, supplierPayables, inventoryValue,
      alerts,
    };
  }, [todaySales, yesterdaySales, todayApprovedPurchases, customerDebts, allInvoices, inventory, branch, todayStr, lbl]);

  const fmt = (v) => `${currency}${Number(v || 0).toLocaleString()}`;

  return (
    <div className="space-y-4">

      {/* ═══════════════════════════════════════════════════════════════════════
          CARD A — SALES SUMMARY
          Total Sales = Cash + Network + Credit.
          NEVER affected by cash shortage, overage, or owner payments.
          ═══════════════════════════════════════════════════════════════════════ */}
      <SectionCard
        icon={TrendingUp}
        title={lbl.card_a_title}
        borderColor="border-blue-200"
        headerBg="bg-blue-50"
        badge={
          <div className="text-right">
            <p className="text-lg font-black text-blue-700">{fmt(metrics.totalSalesToday)}</p>
            {metrics.salesTrend !== 0 && (
              <p className={`text-[10px] font-bold ${metrics.salesTrend >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {metrics.salesTrend >= 0 ? '+' : ''}{metrics.salesTrend.toFixed(1)}% {lbl.vs_yesterday}
              </p>
            )}
          </div>
        }
      >
        <Row label={lbl.cash_sales}    value={fmt(metrics.cashSalesToday)}    indent />
        <Row label={lbl.network_sales} value={fmt(metrics.networkSalesToday)} indent />
        <Row label={lbl.credit_sales}  value={fmt(metrics.creditSalesToday)}  indent />
        {/* Dynamic custom source rows */}
        {allSalesSources
          .filter(s => !s.is_system && s.included_in_dashboard_kpi)
          .map(src => {
            const amt = metrics.customSourcesMap?.[src.id] || metrics.customSourcesMap?.[src.system_key] || 0;
            if (amt === 0) return null;
            return <Row key={src.id} label={src.name_en} value={fmt(amt)} indent />;
          })}
        <Separator className="my-1" />
        <Row label={lbl.total_sales} value={fmt(metrics.totalSalesToday)} highlight valueColor="text-blue-700" />
      </SectionCard>

      {/* ═══════════════════════════════════════════════════════════════════════
          CARD B — CASH RECONCILIATION
          Completely separate from Sales Total.
          Shortage/Overage do NOT change Sales, Network, or Credit.
          ═══════════════════════════════════════════════════════════════════════ */}
      <SectionCard
        icon={Scale}
        title={lbl.card_b_title}
        borderColor="border-amber-200"
        headerBg="bg-amber-50"
        badge={metrics.reconcStatus && <StatusPill status={metrics.reconcStatus} lbl={lbl} />}
      >
        <Row label={lbl.opening_cash}  value={fmt(metrics.openingCash)}  indent />
        <Row label={lbl.expected_cash} value={fmt(metrics.expectedCash)} indent />
        <Row label={lbl.actual_cash}   value={fmt(metrics.actualCash)}   indent />
        <Separator className="my-1" />
        <Row
          label={lbl.cash_difference}
          value={`${metrics.cashDiff >= 0 ? '+' : ''}${fmt(metrics.cashDiff)}`}
          highlight
          valueColor={metrics.cashDiff < 0 ? 'text-red-600' : metrics.cashDiff > 0 ? 'text-amber-600' : 'text-emerald-600'}
        />
        {metrics.cashShortage > 0 && (
          <Row label={lbl.cash_shortage} value={fmt(metrics.cashShortage)} valueColor="text-red-600" indent />
        )}
        {metrics.cashOverage > 0 && (
          <Row label={lbl.cash_overage} value={fmt(metrics.cashOverage)} valueColor="text-amber-600" indent />
        )}
        {metrics.ownerCashContrib > 0 && (
          <Row label={lbl.owner_contrib_cash} value={fmt(metrics.ownerCashContrib)} valueColor="text-purple-600" indent />
        )}
        {metrics.reconcStatus && (
          <p className="text-[9px] text-muted-foreground italic pt-1">
            Reconciliation items do not affect Sales Total.
          </p>
        )}
      </SectionCard>

      {/* ═══════════════════════════════════════════════════════════════════════
          CARD C — PURCHASES (APPROVED ONLY)
          ═══════════════════════════════════════════════════════════════════════ */}
      <SectionCard
        icon={ShoppingCart}
        title={lbl.card_c_title}
        borderColor="border-orange-200"
        headerBg="bg-orange-50"
        badge={
          <p className="text-lg font-black text-orange-700">{fmt(metrics.purchasesToday)}</p>
        }
      >
        <Row
          label={lbl.approved_invoices}
          value={`${metrics.approvedInvoiceCount} invoice${metrics.approvedInvoiceCount !== 1 ? 's' : ''}`}
          indent
        />
        <Row label={lbl.card_c_title} value={fmt(metrics.purchasesToday)} highlight valueColor="text-orange-700" />
      </SectionCard>

      {/* ═══════════════════════════════════════════════════════════════════════
          CARD D — OPERATING RESULT
          Operating Result = Total Sales − Approved Purchases
          If Purchases > Sales → Operating Loss + Owner Capital Contribution
          Owner Capital is NEVER classified as sales revenue.
          ═══════════════════════════════════════════════════════════════════════ */}
      <SectionCard
        icon={DollarSign}
        title={lbl.card_d_title}
        borderColor={metrics.operatingResult >= 0 ? 'border-emerald-200' : 'border-red-200'}
        headerBg={metrics.operatingResult >= 0 ? 'bg-emerald-50' : 'bg-red-50'}
        badge={
          <p className={`text-lg font-black ${metrics.operatingResult >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
            {metrics.operatingResult >= 0 ? '+' : ''}{fmt(metrics.operatingResult)}
          </p>
        }
      >
        <Row label={lbl.total_sales}    value={fmt(metrics.totalSalesToday)}  indent />
        <Row label={lbl.card_c_title}   value={`− ${fmt(metrics.purchasesToday)}`} indent valueColor="text-orange-600" />
        <Separator className="my-1" />
        <Row
          label={lbl.operating_result}
          value={`${metrics.operatingResult >= 0 ? '+' : ''}${fmt(metrics.operatingResult)}`}
          highlight
          valueColor={metrics.operatingResult >= 0 ? 'text-emerald-700' : 'text-red-600'}
        />
        {metrics.ownerCapitalPurchases > 0 && (
          <>
            <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
              <p className="text-[10px] text-amber-700 font-bold uppercase">{lbl.owner_capital_purchases}</p>
              <p className="text-sm font-bold text-amber-700">{fmt(metrics.ownerCapitalPurchases)}</p>
              <p className="text-[9px] text-amber-600 mt-0.5">
                Owner funds to cover purchase shortfall. Not classified as sales revenue.
              </p>
            </div>
          </>
        )}
      </SectionCard>

      {/* ── Secondary KPIs ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <KPICard
          label={lbl.customer_receivables}
          value={fmt(metrics.customerReceivables)}
          icon={Users}
          color="text-amber-600"
          bgColor="bg-amber-100"
        />
        <KPICard
          label={lbl.supplier_payables}
          value={fmt(metrics.supplierPayables)}
          icon={Truck}
          color="text-orange-600"
          bgColor="bg-orange-100"
        />
        <KPICard
          label={lbl.inventory_value}
          value={fmt(metrics.inventoryValue)}
          icon={Package}
          color="text-purple-600"
          bgColor="bg-purple-100"
        />
      </div>

      {/* ── Smart Alerts ────────────────────────────────────────────────────── */}
      {metrics.alerts.length > 0 && (
        <div className="rounded-xl border border-amber-200 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-50">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-semibold text-amber-800">{lbl.alerts}</span>
            <span className="ms-auto text-xs font-bold text-amber-700">{metrics.alerts.length}</span>
          </div>
          <div className="p-3 space-y-2">
            {metrics.alerts.map((alert, i) => (
              <AlertItem key={i} icon={alert.icon} text={alert.text} severity={alert.severity} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
