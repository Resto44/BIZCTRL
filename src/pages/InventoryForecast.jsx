import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import PageHeader from '@/components/shared/PageHeader';
import { supabase } from '@/api/supabaseClient';
import { fetchReportStockConsumption } from '@/lib/reportStockConsumption';
import { buildInventoryForecast, forecastWindow, readForecastInventory } from '@/lib/inventoryForecast';
import { useBranchScope } from '@/lib/BranchScopeContext';
import BranchSelect from '@/components/shared/BranchSelect';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Package, TrendingDown, List, BarChart3, ShoppingCart } from 'lucide-react';
import ForecastReorderPanel from '@/components/inventory/ForecastReorderPanel';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

function statusBadge(daysLeft, t) {
  if (daysLeft === null || daysLeft === undefined) return null;
  if (daysLeft <= 3) return <Badge className="bg-red-100 text-red-700 border-red-200">{t('severity_critical')}</Badge>;
  if (daysLeft <= 7) return <Badge className="bg-amber-100 text-amber-700 border-amber-200">{t('risk_low')}</Badge>;
  return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">{t('active')}</Badge>;
}

export default function InventoryForecast() {
  const { lang, t } = useLanguage();
  const { branches, activeRestaurant } = useTenant();
  const { selectedBranchId, selectedBranchKey, setSelectedBranchId, isAllBranches } = useBranchScope();
  const [lookbackDays, setLookbackDays] = useState(30);
  const range = forecastWindow(lookbackDays);
  const branchId = isAllBranches ? null : selectedBranchId;
  const query = useQuery({
    queryKey: ['inventory-forecast', activeRestaurant?.id, branchId, range.from, range.to],
    enabled: Boolean(activeRestaurant?.id),
    staleTime: 60_000,
    queryFn: async () => {
      const [inventory, consumption] = await Promise.all([
        readForecastInventory({ db: supabase, restaurantId: activeRestaurant.id, branchId }),
        fetchReportStockConsumption({ db: supabase, restaurantId: activeRestaurant.id, branchId, range }),
      ]);
      // Do not publish a partial stock picture as a complete forecast.
      if (inventory.length > 2000) throw new Error('INVENTORY_ROW_LIMIT');
      return { inventory, consumption };
    },
  });
  const copy = {
    en: { basis: 'Estimates use recorded stock consumption, not purchases. Items without verified usage or a current balance show no forecast. Configure ingredients per portion in the POS menu to record recipe usage.', error: 'Could not load the complete inventory forecast. Retry before using reorder suggestions.', retry: 'Retry', loading: 'Loading inventory and recorded consumption…', stock: 'Current stock', unknown: 'Usage not available' },
    ar: { basis: 'التقديرات تعتمد على الاستهلاك المسجل وليس المشتريات. لا تُعرض توقعات للأصناف دون استهلاك موثّق أو رصيد حالي. اضبط مكونات الحصة في قائمة نقاط البيع لتسجيل الاستهلاك.', error: 'تعذّر تحميل توقعات المخزون كاملة. أعد المحاولة قبل اعتماد اقتراحات الشراء.', retry: 'إعادة المحاولة', loading: 'جارٍ تحميل المخزون والاستهلاك المسجل…', stock: 'المخزون الحالي', unknown: 'الاستهلاك غير متاح' },
    fa: { basis: 'پیش‌بینی بر اساس مصرف ثبت‌شده است، نه خرید. برای محصول بدون مصرف معتبر یا موجودی فعلی، پیش‌بینی نشان داده نمی‌شود. مواد و مقدار هر پرس را در منوی POS تنظیم کنید.', error: 'پیش‌بینی کامل موجودی بارگذاری نشد. پیش از استفاده از پیشنهاد خرید، دوباره تلاش کنید.', retry: 'تلاش دوباره', loading: 'بارگذاری موجودی و مصرف ثبت‌شده…', stock: 'موجودی فعلی', unknown: 'مصرف در دسترس نیست' },
  }[lang] || { basis: 'Estimates use recorded consumption, not purchases.', error: 'Could not load forecast.', retry: 'Retry', loading: 'Loading…', stock: 'Current stock', unknown: 'Usage not available' };
  const forecast = useMemo(() => query.isError ? [] : buildInventoryForecast({
    inventory: query.data?.inventory, consumption: query.data?.consumption,
    branches, days: lookbackDays, today: range.to,
  }), [query.data, query.isError, branches, lookbackDays, range.to]);

  const criticalCount = forecast.filter(r => r.daysLeft !== null && r.daysLeft <= 3).length;
  const lowCount = forecast.filter(r => r.daysLeft !== null && r.daysLeft > 3 && r.daysLeft <= 7).length;

  // Chart data: top 10 by days left (lowest first)
  const chartData = forecast.filter(r => r.daysLeft !== null).slice(0, 10).map(r => ({
    name: r.product_name.length > 12 ? r.product_name.slice(0, 12) + '…' : r.product_name,
    days: r.daysLeft ?? 0,
    stock: r.currentStock,
  }));

  return (
    <div>
      <PageHeader title={t('inventory_forecast')} />

      {/* Alert summary */}
      {(criticalCount > 0 || lowCount > 0) && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {criticalCount > 0 && (
            <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
              <AlertTriangle className="w-4 h-4" />
              <span>{criticalCount} {t('severity_critical')}</span>
            </div>
          )}
          {lowCount > 0 && (
            <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-700">
              <TrendingDown className="w-4 h-4" />
              <span>{lowCount} {t('risk_low')}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-sm text-emerald-700">
            <Package className="w-4 h-4" />
            <span>{forecast.filter(r => r.daysLeft !== null && r.daysLeft > 7).length} {t('active')}</span>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <Select value={String(lookbackDays)} onValueChange={v => setLookbackDays(Number(v))}>
          <SelectTrigger className="w-40 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="30">{t('last_30_days')}</SelectItem>
            <SelectItem value="60">60 {t('days_of_stock')}</SelectItem>
            <SelectItem value="90">90 {t('days_of_stock')}</SelectItem>
          </SelectContent>
        </Select>
        <div className="w-full sm:w-48"><BranchSelect value={isAllBranches ? 'all' : selectedBranchKey} includeAll
          onChange={key => setSelectedBranchId(key === 'all' ? 'all' : branches.find(b => (b.key || b.branch_key) === key)?.id)} /></div>
      </div>

      <p className="text-sm text-muted-foreground mb-4" role="note">{copy.basis}</p>
      {query.isLoading && <p role="status">{copy.loading}</p>}
      {query.isError && <Card className="p-4 mb-4" role="alert"><p>{copy.error}</p><Button onClick={() => query.refetch()} className="mt-3 min-h-11">{copy.retry}</Button></Card>}

      {query.isLoading || query.isError ? null : forecast.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p>{t('no_data')}</p>
        </Card>
      ) : (
        <Tabs defaultValue="list">
          <TabsList className="mb-4 flex h-auto flex-wrap gap-1">
            <TabsTrigger value="list" className="gap-1"><List className="w-3.5 h-3.5" /> {t('table')}</TabsTrigger>
            <TabsTrigger value="chart" className="gap-1"><BarChart3 className="w-3.5 h-3.5" /> {t('chart')}</TabsTrigger>
            <TabsTrigger value="reorder" className="gap-1 text-amber-700"><ShoppingCart className="w-3.5 h-3.5" /> {t('reorder_suggested')}</TabsTrigger>
          </TabsList>

          <TabsContent value="list">
            <Card className="p-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground text-left">
                      <th className="pb-2 font-semibold">{t('product')}</th>
                      <th className="pb-2 font-semibold">{t('branch')}</th>
                      <th className="pb-2 text-end font-semibold">{t('avg_consumption')}</th>
                      <th className="pb-2 text-end font-semibold">{copy.stock}</th>
                      <th className="pb-2 text-end font-semibold">{t('days_of_stock')}</th>
                      <th className="pb-2 font-semibold">{t('days_of_stock')} bar</th>
                      <th className="pb-2 text-center font-semibold">{t('status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecast.map((r, i) => (
                      <tr key={i} className={`border-b border-border/40 last:border-0 ${r.needsReorder ? 'bg-red-50/30 dark:bg-red-900/10' : ''}`}>
                        <td className="py-2.5 font-medium">{r.product_name}</td>
                        <td className="py-2.5 text-muted-foreground text-xs">{r.branch}</td>
                        <td className="py-2.5 text-end">{r.avgDaily === null ? '—' : r.avgDaily} {r.unit}</td>
                        <td className="py-2.5 text-end">{r.currentStock === null ? '—' : r.currentStock} {r.unit}</td>
                        <td className={`py-2.5 text-end font-bold ${r.daysLeft !== null && r.daysLeft <= 3 ? 'text-red-500' : r.daysLeft !== null && r.daysLeft <= 7 ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {r.daysLeft !== null ? r.daysLeft : '—'}
                        </td>
                        <td className="py-2.5 w-24">
                          {r.daysLeft !== null && (
                            <div className="w-full bg-muted rounded-full h-1.5">
                              <div className="h-1.5 rounded-full" style={{
                                width: `${Math.min(100, (r.daysLeft / 30) * 100)}%`,
                                background: r.daysLeft <= 3 ? '#ef4444' : r.daysLeft <= 7 ? '#f59e0b' : '#10b981',
                              }} />
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 text-center">{r.daysLeft === null ? copy.unknown : statusBadge(r.daysLeft, t)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="chart">
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-3">{t('days_of_stock')} — Top Items</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={90} />
                  <Tooltip formatter={v => [`${v} days`, t('days_of_stock')]} />
                  <Bar dataKey="days" radius={[0, 4, 4, 0]} name={t('days_of_stock')}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.days <= 3 ? '#ef4444' : entry.days <= 7 ? '#f59e0b' : '#10b981'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </TabsContent>

          <TabsContent value="reorder">
            <ForecastReorderPanel forecast={forecast} />
          </TabsContent>


        </Tabs>
      )}
    </div>
  );
}