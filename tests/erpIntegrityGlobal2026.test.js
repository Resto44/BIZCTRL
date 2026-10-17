import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  unpaidSupplierInvoiceAmount,totalOutstandingSupplierPayables,
  totalUnallocatedSupplierOverpayments,
} from '../src/lib/supplierPayablesIntegrity.js';

const read=p=>readFileSync(p,'utf8');
const sql=read('supabase/migrations/20261018001000_platform_owner_erp_integrity_snapshot.sql');
const portal=read('src/pages/PlatformOwnerPortal.jsx');
const ui=read('src/components/platform-owner/PlatformERPIntegrity.jsx');
const api=read('src/lib/platformOwnerApi.js');
const purchase=read('src/pages/Purchases.jsx');

describe('Platform Owner ERP integrity diagnostics',()=>{
  it('uses platform owner plus MFA and read-only, nonpublic RPC',()=>{
    expect(sql).toContain('PERFORM public.platform_owner_assert()');
    expect(sql).toContain('SET row_security = off');
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.platform_owner_erp_integrity_snapshot() FROM PUBLIC,anon');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.platform_owner_erp_integrity_snapshot() TO authenticated');
    expect(sql).not.toMatch(/\bUPDATE\s+public\./i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\s+public\./i);
    expect(sql).not.toMatch(/\bINSERT\s+INTO\s+public\./i);
    expect(sql).toContain("'read_only',true");
  });
  it('checks financial source reconciliation, credits, tenant and legacy branch references',()=>{
    expect(sql).toContain('coalesce(network_sales,0)');
    expect(sql).toContain('coalesce(credit_sales,0)');
    expect(sql).toContain('coalesce(other_sales,0)');
    expect(sql).toContain('paid_amount>total_amount+0.01');
    expect(sql).toContain('restaurant_id IS NULL');
    expect(sql).toContain('branch_id IS NULL');
    expect(sql).toContain("date>=current_date-30");
    expect(sql).toContain('pg_catalog.pg_tables');
    expect(sql).toContain('v_public_rls_off');
    expect(sql).toContain('v_branch_orphans');
    expect(sql).toContain("'financial_changes',0");
  });
  it('provides mobile EN/AR/FA read-only center and real refresh',()=>{
    expect(portal).toContain("['integrity', Database]");
    expect(portal).toContain('content = <PlatformERPIntegrity lang={lang} />');
    expect(portal).toContain("integrity:'سلامت ERP'");
    expect(portal).toContain("integrity:'سلامة ERP'");
    expect(api).toContain("rpc('platform_owner_erp_integrity_snapshot')");
    expect(ui).toContain("queryFn:platformOwnerApi.erpIntegritySnapshot");
    expect(ui).toContain("onClick={()=>query.refetch()}");
    expect(ui).toContain("dir={lang==='en'?'ltr':'rtl'}");
    expect(ui).toContain('min-w-0');
    expect(ui).not.toContain('.delete(');
    expect(ui).not.toContain('.update(');
  });
});

describe('ERP supplier payable and overpayment calculation',()=>{
  it('does not net an overpaid invoice against a different unpaid invoice',()=>{
    const list=[
      {id:'A',status:'partial',total_amount:100,paid_amount:140},
      {id:'B',status:'pending',total_amount:250,paid_amount:50},
      {id:'C',status:'paid',total_amount:60,paid_amount:60},
      {id:'D',status:'cancelled',total_amount:80,paid_amount:0},
    ];
    expect(unpaidSupplierInvoiceAmount(list[0])).toBe(0);
    expect(totalOutstandingSupplierPayables(list)).toBe(200);
    expect(totalUnallocatedSupplierOverpayments(list)).toBe(40);
  });
  it('uses cents and guards null/corrupt amounts, no negative payable',()=>{
    expect(unpaidSupplierInvoiceAmount({status:'partial',total_amount:0.30,paid_amount:0.1})).toBe(0.2);
    expect(unpaidSupplierInvoiceAmount({status:'partial',total_amount:15,paid_amount:20})).toBe(0);
    expect(unpaidSupplierInvoiceAmount({status:'partial',total_amount:'?',paid_amount:20})).toBe(0);
    expect(totalOutstandingSupplierPayables([])).toBe(0);
  });
  it('shows a separate flagged supplier credit instead of concealing unpaid bills',()=>{
    expect(purchase).toContain('totalOutstandingSupplierPayables(invoices)');
    expect(purchase).toContain('totalUnallocatedSupplierOverpayments(invoices)');
    expect(purchase).toContain('supplierOverpaymentToReview > 0');
    expect(purchase).toContain('reconciliation required');
  });
});
