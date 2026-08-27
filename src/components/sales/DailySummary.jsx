/**
 * DailySummary — Auto-calculated daily financial summary (Sales page sidebar).
 *
 * Accounting rules:
 *  - Total Sales = Cash + Network + Credit  (NEVER affected by reconciliation)
 *  - Purchases   = Only APPROVED supplier invoices for the date
 *  - Operating Result = Total Sales − Approved Purchases − Operating Expenses
 *  - Cash Reconciliation fields are shown separately (no impact on sales)
 */
import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { format } from 'date-fns';
import { TrendingUp, Wallet, ShoppingCart, Truck, Users, BarChart3, Scale, DollarSign } from 'lucide-react';

const LABELS = {
  en: {
    title: 'Daily Summary',
    sales: 'Sales',
    cash_sales: 'Cash Sales',
    network_sales: 'Network / POS Sales',
    credit_sales: 'Customer Credit Sales',
    total_sales: 'Total Sales',
    reconciliation: 'Cash Reconciliation',
    cash_shortage: 'Cash Shortage',
    cash_overage: 'Cash Overage',
    owner_contrib: 'Owner Contribution (Cash)',
    collections: 'Collections',
    customer_collections: 'Customer Collections',
    purchases: 'Purchases (Approved)',
    approved_purchases: 'Approved Invoices',
    expenses: 'Operating Expenses',
    operating_result: 'Operating Result',
    supplier_payments: 'Supplier Payments',
    supplier_debt_balance: 'Supplier Debt Balance',
    customer_debt_balance: 'Customer Debt Balance',
  },
  ar: {
    title: 'الملخص اليومي',
    sales: 'المبيعات',
    cash_sales: 'المبيعات النقدية',
    network_sales: 'مبيعات الشبكة',
    credit_sales: 'مبيعات الآجل',
    total_sales: 'إجمالي المبيعات',
    reconciliation: 'تسوية النقد',
    cash_shortage: 'عجز نقدي',
    cash_overage: 'زيادة نقدية',
    owner_contrib: 'مساهمة المالك (نقد)',
    collections: 'التحصيلات',
    customer_collections: 'تحصيلات العملاء',
    purchases: 'المشتريات (معتمدة)',
    approved_purchases: 'فواتير معتمدة',
    operating_result: 'النتيجة التشغيلية',
    supplier_payments: 'مدفوعات الموردين',
    supplier_debt_balance: 'رصيد ديون الموردين',
    customer_debt_balance: 'رصيد ديون العملاء',
  },
  fa: {
    title: 'خلاصه روزانه',
    sales: 'فروش',
    cash_sales: 'فروش نقدی',
    network_sales: 'فروش شبکه',
    credit_sales: 'فروش اعتباری',
    total_sales: 'جمع فروش',
    reconciliation: 'تطبیق نقد',
    cash_shortage: 'کسری نقد',
    cash_overage: 'مازاد نقد',
    owner_contrib: 'سرمایه مالک (نقد)',
    collections: 'وصولی‌ها',
    customer_collections: 'وصولی مشتریان',
    purchases: 'خریدها (تأیید شده)',
    approved_purchases: 'فاکتورهای تأیید شده',
    operating_result: 'نتیجه عملیاتی',
    supplier_payments: 'پرداخت‌های تامین‌کننده',
    supplier_debt_balance: 'موجودی بدهی تامین‌کننده',
    customer_debt_balance: 'موجودی بدهی مشتری',
  },
};

function SummaryRow({ label, value, currency, highlight, indent, color }) {
  return (
    <div className={`flex justify-between items-center py-1.5 ${indent ? 'pl-4' : ''} ${highlight ? 'border-t border-border mt-1 pt-2' : ''}`}>
      <span className={`text-xs ${indent ? 'text-muted-foreground' : 'font-semibold text-foreground'}`}>{label}</span>
      <span className={`text-sm font-bold ${color || (highlight ? 'text-primary' : 'text-foreground')}`}>
        {currency}{Number(value || 0).toLocaleString()}
      </span>
    </div>
  );
}

function SectionCard({ icon: Icon, title, children, color = 'bg-secondary/40' }) {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className={`flex items-center gap-2 px-3 py-2 ${color}`}>
        <Icon className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold">{title}</span>
      </div>
      <div className="px-3 py-2">{children}</div>
    </div>
  );
}

export default function DailySummary({ date, branch }) {
  const { language, currency } = useLanguage();
  const lbl = LABELS[language] || LABELS.en;
  const { ownerFilter } = useTenant();
  const todayStr = date || format(new Date(), 'yyyy-MM-dd');

  // Today's sales
  const { data: sales = [] } = useQuery({
    queryKey: ['sales_daily', ownerFilter, todayStr],
    queryFn: () => base44.entities.DailySales.filter({ ...(ownerFilter || {}), date: todayStr }, '-date', 100),
    enabled: !!(ownerFilter?.created_by || ownerFilter?.branch),
    staleTime: 15000,
  });

  // Today's collections
  const { data: collections = [] } = useQuery({
    queryKey: ['customer_collections_daily', ownerFilter, todayStr],
    queryFn: async () => {
      if (!ownerFilter?.created_by) return [];
      const { data, error } = await supabase
        .from('customer_collections')
        .select('id, amount, date, branch, branch_id, customer_id, debt_id, payment_method')
        .eq('created_by', ownerFilter.created_by)
        .eq('date', todayStr)
        .limit(200);
      if (error) throw error;
      return data || [];
    },
    enabled: !!ownerFilter?.created_by,
    staleTime: 15000,
  });

  // Today's APPROVED supplier invoices (only these count as purchases)
  const { data: approvedInvoices = [] } = useQuery({
    queryKey: ['approved_purchases_summary', ownerFilter, todayStr],
    queryFn: async () => {
      if (!ownerFilter?.created_by) return [];
      const { data, error } = await supabase
        .from('supplier_invoices')
        .select('id, total_amount, approval_status, branch, date')
        .eq('created_by', ownerFilter.created_by)
        .eq('date', todayStr)
        .in('approval_status', ['approved', 'auto_approved'])
        .limit(200);
      if (error) return [];
      return data || [];
    },
    enabled: !!ownerFilter?.created_by,
    staleTime: 15000,
  });

  // All open supplier invoices for balance
  const { data: allInvoices = [] } = useQuery({
    queryKey: ['supplier_invoices', ownerFilter],
    queryFn: () => base44.entities.SupplierInvoice.filter(ownerFilter || {}, '-date', 500),
    enabled: !!(ownerFilter?.created_by || ownerFilter?.branch),
    staleTime: 30000,
  });

  // All open customer debts for balance
  const { data: customerDebts = [] } = useQuery({
    queryKey: ['debts_customer', ownerFilter],
    queryFn: () => base44.entities.DebtRecord.filter({ ...(ownerFilter || {}), type: 'receivable', party_type: 'customer' }, '-date', 500),
    enabled: !!(ownerFilter?.created_by || ownerFilter?.branch),
    staleTime: 30000,
  });

  const filterBranch = (items) => {
    if (!branch || branch === 'all') return items;
    return items.filter(i => i.branch === branch);
  };

  const daySales      = filterBranch(sales);
  const dayCollections = filterBranch(collections);
  const dayApproved   = filterBranch(approvedInvoices);

  const { data: expenses = [] } = useQuery({
    queryKey: ['expenses_daily_summary', ownerFilter, todayStr],
    queryFn: () => base44.entities.Expense.filter({ ...(ownerFilter || {}), date: todayStr }, '-date', 200),
    enabled: !!(ownerFilter?.created_by || ownerFilter?.branch),
    staleTime: 15000,
  });
  const dayExpenses = filterBranch(expenses);

  const metrics = useMemo(() => {
    // ── Sales (source of truth — never affected by reconciliation) ────────────
    const cashSales    = daySales.reduce((s, r) => s + (Number(r.restaurant_cash) || Number(r.cash) || 0), 0);
    const networkSales = daySales.reduce((s, r) => s + (Number(r.restaurant_network) || Number(r.network) || 0), 0);
    const creditSales  = daySales.reduce((s, r) => s + (Number(r.credit) || 0), 0);
    const totalSales   = cashSales + networkSales + creditSales;

    // ── Cash Reconciliation (separate — does not affect sales) ────────────────
    const cashShortage    = daySales.reduce((s, r) => s + (Number(r.cash_shortage_amount) || 0), 0);
    const cashOverage     = daySales.reduce((s, r) => s + (Number(r.cash_overage_amount) || 0), 0);
    const ownerCashContrib = daySales.reduce((s, r) => s + (Number(r.owner_cash_injection) || 0), 0);

    // ── Collections ───────────────────────────────────────────────────────────
    const customerCollections = dayCollections.reduce((s, c) => s + (Number(c.amount) || 0), 0);

    // ── Purchases (APPROVED only) ─────────────────────────────────────────────
    const approvedPurchases = dayApproved.reduce((s, inv) => s + (Number(inv.total_amount) || 0), 0);

    const operatingExpenses = dayExpenses.reduce((s, expense) => s + (Number(expense.amount) || 0), 0);

    // ── Operating Result — independent from cash reconciliation ───────────────
    const operatingResult = totalSales - approvedPurchases - operatingExpenses;

    // ── Balances ──────────────────────────────────────────────────────────────
    const supplierDebtBalance = allInvoices
      .filter(inv => inv.status !== 'paid')
      .reduce((s, inv) => s + Math.max(0, (inv.amount || 0) - (inv.paid_amount || 0)), 0);

    const customerDebtBalance = customerDebts
      .filter(d => d.status !== 'paid' && d.status !== 'written_off')
      .reduce((s, d) => s + (Number(d.remaining_amount) || 0), 0);

    return {
      cashSales, networkSales, creditSales, totalSales,
      cashShortage, cashOverage, ownerCashContrib,
      customerCollections,
      approvedPurchases, operatingExpenses,
      operatingResult,
      supplierDebtBalance, customerDebtBalance,
    };
  }, [daySales, dayCollections, dayApproved, dayExpenses, allInvoices, customerDebts, todayStr]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-primary" />
        <span className="text-sm font-bold">{lbl.title}</span>
        <span className="text-xs text-muted-foreground ml-auto">{todayStr}</span>
      </div>

      {/* Card A: Sales — NEVER affected by reconciliation */}
      <SectionCard icon={TrendingUp} title={lbl.sales} color="bg-blue-50">
        <SummaryRow label={lbl.cash_sales}    value={metrics.cashSales}    currency={currency} indent />
        <SummaryRow label={lbl.network_sales} value={metrics.networkSales} currency={currency} indent />
        <SummaryRow label={lbl.credit_sales}  value={metrics.creditSales}  currency={currency} indent />
        <SummaryRow label={lbl.total_sales}   value={metrics.totalSales}   currency={currency} highlight color="text-blue-700" />
      </SectionCard>

      {/* Card B: Cash Reconciliation — separate from sales */}
      {(metrics.cashShortage > 0 || metrics.cashOverage > 0 || metrics.ownerCashContrib > 0) && (
        <SectionCard icon={Scale} title={lbl.reconciliation} color="bg-amber-50">
          {metrics.cashShortage > 0 && (
            <SummaryRow label={lbl.cash_shortage} value={metrics.cashShortage} currency={currency} indent color="text-red-600" />
          )}
          {metrics.cashOverage > 0 && (
            <SummaryRow label={lbl.cash_overage} value={metrics.cashOverage} currency={currency} indent color="text-amber-600" />
          )}
          {metrics.ownerCashContrib > 0 && (
            <SummaryRow label={lbl.owner_contrib} value={metrics.ownerCashContrib} currency={currency} indent color="text-purple-600" />
          )}
        </SectionCard>
      )}

      {/* Collections */}
      <SectionCard icon={Wallet} title={lbl.collections} color="bg-emerald-50">
        <SummaryRow label={lbl.customer_collections} value={metrics.customerCollections} currency={currency} indent />
      </SectionCard>

      {/* Card C: Purchases (Approved only) */}
      <SectionCard icon={ShoppingCart} title={lbl.purchases} color="bg-orange-50">
        <SummaryRow label={lbl.approved_purchases} value={metrics.approvedPurchases} currency={currency} indent />
      </SectionCard>

      {/* Card D: Operating Result */}
      <SectionCard icon={DollarSign} title={lbl.operating_result} color={metrics.operatingResult >= 0 ? 'bg-emerald-50' : 'bg-red-50'}>
        <SummaryRow label={lbl.total_sales} value={metrics.totalSales} currency={currency} indent color="text-blue-700" />
        <SummaryRow label={lbl.approved_purchases} value={metrics.approvedPurchases} currency={currency} indent color="text-orange-700" />
        <SummaryRow label={lbl.expenses || 'Operating Expenses'} value={metrics.operatingExpenses} currency={currency} indent color="text-red-700" />
        <SummaryRow
          label={lbl.operating_result}
          value={metrics.operatingResult}
          currency={metrics.operatingResult >= 0 ? currency : '-' + currency}
          highlight
          color={metrics.operatingResult >= 0 ? 'text-emerald-700' : 'text-red-600'}
        />
      </SectionCard>

      {/* Supplier Debt Balance */}
      <SectionCard icon={Truck} title={lbl.supplier_payments} color="bg-orange-50">
        <SummaryRow label={lbl.supplier_debt_balance} value={metrics.supplierDebtBalance} currency={currency} indent color="text-orange-700" />
      </SectionCard>

      {/* Customer Debt Balance */}
      <SectionCard icon={Users} title={lbl.customer_debt_balance} color="bg-amber-50">
        <SummaryRow label={lbl.customer_debt_balance} value={metrics.customerDebtBalance} currency={currency} indent color="text-amber-700" />
      </SectionCard>
    </div>
  );
}
