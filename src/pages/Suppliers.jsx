import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useLanguage } from '@/lib/LanguageContext';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, Truck, Phone, CreditCard, MapPin } from 'lucide-react';
import { useTenant } from '@/lib/TenantContext';
import SupplierDetail from '@/components/suppliers/SupplierDetail';
import SupplierPaymentManager from '@/components/suppliers/SupplierPaymentManager';
import SupplierPaymentForm from '@/components/suppliers/SupplierPaymentForm';

const ui = {
  en: { suppliers: 'Suppliers', add_supplier: 'Add Supplier', edit_supplier: 'Edit Supplier', name: 'Supplier Name', phone: 'Phone', email: 'Email', address: 'Address', notes: 'Notes', save: 'Save', cancel: 'Cancel', confirm_delete: 'Confirm Delete' },
  ar: { suppliers: 'الموردون', add_supplier: 'إضافة مورد', edit_supplier: 'تعديل المورد', name: 'اسم المورد', phone: 'الهاتف', email: 'البريد الإلكتروني', address: 'العنوان', notes: 'ملاحظات', save: 'حفظ', cancel: 'إلغاء', confirm_delete: 'تأكيد الحذف' },
  fa: { suppliers: 'تامین‌کنندگان', add_supplier: 'افزودن تامین‌کننده', edit_supplier: 'ویرایش تامین‌کننده', name: 'نام تامین‌کننده', phone: 'تلفن', email: 'ایمیل', address: 'آدرس', notes: 'یادداشت‌ها', save: 'ذخیره', cancel: 'لغو', confirm_delete: 'تأیید حذف' },
};

const emptyForm = { name: '', phone: '', email: '', address: '', notes: '' };

export default function Suppliers() {
  const { lang } = useLanguage();
  const m = ui[lang] || ui.en;
  const qc = useQueryClient();
  const { ownerFilter } = useTenant();
  const [searchParams] = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteId, setDeleteId] = useState(null);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') || 'list');

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) setActiveTab(tab);
  }, [searchParams]);

  const { data: suppliers = [] } = useQuery({ 
    queryKey: ['suppliers', ownerFilter], 
    queryFn: () => base44.entities.Supplier.filter(ownerFilter || {}, 'name', 500), 
    enabled: !!(ownerFilter?.created_by || ownerFilter?.branch) 
  });

  const { activeRestaurantId, orgId } = useTenant();

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const payload = {
        ...data,
        ...(ownerFilter || {}),
        // Ensure critical visibility fields are explicitly set
        restaurant_id: activeRestaurantId,
        created_by: orgId,
        status: true, // Default to active
      };
      try {
        const result = editing 
          ? await base44.entities.Supplier.update(editing.id, data) 
          : await base44.entities.Supplier.create(payload);
        return result;
      } catch (err) {
        throw err;
      }
    },
    onSuccess: () => { 
      qc.invalidateQueries({ queryKey: ['suppliers'] }); 
      closeForm(); 
    },
    onError: (err) => {
      console.error('[Suppliers] Mutation error:', err);
      alert(err.message || 'An unknown error occurred during save');
    }
  });
  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Supplier.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); setDeleteId(null); },
  });

  const openAdd = () => { setEditing(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (s) => { setEditing(s); setForm({ name: s.name, phone: s.phone || '', email: s.email || '', address: s.address || '', notes: s.notes || '' }); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditing(null); };

  if (selectedSupplier) {
    return <SupplierDetail supplier={selectedSupplier} onBack={() => setSelectedSupplier(null)} />;
  }

  return (
    <div>
      <PageHeader title={m.suppliers} action={<Button size="sm" onClick={openAdd} className="gap-1"><Plus className="w-4 h-4" />{m.add_supplier}</Button>} />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
        <TabsList className="w-full">
          <TabsTrigger value="list" className="flex-1 text-xs">Suppliers</TabsTrigger>
          <TabsTrigger value="payments" className="flex-1 text-xs">
            <CreditCard className="w-3.5 h-3.5 mr-1" />Accounts Payable
          </TabsTrigger>
        </TabsList>

        <TabsContent value="payments" className="mt-3">
          <div className="space-y-4">
            <SupplierPaymentForm />
            <SupplierPaymentManager />
          </div>
        </TabsContent>

        <TabsContent value="list" className="mt-3">
      <div className="space-y-2">
        {suppliers.length === 0 && (
          <div className="text-center py-10 text-muted-foreground">
            <Truck className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">{lang === 'ar' ? 'لا يوجد موردون' : lang === 'fa' ? 'تامین‌کننده‌ای وجود ندارد' : 'No suppliers yet'}</p>
          </div>
        )}
        {suppliers.map(s => (
          <Card key={s.id} className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center">
                  <Truck className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium text-sm">{s.name}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {s.address && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />{s.address}</span>}
                    {s.phone && <span className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{s.phone}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" onClick={() => setSelectedSupplier(s)}>View</Button>
                <Button size="icon" variant="ghost" onClick={() => openEdit(s)}><Pencil className="w-4 h-4" /></Button>
                <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setDeleteId(s.id)}><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

        </TabsContent>
      </Tabs>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? m.edit_supplier : m.add_supplier}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {[['name', m.name], ['phone', m.phone], ['email', m.email], ['address', m.address], ['notes', m.notes]].map(([field, label]) => (
              <div key={field}>
                <Label className="text-xs">{label}</Label>
                <Input value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} />
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <Button className="flex-1" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>{m.save}</Button>
              <Button variant="outline" className="flex-1" onClick={closeForm}>{m.cancel}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{m.confirm_delete}</AlertDialogTitle></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate(deleteId)}>{m.save}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
