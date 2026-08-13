import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import PageHeader from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, TrendingDown, DollarSign, Bell, UserX, Gift, AlertCircle } from 'lucide-react';
import { formatDate, formatCurrency } from '@/lib/helpers';
import { startOfMonth, subMonths, endOfMonth } from 'date-fns';
import { currentMonth, monthRange, summariseAttendance } from '@/lib/payrollEngine';

export default function Alerts() {
  const { t, currency } = useLanguage();
  const { ownerFilter, branches = [], activeRestaurant, isManager, managerBranch } = useTenant();

  const alertScope = useMemo(() => {
    const branch = managerBranch || ownerFilter?.branch || null;
    if (isManager) return branch ? { branch } : null;
    if (activeRestaurant?.id) return { restaurantId: activeRestaurant.id };
    return ownerFilter?.created_by ? { createdBy: ownerFilter.created_by } : null;
  }, [activeRestaurant?.id, isManager, managerBranch, ownerFilter?.branch, ownerFilter?.created_by]);
  const tenantFilter = alertScope?.branch
    ? { branch: alertScope.branch }
    : alertScope?.restaurantId
      ? { restaurant_id: alertScope.restaurantId }
      : alertScope?.createdBy
        ? { created_by: alertScope.createdBy }
        : null;
  const tenantEnabled = !!alertScope;

  const { data: sales = [], isLoading: loadingSales, isError: errorSales } = useQuery({
    queryKey: ['sales', 'alerts', tenantFilter],
    queryFn: () => base44.entities.DailySales.filter(tenantFilter || {}, '-date', 1000),
    enabled: tenantEnabled,
    staleTime: 120000
  });

  const { data: purchases = [], isLoading: loadingPurchases, isError: errorPurchases } = useQuery({
    queryKey: ['purchases', 'alerts', alertScope],
    queryFn: async () => {
      if (!alertScope) return [];
      let query = supabase
        .from('supplier_invoices')
        .select('id, date, branch, total_amount, status')
        .in('status', ['approved', 'partial', 'paid'])
        .order('date', { ascending: false })
        .limit(1000);
      if (alertScope.branch) query = query.eq('branch', alertScope.branch);
      else if (alertScope.restaurantId) query = query.eq('restaurant_id', alertScope.restaurantId);
      else if (alertScope.createdBy) query = query.eq('created_by', alertScope.createdBy);
      const { data, error } = await query;
      return error ? [] : (data || []);
    },
    enabled: tenantEnabled,
    staleTime: 120000
  });

  const { data: attendanceAll = [], isLoading: loadingAttendance, isError: errorAttendance } = useQuery({
    queryKey: ['attendance', 'alerts', tenantFilter],
    queryFn: () => base44.entities.Attendance.filter(tenantFilter || {}, '-date', 1000),
    enabled: tenantEnabled,
    staleTime: 300000
  });

  const { data: bonusesAll = [], isLoading: loadingBonuses, isError: errorBonuses } = useQuery({
    queryKey: ['employee_bonuses', 'alerts', tenantFilter],
    queryFn: () => base44.entities.EmployeeBonus.filter(tenantFilter || {}, '-date', 500),
    enabled: tenantEnabled,
    staleTime: 300000
  });

  const { data: employees = [], isLoading: loadingEmployees, isError: errorEmployees } = useQuery({
    queryKey: ['employees', 'alerts', tenantFilter],
    queryFn: () => base44.entities.Employee.filter(tenantFilter || {}, 'name', 500),
    enabled: tenantEnabled,
    staleTime: 600000
  });

  const isLoading = loadingSales || loadingPurchases || loadingAttendance || loadingBonuses || loadingEmployees;
  const isError = errorSales || errorPurchases || errorAttendance || errorBonuses || errorEmployees;

  const alerts = useMemo(() => {
    if (isLoading || isError) return [];
    
    const result = [];
    const now = new Date();
    const thisMonthStart = formatDate(startOfMonth(now));
    const thisMonthEnd = formatDate(endOfMonth(now));
    const lastMonthStart = formatDate(startOfMonth(subMonths(now, 1)));
    const lastMonthEnd = formatDate(endOfMonth(subMonths(now, 1)));

    // Ensure we have arrays
    const safeSales = Array.isArray(sales) ? sales : [];
    const safePurchases = Array.isArray(purchases) ? purchases : [];
    const safeAttendance = Array.isArray(attendanceAll) ? attendanceAll : [];
    const safeBonuses = Array.isArray(bonusesAll) ? bonusesAll : [];
    const safeEmployees = Array.isArray(employees) ? employees : [];
    const safeBranches = Array.isArray(branches) ? branches : [];

    const thisSales = safeSales.filter(s => s && s.date >= thisMonthStart && s.date <= thisMonthEnd);
    const lastSales = safeSales.filter(s => s && s.date >= lastMonthStart && s.date <= lastMonthEnd);
    const thisPurch = safePurchases.filter(p => p && p.date >= thisMonthStart && p.date <= thisMonthEnd);
    const lastPurch = safePurchases.filter(p => p && p.date >= lastMonthStart && p.date <= lastMonthEnd);

    const saleTotal = (sale) => {
      const explicitTotal = Number(sale?.total);
      return Number.isFinite(explicitTotal)
        ? explicitTotal
        : (Number(sale?.cash) || 0) + (Number(sale?.network) || 0) + (Number(sale?.credit) || 0);
    };
    const thisTotal = thisSales.reduce((sum, sale) => sum + saleTotal(sale), 0);
    const lastTotal = lastSales.reduce((sum, sale) => sum + saleTotal(sale), 0);
    const thisCost = thisPurch.reduce((sum, purchase) => sum + (Number(purchase.total_amount) || 0), 0);
    const lastCost = lastPurch.reduce((sum, purchase) => sum + (Number(purchase.total_amount) || 0), 0);

    const thisProfit = thisTotal - thisCost;
    const lastProfit = lastTotal - lastCost;
    const thisCredit = thisSales.reduce((s, r) => s + (Number(r.credit) || 0), 0);
    const thisCreditPct = thisTotal > 0 ? (thisCredit / thisTotal) * 100 : 0;

    // High credit risk
    if (thisCreditPct > 30) {
      result.push({
        id: 'credit_risk',
        type: 'danger',
        icon: AlertTriangle,
        title: t('alert_high_credit'),
        detail: `${thisCreditPct.toFixed(1)}% ${t('credit_pct')} — ${t('risk_high')}`,
      });
    }

    // Profit drop vs last month
    if (lastProfit > 0 && thisProfit < lastProfit * 0.8) {
      const drop = ((lastProfit - thisProfit) / lastProfit * 100).toFixed(1);
      result.push({
        id: 'profit_drop',
        type: 'warning',
        icon: TrendingDown,
        title: t('alert_profit_drop'),
        detail: `${drop}% drop — ${formatCurrency(thisProfit, currency)} vs ${formatCurrency(lastProfit, currency)}`,
      });
    }

    // Price increase alerts per product
    const productPrices = {};
    safePurchases.forEach(p => {
      if (!p || !p.product_id || !p.used_price || !p.date) return;
      if (!productPrices[p.product_id]) productPrices[p.product_id] = [];
      productPrices[p.product_id].push({ date: p.date, price: p.used_price, name: p.product_name });
    });
    Object.entries(productPrices).forEach(([pid, entries]) => {
      if (entries.length < 2) return;
      const sorted = entries.sort((a, b) => a.date.localeCompare(b.date));
      const oldest = sorted[0].price;
      const newest = sorted[sorted.length - 1].price;
      if (oldest > 0 && newest > oldest * 1.15) {
        const pct = ((newest - oldest) / oldest * 100).toFixed(1);
        result.push({
          id: `price_${pid}`,
          type: 'warning',
          icon: DollarSign,
          title: t('alert_price_increase'),
          detail: `${sorted[0].name || pid}: +${pct}% (${currency}${oldest} → ${currency}${newest})`,
        });
      }
    });

    // Per-branch credit alerts
    safeBranches.forEach(b => {
      if (!b || !b.key) return;
      const bs = thisSales.filter(s => s.branch === b.key);
      const bt = bs.reduce((s, r) => s + (Number(r.cash) || 0) + (Number(r.network) || 0) + (Number(r.credit) || 0), 0);
      const bc = bs.reduce((s, r) => s + (Number(r.credit) || 0), 0);
      const pct = bt > 0 ? (bc / bt) * 100 : 0;
      if (pct > 40) {
        result.push({
          id: `branch_credit_${b.key}`,
          type: 'danger',
          icon: AlertTriangle,
          title: `${b.label || b.name || b.key} — ${t('alert_high_credit')}`,
          detail: `${pct.toFixed(1)}% ${t('credit_pct')}`,
        });
      }
    });

    // === PAYROLL ALERTS ===
    const mon = currentMonth();
    const { from: mFrom, to: mTo } = monthRange(mon);
    const now2 = new Date();
    const dayOfMonth = now2.getDate();

    // Group attendance by employee for this month
    const empAttMap = {};
    safeAttendance.filter(r => r && r.date >= mFrom && r.date <= mTo).forEach(r => {
      if (!r.employee_id) return;
      if (!empAttMap[r.employee_id]) empAttMap[r.employee_id] = [];
      empAttMap[r.employee_id].push(r);
    });

    // Repeated absences (>3 this month)
    safeEmployees.forEach(emp => {
      if (!emp || !emp.id) return;
      const recs = empAttMap[emp.id] || [];
      const summary = summariseAttendance(recs);
      if (summary.absent >= 3) {
        result.push({
          id: `absent_${emp.id}`,
          type: 'warning',
          icon: UserX,
          title: `Repeated Absences — ${emp.name || 'Unknown'}`,
          detail: `${summary.absent} absences this month at ${emp.branch || 'unassigned'}`,
        });
      }
      // Excessive late (>4 times)
      if (summary.late >= 4) {
        result.push({
          id: `late_${emp.id}`,
          type: 'warning',
          icon: AlertTriangle,
          title: `Frequent Late Arrivals — ${emp.name || 'Unknown'}`,
          detail: `${summary.late} late occurrences this month at ${emp.branch || 'unassigned'}`,
        });
      }
    });

    // Unusually high bonuses (>50% of base salary)
    const monthBonuses = safeBonuses.filter(b => b && b.date >= mFrom && b.date <= mTo);
    safeEmployees.forEach(emp => {
      if (!emp || !emp.id) return;
      const empBonuses = monthBonuses.filter(b => b.employee_id === emp.id);
      const total = empBonuses.reduce((s, b) => s + (Number(b.amount) || 0), 0);
      const base = Number(emp.base_salary) || 0;
      if (base > 0 && total > base * 0.5) {
        result.push({
          id: `bonus_high_${emp.id}`,
          type: 'warning',
          icon: Gift,
          title: `High Bonus — ${emp.name || 'Unknown'}`,
          detail: `${formatCurrency(total, currency)} in bonuses (${Math.round((total/base)*100)}% of base salary)`,
        });
      }
    });

    // Unpaid salaries near month-end (after day 25)
    if (dayOfMonth >= 25) {
      const totalUnpaidSalary = safeEmployees
        .filter(e => e && e.is_active !== false)
        .reduce((s, e) => s + (Number(e.base_salary) || 0), 0);
      if (totalUnpaidSalary > 0) {
        result.push({
          id: 'payroll_due',
          type: 'danger',
          icon: DollarSign,
          title: 'Payroll Due',
          detail: `Month-end approaching — estimated ${formatCurrency(totalUnpaidSalary, currency)} payroll obligation`,
        });
      }
    }

    return result;
  }, [sales, purchases, branches, t, currency, attendanceAll, bonusesAll, employees, isLoading, isError]);

  const typeStyles = {
    danger: 'border-red-200 bg-red-50 dark:bg-red-950/20',
    warning: 'border-amber-200 bg-amber-50 dark:bg-amber-950/20',
  };
  const iconStyles = {
    danger: 'text-red-500',
    warning: 'text-amber-500',
  };

  if (isError) {
    return (
      <div className="space-y-4">
        <PageHeader title={t('alerts_title')} />
        <Card className="p-8 border-red-200 bg-red-50 dark:bg-red-950/20 flex flex-col items-center justify-center text-center">
          <AlertCircle className="w-10 h-10 text-red-500 mb-3" />
          <p className="text-sm font-semibold text-red-700 dark:text-red-400">Failed to load alerts</p>
          <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-1">Please check your connection and try again.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t('alerts_title')} />
      
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <Card key={i} className="p-4 border border-border/50">
              <div className="flex items-start gap-3">
                <Skeleton className="w-5 h-5 rounded-full" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Bell className="w-12 h-12 text-emerald-400 mb-3" />
          <p className="text-muted-foreground text-sm">{t('no_alerts')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map(alert => {
            const Icon = alert.icon;
            return (
              <Card key={alert.id} className={`p-4 border ${typeStyles[alert.type] || ''}`}>
                <div className="flex items-start gap-3">
                  <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${iconStyles[alert.type] || ''}`} />
                  <div>
                    <p className="text-sm font-semibold">{alert.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{alert.detail}</p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
