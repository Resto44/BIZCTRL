import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {expenseInvoiceHistoryModel,isPostedExpenseInvoice,nextExpenseHistoryMonthStart} from '../src/lib/expensePurchaseHistory.js';
import {expenseMonthModel} from '../src/lib/expenseInvoiceMonthly.js';

const source=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const cats=[
 {id:'variable',name:'مصارف متغير روزانه',is_fixed:false,expense_type:'variable'},
 {id:'fixed',name:'كهرباء',is_fixed:true,expense_type:'fixed',monthly_amount:2000},
];
const expenses=[
 {id:'exp-35',date:'2026-10-24',amount:35,category_id:'variable'},
 {id:'exp-650',date:'2026-10-01',amount:650,expense_category_id:'fixed'},
];
const invoices=[
 {id:'invoice-0011',invoice_number:'PUR-20261107-0011',date:'2026-11-07',status:'approved',
  approval_status:'auto_approved',total_amount:867,expense_id:'exp-35',expense_category_id:'variable',currency:'SAR'},
 {id:'invoice-0005',invoice_number:'PUR-20261107-0005',date:'2026-11-07',status:'paid',
  approval_status:'auto_approved',total_amount:290,expense_id:'exp-650',expense_category_id:'fixed',currency:'SAR'},
 {id:'invoice-new-type',invoice_number:'PUR-20261107-0015',date:'2026-11-07',status:'partial',
  approval_status:'approved',total_amount:175,expense_id:null,expense_category_id:'variable'},
 {id:'draft',date:'2026-11-07',status:'draft',total_amount:900,expense_category_id:'variable'},
 {id:'pending',date:'2026-11-07',status:'pending',approval_status:'pending',total_amount:900,expense_category_id:'fixed'},
 {id:'not-approved',date:'2026-11-07',status:'partial',approval_status:'pending',total_amount:900,expense_category_id:'fixed'},
 {id:'no-reference',date:'2026-11-07',status:'paid',approval_status:'auto_approved',total_amount:900},
 {id:'old-date',date:'2026-10-23',status:'paid',approval_status:'approved',expense_category_id:'fixed',total_amount:50},
];
describe('Expense history derived from finalized Purchase Invoice references (ERP)',()=>{
 it('scopes monthly posting to the invoice month, including year-end rollover',()=>{
  expect(nextExpenseHistoryMonthStart('2026-11')).toBe('2026-12-01');
  expect(nextExpenseHistoryMonthStart('2026-12')).toBe('2027-01-01');
  expect(nextExpenseHistoryMonthStart('2026-13')).toBeNull();
  expect(nextExpenseHistoryMonthStart('blah')).toBeNull();
  const rows=expenseInvoiceHistoryModel(invoices,expenses,cats,{month:'2026-11'});
  expect(rows.map(row=>row.invoiceNumber)).toEqual([
    'PUR-20261107-0015','PUR-20261107-0011','PUR-20261107-0005',
  ]);
  expect(rows.every(row=>row.date==='2026-11-07')).toBe(true);
 });
 it('shows live known fixed and variable examples without inventing new Expenses',()=>{
  const rows=expenseInvoiceHistoryModel(invoices,expenses,cats,{month:'2026-11'});
  const variable=rows.find(x=>x.invoiceNumber==='PUR-20261107-0011');
  const fixed=rows.find(x=>x.invoiceNumber==='PUR-20261107-0005');
  expect(variable).toMatchObject({type:'variable',invoiceAmount:867,originalExpenseAmount:35,
    originalExpenseDate:'2026-10-24',includedInExpensesKpi:false,createsExpense:false,invoiceCurrency:'SAR'});
  expect(fixed).toMatchObject({type:'fixed',invoiceAmount:290,originalExpenseAmount:650,
    originalExpenseDate:'2026-10-01',includedInExpensesKpi:false,createsExpense:false});
  expect(expenseMonthModel(expenses,cats,{month:'2026-11'}).recordedTotal).toBe(0);
  expect(expenseMonthModel(expenses,cats,{month:'2026-10'}).recordedTotal).toBe(685);
 });
 it('includes new category-only invoices with no fabricated Expense amount',()=>{
  const newOnly=expenseInvoiceHistoryModel(invoices,expenses,cats,{
    month:'2026-11',categoryId:'variable',
  }).find(row=>row.id==='invoice-new-type');
  expect(newOnly).toMatchObject({type:'variable',invoiceAmount:175,expenseId:null,
    categoryId:'variable',originalExpenseAmount:null,createsExpense:false});
 });
 it('filters fixed/variable and category reliably',()=>{
  expect(expenseInvoiceHistoryModel(invoices,expenses,cats,{month:'2026-11',type:'fixed'})
    .map(row=>row.invoiceNumber)).toEqual(['PUR-20261107-0005']);
  expect(expenseInvoiceHistoryModel(invoices,expenses,cats,{month:'2026-11',categoryId:'fixed'})
    .map(row=>row.invoiceNumber)).toEqual(['PUR-20261107-0005']);
  expect(expenseInvoiceHistoryModel(invoices,expenses,cats,{month:'2026-10'})
    .map(row=>row.id)).toEqual(['old-date']);
 });
 it('excludes drafts, unapproved, missing references and canceled records',()=>{
  expect(isPostedExpenseInvoice({status:'draft',expense_id:'x'})).toBe(false);
  expect(isPostedExpenseInvoice({status:'approved',approval_status:'pending',expense_id:'x'})).toBe(false);
  expect(isPostedExpenseInvoice({status:'paid',expense_category_id:'x'})).toBe(true);
  expect(isPostedExpenseInvoice({status:'void',expense_category_id:'x'})).toBe(false);
  expect(isPostedExpenseInvoice({status:'paid'})).toBe(false);
  const rows=expenseInvoiceHistoryModel([...invoices,invoices[0]],expenses,cats,{month:'2026-11'});
  expect(rows).toHaveLength(3);
  expect(new Set(rows.map(row=>row.id)).size).toBe(3);
 });
 it('uses tenant and branch scoped invoice query, with no new Expense write or money added',()=>{
  const component=source('../src/components/expenses/ExpensePurchaseHistory.jsx');
  const page=source('../src/pages/Expenses.jsx');
  const purchaseForm=source('../src/components/purchases/PurchaseInvoiceForm.jsx');
  expect(component).toContain(".eq('restaurant_id',restaurantId)");
  expect(component).toContain(".eq('branch_id',branchId)");
  expect(component).toContain(".is('branch_id',null).eq('branch',branchKey)");
  expect(component).toContain(".in('status',['approved','paid','partial'])");
  expect(component).toContain("expense_purchase_invoice_history");
  expect(component).not.toContain("supabase.from('expenses').insert");
  expect(page).toContain('<ExpensePurchaseHistory');
  expect(purchaseForm).toContain("qc.invalidateQueries({ queryKey: ['expense_purchase_invoice_history'] });");
  expect(page).toContain('model.recordedTotal');
  expect(page).not.toContain('model.recordedTotal+');
 });
});
