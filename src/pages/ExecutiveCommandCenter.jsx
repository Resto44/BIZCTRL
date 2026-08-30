import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { useRole } from '@/lib/RoleContext';
import PageHeader from '@/components/shared/PageHeader';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { BarChart3, TrendingUp, AlertTriangle, Zap } from 'lucide-react';

// Import new analytics components
import AdvancedKPICards from '@/components/dashboard/AdvancedKPICards';
import ExecutivePnL from '@/components/dashboard/ExecutivePnL';
import CashFlowAnalytics from '@/components/dashboard/CashFlowAnalytics';
import OperationalAlerts from '@/components/dashboard/OperationalAlerts';
import EnhancedBranchRankings from '@/components/dashboard/EnhancedBranchRankings';

// Import existing components that we're preserving
import DashboardFilters from '@/components/dashboard/DashboardFilters';
import SmartInsights from '@/components/dashboard/SmartInsights';
import SalesTrendsChart from '@/components/dashboard/SalesTrendsChart';
import { getDateRange, formatDate } from '@/lib/helpers';
import { format } from 'date-fns';

export default function ExecutiveCommandCenter() {
  const { t, currency } = useLanguage();
  const { branches, ownerFilter } = useTenant();
  const { role } = useRole();
  const [activeTab, setActiveTab] = useState('overview');
  const [rangeType, setRangeType] = useState('month');
  const [branch, setBranch] = useState('all');
  const [customFrom, setCustomFrom] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [customTo, setCustomTo] = useState(format(new Date(), 'yyyy-MM-dd'));

  const dateRange = useMemo(() => {
    if (rangeType === 'custom') return { from: new Date(customFrom), to: new Date(customTo) };
    return getDateRange(rangeType);
  }, [rangeType, customFrom, customTo]);

  const fromStr = formatDate(dateRange.from);
  const toStr = formatDate(dateRange.to);

  // Fetch all data for the dashboard
  const { data: allSales = [], isLoading: loadingSales } = useQuery({
    queryKey: ['sales', ownerFilter],
    queryFn: () => base44.entities.DailySales.filter(ownerFilter || {}, '-date', 1000),
    staleTime: 120000,
    enabled: !!ownerFilter?.created_by,
  });

  const { data: allPurchases = [], isLoading: loadingPurchases } = useQuery({
    queryKey: ['purchases', ownerFilter],
    queryFn: async () => {
      if (!ownerFilter?.created_by) return [];
      const { data, error } = await supabase
        .from('supplier_invoices')
        .select('*')
        .eq('created_by', ownerFilter.created_by)
        .in('approval_status', ['approved', 'auto_approved'])
        .order('date', { ascending: false })
        .limit(1000);
      if (error) return [];
      return data || [];
    },
    staleTime: 120000,
    enabled: !!ownerFilter?.created_by,
  });

  const { data: allExpenses = [] } = useQuery({
    queryKey: ['expenses', ownerFilter],
    queryFn: () => base44.entities.Expense.filter(ownerFilter || {}, '-date', 1000),
    staleTime: 120000,
    enabled: !!ownerFilter?.created_by,
  });

  const { data: allWaste = [] } = useQuery({
    queryKey: ['inventory_waste', ownerFilter],
    queryFn: () => base44.entities.InventoryWaste.filter(ownerFilter || {}, '-date', 500),
    staleTime: 120000,
    enabled: !!ownerFilter?.created_by,
  });

  const { data: inventory = [] } = useQuery({
    queryKey: ['inventory_dashboard', ownerFilter],
    queryFn: () => base44.entities.Inventory.filter(ownerFilter || {}, 'product_name', 500),
    staleTime: 300000,
    enabled: !!ownerFilter?.created_by,
  });

  // Filter data by date range and branch
  const filteredSales = useMemo(() =>
    allSales.filter(s => s.date >= fromStr && s.date <= toStr && (branch === 'all' || s.branch === branch)),
    [allSales, fromStr, toStr, branch]
  );

  const filteredPurchases = useMemo(() =>
    allPurchases.filter(p => p.date >= fromStr && p.date <= toStr && (branch === 'all' || p.branch === branch)),
    [allPurchases, fromStr, toStr, branch]
  );

  const filteredExpenses = useMemo(() =>
    allExpenses.filter(e => e.date >= fromStr && e.date <= toStr && (branch === 'all' || e.branch === branch || e.branch === 'all')),
    [allExpenses, fromStr, toStr, branch]
  );

  const filteredWaste = useMemo(() =>
    allWaste.filter(w => w.date >= fromStr && w.date <= toStr && (branch === 'all' || w.branch === branch)),
    [allWaste, fromStr, toStr, branch]
  );

  // Previous period for comparison
  const prevRange = useMemo(() => {
    const diffMs = dateRange.to - dateRange.from;
    return { from: new Date(dateRange.from - diffMs - 86400000), to: new Date(dateRange.from - 86400000) };
  }, [dateRange]);

  const prevFrom = formatDate(prevRange.from);
  const prevTo = formatDate(prevRange.to);

  const prevSales = useMemo(() =>
    allSales.filter(s => s.date >= prevFrom && s.date <= prevTo && (branch === 'all' || s.branch === branch)),
    [allSales, prevFrom, prevTo, branch]
  );

  const prevPurchases = useMemo(() =>
    allPurchases.filter(p => p.date >= prevFrom && p.date <= prevTo && (branch === 'all' || p.branch === branch)),
    [allPurchases, prevFrom, prevTo, branch]
  );

  const prevExpenses = useMemo(() =>
    allExpenses.filter(e => e.date >= prevFrom && e.date <= prevTo && (branch === 'all' || e.branch === branch || e.branch === 'all')),
    [allExpenses, prevFrom, prevTo, branch]
  );

  const dataLoading = loadingSales || loadingPurchases;

  if (dataLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('executive_command_center')}
        subtitle={t('enterprise_business_intelligence')}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5 mb-4">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            <span className="hidden sm:inline">{t('overview')}</span>
          </TabsTrigger>
          <TabsTrigger value="financials" className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            <span className="hidden sm:inline">{t('financials')}</span>
          </TabsTrigger>
          <TabsTrigger value="cashflow" className="flex items-center gap-2">
            <Zap className="w-4 h-4" />
            <span className="hidden sm:inline">{t('cash_flow')}</span>
          </TabsTrigger>
          <TabsTrigger value="alerts" className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span className="hidden sm:inline">{t('alerts')}</span>
          </TabsTrigger>
          <TabsTrigger value="branches" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            <span className="hidden sm:inline">{t('branches')}</span>
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <DashboardFilters
            rangeType={rangeType}
            setRangeType={setRangeType}
            branch={branch}
            setBranch={setBranch}
            customFrom={customFrom}
            setCustomFrom={setCustomFrom}
            customTo={customTo}
            setCustomTo={setCustomTo}
          />

          <AdvancedKPICards branchKey={branch} />

          <SalesTrendsChart
            sales={filteredSales}
            purchases={filteredPurchases}
            currency={currency}
          />

          <SmartInsights
            sales={filteredSales}
            purchases={filteredPurchases}
            expenses={filteredExpenses}
            waste={filteredWaste}
            inventory={inventory}
            prevSales={prevSales}
            prevPurchases={prevPurchases}
            prevExpenses={prevExpenses}
          />
        </TabsContent>

        {/* Financials Tab */}
        <TabsContent value="financials" className="space-y-4">
          <DashboardFilters
            rangeType={rangeType}
            setRangeType={setRangeType}
            branch={branch}
            setBranch={setBranch}
            customFrom={customFrom}
            setCustomFrom={setCustomFrom}
            customTo={customTo}
            setCustomTo={setCustomTo}
          />
          <ExecutivePnL branchKey={branch} />
        </TabsContent>

        {/* Cash Flow Tab */}
        <TabsContent value="cashflow" className="space-y-4">
          <DashboardFilters
            rangeType={rangeType}
            setRangeType={setRangeType}
            branch={branch}
            setBranch={setBranch}
            customFrom={customFrom}
            setCustomFrom={setCustomFrom}
            customTo={customTo}
            setCustomTo={setCustomTo}
          />
          <CashFlowAnalytics branchKey={branch} />
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts" className="space-y-4">
          <OperationalAlerts branchKey={branch} />
        </TabsContent>

        {/* Branch Rankings Tab */}
        <TabsContent value="branches" className="space-y-4">
          <EnhancedBranchRankings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
