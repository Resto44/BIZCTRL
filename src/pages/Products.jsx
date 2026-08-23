import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import PageHeader from '@/components/shared/PageHeader';
import ProductMasterForm from '@/components/products/ProductMasterForm';
import EmptyState from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';

export default function Products() {
  const { t, currency } = useLanguage();
  const { activeRestaurant } = useTenant();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [search, setSearch] = useState('');

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', activeRestaurant?.id],
    queryFn: () => base44.entities.Product.filter(
      activeRestaurant?.id ? { restaurant_id: activeRestaurant.id } : {},
      'name', 2000
    ),
    enabled: !!activeRestaurant?.id,
    staleTime: 300000,
  });

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.Product.create({ ...data, restaurant_id: activeRestaurant?.id }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); setShowForm(false); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Product.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); setEditing(null); },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Product.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); setDeleting(null); },
  });

  const handleSave = (data) => {
    if (editing) {
      updateMut.mutate({ id: editing.id, data });
    } else {
      createMut.mutate(data);
    }
  };

  const filtered = products.filter(p =>
    !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.product_id?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <PageHeader
        title={t('products')}
        action={
          <Button size="sm" onClick={() => { setShowForm(true); setEditing(null); }}>
            <Plus className="w-4 h-4 mr-1" />{t('add_product')}
          </Button>
        }
      />

      <div className="mb-4">
        <Input placeholder={t('search')} value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <p className="text-center text-muted-foreground text-sm py-8">{t('loading')}</p>
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-2">
          {filtered.map(p => (
            <Card key={p.id} className="p-3 bg-card">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{p.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">{p.product_id}</span>
                    {p.category && <span className="text-xs bg-secondary px-2 py-0.5 rounded-full text-secondary-foreground">{p.category}</span>}
                    <span className="text-xs text-muted-foreground">{p.unit}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-muted-foreground">{t('default_price')}: {currency}{p.default_price}</span>
                    <span className="text-xs text-muted-foreground">{t('default_cost')}: {currency}{p.default_cost || 0}</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(p); setShowForm(false); }}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleting(p)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('add_product')}</DialogTitle>
          </DialogHeader>
          <ProductMasterForm onSubmit={handleSave} onCancel={() => setShowForm(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('edit_product')}</DialogTitle>
          </DialogHeader>
          {editing && (
            <ProductMasterForm
              initial={editing}
              onSubmit={handleSave}
              onCancel={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(open) => { if (!open) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirm_delete')}</AlertDialogTitle>
            <AlertDialogDescription></AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMut.mutate(deleting.id)}>{t('delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
