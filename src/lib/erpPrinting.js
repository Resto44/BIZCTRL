import {receiptHtml} from '@/lib/retailCashier';

export const PRINTER_DOCUMENTS = [
 'kitchen_ticket','cashier_receipt','sales_invoice','purchase_invoice',
 'supplier_document','customer_statement','financial_report',
];
export const PRINTER_PAPERS = ['58mm','80mm','A4'];
export const printerEscape = value => String(value ?? '').replace(/[&<>"']/g,
 ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

export function kitchenTicketHtml(payload = {}, paper = '80mm', lang = 'ar') {
 const width = PRINTER_PAPERS.includes(paper) ? paper : '80mm';
 const lines = Array.isArray(payload.lines) ? payload.lines : [];
 const rtl = lang !== 'en';
 const id = printerEscape(payload.number || '—');
 return '<!doctype html><html lang="'+(rtl?'ar':'en')+'" dir="'+(rtl?'rtl':'ltr')+'"><head><meta charset="utf-8"><title>Kitchen #'+id+'</title>'
  +'<style>@page{size:'+ (width==='A4'?'A4':width+' auto')+';margin:4mm}body{font-family:system-ui,Arial,sans-serif;color:#111;font-size:14px;max-width:'+(width==='A4'?'190mm':width)+';margin:0 auto}h1{text-align:center;font-size:24px;border-bottom:2px dashed #222;padding-bottom:8px}li{padding:8px 0;border-bottom:1px dashed #aaa;font-size:19px;list-style:none}strong{font-weight:900}.detail{font-size:12px;margin:5px 0}.note{border:2px solid #111;padding:8px;white-space:pre-wrap}button{margin:12px 0;padding:10px;background:#fff;border:1px solid #333}@media print{button{display:none}}</style></head><body>'
  +'<h1>Kitchen / مطبخ #'+id+'</h1>'
  +'<p class="detail">'+printerEscape(payload.order_type)+' · '+printerEscape(payload.table_label)+'</p>'
  +'<ul style="padding:0">'+lines.map(line=>'<li><strong>'+printerEscape(line.quantity)+' × </strong>'+printerEscape(line['name_'+lang]||line.name_ar||line.name||'—')+'</li>').join('')+'</ul>'
  +(payload.notes?'<p class="note">'+printerEscape(payload.notes)+'</p>':'')
  +'<p class="detail">'+printerEscape(payload.submitted_at||'')+'</p>'
  +'<button onclick="window.print()">Print / طباعة</button></body></html>';
}

// Browser printing always needs explicit operator action. A popup or afterprint
// event is NOT physical proof of paper, nor a financial ledger entry.
export function openERPPrintJob(job, lang = 'ar') {
 if (!job || !['kitchen_ticket','cashier_receipt'].includes(job.document_type)) throw new Error('PRINT_UNSUPPORTED_JOB');
 const popup = window.open('', '_blank', 'width=650,height=860');
 if (!popup) throw new Error('PRINT_POPUP_BLOCKED');
 popup.opener = null;
 const html = job.document_type === 'kitchen_ticket'
  ? kitchenTicketHtml(job.payload, job.paper, lang)
  : receiptHtml(job.payload?.receipt || {},lang,PRINTER_PAPERS.includes(job.paper)?job.paper:'80mm');
 popup.document.open();
 popup.document.write(html);
 popup.document.close();
 popup.focus();
 // Keep manual print button visible for mobile Safari / a deferred print dialog.
 popup.setTimeout(()=>popup.print(),350);
 return true;
}

export function printerPaperLabel(paper) {
 return PRINTER_PAPERS.includes(paper)?paper:'80mm';
}
