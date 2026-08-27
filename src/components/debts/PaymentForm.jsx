import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { useAuth } from '@/lib/AuthContext';
import { useTenant } from '@/lib/TenantContext';
import { useDebtI18n } from '@/lib/debtI18n';
import { useNotify } from '@/lib/useNotify';
import { Loader2, Receipt, MessageCircle, Clock, FileText } from 'lucide-react';
import { processPaymentSave, generateReceiptPDF, openPDFInNewTab } from '@/lib/debtInvoiceService';
import { customerDebtPaymentErrorMessage, newReceivableRequestId, recordCustomerDebtPayment } from '@/lib/debt/customerReceivableRepository';
import { isWhatsAppConfigured } from '@/lib/whatsappService';

export default function PaymentForm({ debt, onSave, onCancel }) {
  const notif = useNotify();
  const { user } = useAuth();
  const { activeRestaurantId } = useTenant();
  const d = useDebtI18n();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const paymentRequestId = useRef(null);

  const remaining = (debt.remaining_amount ?? debt.total_amount - (debt.paid_amount || 0));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) return;
    setSaving(true);

    try {
      // The RPC locks the receivable, prevents overpayment and duplicate request
      // writes, records the payment, updates the remaining balance, and refreshes
      // the Customer Master compatibility cache in one database transaction.
      const result = await recordCustomerDebtPayment({
        debtId: debt.id,
        amount: amt,
        date,
        paymentMethod: method,
        notes,
        requestId: paymentRequestId.current || (paymentRequestId.current = newReceivableRequestId()),
      });
      const payment = result.payment;
      const updatedDebt = result.debt || debt;

      // Receipt/WhatsApp delivery is a post-commit communication side effect. It
      // cannot undo or duplicate the authoritative repayment if delivery fails.
      try {
        await processPaymentSave({
          payment: { ...payment, amount: amt, payment_method: method, date, notes },
          debtRecord: updatedDebt,
          restaurantId: activeRestaurantId,
          createdBy: user?.email,
          brandName: 'BizCTRL',
        });
      } catch (receiptError) {
        console.warn('Customer payment receipt delivery failed after commit:', receiptError?.message || receiptError);
      }

      await notif.creditCollection({
        branch: updatedDebt.branch || debt.branch || 'General',
        amount: amt,
        action: 'create',
      });
      onSave();
    } catch (err) {
      console.error('Payment error:', err);
      alert(customerDebtPaymentErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handlePreviewReceipt = () => {
    const amt = parseFloat(amount) || 0;
    const receiptData = {
      receipt_number: 'RCP-PREVIEW',
      party_name: debt.party_name,
      party_phone: debt.party_phone,
      receipt_date: date,
      amount: amt,
      payment_method: method,
      invoice_number: debt.invoice_auto_number || debt.invoice_number,
      notes,
    };
    const html = generateReceiptPDF(receiptData);
    openPDFInNewTab(html);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-2">
      <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{d.total_debt}</span>
          <span className="font-bold">{debt.total_amount?.toLocaleString()} {d.currency}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{d.amount_paid_label}</span>
          <span className="font-medium text-green-600">{(debt.paid_amount || 0)?.toLocaleString()} {d.currency}</span>
        </div>
        <div className="flex justify-between border-t pt-1">
          <span className="font-semibold">{d.remaining}</span>
          <span className="font-bold text-red-600">{remaining?.toLocaleString()} {d.currency}</span>
        </div>
      </div>

      <div className="space-y-1">
        <Label>{d.payment_amount}</Label>
        <Input required type="number" min="0.01" max={remaining} step="0.01"
          value={amount} onChange={e => setAmount(e.target.value)}
          placeholder={d.max_placeholder(remaining?.toLocaleString())} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>{d.payment_method}</Label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">{d.method_cash}</SelectItem>
              <SelectItem value="network">{d.method_network}</SelectItem>
              <SelectItem value="bank_transfer">{d.method_bank}</SelectItem>
              <SelectItem value="cheque">{d.method_cheque}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>{d.date}</Label>
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1">
        <Label>{d.notes}</Label>
        <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
      </div>

      {/* WhatsApp status banner */}
      <div className="flex items-center justify-between bg-blue-50 rounded-lg px-3 py-2">
        <div className="flex items-center gap-2 text-xs text-blue-700">
          <Receipt className="w-3.5 h-3.5" />
          <span>Receipt will be auto-created</span>
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

      {/* Preview Receipt Button */}
      {amount && parseFloat(amount) > 0 && (
        <Button type="button" variant="outline" size="sm" className="w-full text-green-600 border-green-200" onClick={handlePreviewReceipt}>
          <FileText className="w-4 h-4 mr-2" /> Preview Receipt
        </Button>
      )}

      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={saving} className="flex-1 bg-green-600 hover:bg-green-700">
          {saving ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {d.recording}
            </span>
          ) : d.submit_payment}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>{d.cancel}</Button>
      </div>

      {/* WhatsApp note */}
      <div className="text-[10px] text-muted-foreground text-center">
        {debt.party_phone
          ? isWhatsAppConfigured()
            ? '📲 Receipt will be sent to customer WhatsApp automatically'
            : '📋 Receipt queued for WhatsApp delivery (Pending WhatsApp Delivery)'
          : '⚠️ No phone number — WhatsApp delivery skipped'}
      </div>
    </form>
  );
}