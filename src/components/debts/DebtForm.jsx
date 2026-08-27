import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useTenant } from '@/lib/TenantContext';
import { useDebtI18n } from '@/lib/debtI18n';
import { useAuth } from '@/lib/AuthContext';
import { format } from 'date-fns';
import { FileText, MessageCircle, Loader2, Clock } from 'lucide-react';
import { generateInvoiceNumber, processDebtSave, generateInvoicePDF, openPDFInNewTab } from '@/lib/debtInvoiceService';
import { isWhatsAppConfigured } from '@/lib/whatsappService';
import { createCustomerReceivable, customerDebtPaymentErrorMessage, newReceivableRequestId } from '@/lib/debt/customerReceivableRepository';

export default function DebtForm({ initial = {}, onSave, onCancel }) {
  const { branches, activeRestaurantId, ownerFilter } = useTenant();
  const { user } = useAuth();
  const d = useDebtI18n();

  const partyTypes = [
    { value: 'customer', label: d.party_customer },
    { value: 'company', label: d.party_company },
    { value: 'supplier', label: d.party_supplier },
    { value: 'loan', label: d.party_loan },
    { value: 'branch', label: d.party_branch },
    { value: 'owner_personal', label: d.party_owner_personal },
    { value: 'employee', label: d.party_employee },
    { value: 'driver', label: d.party_driver },
  ];

  const [form, setForm] = useState({
    type: 'receivable',
    party_type: 'customer',
    party_name: '',
    party_phone: '',
    branch: '',
    invoice_number: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    due_date: '',
    total_amount: '',
    paid_amount: '',
    description: '',
    notes: '',
    interest_rate: '',
    installment_amount: '',
    installment_frequency: 'monthly',
    ...initial,
  });
  const [saving, setSaving] = useState(false);
  const [autoInvoiceNum, setAutoInvoiceNum] = useState('');
  const [saveResult, setSaveResult] = useState(null);
  const receivableRequestId = useRef(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Pre-generate invoice number for new records
  useEffect(() => {
    if (!initial.id && activeRestaurantId) {
      generateInvoiceNumber(activeRestaurantId).then(num => {
        setAutoInvoiceNum(num);
      });
    } else if (initial.invoice_auto_number) {
      setAutoInvoiceNum(initial.invoice_auto_number);
    }
  }, [initial.id, activeRestaurantId]);

  // Load Employees
  const { data: employees = [] } = useQuery({
    queryKey: ['employees', ownerFilter],
    queryFn: () => base44.entities.Employee.filter(ownerFilter || {}, 'full_name', 500),
    enabled: form.party_type === 'employee' && !!ownerFilter?.created_by,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers', activeRestaurantId, form.branch],
    queryFn: () => base44.entities.Customer.filter({ restaurant_id: activeRestaurantId, is_active: true }, 'name', 500),
    enabled: form.party_type === 'customer' && form.type === 'receivable' && !!activeRestaurantId,
  });

  // Load Drivers
  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers', activeRestaurantId],
    queryFn: () => base44.entities.Driver.filter({ restaurant_id: activeRestaurantId }, 'full_name', 500),
    enabled: form.party_type === 'driver' && !!activeRestaurantId,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveResult(null);
    const total = parseFloat(form.total_amount) || 0;
    const paid = parseFloat(form.paid_amount) || 0;
    const data = {
      ...form,
      restaurant_id: activeRestaurantId,
      total_amount: total,
      paid_amount: paid,
      remaining_amount: total - paid,
      interest_rate: parseFloat(form.interest_rate) || 0,
      installment_amount: parseFloat(form.installment_amount) || 0,
      status: paid >= total ? 'paid' : paid > 0 ? 'partial' : 'open',
    };
    try {
      const finalData = { ...data };
      if (form.party_type === 'employee') {
        finalData.employee_id = form.party_id;
        finalData.employee_name = form.party_name;
      } else if (form.party_type === 'driver') {
        finalData.driver_id = form.party_id;
        finalData.driver_name = form.party_name;
      }
      delete finalData.party_id;

      let savedRecord;
      if (!initial.id && form.party_type === 'customer' && form.type === 'receivable') {
        const branchId = branches.find((branch) => branch.key === form.branch || branch.branch_key === form.branch)?.id || null;
        const result = await createCustomerReceivable({
          customerId: form.customer_id,
          branchId,
          branch: form.branch,
          totalAmount: total,
          paidAmount: paid,
          date: form.date,
          dueDate: form.due_date,
          invoiceNumber: form.invoice_number,
          description: form.description,
          notes: form.notes,
          requestId: receivableRequestId.current || (receivableRequestId.current = newReceivableRequestId()),
        });
        savedRecord = result.debt;
      } else if (initial.id) {
        savedRecord = await base44.entities.DebtRecord.update(initial.id, finalData);
      } else {
        savedRecord = await base44.entities.DebtRecord.create(finalData);
      }

      // Auto-create invoice + send WhatsApp (only for new records)
      if (!initial.id && savedRecord) {
        const result = await processDebtSave({
          debtRecord: { ...savedRecord, ...finalData },
          restaurantId: activeRestaurantId,
          createdBy: user?.email,
          brandName: 'BizCTRL',
        });
        setSaveResult(result);
      }

      onSave(savedRecord);
    } catch (err) {
      console.error('Failed to save debt:', err);
      alert(customerDebtPaymentErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handlePartySelect = (val) => {
    if (form.party_type === 'employee') {
      const emp = employees.find(e => e.id === val);
      if (emp) {
        setForm(f => ({
          ...f,
          party_id: emp.id,
          party_name: emp.full_name || emp.name,
          party_phone: emp.phone || '',
          branch: emp.branch || f.branch
        }));
      }
    } else if (form.party_type === 'driver') {
      const drv = drivers.find(d => d.id === val);
      if (drv) {
        setForm(f => ({
          ...f,
          party_id: drv.id,
          party_name: drv.full_name,
          party_phone: drv.phone || '',
        }));
      }
    } else if (form.party_type === 'customer') {
      const customer = customers.find((candidate) => String(candidate.id) === String(val));
      if (customer) {
        setForm(f => ({
          ...f,
          party_id: customer.id,
          customer_id: customer.id,
          party_name: customer.name || '',
          party_phone: customer.phone || '',
          branch: customer.branch || f.branch,
        }));
      }
    }
  };

  const handlePreviewInvoice = () => {
    const total = parseFloat(form.total_amount) || 0;
    const paid = parseFloat(form.paid_amount) || 0;
    const invoiceData = {
      invoice_number: autoInvoiceNum || 'DBT-PREVIEW',
      party_name: form.party_name || 'Customer',
      party_phone: form.party_phone,
      invoice_date: form.date,
      due_date: form.due_date,
      branch: form.branch,
      total_amount: total,
      paid_amount: paid,
      remaining_amount: total - paid,
      description: form.description,
      status: paid >= total ? 'paid' : paid > 0 ? 'partial' : 'open',
    };
    const html = generateInvoicePDF(invoiceData);
    openPDFInNewTab(html);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-2">
      {/* Auto Invoice Number Banner */}
      {!initial.id && autoInvoiceNum && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
          <FileText className="w-4 h-4 text-blue-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs text-blue-600 font-medium">Auto Invoice Number</div>
            <div className="text-sm font-bold text-blue-800">{autoInvoiceNum}</div>
          </div>
          {isWhatsAppConfigured() ? (
            <Badge className="bg-green-100 text-green-700 text-[10px]">
              <MessageCircle className="w-3 h-3 mr-1" /> WhatsApp Ready
            </Badge>
          ) : (
            <Badge className="bg-amber-100 text-amber-700 text-[10px]">
              <Clock className="w-3 h-3 mr-1" /> Will Queue
            </Badge>
          )}
        </div>
      )}

      {/* Type + Party Type */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>{d.type_label}</Label>
          <Select value={form.type} onValueChange={v => set('type', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="receivable">{d.type_receivable}</SelectItem>
              <SelectItem value="liability">{d.type_liability}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>{d.party_label}</Label>
          <Select value={form.party_type} onValueChange={v => {
            set('party_type', v);
            set('party_name', '');
            set('party_phone', '');
            set('party_id', '');
          }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {partyTypes.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Name Selector for Employee/Driver or Input for others */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>{d.name_label}</Label>
          {form.party_type === 'employee' ? (
            <Select value={form.party_id} onValueChange={handlePartySelect}>
              <SelectTrigger><SelectValue placeholder={d.name_placeholder} /></SelectTrigger>
              <SelectContent>
                {employees.map(e => (
                  <SelectItem key={e.id} value={e.id}>{e.full_name || e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : form.party_type === 'driver' ? (
            <Select value={form.party_id} onValueChange={handlePartySelect}>
              <SelectTrigger><SelectValue placeholder={d.name_placeholder} /></SelectTrigger>
              <SelectContent>
                {drivers.map(drv => (
                  <SelectItem key={drv.id} value={drv.id}>{drv.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : form.party_type === 'customer' && form.type === 'receivable' ? (
            <Select value={form.customer_id || form.party_id || ''} onValueChange={handlePartySelect}>
              <SelectTrigger><SelectValue placeholder="Select active customer" /></SelectTrigger>
              <SelectContent>
                {customers.filter((customer) => !form.branch || customer.branch === form.branch).map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input required value={form.party_name} onChange={e => set('party_name', e.target.value)} placeholder={d.name_placeholder} />
          )}
        </div>
        <div className="space-y-1">
          <Label>{d.phone_label} <span className="text-[10px] text-blue-500">(WhatsApp)</span></Label>
          <Input value={form.party_phone} onChange={e => set('party_phone', e.target.value)} placeholder="05xxxxxxxx" />
        </div>
      </div>

      {/* Branch */}
      <div className="space-y-1">
        <Label>{d.branch_label}</Label>
        <Select value={form.branch} onValueChange={v => set('branch', v)}>
          <SelectTrigger><SelectValue placeholder={d.choose_branch} /></SelectTrigger>
          <SelectContent>
            {branches.map(b => <SelectItem key={b.key} value={b.key}>{b.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>{d.debt_date}</Label>
          <Input type="date" required value={form.date} onChange={e => set('date', e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>{d.due_date}</Label>
          <Input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
        </div>
      </div>

      {/* Amount */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>{d.total_amount}</Label>
          <Input required type="number" min="0" step="0.01" value={form.total_amount} onChange={e => set('total_amount', e.target.value)} placeholder="0.00" />
        </div>
        <div className="space-y-1">
          <Label>{d.paid_so_far}</Label>
          <Input type="number" min="0" step="0.01" value={form.paid_amount || ''} onChange={e => set('paid_amount', e.target.value)} placeholder="0.00" />
        </div>
      </div>

      {/* Loan fields */}
      {form.party_type === 'loan' && (
        <div className="grid grid-cols-2 gap-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
          <div className="space-y-1">
            <Label>{d.monthly_installment}</Label>
            <Input type="number" min="0" value={form.installment_amount} onChange={e => set('installment_amount', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{d.interest_pct}</Label>
            <Input type="number" min="0" step="0.1" value={form.interest_rate} onChange={e => set('interest_rate', e.target.value)} />
          </div>
        </div>
      )}

      {/* Description + Notes */}
      <div className="space-y-1">
        <Label>{d.description}</Label>
        <Input value={form.description} onChange={e => set('description', e.target.value)} placeholder={d.description_placeholder} />
      </div>
      <div className="space-y-1">
        <Label>{d.notes}</Label>
        <Textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder={d.notes_placeholder} />
      </div>

      {/* Preview Invoice Button */}
      {!initial.id && form.party_name && form.total_amount && (
        <Button type="button" variant="outline" size="sm" className="w-full text-blue-600 border-blue-200" onClick={handlePreviewInvoice}>
          <FileText className="w-4 h-4 mr-2" /> Preview Invoice
        </Button>
      )}

      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={saving} className="flex-1">
          {saving ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {d.saving}
            </span>
          ) : (initial.id ? d.update : d.add)}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>{d.cancel}</Button>
      </div>

      {/* WhatsApp info note */}
      {!initial.id && (
        <div className="text-[10px] text-muted-foreground text-center">
          {isWhatsAppConfigured()
            ? '📲 Invoice will be sent to customer WhatsApp automatically'
            : '📋 Invoice will be queued for WhatsApp delivery (Pending WhatsApp Delivery)'}
        </div>
      )}
    </form>
  );
}
