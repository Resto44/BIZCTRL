import { isReportFixedCategory } from './expenseConfiguration';

const POSTED_INVOICE_STATES=new Set(['approved','paid','partial']);
const NON_APPROVED_STATES=new Set(['pending','draft','rejected','declined','cancelled','canceled','void']);

/** Return the next Gregorian month boundary without relying on browser timezone. */
export function nextExpenseHistoryMonthStart(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month||''))) return null;
  const [year,part]=month.split('-').map(Number);
  return new Date(Date.UTC(year,part,1)).toISOString().slice(0,10);
}

/** Only finalized/approved purchase invoices become expense-reference history.
 * This is a projection of the supplier invoice record, not an additional
 * expense posting. The existing expense amount is never replaced or summed.
 */
export function isPostedExpenseInvoice(invoice) {
  const state=String(invoice?.status||'').trim().toLowerCase();
  const approval=String(invoice?.approval_status||'').trim().toLowerCase();
  return POSTED_INVOICE_STATES.has(state) && !NON_APPROVED_STATES.has(approval)
    && Boolean(invoice?.expense_id||invoice?.expense_category_id);
}
const safeAmount=value=>{
  if (value==null||value==='') return null;
  const n=Number(value);
  return Number.isFinite(n)&&n>=0 ? Math.round(n*100)/100 : null;
};
export function expenseInvoiceHistoryModel(invoices=[],expenses=[],categories=[],options={}) {
  const month=String(options.month||'');
  const type=options.type||'all';
  const selectedCategory=options.categoryId||'all';
  const byExpense=new Map((Array.isArray(expenses)?expenses:[]).map(e=>[String(e.id),e]));
  const byCategory=new Map((Array.isArray(categories)?categories:[]).map(c=>[String(c.id),c]));
  const encountered=new Set();
  return (Array.isArray(invoices)?invoices:[])
    .filter(i=>isPostedExpenseInvoice(i) && (!month||String(i.date||'').slice(0,7)===month))
    .filter(i=>{const key=String(i.id||'');if(!key||encountered.has(key))return false;encountered.add(key);return true;})
    .map(i=>{
      const existing=i.expense_id?byExpense.get(String(i.expense_id)):null;
      const resolvedCategoryId=i.expense_category_id||existing?.expense_category_id||existing?.category_id||null;
      const category=resolvedCategoryId?byCategory.get(String(resolvedCategoryId)):null;
      return {
        id:i.id,
        invoiceId:i.id,
        invoiceNumber:i.invoice_number||null,
        date:String(i.date||'').slice(0,10),
        branchId:i.branch_id||null,
        branchKey:i.branch||null,
        expenseId:i.expense_id||null,
        categoryId:resolvedCategoryId,
        category,
        type:isReportFixedCategory(category)?'fixed':'variable',
        invoiceAmount:safeAmount(i.total_amount),
        originalExpenseAmount:existing?safeAmount(existing.amount):null,
        originalExpenseDate:existing?.date||null,
        supplierName:i.supplier_name||null,
        status:String(i.status||'').toLowerCase(),
        approvalStatus:i.approval_status||null,
        source:'purchase_invoice_reference',
        createsExpense:false,
        includedInExpensesKpi:false,
      };
    })
    .filter(row=>(type==='all'||row.type===type)
      && (selectedCategory==='all'||row.categoryId===selectedCategory))
    .sort((a,b)=>b.date.localeCompare(a.date)||String(b.invoiceNumber||'').localeCompare(String(a.invoiceNumber||'')));
}
