import { supabase } from '@/api/supabaseClient';

export const cashierRpc = async (name, args, client = supabase) => {
  const { data, error } = await client.rpc(`erp_retail_${name}`, args);
  if (error) throw error;
  return data;
};
export const money = (value, currency = 'SAR') => `${currency} ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const productName = (product, lang) => (lang === 'ar' || lang === 'fa' ? product.name_ar : product.name_en) || product.name || '';
export const isDefiniteRejection = error => /^[0-9A-Z]{5}$/.test(error?.code || '') || ['PGRST301', 'PGRST302', 'PGRST202'].includes(error?.code);
export function paymentBreakdown(total, mode, cash, card) {
  const cents = n => Math.round(Number(n) * 100);
  const due = cents(total);
  const paidCard = mode === 'cash' ? 0 : mode === 'mixed' ? cents(card) : due;
  const paidCash = mode === 'cash' || mode === 'mixed' ? cents(cash) : 0;
  const valid = [due, paidCard, paidCash].every(Number.isSafeInteger) && due >= 0 && paidCash >= 0 && paidCard >= 0 && paidCard <= due && paidCash + paidCard >= due;
  return { valid, change: valid ? (paidCash + paidCard - due) / 100 : 0, payments: [
    ...(mode === 'cash' || mode === 'mixed' ? [{ payment_method: 'cash', amount: paidCash / 100 }] : []),
    ...(mode !== 'cash' ? [{ payment_method: mode === 'mixed' ? 'mada' : mode, amount: paidCard / 100 }] : []),
  ] };
}

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
export function receiptHtml(receipt, lang = 'en', paper = '80mm') {
  const b = receipt.business || {};
  const currency = b.currency || 'SAR';
  const e = escapeHtml;
  const bilingual = lang === 'ar' || lang === 'fa';
  const title = receipt.transaction_type === 'refund' ? 'Refund receipt / إيصال استرداد' : 'Sales receipt / إيصال بيع';
  return `<!doctype html><html lang="${bilingual ? 'ar' : 'en'}" dir="${bilingual ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${e(receipt.receipt_number)}</title><style>
  @page{size:${paper === 'A4' ? 'A4' : '80mm auto'};margin:5mm}*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#111;max-width:${paper === 'A4' ? '190mm' : '70mm'};margin:12px auto}h1{font-size:19px}header,footer{text-align:center}p{margin:6px 0;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;margin:14px 0}td,th{padding:7px 2px;border-bottom:1px dashed #bbb;text-align:start;vertical-align:top}td:last-child,th:last-child{text-align:end;white-space:nowrap}.row{display:flex;justify-content:space-between;gap:8px;margin:8px 0}.total{font-size:19px;font-weight:bold;border-top:2px solid;padding-top:10px}small{color:#555}.no-print{padding:12px;display:block;margin:16px auto}@media print{.no-print{display:none}body{margin:0 auto}}tr{break-inside:avoid}</style></head><body>
  <header><h1>${e(b.name)}</h1><p>${e(b.branch_name)}</p><p>${e(b.address)}</p>${b.branch_phone ? `<p>${e(b.branch_phone)}</p>` : ''}<h2>${title}</h2></header>
  <p>${e(receipt.receipt_number)}</p><p>${e(new Date(receipt.occurred_at).toLocaleString())}</p><p>${e(receipt.device_code)} · ${e(receipt.cashier_name)}</p>
  ${receipt.original_receipt ? `<p>Original / الأصل: ${e(receipt.original_receipt)}</p>` : ''}
  <table><thead><tr><th>Item / الصنف</th><th>Qty / كمية</th><th>Total / إجمالي</th></tr></thead><tbody>${(receipt.lines || []).map(line => `<tr><td>${e(productName(line, lang))}<br><small>${e(line.sku)}<br>${e(money(line.unit_price, currency))} / ${e(line.unit || 'pc')}</small></td><td>${e(line.quantity)}</td><td>${e(Number(line.line_total).toFixed(2))}</td></tr>`).join('')}</tbody></table>
  <div class="row"><span>Subtotal / قبل الضريبة</span><span>${e(money(receipt.subtotal, currency))}</span></div>
  <div class="row"><span>Discount / الخصم</span><span>${e(money(receipt.discount_total, currency))}</span></div>
  <div class="row"><span>Tax / الضريبة</span><span>${e(money(receipt.tax_total, currency))}</span></div>
  <div class="row total"><span>Total / الإجمالي</span><span>${e(money(receipt.net_total, currency))}</span></div>
  ${(receipt.payments || []).map(p => `<div class="row"><span>${e(p.payment_method)}</span><span>${e(money(p.amount, currency))}</span></div>`).join('')}
  <div class="row"><span>Change / الباقي</span><span>${e(money(receipt.change, currency))}</span></div>
  <footer><p>Thank you · شكراً لزيارتكم</p><small>BizCTRL · ${e(receipt.id)}</small></footer>
  <button class="no-print" onclick="window.print()">Print / Save PDF · طباعة</button></body></html>`;
}
export function printCashierReceipt(receipt, lang, paper) {
  const popup = window.open('', '_blank', 'width=700,height=850');
  if (!popup) throw new Error('Allow pop-ups to print the receipt.');
  popup.opener = null;
  popup.document.open(); popup.document.write(receiptHtml(receipt, lang, paper)); popup.document.close();
  popup.focus();
  // Keep the receipt open if mobile browsers defer printing until a user tap.
  popup.setTimeout(() => popup.print(), 300);
}
