import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Package, AlertTriangle, Search, Plus,
  BarChart3, Download, Trash2, ArrowLeftRight
} from 'lucide-react';
import { Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { Link } from 'react-router-dom';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

function InventoryItem({ item, currency }) {
  const stockPct = item.low_stock_threshold > 0
    ? Math.min(100, (item.quantity / (item.low_stock_threshold * 3)) * 100)
    : 100;
  const isLow = item.quantity <= (item.low_stock_threshold || 0);
  const isOut = item.quantity <= 0;

  return (
    <Card className={`${isOut ? 'border-red-200 bg-red-50/30' : isLow ? 'border-amber-200 bg-amber-50/30' : ''}`}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{item.product_name}</p>
            <p className="text-xs text-muted-foreground">{item.branch} · {item.category || 'General'}</p>
          </div>
          <div className="text-right shrink-0">
            <p className={`text-sm font-bold ${isOut ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-foreground'}`}>
              {item.quantity} {item.unit || 'units'}
            </p>
            {isOut && <Badge variant="destructive" className="text-[10px] h-4 px-1">Out</Badge>}
            {isLow && !isOut && <Badge className="bg-amber-500 text-white text-[10px] h-4 px-1">Low</Badge>}
          </div>
        </div>
        <Progress value={stockPct} className={`h-1.5 ${isOut ? '[&>div]:bg-red-500' : isLow ? '[&>div]:bg-amber-500' : '[&>div]:bg-emerald-500'}`} />
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>Threshold: {item.low_stock_threshold || 0}</span>
          <span>Value: {currency}{((item.quantity || 0) * (item.cost_price || 0)).toLocaleString()}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function InventoryCommandCenter() {
  const { t, currency } = useLanguage();
  const { ownerFilter } = useTenant();
  const [tab, setTab] = useState('dashboard');
  const [search, setSearch] = useState('');

  const { data: inventory = [], isLoading } = useQuery({
    queryKey: ['inventory_cmd', ownerFilter],
    queryFn: () => base44.entities.Inventory.filter(ownerFilter || {}, 'product_name', 500),
    staleTime: 120000,
    enabled: !!ownerFilter?.created_by,
  });

  const { data: waste = [] } = useQuery({
    queryKey: ['waste_cmd', ownerFilter],
    queryFn: () => base44.entities.InventoryWaste?.filter(ownerFilter || {}, '-date', 200) || [],
    staleTime: 120000,
    enabled: !!ownerFilter?.created_by,
  });

  const filtered = useMemo(() =>
    inventory.filter(i => search === '' || i.product_name?.toLowerCase().includes(search.toLowerCase())),
    [inventory, search]
  );

  const lowStock = inventory.filter(i => i.quantity <= (i.low_stock_threshold || 0) && i.quantity > 0);
  const outOfStock = inventory.filter(i => i.quantity <= 0);
  const totalValue = inventory.reduce((s, i) => s + ((i.quantity || 0) * (i.cost_price || 0)), 0);
  const wasteValue = waste.reduce((s, w) => s + (w.waste_cost || 0), 0);

  // Category breakdown for pie chart
  const categoryData = useMemo(() => {
    const map = {};
    inventory.forEach(i => {
      const cat = i.category || 'Other';
      if (!map[cat]) map[cat] = 0;
      map[cat] += (i.quantity || 0) * (i.cost_price || 0);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).slice(0, 6);
  }, [inventory]);

  const fmt = (n) => `${currency}${(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-xl font-bold">{t('inventory_command_center')}</h1>
          <p className="text-xs text-muted-foreground">{inventory.length} items</p>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1">
            <Download className="w-3 h-3" />
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1" asChild>
            <Link to="/inventory"><Plus className="w-3 h-3" /> Add</Link>
          </Button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-blue-100">
          <CardContent className="p-3">
            <p className="text-lg font-bold text-blue-600">{fmt(totalValue)}</p>
            <p className="text-xs text-muted-foreground">{t('inventory_value')}</p>
          </CardContent>
        </Card>
        <Card className="border-red-100">
          <CardContent className="p-3">
            <p className="text-lg font-bold text-red-500">{fmt(wasteValue)}</p>
            <p className="text-xs text-muted-foreground">{t('waste_tracking')}</p>
          </CardContent>
        </Card>
        <Card className={`${lowStock.length > 0 ? 'border-amber-200 bg-amber-50/30' : ''}`}>
          <CardContent className="p-3">
            <p className={`text-lg font-bold ${lowStock.length > 0 ? 'text-amber-600' : 'text-foreground'}`}>{lowStock.length}</p>
            <p className="text-xs text-muted-foreground">{t('low_stock_center')}</p>
          </CardContent>
        </Card>
        <Card className={`${outOfStock.length > 0 ? 'border-red-200 bg-red-50/30' : ''}`}>
          <CardContent className="p-3">
            <p className={`text-lg font-bold ${outOfStock.length > 0 ? 'text-red-600' : 'text-foreground'}`}>{outOfStock.length}</p>
            <p className="text-xs text-muted-foreground">Out of Stock</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:grid-cols-4">
          <TabsTrigger value="dashboard" className="min-h-10 whitespace-normal px-2 py-2 text-center text-xs leading-tight sm:min-h-9 sm:whitespace-nowrap">{t('overview')}</TabsTrigger>
          <TabsTrigger value="lowstock" className="min-h-10 whitespace-normal px-2 py-2 text-center text-xs leading-tight sm:min-h-9 sm:whitespace-nowrap">
            Low Stock {lowStock.length > 0 && <Badge className="ml-1 h-4 w-4 p-0 text-[9px] bg-amber-500">{lowStock.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="waste" className="min-h-10 whitespace-normal px-2 py-2 text-center text-xs leading-tight sm:min-h-9 sm:whitespace-nowrap">{t('waste_tracking')}</TabsTrigger>
          <TabsTrigger value="analytics" className="min-h-10 whitespace-normal px-2 py-2 text-center text-xs leading-tight sm:min-h-9 sm:whitespace-nowrap">{t('inventory_analytics')}</TabsTrigger>
        </TabsList>

        {/* Dashboard Tab */}
        <TabsContent value="dashboard" className="mt-3 space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={`${t('search')}...`} className="pl-9 h-9 text-sm" />
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" className="h-9 text-xs gap-1" asChild>
              <Link to="/inventory-transfers"><ArrowLeftRight className="w-3 h-3" />{t('transfers')}</Link>
            </Button>
            <Button variant="outline" className="h-9 text-xs gap-1" asChild>
              <Link to="/inventory-waste"><Trash2 className="w-3 h-3" />{t('waste_tracking')}</Link>
            </Button>
            <Button variant="outline" className="h-9 text-xs gap-1" asChild>
              <Link to="/inventory-forecast"><BarChart3 className="w-3 h-3" />Forecast</Link>
            </Button>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">{t('no_data')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.slice(0, 20).map(item => (
                <InventoryItem key={item.id} item={item} currency={currency} />
              ))}
              {filtered.length > 20 && (
                <p className="text-xs text-center text-muted-foreground py-2">
                  Showing 20 of {filtered.length} items
                </p>
              )}
            </div>
          )}
        </TabsContent>

        {/* Low Stock Tab */}
        <TabsContent value="lowstock" className="mt-3 space-y-3">
          {lowStock.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">All items are well-stocked!</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <p className="text-xs text-amber-700 font-medium">{lowStock.length} items need restocking</p>
                <Button size="sm" className="ml-auto h-7 text-xs bg-amber-500 hover:bg-amber-600 text-white" asChild>
                  <Link to="/purchase-orders">Order Now</Link>
                </Button>
              </div>
              <div className="space-y-2">
                {lowStock.map(item => <InventoryItem key={item.id} item={item} currency={currency} />)}
              </div>
            </>
          )}
        </TabsContent>

        {/* Waste Tab */}
        <TabsContent value="waste" className="mt-3 space-y-3">
          <Card>
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm font-semibold">{t('waste_tracking')}</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              {waste.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">{t('no_data')}</p>
              ) : (
                waste.slice(0, 10).map(w => (
                  <div key={w.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <p className="text-sm font-medium">{w.product_name}</p>
                      <p className="text-xs text-muted-foreground">{w.date} · {w.reason || 'N/A'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-red-500">-{w.quantity} {w.unit}</p>
                      <p className="text-xs text-muted-foreground">{fmt(w.waste_cost)}</p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="mt-3 space-y-3">
          {categoryData.length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm font-semibold">Inventory by Category</CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={categoryData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={9}>
                      {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => [`${currency}${v.toLocaleString()}`, '']} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
