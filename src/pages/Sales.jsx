import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useLanguage } from '@/lib/LanguageContext';
import PageHeader from '@/components/shared/PageHeader';
// SalesForm removed to enforce single ERP workspace entry point
import ERPSalesWorkspace from '@/components/sales/ERPSalesWorkspace';
import SalesListItem from '@/components/sales/SalesListItem';
import EmptyState from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Plus, Download, SlidersHorizontal, BarChart3, Trash2, CheckSquare, Square } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { downloadCSV, downloadPDF, buildSalesCSV, buildSalesPDF } from '@/lib/exportUtils';
import ExportDialog from '@/components/shared/ExportDialog';
import SalesFilterSidebar from '@/components/sales/SalesFilterSidebar';
import { useNotify } from '@/lib/useNotify';
import { useNetworkSettlement } from '@/hooks/useNetworkSettlement';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { useTenant } from '@/lib/TenantContext';
import { useRole, ROLES } from '@/lib/RoleContext';
import { format } from 'date-fns';
import CustomerCollections from '@/components/sales/CustomerCollections';
import DailySummary from '@/components/sales/DailySummary';
import CashRegister from '@/components/sales/CashRegister';
import POSReconciliation from '@/components/sales/POSReconciliation';
import {
  generateSalesInvoiceNumber,
  createSalesInvoice,
  generateAndUploadPDF,
} from '@/lib/salesInvoiceService';
import { filterDailySalesRecords, toDailySalesCardRecord } from '@/lib/dailySalesPresentation';

const asRecordArray = (value) => Array.isArray(value) ? value.filter(Boolean) : [];
const firstRecord = (value) => asRecordArray(value).at(0) || null;
const dailySalesTotal = (sale) =>
  Number(sale?.restaurant_cash ?? sale?.cash ?? 0) +
  Number(sale?.restaurant_network ?? sale?.network ?? 0) +
  Number(sale?.credit ?? 0) +
  Number(sale?.custom_sources_total ?? 0);

export default function Sales() {
  const { t, currency, lang, dir, translateLiteral } = useLanguage();
  const { branches: tenantBranches, orgId, ownerFilter, activeRestaurant } = useTenant();
  const branches = asRecordArray(tenantBranches);
  const qc = useQueryClient();
  const notif = useNotify();
  const { user } = useAuth();
  const { role } = useRole();
  const canDelete = role === ROLES.OWNER || role === ROLES.MANAGER || role === ROLES.GENERAL_MANAGER;
  const isBranchManager = role === ROLES.MANAGER;
  const canManageDriverSales = role === ROLES.OWNER || isBranchManager;
  const isDriverSale = (sale) => Boolean(sale?.driver_id || sale?.drivers_json);
  const { autoSettle } = useNetworkSettlement({ orgId, user, currency });
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showFinancialPanel, setShowFinancialPanel] = useState(false);
  const [filters, setFilters] = useState({ branch: 'all', from: '', to: '', minTotal: '', maxTotal: '' });
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  // Invoice state — shown after successful save
  const [savedInvoice, setSavedInvoice] = useState(null);
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);

  // BUG FIX: Owner history must query by restaurant_id so that records created
  // by Branch Managers (who write with their own email as created_by) are visible.
  // Manager history still queries by branch key (ownerFilter.branch).
  const salesQueryFilter = useMemo(() => {
    if (ownerFilter?.branch) return ownerFilter; // manager: branch-scoped
    if (activeRestaurant?.id) return { restaurant_id: activeRestaurant.id }; // owner: restaurant-scoped
    return ownerFilter || {};
  }, [ownerFilter, activeRestaurant?.id]);

  const { data: salesData, isLoading, isError } = useQuery({
    queryKey: ['sales', salesQueryFilter],
    queryFn: async () => asRecordArray(await base44.entities.DailySales.filter(salesQueryFilter, '-date', 2000)),
    staleTime: 120000,
    enabled: !!ownerFilter && (!!ownerFilter.created_by || !!ownerFilter.branch || !!activeRestaurant?.id),
  });
  const sales = asRecordArray(salesData);

  // Only create wallet transactions for COUNTER (restaurant) sales.
  const autoWalletTx = async (saleData, saleId, prevSale = null) => {
    try {
      const promises = [];
      const base = { 
        transaction_date: saleData.date, 
        branch: saleData.branch, 
        auto_generated: true, 
        reference_id: saleId,
        restaurant_id: saleData.restaurant_id || activeRestaurant?.id,
        // RLS required scope field
        branch_id: saleData.branch_id || null,
      };

      if (prevSale) {
        const existing = asRecordArray(await base44.entities.WalletTransaction.filter({ reference_id: prevSale.id, auto_generated: true }));
        await Promise.all(existing.map(tx => base44.entities.WalletTransaction.delete(tx.id)));
      }

      const rNet = Number(saleData.restaurant_network) || 0;
      const rCash = Number(saleData.restaurant_cash) || 0;

      if (rNet > 0) {
        promises.push(base44.entities.WalletTransaction.create({
          ...base,
          transaction_type: 'network_sales_auto', 
          flow_type: 'network_sales_auto',
          wallet: 'owner_network', 
          direction: 'in',
          amount: rNet, 
          payment_method: 'network',
          description: `Counter network — ${saleData.branch} — ${saleData.date}`,
        }));
      }

      if (rCash > 0) {
        promises.push(base44.entities.WalletTransaction.create({
          ...base,
          transaction_type: 'cash_sales_branch', 
          flow_type: 'cash_sales_branch',
          wallet: 'branch_cash', 
          direction: 'in',
          amount: rCash, 
          payment_method: 'cash',
          description: `Counter cash — ${saleData.branch} — ${saleData.date}`,
        }));
      }

      await Promise.all(promises);
      qc.invalidateQueries({ queryKey: ['wallet_transactions'] });
    } catch (e) {
      console.warn('[autoWalletTx] optional wallet update failed:', e.message);
    }
  };

  // Rule 6: Auto-create Owner Capital Contribution treasury entries.
  // Two separate cases:
  //   (a) Cash Reconciliation shortage — owner injects cash to balance register
  //   (b) Purchases > Sales — owner covers operating loss from personal funds
  // Neither case modifies Sales Total, Network, or Credit.
  const autoOwnerCapitalTx = async (saleData, saleId) => {
    // Case (a): owner cash injection to cover register shortage
    const cashContrib = Number(saleData.owner_cash_injection) || 0;
    // Case (b): owner capital to cover purchases > sales operating loss.
    // It is derived from persisted values because no separate database column exists.
    const purchasesContrib = Math.max(0, (Number(saleData.approved_purchases_total) || 0) - dailySalesTotal(saleData));

    if (cashContrib <= 0 && purchasesContrib <= 0) return;

    try {
      // Remove any existing owner-capital txs for this sale to avoid duplicates
      const existing = asRecordArray(await base44.entities.WalletTransaction.filter({
        reference_id: saleId,
        auto_generated: true,
      }));
      const prev = existing.filter(tx => tx.type === 'owner_capital_contribution');
      await Promise.all(prev.map(tx => base44.entities.WalletTransaction.delete(tx.id)));

      const creates = [];

      if (cashContrib > 0) {
        creates.push(base44.entities.WalletTransaction.create({
          transaction_date: saleData.date,
          transaction_type: 'owner_capital_contribution',
          flow_type: 'owner_capital_contribution',
          wallet: 'owner_cash',
          direction: 'in',
          amount: cashContrib,
          payment_method: 'cash',
          branch: saleData.branch,
          description: `Owner Capital Contribution — Cash Register Shortage — ${saleData.branch} — ${saleData.date}`,
          reference_id: saleId,
          auto_generated: true,
          recorded_by: user?.email || '',
          notes: 'Cash reconciliation: owner covered register shortage. Not classified as sales revenue.',
          restaurant_id: saleData.restaurant_id || activeRestaurant?.id,
          branch_id: saleData.branch_id || null,
        }));
      }

      if (purchasesContrib > 0) {
        creates.push(base44.entities.WalletTransaction.create({
          transaction_date: saleData.date,
          transaction_type: 'owner_capital_contribution',
          flow_type: 'owner_capital_contribution',
          wallet: 'owner_cash',
          direction: 'in',
          amount: purchasesContrib,
          payment_method: 'cash',
          branch: saleData.branch,
          description: `Owner Capital Contribution — Purchases Exceed Sales — ${saleData.branch} — ${saleData.date}`,
          reference_id: saleId,
          auto_generated: true,
          recorded_by: user?.email || '',
          notes: `Operating loss covered by owner. Sales=${dailySalesTotal(saleData)}, Purchases=${saleData.approved_purchases_total || 0}. Not classified as sales revenue.`,
          restaurant_id: saleData.restaurant_id || activeRestaurant?.id,
          branch_id: saleData.branch_id || null,
        }));
      }

      await Promise.all(creates);
      qc.invalidateQueries({ queryKey: ['wallet_transactions'] });
    } catch (e) {
      console.warn('[autoOwnerCapitalTx] failed:', e.message);
    }
  };

  // Cash Reconciliation treasury entries.
  // These are AUDIT records only — they do NOT modify Sales Total, Network, or Credit.
  const autoShortageOveageTx = async (saleData, saleId) => {
    const cashStatus = saleData.cash_status;
    // Shortage and overage are derived from the persisted reconciliation difference.
    const cashDifference = Number(saleData.cash_difference) || 0;
    const shortageAmt = Math.max(0, -cashDifference);
    const overageAmt  = Math.max(0, cashDifference);

    const isApprovedShortage = cashStatus === 'Shortage' && saleData.manager_approval && shortageAmt > 0;
    const isOverage           = cashStatus === 'Overage'  && overageAmt > 0;
    if (!isApprovedShortage && !isOverage) return;

    try {
      // Remove any existing shortage/overage tx for this sale
      const existing = asRecordArray(await base44.entities.WalletTransaction.filter({
        reference_id: saleId,
        auto_generated: true,
      }));
      const prev = existing.filter(tx =>
        tx.description && (tx.description.includes('Cash Shortage') || tx.description.includes('Cash Overage'))
      );
      await Promise.all(prev.map(tx => base44.entities.WalletTransaction.delete(tx.id)));

      if (isApprovedShortage) {
        // Shortage: audit record — does NOT reduce sales
        await base44.entities.WalletTransaction.create({
          transaction_date: saleData.date,
          transaction_type: 'cash_reconciliation_shortage',
          flow_type: 'cash_reconciliation_shortage',
          wallet: 'branch_cash',
          direction: 'out',
          amount: shortageAmt,
          payment_method: 'cash',
          branch: saleData.branch,
          description: `Cash Shortage (Reconciliation) — ${saleData.branch} — ${saleData.date} — Cashier: ${saleData.cashier_name || ''} — Approved by: ${saleData.manager_approved_by || ''}`,
          reference_id: saleId,
          auto_generated: true,
          recorded_by: saleData.manager_approved_by || '',
          notes: 'Reconciliation audit entry. Sales Total is unchanged.',
          restaurant_id: saleData.restaurant_id || activeRestaurant?.id,
          branch_id: saleData.branch_id || null,
        });
      }

      if (isOverage) {
        // Overage: audit record — does NOT increase sales
        await base44.entities.WalletTransaction.create({
          transaction_date: saleData.date,
          transaction_type: 'cash_reconciliation_overage',
          flow_type: 'cash_reconciliation_overage',
          wallet: 'branch_cash',
          direction: 'in',
          amount: overageAmt,
          payment_method: 'cash',
          branch: saleData.branch,
          description: `Cash Overage (Reconciliation) — ${saleData.branch} — ${saleData.date} — Cashier: ${saleData.cashier_name || ''}`,
          reference_id: saleId,
          auto_generated: true,
          recorded_by: saleData.manager_approved_by || '',
          notes: 'Reconciliation audit entry. Sales Total is unchanged.',
          restaurant_id: saleData.restaurant_id || activeRestaurant?.id,
          branch_id: saleData.branch_id || null,
        });
      }

      qc.invalidateQueries({ queryKey: ['wallet_transactions'] });
    } catch (e) {
      console.warn('[autoShortageOveageTx] failed:', e.message);
    }
  };

  // Auto-save customer credit entries to DebtRecord + DebtPayment
  // Debt Management is the single source of truth for customer credit
  const autoSaveCreditDebts = async (saleData, saleId) => {
    if (!saleData.credit_entries_json) return;
    let entries = [];
    try { entries = asRecordArray(JSON.parse(saleData.credit_entries_json)); } catch { return; }
    if (!entries.length) return;

    for (const entry of entries) {
      const amt = Number(entry.amount) || 0;
      if (amt <= 0) continue;

      const customerName = entry.customer || 'Unknown Customer';
      const customerId = entry.customer_id;

      try {
        // Fetch or create DebtRecord for this customer
        let debtRecord = null;
        if (customerId) {
          const existing = asRecordArray(await base44.entities.DebtRecord.filter({ id: customerId }));
          debtRecord = firstRecord(existing);
        } else {
          // Look up by name + branch + type=receivable to avoid duplicates
          const existing = asRecordArray(await base44.entities.DebtRecord.filter({
            party_name: customerName,
            branch: saleData.branch,
            type: 'receivable'
          }));
          debtRecord = firstRecord(existing);
        }

        if (debtRecord) {
          // Update existing DebtRecord
          const newTotal = (debtRecord.total_amount || 0) + amt;
          const newRemaining = (debtRecord.remaining_amount || 0) + amt;
          const newStatus = newRemaining > 0 ? (debtRecord.paid_amount > 0 ? 'partial' : 'open') : 'paid';
          await base44.entities.DebtRecord.update(debtRecord.id, {
            total_amount: newTotal,
            remaining_amount: newRemaining,
            status: newStatus,
          });
          
          // Record the transaction in DebtPayment
          await base44.entities.DebtPayment.create({
            debt_id: debtRecord.id,
            party_name: debtRecord.party_name,
            date: saleData.date,
            amount: -amt, // negative = new debt added
            payment_method: 'credit',
            notes: `Credit sale — ${saleData.date} — Branch: ${saleData.branch}`,
            recorded_by: user?.email || '',
            recorded_by_name: user?.full_name || user?.email || '',
            restaurant_id: saleData.restaurant_id || activeRestaurant?.id,
            branch_id: saleData.branch_id || null,
            branch: saleData.branch || '',
          });
        } else {
          // Create new DebtRecord
          const newDebt = await base44.entities.DebtRecord.create({
            type: 'receivable',
            party_type: 'customer',
            party_name: customerName,
            party_phone: entry.customer_phone || '',
            branch: saleData.branch,
            date: saleData.date,
            total_amount: amt,
            paid_amount: 0,
            remaining_amount: amt,
            status: 'open',
            description: `Credit sale — ${saleData.date}`,
            notes: entry.notes || '',
            restaurant_id: saleData.restaurant_id || activeRestaurant?.id,
            branch_id: saleData.branch_id || null,
          });
          
          await base44.entities.DebtPayment.create({
            debt_id: newDebt.id,
            party_name: customerName,
            date: saleData.date,
            amount: -amt,
            payment_method: 'credit',
            notes: `Credit sale — ${saleData.date}`,
            recorded_by: user?.email || '',
            restaurant_id: saleData.restaurant_id || activeRestaurant?.id,
            branch_id: saleData.branch_id || null,
            branch: saleData.branch || '',
          });
        }

        // UPDATE CUSTOMER OUTSTANDING BALANCE (BUG 2)
        // We look up the customer by name or ID and increment their balance
        try {
          const customers = asRecordArray(await base44.entities.Customer.filter(
            customerId ? { id: customerId } : { customer_name: customerName }
          ));
          const c = firstRecord(customers);
          if (c) {
            await base44.entities.Customer.update(c.id, {
              outstanding_balance: (Number(c.outstanding_balance) || 0) + amt
            });
          }
        } catch (custErr) {
          console.warn('[autoSaveCreditDebts] customer balance update failed:', custErr.message);
        }

      } catch (e) { 
        console.warn('[autoSaveCreditDebts] failed:', e.message); 
      }
    }

    // Invalidate ALL relevant queries for Debts & Receivables and Customer Credit KPI
    qc.invalidateQueries({ queryKey: ['debts_customer'] });
    qc.invalidateQueries({ queryKey: ['debts_customer_dash'] });
    qc.invalidateQueries({ queryKey: ['debt_customers_form'] });
    qc.invalidateQueries({ queryKey: ['debt_records'] });
    qc.invalidateQueries({ queryKey: ['debt_payments'] });
    qc.invalidateQueries({ queryKey: ['customers'] });
    qc.invalidateQueries({ queryKey: ['v_customer_summary'] });
    qc.invalidateQueries({ queryKey: ['debt_records_customers'] });
  };

  // Auto-generate invoice after sale save — SILENT BACKGROUND PDF GENERATION
  const autoGenerateInvoice = async (saleData, saleId) => {
    // Fired in background — do NOT await this in handleSave to keep UI fast.
    try {
      // Give the DB a moment to process the trigger
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Fetch the generated invoice from the DB
      const invoices = asRecordArray(await base44.entities.SalesInvoice.filter({ sale_id: saleId }));
      const invoice = firstRecord(invoices);

      if (!invoice) return;

      // Generate and store permanent PDF in background
      try {
        await generateAndUploadPDF(invoice, 'BizCTRL', currency, { lang, dir, translateLiteral });
        qc.invalidateQueries({ queryKey: ['sales_invoices'] });
      } catch (pdfErr) {
        console.warn('[Sales] Silent PDF generation failed:', pdfErr);
      }
    } catch (err) {
      console.warn('[Sales] Background invoice task failed:', err.message);
    }
  };

  const createMut = useMutation({
    mutationFn: async ({ data, proofUrl, ocr }) => {
      console.log('[Sales:createMut] mutationFn started');
      if (isDriverSale(data) && !canManageDriverSales) {
        throw new Error('Only the restaurant Owner or assigned Branch Manager can create a Driver Sale.');
      }
      // ── TRANSACTION-LIKE WORKFLOW (Requirement 5) ──
      // 1. Insert parent Sale record first (Requirement 2)
      console.log('[Sales:createMut] 1. Inserting daily_sales...');
      const sale = await base44.entities.DailySales.create(data);
      if (!sale?.id) {
        console.error('[Sales:createMut] FAILED: No sale ID returned');
        throw new Error('Failed to create sale record');
      }
      console.log('[Sales:createMut] SUCCESS: daily_sales created, ID:', sale.id);

      // 2. Wait for the returned Sale ID (Requirement 3)
      const saleId = sale.id;

      // 3. Create sales_invoices using exactly that Sale ID (Requirement 4)
      console.log('[Sales:createMut] 3. Creating sales_invoice...');
      try {
        const invoiceNum = data.invoice_number || await generateSalesInvoiceNumber(data.restaurant_id, data.date);
        await createSalesInvoice({
          invoiceNumber: invoiceNum,
          saleId: saleId,
          saleData: data,
          restaurantId: data.restaurant_id,
          createdBy: data.created_by || user?.email
        });
        console.log('[Sales:createMut] SUCCESS: sales_invoice created');
      } catch (invErr) {
        console.warn('[Sales:createMut] SKIPPED: Manual invoice creation failed:', invErr.message);
      }

      // 4. Run secondary side-effects
      console.log('[Sales:createMut] 4. Running side-effects...');
      
      console.log('[Sales:createMut] -> autoWalletTx...');
      try { await autoWalletTx(data, saleId); console.log('[Sales:createMut] SUCCESS: autoWalletTx'); } catch (e) { console.error('[Sales:createMut] FAILED: autoWalletTx:', e.message); }
      
      console.log('[Sales:createMut] -> autoShortageOveageTx...');
      try { await autoShortageOveageTx(data, saleId); console.log('[Sales:createMut] SUCCESS: autoShortageOveageTx'); } catch (e) { console.error('[Sales:createMut] FAILED: autoShortageOveageTx:', e.message); }
      
      console.log('[Sales:createMut] -> autoOwnerCapitalTx...');
      try { await autoOwnerCapitalTx(data, saleId); console.log('[Sales:createMut] SUCCESS: autoOwnerCapitalTx'); } catch (e) { console.error('[Sales:createMut] FAILED: autoOwnerCapitalTx:', e.message); }
      
      console.log('[Sales:createMut] -> autoSettle...');
      try { await autoSettle(data, saleId, proofUrl || null, ocr || null, null); console.log('[Sales:createMut] SUCCESS: autoSettle'); } catch (e) { console.warn('[Sales:createMut] SKIPPED: autoSettle:', e.message); }
      
      console.log('[Sales:createMut] -> autoSaveCreditDebts...');
      try { await autoSaveCreditDebts(data, saleId); console.log('[Sales:createMut] SUCCESS: autoSaveCreditDebts'); } catch (e) { console.error('[Sales:createMut] FAILED: autoSaveCreditDebts:', e.message); }
      
      // 5. Finalize invoice (PDF generation etc) — SILENT BACKGROUND TASK
      console.log('[Sales:createMut] 5. Finalizing invoice...');
      autoGenerateInvoice(data, saleId);
      
      const total = dailySalesTotal(data);
      try {
        await notif.sale({ branch: data.branch, amount: total, action: 'create' });
        console.log('[Sales:createMut] SUCCESS: notification sent');
      } catch (e) {
        console.warn('[Sales:createMut] SKIPPED: notification failed:', e.message);
      }
      
      console.log('[Sales:createMut] mutationFn COMPLETED');
      return sale;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['sales_cash'] });
      qc.invalidateQueries({ queryKey: ['sales_daily'] });
      qc.invalidateQueries({ queryKey: ['sales_today'] });
      qc.invalidateQueries({ queryKey: ['sales_month'] });
      qc.invalidateQueries({ queryKey: ['sales_yesterday'] });
      qc.invalidateQueries({ queryKey: ['sales_week'] });
      qc.invalidateQueries({ queryKey: ['sales_prev_week'] });
      qc.invalidateQueries({ queryKey: ['sales_prev_month'] });
      // Live Sales Summary keys
      qc.invalidateQueries({ queryKey: ['sales_today_live'] });
      qc.invalidateQueries({ queryKey: ['sales_yesterday_live'] });
      qc.invalidateQueries({ queryKey: ['sales_month_live'] });
      // Dashboard keys
      qc.invalidateQueries({ queryKey: ['supplier_invoices_dash'] });
      qc.invalidateQueries({ queryKey: ['debts_customer_dash'] });
      qc.invalidateQueries({ queryKey: ['settlements_all'] });
      qc.invalidateQueries({ queryKey: ['settlements_mgr'] });
      qc.invalidateQueries({ queryKey: ['wallet_transactions'] });
      qc.invalidateQueries({ queryKey: ['wallet_transactions_dash'] });
      qc.invalidateQueries({ queryKey: ['sales_sources'] });
      qc.invalidateQueries({ queryKey: ['dashboard_metrics'] });
      qc.invalidateQueries({ queryKey: ['reports'] });
      qc.invalidateQueries({ queryKey: ['driver-sales'] });
      qc.invalidateQueries({ queryKey: ['driver-performance'] });
      setShowForm(false);
      setEditing(null); // Clear editing state just in case
    },
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, data, prev, proofUrl, ocr }) => {
      if ((isDriverSale(prev) || isDriverSale(data)) && !canManageDriverSales) {
        throw new Error('Only the restaurant Owner or assigned Branch Manager can edit a Driver Sale.');
      }
      const sale = await base44.entities.DailySales.update(id, data);
      await autoWalletTx(data, id, prev);
      // FIX 5: Update treasury transaction for approved shortage/overage
      await autoShortageOveageTx(data, id);
      // Rule 6: Update Owner Capital Contribution treasury entry if purchases > sales
      await autoOwnerCapitalTx(data, id);
      try { await autoSettle(data, id, proofUrl || null, ocr || null, prev); } catch (e) { console.warn('autoSettle skipped:', e.message); }
      // Save customer credit entries to Debt Management (single source of truth)
      await autoSaveCreditDebts(data, id);
      // Re-generate invoice on update (upsert by invoice_number) — SILENT BACKGROUND TASK
      autoGenerateInvoice({ ...data, invoice_number: prev?.invoice_number }, id);
      const total = (data.restaurant_cash || 0) + (data.restaurant_network || 0) + (data.credit || 0);
      await notif.sale({ branch: data.branch, amount: total, action: 'update' });
      return sale;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['sales_cash'] });
      qc.invalidateQueries({ queryKey: ['sales_daily'] });
      qc.invalidateQueries({ queryKey: ['sales_today'] });
      qc.invalidateQueries({ queryKey: ['sales_month'] });
      qc.invalidateQueries({ queryKey: ['sales_yesterday'] });
      qc.invalidateQueries({ queryKey: ['sales_week'] });
      // Live Sales Summary keys
      qc.invalidateQueries({ queryKey: ['sales_today_live'] });
      qc.invalidateQueries({ queryKey: ['sales_yesterday_live'] });
      qc.invalidateQueries({ queryKey: ['sales_month_live'] });
      // Dashboard keys
      qc.invalidateQueries({ queryKey: ['supplier_invoices_dash'] });
      qc.invalidateQueries({ queryKey: ['debts_customer_dash'] });
      qc.invalidateQueries({ queryKey: ['settlements_all'] });
      qc.invalidateQueries({ queryKey: ['settlements_mgr'] });
      qc.invalidateQueries({ queryKey: ['wallet_transactions_dash'] });
      qc.invalidateQueries({ queryKey: ['sales_sources'] });
      qc.invalidateQueries({ queryKey: ['dashboard_metrics'] });
      qc.invalidateQueries({ queryKey: ['reports'] });
      qc.invalidateQueries({ queryKey: ['driver-sales'] });
      qc.invalidateQueries({ queryKey: ['driver-performance'] });
      setEditing(null);
      setShowForm(false); // Ensure form closes on update too
    },
  });

  const invalidateSalesQueries = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['sales'] });
    qc.invalidateQueries({ queryKey: ['sales_today'] });
    qc.invalidateQueries({ queryKey: ['sales_month'] });
    qc.invalidateQueries({ queryKey: ['sales_yesterday'] });
    qc.invalidateQueries({ queryKey: ['sales_week'] });
    qc.invalidateQueries({ queryKey: ['sales_today_live'] });
    qc.invalidateQueries({ queryKey: ['sales_yesterday_live'] });
    qc.invalidateQueries({ queryKey: ['sales_month_live'] });
    qc.invalidateQueries({ queryKey: ['sales_sources'] });
    qc.invalidateQueries({ queryKey: ['dashboard_metrics'] });
    qc.invalidateQueries({ queryKey: ['reports'] });
    qc.invalidateQueries({ queryKey: ['wallet_transactions'] });
    qc.invalidateQueries({ queryKey: ['supplier_invoices_dash'] });
    qc.invalidateQueries({ queryKey: ['driver-sales'] });
    qc.invalidateQueries({ queryKey: ['driver-performance'] });
  }, [qc]);

  const deleteMut = useMutation({
    mutationFn: async (sale) => {
      if (isDriverSale(sale) && !canManageDriverSales) {
        throw new Error('Only the restaurant Owner or assigned Branch Manager can delete a Driver Sale.');
      }
      await base44.entities.DailySales.delete(sale.id);
      await notif.sale({ branch: sale.branch, action: 'delete' });
    },
    onSuccess: () => {
      invalidateSalesQueries();
      setDeleting(null);
    },
  });

  const bulkDeleteMut = useMutation({
    mutationFn: async (ids) => {
      const selectedSales = sales.filter((sale) => ids.includes(sale.id));
      if (selectedSales.some(isDriverSale) && !canManageDriverSales) {
        throw new Error('Only the restaurant Owner or assigned Branch Manager can delete Driver Sales.');
      }
      await Promise.all(ids.map(id => base44.entities.DailySales.delete(id)));
    },
    onSuccess: () => {
      invalidateSalesQueries();
      setSelectedIds(new Set());
      setBulkDeleting(false);
    },
  });

  const filtered = useMemo(() => filterDailySalesRecords(sales, filters), [sales, filters]);

  const toggleSelect = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(s => s.id)));
    }
  }, [selectedIds.size, filtered]);

  const handleSave = async (data, proofUrl, ocr) => {
    // Ensure restaurant_id is included for correct scoping in Cash Register Center
    if (activeRestaurant?.id) {
      data.restaurant_id = activeRestaurant.id;
    }
    // Bug fix: always create a NEW record unless explicitly editing an existing one.
    // Previous behaviour found any record for the same date+branch and overwrote it,
    // which destroyed history.  Now every submission creates its own record.
    if (editing) {
      await updateMut.mutateAsync({ id: editing.id, data, prev: editing, proofUrl, ocr });
    } else {
      await createMut.mutateAsync({ data, proofUrl, ocr });
    }
  };

  const handleExport = ({ format: fmt, from, to, branch }) => {
    const data = sales.filter(s => {
      if (!s.date) return false;
      const inRange = (!from || s.date >= from) && (!to || s.date <= to);
      const inBranch = branch === 'all' || s.branch === branch;
      return inRange && inBranch;
    }).sort((a, b) => a.date.localeCompare(b.date));

    const branchLabel = branch === 'all' ? 'All Branches' : (branches.find(b => b.key === branch)?.label || branch);
    const subtitle = `${branchLabel} | ${from} → ${to}`;
    const filename = `sales_${from}_${to}_${branch}`;

    if (fmt === 'csv') {
      const { headers, rows } = buildSalesCSV(data, t, currency, branches);
      downloadCSV(`${filename}.csv`, headers, rows);
    } else {
      const { headers, rows, totalsRow } = buildSalesPDF(data, t, currency, branches, subtitle);
      downloadPDF({ filename: `${filename}.pdf`, title: t('daily_sales'), subtitle, headers, rows, totalsRow, lang, dir });
    }
    setShowExport(false);
  };

  const activeFilterCount = [
    filters.branch !== 'all', filters.from, filters.to, filters.minTotal, filters.maxTotal,
  ].filter(Boolean).length;

  return (
    <div className="max-w-full overflow-x-hidden">
      <PageHeader
        title={t('daily_sales')}
        action={
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <Button size="sm" variant="outline" onClick={() => setShowExport(true)} className="flex-1 sm:flex-none">
              <Download className="w-4 h-4 mr-1" /> Export
            </Button>
            <Button
              size="sm"
              variant={showFinancialPanel ? 'default' : 'outline'}
              onClick={() => setShowFinancialPanel(v => !v)}
              className="flex-1 sm:flex-none"
            >
              <BarChart3 className="w-4 h-4 mr-1" /> Summary
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowFilters(v => !v)} className="relative flex-none">
              <SlidersHorizontal className="w-4 h-4" />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-primary text-primary-foreground text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                  {activeFilterCount}
                </span>
              )}
            </Button>
            <Button size="sm" onClick={() => { setShowForm(true); setEditing(null); }} className="w-full sm:w-auto">
              <Plus className="w-4 h-4 mr-1" />{t('add_sales')}
            </Button>
          </div>
        }
      />

      {/* Financial Panel — toggled by Summary button */}
      {showFinancialPanel && (
        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <CustomerCollections date={todayStr} branch={filters.branch} />
          <DailySummary date={todayStr} branch={filters.branch} />
          <CashRegister date={todayStr} branch={filters.branch} />
          <POSReconciliation date={todayStr} branch={filters.branch} />
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-4">
        {showFilters && (
          <div className="w-full md:w-56 flex-shrink-0">
            <SalesFilterSidebar filters={filters} onChange={setFilters} onClose={() => setShowFilters(false)} />
          </div>
        )}

        <div className="flex-1 min-w-0 w-full">
          {/* Bulk action toolbar */}
          {canDelete && filtered.length > 0 && (
            <div className="flex items-center gap-2 mb-2">
              <button
                type="button"
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={toggleSelectAll}
              >
                {selectedIds.size === filtered.length && filtered.length > 0
                  ? <CheckSquare className="w-4 h-4 text-primary" />
                  : <Square className="w-4 h-4" />}
                {selectedIds.size === filtered.length && filtered.length > 0 ? 'Deselect All' : 'Select All'}
              </button>
              {selectedIds.size > 0 && (
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-xs text-destructive hover:text-destructive/80 ml-auto"
                  onClick={() => setBulkDeleting(true)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Selected ({selectedIds.size})
                </button>
              )}
              {selectedIds.size === 0 && (
                <span className="text-xs text-muted-foreground ml-auto">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
              )}
            </div>
          )}
          {!canDelete && filtered.length > 0 && (
            <p className="text-xs text-muted-foreground mb-2">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</p>
          )}
          {isLoading ? (
            <p className="text-center text-muted-foreground text-sm py-8">{t('loading')}</p>
          ) : filtered.length === 0 ? (
            <div>
              {isError && (
                <p role="status" className="mb-3 text-center text-sm text-muted-foreground">
                  Saved sales could not be refreshed. You can still add a sales record.
                </p>
              )}
              <EmptyState />
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(s => (
                <SalesListItem
                  key={s.id}
                  sale={toDailySalesCardRecord(s)}
                  record={s}
                  onEdit={(sale) => {
                    if (isDriverSale(sale) && !canManageDriverSales) {
                      toast.error('Driver Sales can only be edited by the restaurant Owner or assigned Branch Manager.');
                      return;
                    }
                    setEditing(sale);
                    setShowForm(false);
                  }}
                  onDelete={canDelete && (!isDriverSale(s) || canManageDriverSales) ? (sale) => setDeleting(sale) : null}
                  selected={selectedIds.has(s.id)}
                  onToggleSelect={canDelete ? toggleSelect : null}
                />
              ))}
            </div>
          )}
        </div>
      </div>

            {/* Add Sale Dialog — Enterprise ERP Sales Closing Workspace */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-xl w-full max-h-[92vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-4 pt-4 pb-2 border-b border-border flex-shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Enterprise Sales Closing Workspace
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            <ERPSalesWorkspace onSubmit={handleSave} onCancel={() => setShowForm(false)} />
          </div>
        </DialogContent>
      </Dialog>
      {/* Edit Sale Dialog — Enterprise ERP Sales Closing Workspace */}
      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="max-w-xl w-full max-h-[92vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-4 pt-4 pb-2 border-b border-border flex-shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              Edit Sales Closing Workspace
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {editing && <ERPSalesWorkspace initial={editing} onSubmit={handleSave} onCancel={() => setEditing(null)} />}
          </div>
        </DialogContent>
      </Dialog>

      {/* Single Delete Confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={(open) => { if (!open) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirm_delete')}</AlertDialogTitle>
            <AlertDialogDescription>Delete sales record for {deleting?.branch} on {deleting?.date}? This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => deleteMut.mutate(deleting)}>{t('delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={bulkDeleting} onOpenChange={(open) => { if (!open) setBulkDeleting(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} Sales Record{selectedIds.size !== 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete {selectedIds.size} selected sales record{selectedIds.size !== 1 ? 's' : ''}. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => bulkDeleteMut.mutate(Array.from(selectedIds))}
            >
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Invoice Share/Download Dialog removed to prevent blocking UI */}

      <ExportDialog open={showExport} onClose={() => setShowExport(false)} onExport={handleExport} title={t('daily_sales')} />
    </div>
  );
}
