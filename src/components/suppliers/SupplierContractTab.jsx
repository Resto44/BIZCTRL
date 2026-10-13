import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pencil, Save, X, FileText, Calendar, CreditCard } from 'lucide-react';

const TERMS_LABELS = {
  immediate: 'Immediate',
  net_7: 'Net 7 days',
  net_15: 'Net 15 days',
  net_30: 'Net 30 days',
  net_60: 'Net 60 days',
};

export default function SupplierContractTab({ supplier, readOnly = false }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    contract_start: supplier.contract_start || '',
    contract_end: supplier.contract_end || '',
    payment_terms: supplier.payment_terms || 'net_30',
    credit_limit: supplier.credit_limit || '',
    contract_notes: supplier.contract_notes || '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const saveMut = useMutation({
    mutationFn: (data) => base44.entities.Supplier.update(supplier.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); qc.invalidateQueries({queryKey:['supplier-ledger']}); setEditing(false); },
  });

  const hasContract = supplier.contract_start || supplier.payment_terms || supplier.contract_notes;

  return (
    <div className="space-y-3">
      {!editing ? (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" /> Contract Terms
            </h3>
            <Button disabled={readOnly} size="sm" variant="ghost" onClick={() => setEditing(true)}>
              <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
            </Button>
          </div>

          {!hasContract ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No contract terms set. Click Edit to add.</p>
          ) : (
            <div className="space-y-2">
              {(supplier.contract_start || supplier.contract_end) && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm">
                    {supplier.contract_start || '—'} → {supplier.contract_end || 'Ongoing'}
                  </span>
                  {supplier.contract_end && new Date(supplier.contract_end) < new Date() && (
                    <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">Expired</Badge>
                  )}
                  {supplier.contract_end && new Date(supplier.contract_end) > new Date() &&
                    (new Date(supplier.contract_end) - new Date()) < 30 * 86400000 && (
                    <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">Expiring Soon</Badge>
                  )}
                </div>
              )}
              {supplier.payment_terms && (
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium">{TERMS_LABELS[supplier.payment_terms] || supplier.payment_terms}</span>
                </div>
              )}
              {supplier.credit_limit > 0 && (
                <p className="text-sm text-muted-foreground">Credit Limit: <strong>{supplier.credit_limit}</strong></p>
              )}
              {supplier.contract_notes && (
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">{supplier.contract_notes}</p>
                </div>
              )}
            </div>
          )}
        </Card>
      ) : (
        <Card className="p-4 space-y-3">
          <h3 className="font-semibold text-sm">Edit Contract Terms</h3>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Contract Start</Label><Input type="date" value={form.contract_start} onChange={e => set('contract_start', e.target.value)} /></div>
            <div><Label className="text-xs">Contract End</Label><Input type="date" value={form.contract_end} onChange={e => set('contract_end', e.target.value)} /></div>
          </div>
          <div>
            <Label className="text-xs">Payment Terms</Label>
            <Select value={form.payment_terms} onValueChange={v => set('payment_terms', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TERMS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Credit Limit</Label>
            <Input type="number" value={form.credit_limit} onChange={e => set('credit_limit', e.target.value)} placeholder="0" />
          </div>
          <div>
            <Label className="text-xs">Contract Notes / Terms</Label>
            <textarea
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              rows={4}
              value={form.contract_notes}
              onChange={e => set('contract_notes', e.target.value)}
              placeholder="Delivery terms, quality standards, penalties..."
            />
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending}>
              <Save className="w-3.5 h-3.5 mr-1" /> Save
            </Button>
            <Button variant="outline" onClick={() => setEditing(false)}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}