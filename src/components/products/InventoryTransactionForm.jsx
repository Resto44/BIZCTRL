import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowUp, ArrowDown, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const TX_TYPES = [
  { value: 'stock_in',            label: 'Stock In',             icon: ArrowUp,    color: 'text-green-600' },
  { value: 'stock_out',           label: 'Stock Out',            icon: ArrowDown,  color: 'text-red-600' },
  { value: 'purchase',            label: 'Purchase',             icon: ArrowUp,    color: 'text-blue-600' },
  { value: 'waste',               label: 'Waste',                icon: ArrowDown,  color: 'text-orange-600' },
  { value: 'recipe_consumption',  label: 'Recipe Consumption',   icon: ArrowDown,  color: 'text-purple-600' },
  { value: 'transfer_in',         label: 'Transfer In',          icon: ArrowUp,    color: 'text-teal-600' },
  { value: 'transfer_out',        label: 'Transfer Out',         icon: ArrowDown,  color: 'text-teal-600' },
  { value: 'adjustment',          label: 'Adjustment',           icon: RefreshCw,  color: 'text-gray-600' },
  { value: 'opening',             label: 'Opening Stock',        icon: ArrowUp,    color: 'text-green-600' },
];

export default function InventoryTransactionForm({ product, onSuccess, onCancel }) {
  const { t, currency } = useLanguage();
  const { activeRestaurant } = useTenant();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    transaction_type: 'stock_in',
    quantity: '',
    unit_cost: product?.purchase_cost || '',
    notes: '',
  });

  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.InventoryTransaction.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['inventory_transactions', product.id] });
      toast.success(t('stock_updated'));
      onSuccess?.();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.quantity || Number(form.quantity) === 0) {
      toast.error('Quantity must not be zero');
      return;
    }
    createMut.mutate({
      product_id: product.id,
      restaurant_id: activeRestaurant?.id,
      transaction_type: form.transaction_type,
      quantity: Number(form.quantity),
      unit_cost: Number(form.unit_cost) || 0,
      notes: form.notes || null,
    });
  };

  const selectedType = TX_TYPES.find(t => t.value === form.transaction_type);
  const isOut = ['stock_out', 'waste', 'recipe_consumption', 'transfer_out'].includes(form.transaction_type);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-muted rounded-lg p-3 text-xs">
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Product</span>
          <span className="font-semibold">{product?.name}</span>
        </div>
        <div className="flex justify-between items-center mt-1">
          <span className="text-muted-foreground">Current Stock</span>
          <span className={`font-bold ${(product?.current_stock || 0) <= (product?.min_stock || 0) ? 'text-red-600' : 'text-green-600'}`}>
            {product?.current_stock || 0} {product?.unit || ''}
          </span>
        </div>
      </div>

      <div>
        <Label className="text-xs">Transaction Type</Label>
        <div className="grid grid-cols-3 gap-1.5 mt-1">
          {TX_TYPES.map(type => {
            const Icon = type.icon;
            const isSelected = form.transaction_type === type.value;
            return (
              <button
                key={type.value}
                type="button"
                onClick={() => set('transaction_type', type.value)}
                className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs transition-colors ${
                  isSelected ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card hover:bg-muted'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-primary' : type.color}`} />
                <span className="text-center leading-tight">{type.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">
            Quantity {isOut ? '(to remove)' : '(to add)'}
          </Label>
          <Input
            type="number"
            step="0.001"
            min="0.001"
            value={form.quantity}
            onChange={e => set('quantity', e.target.value)}
            required
            placeholder="0"
            className={isOut ? 'border-red-300' : 'border-green-300'}
          />
        </div>
        <div>
          <Label className="text-xs">Unit Cost ({currency})</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={form.unit_cost}
            onChange={e => set('unit_cost', e.target.value)}
            placeholder="0.00"
          />
        </div>
      </div>

      {form.quantity && (
        <div className="bg-muted rounded-lg p-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">New Stock After</span>
            <span className="font-bold">
              {isOut
                ? Math.max(0, (product?.current_stock || 0) - Number(form.quantity)).toFixed(3)
                : ((product?.current_stock || 0) + Number(form.quantity)).toFixed(3)
              } {product?.unit || ''}
            </span>
          </div>
        </div>
      )}

      <div>
        <Label className="text-xs">Notes</Label>
        <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} placeholder={t('optional')} />
      </div>

      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={createMut.isPending}>
          {createMut.isPending ? t('processing') : 'Record Transaction'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>{t('cancel')}</Button>
      </div>
    </form>
  );
}
