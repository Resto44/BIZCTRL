import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
// Avoid loading SDK/window globals into this pure utility test.
vi.mock('@/lib/retailCashier',()=>({receiptHtml:()=>'<html>mock receipt</html>'}));
import {printerEscape,PRINTER_DOCUMENTS,PRINTER_PAPERS,kitchenTicketHtml} from '../src/lib/erpPrinting.js';

const sql=readFileSync('supabase/migrations/20261114211500_erp_printer_management_v1.sql','utf8');
const page=readFileSync('src/pages/PrinterManagementERP.jsx','utf8');
const app=readFileSync('src/App.jsx','utf8');
const nav=readFileSync('src/components/layout/ERPSidebar.jsx','utf8');
const kitchen=readFileSync('src/pages/restaurant/KitchenDisplayERP.jsx','utf8');
const pos=readFileSync('src/pages/restaurant/RestaurantPOS.jsx','utf8');

describe('ERP central printing management: tenant safety and business continuity',()=>{
 it('only owner can create/enable/disable branch-matched printers',()=>{
  expect(sql).toContain("m.role<>'owner' or p_branch_id is null");
  expect(sql).toContain("p_branch_id is distinct from m.branch_id");
  expect(sql).toContain("PRINT_BRANCH_NOT_ASSIGNED");
  expect(sql).toContain("b.id=p_branch_id and b.restaurant_id=p_restaurant_id");
  expect(sql).toContain("status='approved'");
  expect(sql).toContain("user_id=auth.uid()");
  expect(sql).toContain("PRINT_OWNER_ONLY");
  expect(sql).toContain("raise exception 'PRINT_DEVICE_FORBIDDEN'");
  expect(sql).toContain("mode text not null default 'browser' check(mode='browser')");
  expect(sql).toContain("active boolean not null default true");
 });
 it('stores print destinations and queued tickets outside existing POS/ledger data',()=>{
  expect(sql).toContain('create schema if not exists erp_print_private');
  expect(sql).toContain('create table if not exists erp_print_private.devices');
  expect(sql).toContain('create table if not exists erp_print_private.jobs');
  expect(sql).toContain('unique(device_id,source_id,document_type)');
  expect(sql).toContain('on conflict(device_id,source_id,document_type) do nothing');
  expect(sql).toContain('after insert or update of submitted_at,paid_at on restaurant_pos_private.orders');
  expect(sql).toContain("should_kitchen:=new.submitted_at is not null");
  expect(sql).toContain("should_receipt:=new.paid_at is not null and new.receipt is not null");
  expect(sql).toContain('if not (should_kitchen or should_receipt) then return new');
  expect(sql).toContain('raise warning \'PRINT_QUEUE_FAILURE %\'');
  expect(sql).not.toMatch(/delete\s+from\s+(restaurant_pos_private|public)\./i);
  expect(sql).not.toMatch(/update\s+(restaurant_pos_private\.orders|public\.daily_sales)/i);
 });
 it('never allows browsers to manipulate queues or forge a printed status directly',()=>{
  expect(sql).toContain('enable row level security');
  expect(sql).toContain('revoke all on all tables in schema erp_print_private from public,anon,authenticated');
  expect(sql).toContain('revoke all on schema erp_print_private from public,anon,authenticated');
  expect(sql).toContain('revoke all on function public.erp_print_manage');
  expect(sql).toContain('to authenticated');
  expect(sql).toContain("if p_action='confirm' and j.status<>'dialog_opened'");
  expect(sql).toContain('PRINT_CONFIRM_REQUIRES_OPEN');
  expect(sql).toContain("when 'open' then 'dialog_opened'");
  expect(sql).toContain("when 'confirm' then 'operator_confirmed'");
  expect(sql).not.toContain("'printed_automatically'");
 });
 it('restricts kitchen to preparation details and cashier receipts to sales roles',()=>{
  expect(sql).toContain("j.document_type='kitchen_ticket' and can_kitchen");
  expect(sql).toContain("j.document_type='cashier_receipt' and can_sales");
  expect(sql).toContain("public.erp_has_any_permission(array['viewOrders'])");
  expect(sql).toContain("public.erp_has_any_permission(array['viewSales'])");
  expect(sql).toContain("'name',coalesce(v->>'name_ar',v->>'name')");
  expect(sql).toContain("'quantity',coalesce(v->>'quantity','1')");
  expect(sql).toContain("d.station='' or coalesce(value->>'station','Kitchen')=d.station");
  const start=sql.indexOf("payload:=jsonb_build_object('number',new.number,'lines',lines");
  expect(start).toBeGreaterThan(0);
  const end=sql.indexOf('insert into erp_print_private.jobs',start);
  const kitchenPayload=sql.slice(start,end);
  expect(kitchenPayload).not.toContain('net_total');
  expect(kitchenPayload).not.toContain('receipt');
 });
 it('prints escaped bilingual 58/80mm/A4 tickets, never claims a cash transaction',()=>{
  const html=kitchenTicketHtml({number:177,lines:[{name:'<script>alert(1)</script>',quantity:2}],notes:'<img src=x onerror=alert(1)>'},'80mm','ar');
  expect(PRINTER_PAPERS).toEqual(['58mm','80mm','A4']);
  expect(PRINTER_DOCUMENTS).toContain('purchase_invoice');
  expect(PRINTER_DOCUMENTS).toContain('financial_report');
  expect(printerEscape('<b>&')).toBe('&lt;b&gt;&amp;');
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('<img src=');
  expect(html).toContain('size:80mm auto');
  expect(html).toContain('dir="rtl"');
  expect(html).toContain('Kitchen / مطبخ #177');
  expect(html).not.toContain('net_total');
 });
 it('integrates owner printer settings, kitchen and restaurant cashier entry points',()=>{
  expect(app).toContain("lazy(() => import('@/pages/PrinterManagementERP'))");
  expect(app).toContain('path="/printer-management"');
  expect(nav).toContain("path: '/printer-management'");
  expect(kitchen).toContain('data-testid="kds-print-queue-link"');
  expect(pos).toContain('data-testid="restaurant-printer-management"');
  expect(page).toContain("p_action:action");
  expect(page).toContain("p_job_id:job.id");
  expect(page).toContain("p_restaurant_id:restaurantId");
  expect(page).toContain("effectiveBranch");
  expect(page).toContain('data-testid="erp-print-job-queue"');
  expect(page).toContain('data-testid="printer-open-ticket"');
  expect(page).toContain("openERPPrintJob(job,lang)");
  expect(page).toContain("action(job,'open')");
  expect(page).toContain("action(job,'confirm')");
  expect(page).toContain('refetchIntervalInBackground:false');
 });
});
