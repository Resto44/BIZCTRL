import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Ruler, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { useTenant } from '@/lib/TenantContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const EMPTY_UNIT = { name: '', abbreviation: '', type: 'count' };

export default function ProductUnitManager() {
  const { activeRestaurant } = useTenant();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_UNIT);

  const { data: allUnits = [], isLoading } = useQuery({
    queryKey: ['product_units', activeRestaurant?.id],
    queryFn: () => base44.entities.ProductUnit.list('sort_order', 500),
    enabled: Boolean(activeRestaurant?.id),
    staleTime: 60_000,
  });

  const units = useMemo(() => allUnits.filter((unit) => (
    unit.is_system || !unit.restaurant_id || unit.restaurant_id === activeRestaurant?.id
  )), [activeRestaurant?.id, allUnits]);

  const createUnit = useMutation({
    mutationFn: (payload) => base44.entities.ProductUnit.create({
      ...payload,
      restaurant_id: activeRestaurant?.id,
      is_system: false,
      is_active: true,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product_units'] });
      setForm(EMPTY_UNIT);
      toast.success('Product unit added.');
    },
    onError: (error) => toast.error(error?.message || 'Unable to add product unit.'),
  });

  const deleteUnit = useMutation({
    mutationFn: (id) => base44.entities.ProductUnit.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product_units'] });
      toast.success('Product unit removed.');
    },
    onError: (error) => toast.error(error?.message || 'Unable to remove product unit.'),
  });

  const submit = (event) => {
    event.preventDefault();
    if (!form.name.trim()) return;
    createUnit.mutate({
      name: form.name.trim(),
      abbreviation: form.abbreviation.trim() || null,
      type: form.type,
    });
  };

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50">
        <div className="mb-3 flex items-center gap-2">
          <Ruler className="h-5 w-5 text-blue-600" aria-hidden="true" />
          <div><h3 className="font-black">Add Custom Unit</h3><p className="text-xs text-muted-foreground">System units remain available to every business.</p></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px_150px_auto] sm:items-end">
          <div><Label htmlFor="product-unit-name">Unit name</Label><Input id="product-unit-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Dozen" required /></div>
          <div><Label htmlFor="product-unit-code">Abbreviation</Label><Input id="product-unit-code" value={form.abbreviation} onChange={(event) => setForm((current) => ({ ...current, abbreviation: event.target.value }))} placeholder="dz" /></div>
          <div><Label>Type</Label><Select value={form.type} onValueChange={(type) => setForm((current) => ({ ...current, type }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="count">Count</SelectItem><SelectItem value="weight">Weight</SelectItem><SelectItem value="volume">Volume</SelectItem><SelectItem value="custom">Custom</SelectItem></SelectContent></Select></div>
          <Button type="submit" disabled={createUnit.isPending}><Plus className="mr-1.5 h-4 w-4" />Add</Button>
        </div>
      </form>

      {isLoading ? <div className="h-40 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900" /> : (
        <div className="grid gap-2 sm:grid-cols-2">
          {units.map((unit) => (
            <div key={unit.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 font-black text-blue-600 dark:bg-blue-950/50">{unit.abbreviation || unit.name?.slice(0, 2)}</span>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{unit.name}</p><p className="text-xs capitalize text-muted-foreground">{unit.type || 'custom'}</p></div>
              {unit.is_system ? <Badge variant="secondary">System</Badge> : <Button type="button" variant="ghost" size="icon" className="text-red-600" aria-label={`Delete ${unit.name}`} onClick={() => deleteUnit.mutate(unit.id)}><Trash2 className="h-4 w-4" /></Button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
