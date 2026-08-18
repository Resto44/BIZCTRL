/**
 * Debt Invoice & Receipt Service
 * 
 * - Auto-generates invoice numbers: DBT-YYYYMMDD-XXXX
 * - Creates invoice records on debt save
 * - Creates receipt records on payment
 * - Generates PDF for invoice and receipt
 * - Triggers WhatsApp delivery
 */

import { supabase } from '@/api/supabaseClient';
import { sendInvoiceWhatsApp, sendReceiptWhatsApp } from '@/lib/whatsappService';
import { format } from 'date-fns';

// ── Generate invoice number ───────────────────────────────────────────────────
export async function generateInvoiceNumber(restaurantId) {
  try {
    const { data, error } = await supabase.rpc('generate_debt_invoice_number', {
      p_restaurant_id: restaurantId,
    });
    if (error) throw error;
    return data;
  } catch (err) {
    // Fallback: generate locally if RPC fails
    const dateStr = format(new Date(), 'yyyyMMdd');
    const rand = Math.floor(Math.random() * 9000) + 1000;
    return `DBT-${dateStr}-${rand}`;
  }
}

// ── Generate receipt number ───────────────────────────────────────────────────
export function generateReceiptNumber(invoiceNumber) {
  if (invoiceNumber) {
    return invoiceNumber.replace('DBT-', 'RCP-');
  }
  const dateStr = format(new Date(), 'yyyyMMdd');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `RCP-${dateStr}-${rand}`;
}

// ── Generate Invoice PDF (HTML-based, opens in new tab or returns blob URL) ───
export function generateInvoicePDF(invoice, brandName = 'BizCTRL') {
  const html = `<!DOCTYPE html>
<html dir="ltr" lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; color: #1a1a1a; background: #fff; padding: 40px; }
  .header { text-align: center; border-bottom: 3px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px; }
  .brand { font-size: 28px; font-weight: bold; color: #2563eb; }
  .invoice-title { font-size: 18px; color: #6b7280; margin-top: 4px; }
  .invoice-number { font-size: 22px; font-weight: bold; color: #1e40af; margin-top: 8px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
  .info-box { background: #f8fafc; border-radius: 8px; padding: 16px; }
  .info-label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
  .info-value { font-size: 15px; font-weight: 600; margin-top: 4px; }
  .amount-section { background: #eff6ff; border: 2px solid #2563eb; border-radius: 12px; padding: 24px; margin-bottom: 30px; }
  .amount-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #dbeafe; }
  .amount-row:last-child { border-bottom: none; font-size: 20px; font-weight: bold; color: #1e40af; }
  .amount-label { color: #374151; }
  .amount-value { font-weight: 600; }
  .footer { text-align: center; color: #9ca3af; font-size: 12px; border-top: 1px solid #e5e7eb; padding-top: 20px; }
  .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; }
  .status-open { background: #dbeafe; color: #1e40af; }
  .status-paid { background: #d1fae5; color: #065f46; }
  .status-partial { background: #fef3c7; color: #92400e; }
  .status-overdue { background: #fee2e2; color: #991b1b; }
  @media print { body { padding: 20px; } }
</style>
</head>
<body>
  <div class="header">
    <div class="brand">${brandName}</div>
    <div class="invoice-title">DEBT INVOICE / فاتورة دين</div>
    <div class="invoice-number">${invoice.invoice_number}</div>
  </div>
  
  <div class="info-grid">
    <div class="info-box">
      <div class="info-label">Customer / العميل</div>
      <div class="info-value">${invoice.party_name || '-'}</div>
      ${invoice.party_phone ? `<div style="font-size:13px;color:#6b7280;margin-top:4px;">📞 ${invoice.party_phone}</div>` : ''}
    </div>
    <div class="info-box">
      <div class="info-label">Invoice Date / تاريخ الفاتورة</div>
      <div class="info-value">${invoice.invoice_date || format(new Date(), 'yyyy-MM-dd')}</div>
      ${invoice.due_date ? `<div style="font-size:13px;color:#ef4444;margin-top:4px;">Due: ${invoice.due_date}</div>` : ''}
    </div>
    ${invoice.branch ? `
    <div class="info-box">
      <div class="info-label">Branch / الفرع</div>
      <div class="info-value">${invoice.branch}</div>
    </div>` : ''}
    <div class="info-box">
      <div class="info-label">Status / الحالة</div>
      <div class="info-value">
        <span class="status-badge status-${invoice.status || 'open'}">${(invoice.status || 'open').toUpperCase()}</span>
      </div>
    </div>
  </div>

  ${invoice.description ? `
  <div style="background:#f8fafc;border-radius:8px;padding:16px;margin-bottom:20px;">
    <div style="font-size:11px;color:#6b7280;text-transform:uppercase;margin-bottom:4px;">Description</div>
    <div>${invoice.description}</div>
  </div>` : ''}

  <div class="amount-section">
    <div class="amount-row">
      <span class="amount-label">Total Amount / المبلغ الإجمالي</span>
      <span class="amount-value">${Number(invoice.total_amount || 0).toLocaleString()}</span>
    </div>
    <div class="amount-row">
      <span class="amount-label">Paid Amount / المدفوع</span>
      <span class="amount-value" style="color:#059669;">${Number(invoice.paid_amount || 0).toLocaleString()}</span>
    </div>
    <div class="amount-row">
      <span class="amount-label">Remaining Balance / المتبقي</span>
      <span class="amount-value" style="color:#dc2626;">${Number(invoice.remaining_amount || (invoice.total_amount - (invoice.paid_amount || 0))).toLocaleString()}</span>
    </div>
  </div>

  <div class="footer">
    <p>Generated by BizCTRL • ${new Date().toLocaleDateString()}</p>
    <p style="margin-top:4px;">Thank you for your business / شكراً لتعاملكم معنا</p>
  </div>
</body>
</html>`;
  return html;
}

// ── Generate Receipt PDF ──────────────────────────────────────────────────────
export function generateReceiptPDF(receipt, brandName = 'BizCTRL') {
  const html = `<!DOCTYPE html>
<html dir="ltr" lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; color: #1a1a1a; background: #fff; padding: 40px; }
  .header { text-align: center; border-bottom: 3px solid #059669; padding-bottom: 20px; margin-bottom: 30px; }
  .brand { font-size: 28px; font-weight: bold; color: #059669; }
  .receipt-title { font-size: 18px; color: #6b7280; margin-top: 4px; }
  .receipt-number { font-size: 22px; font-weight: bold; color: #065f46; margin-top: 8px; }
  .check-icon { font-size: 48px; margin: 16px 0; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
  .info-box { background: #f0fdf4; border-radius: 8px; padding: 16px; }
  .info-label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
  .info-value { font-size: 15px; font-weight: 600; margin-top: 4px; }
  .amount-section { background: #f0fdf4; border: 2px solid #059669; border-radius: 12px; padding: 24px; margin-bottom: 30px; text-align: center; }
  .amount-paid { font-size: 36px; font-weight: bold; color: #059669; }
  .amount-label { font-size: 14px; color: #6b7280; margin-bottom: 8px; }
  .footer { text-align: center; color: #9ca3af; font-size: 12px; border-top: 1px solid #e5e7eb; padding-top: 20px; }
  @media print { body { padding: 20px; } }
</style>
</head>
<body>
  <div class="header">
    <div class="brand">${brandName}</div>
    <div class="receipt-title">PAYMENT RECEIPT / إيصال دفع</div>
    <div class="receipt-number">${receipt.receipt_number}</div>
    <div class="check-icon">✅</div>
  </div>
  
  <div class="info-grid">
    <div class="info-box">
      <div class="info-label">Customer / العميل</div>
      <div class="info-value">${receipt.party_name || '-'}</div>
      ${receipt.party_phone ? `<div style="font-size:13px;color:#6b7280;margin-top:4px;">📞 ${receipt.party_phone}</div>` : ''}
    </div>
    <div class="info-box">
      <div class="info-label">Payment Date / تاريخ الدفع</div>
      <div class="info-value">${receipt.receipt_date || format(new Date(), 'yyyy-MM-dd')}</div>
    </div>
    <div class="info-box">
      <div class="info-label">Payment Method / طريقة الدفع</div>
      <div class="info-value">${(receipt.payment_method || 'cash').toUpperCase()}</div>
    </div>
    ${receipt.invoice_number ? `
    <div class="info-box">
      <div class="info-label">Invoice Reference</div>
      <div class="info-value">${receipt.invoice_number}</div>
    </div>` : ''}
  </div>

  <div class="amount-section">
    <div class="amount-label">Amount Paid / المبلغ المدفوع</div>
    <div class="amount-paid">${Number(receipt.amount || 0).toLocaleString()}</div>
  </div>

  ${receipt.notes ? `
  <div style="background:#f8fafc;border-radius:8px;padding:16px;margin-bottom:20px;">
    <div style="font-size:11px;color:#6b7280;text-transform:uppercase;margin-bottom:4px;">Notes</div>
    <div>${receipt.notes}</div>
  </div>` : ''}

  <div class="footer">
    <p>Generated by BizCTRL • ${new Date().toLocaleDateString()}</p>
    <p style="margin-top:4px;">Payment confirmed / تم تأكيد الدفع</p>
  </div>
</body>
</html>`;
  return html;
}

// ── Open PDF in new tab ───────────────────────────────────────────────────────
export function openPDFInNewTab(htmlContent) {
  const blob = new Blob([htmlContent], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return url;
}

// ── Create invoice record after debt save ─────────────────────────────────────
export async function createDebtInvoice({
  debtRecord,
  invoiceNumber,
  restaurantId,
  createdBy,
  brandName,
}) {
  try {
    const invoiceData = {
      debt_record_id: debtRecord.id,
      invoice_number: invoiceNumber,
      invoice_date: debtRecord.date || format(new Date(), 'yyyy-MM-dd'),
      party_name: debtRecord.party_name,
      party_phone: debtRecord.party_phone || '',
      party_type: debtRecord.party_type,
      branch: debtRecord.branch || '',
      total_amount: debtRecord.total_amount || 0,
      paid_amount: debtRecord.paid_amount || 0,
      remaining_amount: debtRecord.remaining_amount || debtRecord.total_amount || 0,
      description: debtRecord.description || '',
      notes: debtRecord.notes || '',
      due_date: debtRecord.due_date || null,
      status: debtRecord.status || 'open',
      whatsapp_status: 'pending',
      restaurant_id: restaurantId,
      created_by: createdBy,
      created_date: new Date().toISOString(),
      updated_date: new Date().toISOString(),
    };

    const { data: invoice, error } = await supabase
      .from('debt_invoices')
      .insert(invoiceData)
      .select()
      .single();

    if (error) throw error;

    // Update debt_record with invoice_auto_number
    await supabase
      .from('debt_records')
      .update({ invoice_auto_number: invoiceNumber, updated_date: new Date().toISOString() })
      .eq('id', debtRecord.id);

    return { success: true, invoice };
  } catch (err) {
    console.error('[debtInvoiceService] createDebtInvoice error:', err);
    return { success: false, error: err.message };
  }
}

// ── Create receipt record after payment ──────────────────────────────────────
export async function createDebtReceipt({
  payment,
  debtRecord,
  receiptNumber,
  invoiceNumber,
  restaurantId,
  createdBy,
}) {
  try {
    const receiptData = {
      debt_payment_id: payment.id,
      debt_record_id: debtRecord.id,
      receipt_number: receiptNumber,
      receipt_date: payment.date || format(new Date(), 'yyyy-MM-dd'),
      party_name: debtRecord.party_name,
      party_phone: debtRecord.party_phone || '',
      branch: debtRecord.branch || '',
      amount: payment.amount || 0,
      payment_method: payment.payment_method || 'cash',
      invoice_number: invoiceNumber || debtRecord.invoice_auto_number || debtRecord.invoice_number || '',
      notes: payment.notes || '',
      whatsapp_status: 'pending',
      restaurant_id: restaurantId,
      created_by: createdBy,
      created_date: new Date().toISOString(),
      updated_date: new Date().toISOString(),
    };

    const { data: receipt, error } = await supabase
      .from('debt_receipts')
      .insert(receiptData)
      .select()
      .single();

    if (error) throw error;

    // Update debt_payment with receipt_number
    await supabase
      .from('debt_payments')
      .update({
        receipt_number: receiptNumber,
        party_name: debtRecord.party_name,
        party_phone: debtRecord.party_phone || '',
        restaurant_id: restaurantId,
        branch: debtRecord.branch || '',
        updated_date: new Date().toISOString(),
      })
      .eq('id', payment.id);

    return { success: true, receipt };
  } catch (err) {
    console.error('[debtInvoiceService] createDebtReceipt error:', err);
    return { success: false, error: err.message };
  }
}

// ── Full flow: save debt → create invoice → send WhatsApp ─────────────────────
export async function processDebtSave({
  debtRecord,
  restaurantId,
  createdBy,
  brandName = 'BizCTRL',
}) {
  const results = { invoiceNumber: null, invoice: null, whatsapp: null };

  try {
    // 1. Generate invoice number
    const invoiceNumber = await generateInvoiceNumber(restaurantId);
    results.invoiceNumber = invoiceNumber;

    // 2. Create invoice record
    const invoiceResult = await createDebtInvoice({
      debtRecord,
      invoiceNumber,
      restaurantId,
      createdBy,
      brandName,
    });
    results.invoice = invoiceResult;

    // 3. Send WhatsApp if phone available
    if (debtRecord.party_phone && invoiceResult.invoice) {
      const htmlContent = generateInvoicePDF(
        { ...invoiceResult.invoice, invoice_number: invoiceNumber },
        brandName
      );
      const whatsappResult = await sendInvoiceWhatsApp({
        invoice: { ...invoiceResult.invoice, invoice_number: invoiceNumber },
        pdfUrl: null, // PDF URL would come from uploaded file
        restaurantId,
        createdBy,
      });
      results.whatsapp = whatsappResult;
    }

    return { success: true, ...results };
  } catch (err) {
    console.error('[debtInvoiceService] processDebtSave error:', err);
    return { success: false, error: err.message, ...results };
  }
}

// ── Full flow: save payment → create receipt → send WhatsApp ──────────────────
export async function processPaymentSave({
  payment,
  debtRecord,
  restaurantId,
  createdBy,
  brandName = 'BizCTRL',
}) {
  const results = { receiptNumber: null, receipt: null, whatsapp: null };

  try {
    // 1. Generate receipt number
    const invoiceNumber = debtRecord.invoice_auto_number || debtRecord.invoice_number;
    const receiptNumber = generateReceiptNumber(invoiceNumber);
    results.receiptNumber = receiptNumber;

    // 2. Create receipt record
    const receiptResult = await createDebtReceipt({
      payment,
      debtRecord,
      receiptNumber,
      invoiceNumber,
      restaurantId,
      createdBy,
    });
    results.receipt = receiptResult;

    // 3. Send WhatsApp if phone available
    if (debtRecord.party_phone && receiptResult.receipt) {
      const whatsappResult = await sendReceiptWhatsApp({
        receipt: { ...receiptResult.receipt, receipt_number: receiptNumber },
        pdfUrl: null,
        restaurantId,
        createdBy,
      });
      results.whatsapp = whatsappResult;
    }

    return { success: true, ...results };
  } catch (err) {
    console.error('[debtInvoiceService] processPaymentSave error:', err);
    return { success: false, error: err.message, ...results };
  }
}
