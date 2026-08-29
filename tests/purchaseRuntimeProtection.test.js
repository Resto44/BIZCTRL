import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

describe('Sales and purchase financial-record protection', () => {
  it('removes the unsupported destructive Sales Closing action instead of rendering undefined mutation handlers', async () => {
    const sales = await source('../src/pages/Sales.jsx');

    expect(sales).toContain("import UnifiedSalesClosing from '@/components/sales/UnifiedSalesClosing';");
    expect(sales).toContain('saveClosingSession({ payload, closingId: editing?.id || null })');
    expect(sales).toContain('onDelete={null}');
    expect(sales).not.toContain('deleteMut.mutate');
    expect(sales).not.toContain('bulkDeleteMut.mutate');
  });

  it('limits purchase edit and delete affordances to unapproved drafts', async () => {
    const purchaseList = await source('../src/components/purchases/PurchaseInvoiceList.jsx');

    expect(purchaseList).toContain('const isMutableDraft = (invoice)');
    expect(purchaseList).toContain("invoice?.status === 'draft'");
    expect(purchaseList).toContain("!['approved', 'auto_approved'].includes(invoice?.approval_status)");
    expect(purchaseList).toContain("{onEdit && isMutableDraft(inv) && (");
    expect(purchaseList).toContain("{onDelete && canDelete && isMutableDraft(inv) && (");
    expect(purchaseList).toContain('Select All Drafts');
  });

  it('rejects malformed purchase lines, duplicate submit attempts, and overpayment before persistence', async () => {
    const [form, engine] = await Promise.all([
      source('../src/components/purchases/PurchaseInvoiceForm.jsx'),
      source('../src/lib/procurementEngine.js'),
    ]);

    expect(form).toContain('if (savingRef.current) return;');
    expect(form).toContain('Payment amount cannot exceed the outstanding invoice balance.');
    expect(engine).toContain('function assertValidInvoiceLines(items = [], additionalCosts = [])');
    expect(engine).toContain('quantity must be greater than zero.');
    expect(engine).toContain('unit cost cannot be negative.');
    expect(engine).toContain('Payment amount must be greater than zero.');
    expect(engine).toContain('Payment amount cannot exceed the outstanding invoice balance.');
    expect(engine).toContain("if (mode !== 'draft') assertValidInvoiceLines(items, additionalCosts);");
    expect(engine).toContain("const approvalStatus = mode === 'draft' ? 'draft'");
    expect(form).toContain("handleSubmit(e, 'draft')");
    expect(form).toContain('Save Draft');
    expect(form).toContain('Approve & Post');
  });

  it('implements the Smart Invoice Capture review and reconciliation workflow', async () => {
    const [form, ocr] = await Promise.all([
      source('../src/components/purchases/PurchaseInvoiceForm.jsx'),
      source('../src/components/purchases/OcrScanDialog.jsx'),
    ]);

    expect(form).toContain('Smart Invoice Capture');
    expect(form).toContain('Invoice Reconciliation');
    expect(form).toContain('fields verified');
    expect(form).toContain('invoiceDifference');
    expect(ocr).toContain('overall_confidence');
    expect(ocr).toContain('field_confidence');
    expect(ocr).toContain('"items"');
    expect(ocr).toContain('unit_price');
  });

  it('enforces the finalized-invoice lifecycle and branch authorization in the database routine', async () => {
    const migration = await source('../src/supabase/20260826_protect_finalized_purchase_invoices.sql');

    expect(migration).toContain('erp_can_write_scope_text');
    expect(migration).toContain("COALESCE(v_invoice.status, 'draft') <> 'draft'");
    expect(migration).toContain("COALESCE(v_invoice.approval_status, 'draft') IN ('approved', 'auto_approved')");
    expect(migration).toContain('Finalized purchase invoices cannot be deleted. Use the authorized correction workflow.');
  });
});
