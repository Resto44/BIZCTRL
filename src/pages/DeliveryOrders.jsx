import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenant } from '@/lib/TenantContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, RefreshCw, ShoppingBag, Truck, ChefHat, BarChart2, Map } from 'lucide-react';
import { ManagerLiveMap } from '@/components/driver/DriverLocationMap';
import BranchSelect from '@/components/shared/BranchSelect';
import OrderBoard from '@/components/delivery/OrderBoard';
import NewOrderForm from '@/components/delivery/NewOrderForm';
import KitchenDisplay from '@/components/delivery/KitchenDisplay';
import DriverWallets from '@/components/delivery/DriverWallets';
import DeliveryAnalytics from '@/components/delivery/DeliveryAnalytics';

export default function DeliveryOrders() {
  const { branches, managerBranch, isManager, activeRestaurant } = useTenant();
  const qc = useQueryClient();

  const defaultBranch = isManager ? (managerBranch || '') : (branches[0]?.key || '');
  const [selectedBranch, setSelectedBranch] = useState(defaultBranch);
  const [tab, setTab] = useState('orders');
  const [showNewOrder, setShowNewOrder] = useState(false);

  useEffect(() => {
    if (!selectedBranch && defaultBranch) setSelectedBranch(defaultBranch);
  }, [defaultBranch]);

  const today = new Date().toISOString().split('T')[0];
  const selectedBranchRecord = useMemo(() => branches.find((branch) =>
    branch.key === selectedBranch || branch.branch_key === selectedBranch || String(branch.id) === String(selectedBranch),
  ) || null, [branches, selectedBranch]);

  const { data: orders = [], refetch } = useQuery({
    queryKey: ['delivery-orders', selectedBranch, today],
    queryFn: () => selectedBranch
      ? base44.entities.DeliveryOrder.filter({ branch: selectedBranch }, '-created_date', 200)
      : [],
    enabled: !!selectedBranch,
    refetchInterval: 15000,
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers', activeRestaurant?.id, selectedBranchRecord?.id],
    queryFn: () => activeRestaurant?.id && selectedBranchRecord?.id
      ? base44.entities.Driver.filter({ restaurant_id: activeRestaurant.id, branch_id: selectedBranchRecord.id }, 'full_name', 500)
      : [],
    enabled: !!activeRestaurant?.id && !!selectedBranchRecord?.id,
  });

  const { data: menuCategories = [] } = useQuery({
    queryKey: ['menu-categories', selectedBranch],
    queryFn: () => base44.entities.MenuCategory.filter({ active: true }, 'sort_order', 200),
    staleTime: 60000,
  });

  const { data: menuSubcategories = [] } = useQuery({
    queryKey: ['menu-subcategories', selectedBranch],
    queryFn: () => base44.entities.MenuSubcategory.filter({ active: true }, 'sort_order', 200),
    staleTime: 60000,
  });

  const { data: menuProducts = [] } = useQuery({
    queryKey: ['menu-products', selectedBranch],
    queryFn: () => base44.entities.MenuProduct.filter({ active: true }, 'name', 200),
    staleTime: 60000,
  });

  const { data: openShifts = [] } = useQuery({
    queryKey: ['driver-shifts-open', selectedBranch, today],
    queryFn: () => selectedBranch
      ? base44.entities.DriverShift.filter({ branch: selectedBranch, date: today, status: 'open' })
      : [],
    enabled: !!selectedBranch,
    refetchInterval: 20000, // refresh GPS positions every 20s
  });

  // Build driver location list for the live map
  const driverLocations = openShifts
    .filter(s => s.driver_lat && s.driver_lng)
    .map(s => {
      const activeOrder = orders.find(o => o.driver_id === s.driver_id && o.status === 'out_for_delivery');
      return {
        driver_id: s.driver_id,
        driver_name: s.driver_name,
        lat: s.driver_lat,
        lng: s.driver_lng,
        location_updated_at: s.location_updated_at,
        order: activeOrder || null,
      };
    });

  const updateOrderMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.DeliveryOrder.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['delivery-orders'] }),
  });

  const activeOrders = orders.filter(o => !['delivered', 'cancelled'].includes(o.status));
  const todayOrders = orders.filter(o => o.created_date?.startsWith(today));

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div>
            <h1 className="text-lg font-bold">Delivery Operations</h1>
            <p className="text-xs text-muted-foreground">
              {activeOrders.length} active · {todayOrders.length} today
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button size="sm" onClick={() => setShowNewOrder(true)} className="gap-1">
              <Plus className="w-4 h-4" /> New Order
            </Button>
          </div>
        </div>
        <BranchSelect value={selectedBranch} onChange={setSelectedBranch} disabled={isManager} />
      </div>

      <div className="px-4 pt-4 max-w-5xl mx-auto">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-5 w-full mb-4">
            <TabsTrigger value="orders" className="text-xs flex items-center gap-1">
              <ShoppingBag className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Orders</span>
              {activeOrders.length > 0 && (
                <Badge className="ml-1 h-4 px-1 text-[10px] bg-primary">{activeOrders.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="kitchen" className="text-xs flex items-center gap-1">
              <ChefHat className="w-3.5 h-3.5" /><span className="hidden sm:inline">Kitchen</span>
            </TabsTrigger>
            <TabsTrigger value="drivers" className="text-xs flex items-center gap-1">
              <Truck className="w-3.5 h-3.5" /><span className="hidden sm:inline">Wallets</span>
            </TabsTrigger>
            <TabsTrigger value="livemap" className="text-xs flex items-center gap-1">
              <Map className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Live Map</span>
              {driverLocations.length > 0 && (
                <Badge className="ml-1 h-4 px-1 text-[10px] bg-green-500">{driverLocations.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="analytics" className="text-xs flex items-center gap-1">
              <BarChart2 className="w-3.5 h-3.5" /><span className="hidden sm:inline">Analytics</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="orders">
            <OrderBoard
              orders={orders}
              drivers={drivers}
              onUpdateOrder={(id, data) => updateOrderMutation.mutate({ id, data })}
              loading={updateOrderMutation.isPending}
            />
          </TabsContent>

          <TabsContent value="kitchen">
            <KitchenDisplay orders={orders} onUpdateOrder={(id, data) => updateOrderMutation.mutate({ id, data })} />
          </TabsContent>

          <TabsContent value="drivers">
            <DriverWallets
              drivers={drivers}
              orders={todayOrders}
              openShifts={openShifts}
              branch={selectedBranch}
              today={today}
            />
          </TabsContent>

          <TabsContent value="livemap">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm">Live Driver Tracking</h3>
                  <p className="text-xs text-muted-foreground">
                    {driverLocations.length > 0
                      ? `${driverLocations.length} driver${driverLocations.length > 1 ? 's' : ''} sharing location`
                      : 'No drivers sharing GPS yet'}
                  </p>
                </div>
              </div>
              <ManagerLiveMap driverLocations={driverLocations} />
              {driverLocations.length > 0 && (
                <div className="space-y-2">
                  {driverLocations.map(d => (
                    <div key={d.driver_id} className="flex items-center justify-between bg-muted/40 rounded-xl px-3 py-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-base">🚴</span>
                        <div>
                          <p className="font-medium text-sm">{d.driver_name}</p>
                          {d.order && <p className="text-xs text-muted-foreground">→ {d.order.customer_address}</p>}
                        </div>
                      </div>
                      <div className="text-xs text-green-600 font-medium">
                        {d.location_updated_at ? new Date(d.location_updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Live'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="analytics">
            <DeliveryAnalytics orders={orders} drivers={drivers} today={today} />
          </TabsContent>

        </Tabs>
      </div>

      {/* New Order Dialog */}
      {showNewOrder && (
        <NewOrderForm
          branch={selectedBranch}
          drivers={drivers}
          menuCategories={menuCategories}
          menuSubcategories={menuSubcategories}
          menuProducts={menuProducts}
          openShifts={openShifts}
          onClose={() => setShowNewOrder(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['delivery-orders'] });
            setShowNewOrder(false);
          }}
        />
      )}
    </div>
  );
}