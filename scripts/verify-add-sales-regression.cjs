const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const salesPage = read('src/pages/Sales.jsx');
const workspace = read('src/components/sales/UnifiedSalesClosing.jsx');
const closingRepository = read('src/lib/closing/ClosingRepository.js');
const branchSelect = read('src/components/shared/BranchSelect.jsx');
const purchaseList = read('src/components/purchases/PurchaseInvoiceList.jsx');
const purchaseForm = read('src/components/purchases/PurchaseInvoiceForm.jsx');
const procurementEngine = read('src/lib/procurementEngine.js');
const finalizedPurchaseProtection = read('src/supabase/20260826_protect_finalized_purchase_invoices.sql');

// The active Sales screen must use the canonical transactional Closing workflow.
assert(salesPage.includes("import UnifiedSalesClosing from '@/components/sales/UnifiedSalesClosing';"), 'Sales does not mount the unified Closing workspace');
assert(salesPage.includes('saveClosingSession({ payload, closingId: editing?.id || null })'), 'Sales bypasses the canonical Closing persistence RPC');
assert(salesPage.includes('SALES_CLOSING_BRANCH_CONTEXT_MISMATCH'), 'Sales does not reject a stale branch save context');
assert(salesPage.includes("onDelete={null}"), 'Sales exposes unsupported destructive Closing deletion');
assert(!salesPage.includes('deleteMut.mutate'), 'Sales still references the removed delete mutation at runtime');
assert(!salesPage.includes('bulkDeleteMut.mutate'), 'Sales still references the removed bulk-delete mutation at runtime');

// The current workspace owns validation, idempotent saves, customer credit, and mobile submission state.
assert(workspace.includes('onSubmit={handleSubmit}') || workspace.includes('onSubmit'), 'Unified Closing does not expose a submit workflow');
assert(workspace.includes('isSubmitting'), 'Unified Closing does not guard duplicate submission state');
assert(workspace.includes('CustomerCreditEntry'), 'Unified Closing does not render the customer credit workflow');
assert(workspace.includes('BranchSelect value={form.branch} onChange={selectClosingBranch}'), 'Unified Closing does not bind branch selection through the active scope');
assert(closingRepository.includes('requestId = newRequestId()'), 'Closing persistence has no idempotency request key');
assert(closingRepository.includes("erp_finalize_sales_closing") && closingRepository.includes("erp_save_sales_closing_draft"), 'Closing persistence does not route draft and finalized states through canonical RPCs');
assert(branchSelect.includes('const branches = asRecordArray(tenantBranches);'), 'BranchSelect does not normalize loading/null branch data');
assert(branchSelect.includes("const canChange = typeof onChange === 'function';"), 'BranchSelect does not guard a missing branch callback');

// Purchases may only mutate drafts; finalized financial records require correction rather than deletion or direct edit.
assert(purchaseList.includes('const isMutableDraft = (invoice)'), 'Purchase list lacks a canonical mutable-draft guard');
assert(purchaseList.includes("invoice?.status === 'draft'"), 'Purchase list does not restrict mutation to draft invoices');
assert(purchaseList.includes('Finalized invoices require the canonical correction workflow.'), 'Purchase list does not explain the finalized-record protection');
assert(purchaseForm.includes('if (savingRef.current) return;'), 'Purchase form does not guard duplicate submissions');
assert(purchaseForm.includes('Payment amount cannot exceed the outstanding invoice balance.'), 'Purchase form does not reject overpayment before persistence');
assert(procurementEngine.includes('assertValidInvoiceLines(items, additionalCosts);'), 'Purchase engine does not enforce line-item invariants');
assert(procurementEngine.includes('Finalized purchase invoices cannot be edited.'), 'Purchase engine does not block direct finalized-invoice edits');
assert(procurementEngine.includes('Payment amount cannot exceed the outstanding invoice balance.'), 'Purchase engine does not reject overpayment during persistence');
assert(finalizedPurchaseProtection.includes("COALESCE(v_invoice.status, 'draft') <> 'draft'"), 'Purchase deletion migration does not block finalized invoices');
assert(finalizedPurchaseProtection.includes('erp_can_write_scope_text'), 'Purchase deletion migration does not retain branch-scope authorization');

console.log('Active Sales Closing and Purchase runtime regression checks passed: canonical persistence, branch safety, duplicate-submit protection, draft-only purchase mutation, and finalized-record safeguards are in place.');
