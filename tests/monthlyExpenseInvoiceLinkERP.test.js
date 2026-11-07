import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { expenseMonthModel, invoiceExpenseLinkInput, riyadhCurrentMonth } from '../src/lib/expenseInvoiceMonthly.js';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

describe('ERP monthly expenses and purchase invoice expense references',()=>{
 const categories=[
   {id:'rent',is_fixed:true,monthly_amount:1500,branch_id:'branch-a',is_active:true},
   {id:'electricity',expense_type:'variable',monthly_amount:0,is_active:true},
   {id:'fuel',is_fixed:false,monthly_amount:0,is_active:true},
 ];
 const expenses=[
   {id:'a',date:'2026-11-03',amount:'500',category_id:'rent',branch_id:'branch-a'},
   {id:'b',date:'2026-11-07',amount:35.5,category_id:'electricity',branch_id:'branch-a'},
   {id:'c',date:'2026-10-15',amount:800,category_id:'fuel',branch_id:'branch-a'},
   {id:'d',date:'2026-11-09',amount:40,expense_category_id:'fuel',branch_id:'branch-a'},
 ];
 it('uses Saudi business month and does not carry expenses into the next month',()=>{
   expect(riyadhCurrentMonth(new Date('2026-10-31T22:10:00Z'))).toBe('2026-11');
   const result=expenseMonthModel(expenses,categories,{month:'2026-11',branchId:'branch-a'});
   expect(result.recordedTotal).toBe(575.5);
   expect(result.recordedFixed).toBe(500);
   expect(result.recordedVariable).toBe(75.5);
   expect(result.recordCount).toBe(3);
   expect(result.configuredFixed).toBe(1500);
   expect(result.recordedTotal).not.toBe(2075.5);
   expect(expenseMonthModel(expenses,categories,{month:'2026-10'}).recordedTotal).toBe(800);
 });
 it('filters records by accounting type and expense category without changing the financial KPI totals',()=>{
   const r=expenseMonthModel(expenses,categories,{month:'2026-11',type:'variable',categoryId:'electricity'});
   expect(r.visible.map(x=>x.id)).toEqual(['b']);
   expect(r.recordedTotal).toBe(575.5);
 });
 it('treats a linked expense as reference-only metadata, not another amount',()=>{
   expect(invoiceExpenseLinkInput({id:'a',category_id:'rent'})).toEqual({expense_id:'a',expense_category_id:'rent'});
   expect(invoiceExpenseLinkInput(null,'electricity')).toEqual({expense_id:null,expense_category_id:'electricity'});
   expect(invoiceExpenseLinkInput(null,null)).toEqual({expense_id:null,expense_category_id:null});
 });
 it('saves two optional association fields without inserting an Expense transaction from Purchase Invoice',()=>{
   const form=read('../src/components/purchases/PurchaseInvoiceForm.jsx');
   const selector=read('../src/components/purchases/PurchaseExpenseOptions.jsx');
   const engine=read('../src/lib/procurementEngine.js');
   expect(form).toContain('expense_id:expenseLink.expense_id||null');
   expect(form).toContain('expense_category_id:expenseLink.expense_category_id||null');
   expect(form).toContain('Options · Expense reference');
   expect(form).toContain('setExpenseLink({expense_id:null,expense_category_id:null})');
   expect(selector).toContain("supabase.from('expenses')");
   expect(selector).toContain("supabase.from('expense_categories')");
   expect(selector).not.toContain("supabase.from('expenses')\n        .insert(");
   expect(engine).toContain('...invoiceData');
   expect(engine).toContain('calcInvoiceTotals(items, additionalCosts)');
 });
 it('db trigger forbids cross-tenant and cross-branch links, and does not change invoice totals',()=>{
   const sql=read('../supabase/migrations/20261107221500_purchase_invoice_optional_expense_link.sql');
   expect(sql).toContain('INVOICE_EXPENSE_SCOPE_MISMATCH');
   expect(sql).toContain('INVOICE_EXPENSE_CATEGORY_SCOPE_MISMATCH');
   expect(sql).toContain('INVOICE_EXPENSE_CATEGORY_CONFLICT');
   expect(sql).toContain('linked_exp.restaurant_id IS DISTINCT FROM NEW.restaurant_id');
   expect(sql).toContain('linked_exp.branch_id=NEW.branch_id');
   expect(sql).toContain('linked_category.branch_id<>NEW.branch_id');
   expect(sql).not.toMatch(/INSERT INTO public.expenses/i);
   expect(sql).not.toMatch(/UPDATE public.expenses/i);
 });
 it('renders compact month filter and fixed/variable budget totals; analytics use current schema columns',()=>{
   const page=read('../src/pages/Expenses.jsx');
   const analytics=read('../src/components/expenses/ExpenseAnalytics.jsx');
   expect(page).toContain('type="month"');
   expect(page).toContain('model.recordedFixed');
   expect(page).toContain('model.recordedVariable');
   expect(page).toContain('model.configuredFixed');
   expect(analytics).toContain('e.expense_category_id || e.category_id');
   expect(analytics).toContain('e.branch_key || e.branch');
 });
});
