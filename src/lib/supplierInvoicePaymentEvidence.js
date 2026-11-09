/**
 * Supplier self-service invoice evidence, read-only. The posted
 * supplier_invoices.paid_amount is canonical; payment rows explain its audit
 * trail but are NEVER added again as an invoice payment or financial posting.
 */
const excluded=new Set(['draft','cancelled','canceled','void','voided','deleted','rejected']);
const toCents=value=>{
  if(value==null||value==='')return null;
  const n=Number(value);
  return Number.isFinite(n)&&n>=0?Math.round(n*100):null;
};
const fromCents=value=>value==null?null:value/100;
export function supplierInvoicePaymentEvidence(invoice={},payments=[],historyLoaded=true){
  const totalCents=toCents(invoice.total_amount);
  const paidCents=toCents(invoice.paid_amount);
  const posted=!excluded.has(String(invoice.status||'').toLowerCase());
  const validRows=Array.isArray(payments)?payments.filter(p=>p&&String(p.invoice_id)===String(invoice.id)):[];
  const seen=new Set();
  const rows=validRows.filter(p=>{
    const id=String(p.id||'');
    if(!id||seen.has(id))return false;
    seen.add(id);return true;
  }).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||
    String(b.created_date||'').localeCompare(String(a.created_date||''))||
    String(b.id).localeCompare(String(a.id)));
  const amounts=rows.map(p=>toCents(p.amount));
  const rowsValid=amounts.every(n=>n!=null&&n>0);
  const historyCents=rowsValid?amounts.reduce((sum,n)=>sum+n,0):null;
  const remainingCents=totalCents!=null&&paidCents!=null?
    Math.max(0,totalCents-paidCents):null;
  const mismatch=historyLoaded&&rows.length>0&&(!rowsValid||paidCents==null||
    Math.abs(historyCents-paidCents)>1);
  const paidPercent=totalCents>0&&paidCents!=null?
    Math.max(0,Math.min(100,Math.round(paidCents*100/totalCents))):null;
  return {
    posted, invoiceId:invoice.id||null,
    total:fromCents(totalCents),paid:fromCents(paidCents),
    remaining:fromCents(remainingCents),paidPercent,
    paymentHistory:rows,paymentCount:rows.length,
    historyAmount:fromCents(historyCents),
    historyLoaded,historyNeedsReview:mismatch,
    legacyHistoryMissing:historyLoaded&&rows.length===0&&paidCents>0,
    paidFull:posted&&totalCents!=null&&totalCents>0&&paidCents!=null&&paidCents>=totalCents,
    paidPartial:posted&&totalCents!=null&&paidCents!=null&&paidCents>0&&paidCents<totalCents,
  };
}
export function supplierInvoiceProgress(invoices=[]){
  return invoices.reduce((a,invoice)=>{
    const info=supplierInvoicePaymentEvidence(invoice,[],false);
    if(!info.posted)return a;
    if(info.paidFull)a.fullyPaid++;
    else if(info.paidPartial)a.partiallyPaid++;
    return a;
  },{fullyPaid:0,partiallyPaid:0});
}
