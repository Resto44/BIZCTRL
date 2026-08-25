import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import PageHeader from '@/components/shared/PageHeader';
// SalesForm removed to enforce single ERP workspace entry point
import UnifiedSalesClosing from '@/components/sales/UnifiedSalesClosing';
import SalesListItem from '@/components/sales/SalesListItem';
import EmptyState from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Plus, Download, SlidersHorizontal, BarChart3, Trash2, CheckSquare, Square, Loader2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { downloadCSV, downloadPDF, buildSalesCSV, buildSalesPDF } from '@/lib/exportUtils';
import ExportDialog from '@/components/shared/ExportDialog';
import SalesFilterSidebar from '@/components/sales/SalesFilterSidebar';
import { useNotify } from '@/lib/useNotify';
import { useNetworkSettlement } from '@/hooks/useNetworkSettlement';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { useTenant } from '@/lib/TenantContext';
import { useBranchScope } from '@/lib/BranchScopeContext';
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

const sameScopeValue = (left, right) => String(left || '').trim() === String(right || '').trim();
const salesClosingCashierId = (record) => record?.cashier_id || record?.cashier_employee_id || record?.manager_user_id || null;
const matchesSalesClosingSession = (record, session) => {
  if (!record || !session) return false;
  const branchMatches = session.branch_id
    ? sameScopeValue(record.branch_id, session.branch_id)
    : sameScopeValue(record.branch, session.branch);
  const recordCashierId = salesClosingCashierId(record);
  const cashierMatches = session.cashier_id
    ? (recordCashierId ? sameScopeValue(recordCashierId, session.cashier_id) : sameScopeValue(record.cashier_name, session.cashier_name))
    : sameScopeValue(record.cashier_name, session.cashier_name);
  return branchMatches
    && sameScopeValue(record.date, session.date)
    && sameScopeValue(record.shift, session.shift)
    && cashierMatches;
};

// Drafts are work-in-progress records. Financial integrations are deliberately
// deferred until the closing enters its explicit finalized lifecycle state.
const shouldRunFinalizationSideEffects = (saleData) => saleData?.closing_state === 'finalized';

export default function Sales() {
  const { t, currency, lang, dir, translateLiteral } = useLanguage();
  const { branches: tenantBranches, orgId, ownerFilter, activeRestaurant } = useTenant();
  const {
    selectedBranchId,
    selectedBranchKey,
    isAllBranches,
  } = useBranchScope();
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
  const [showForm, setShowForm] = useState(true);
  const [editing, setEditing] = useState(null);
  const [newClosingDefaults, setNewClosingDefaults] = useState(null);
  const [newClosingInstance, setNewClosingInstance] = useState(0);
  const [sessionContext, setSessionContext] = useState(null);
  const [isOpeningNewClosing, setIsOpeningNewClosing] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showFinancialPanel, setShowFinancialPanel] = useState(false);
  const [filters, setFilters] = useState({ branch: 'all', from: '', to: '', minTotal: '', maxTotal: '' });
  useEffect(() => {
    setFilters((current) => ({ ...current, branch: isAllBranches ? 'all' : (selectedBranchKey || 'all') }));
  }, [isAllBranches, selectedBranchKey]);
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  // Invoice state — shown after successful save
  const [savedInvoice, setSavedInvoice] = useState(null);
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);

  // Canonical UUID branch rows and legacy key rows are both filtered by the
  // authenticated restaurant on the server. No broad tenant dataset is filtered
  // in the browser when a particular branch is selected.
  const fetchScopedSales = useCallback(async () => {
    if (!activeRestaurant?.id) return [];
    const baseQuery = () => supabase.from('daily_sales').select('*')
      .eq('restaurant_id', activeRestaurant.id)
      .order('date', { ascending: false })
      .limit(2000);
    if (isAllBranches) {
      const { data, error } = await baseQuery();
      if (error) throw error;
      return asRecordArray(data);
    }
    if (!selectedBranchId || !selectedBranchKey) return [];
    const [canonical, legacy] = await Promise.all([
      baseQuery().eq('branch_id', selectedBranchId),
      baseQuery().is('branch_id', null).eq('branch', selectedBranchKey),
    ]);
    if (canonical.error || legacy.error) throw canonical.error || legacy.error;
    return asRecordArray(Array.from(new Map([...(canonical.data || []), ...(legacy.data || [])]
      .map((record) => [record.id, record])).values()));
  }, [activeRestaurant?.id, isAllBranches, selectedBranchId, selectedBranchKey]);

  const { data: salesData, isLoading, isError } = useQuery({
    queryKey: ['sales', activeRestaurant?.id, selectedBranchId],
    queryFn: fetchScopedSales,
    staleTime: 120000,
    enabled: Boolean(activeRestaurant?.id),
  });
  const sales = asRecordArray(salesData);

  const updateClosingSessionContext = useCallback((nextContext) => {
    setSessionContext((current) => {
      const next = nextContext || null;
      if (current && next && ['date', 'branch', 'branch_id', 'shift', 'cashier_id', 'cashier_name'].every((key) => sameScopeValue(current[key], next[key]))) return current;
      return next;
    });
  }, []);

  const findExistingClosingSession = useCallback(async (session) => {
    if (!activeRestaurant?.id || !session?.date || !session?.branch || !session?.shift) return null;
    const baseQuery = () => supabase.from('daily_sales')
      .select('*')
      .eq('restaurant_id', activeRestaurant.id)
      .eq('date', session.date)
      .eq('shift', session.shift)
      .limit(50);
    const [canonical, legacy] = await Promise.all([
      session.branch_id ? baseQuery().eq('branch_id', session.branch_id) : Promise.resolve({ data: [], error: null }),
      baseQuery().is('branch_id', null).eq('branch', session.branch),
    ]);
    if (canonical.error || legacy.error) throw canonical.error || legacy.error;
    const candidates = Array.from(new Map([...(canonical.data || []), ...(legacy.data || [])]
      .map((record) => [record.id, record])).values());
    return candidates.find((record) => matchesSalesClosingSession(record, session)) || null;
  }, [activeRestaurant?.id]);

  const openNewClosing = useCallback(async () => {
    if (isOpeningNewClosing) return;
    const session = sessionContext;
    if (!session?.date || !session?.branch || !session?.shift || (!session?.cashier_id && !session?.cashier_name)) {
      toast.error('Select a branch, shift, and cashier before opening a closing session.');
      return;
    }
    setIsOpeningNewClosing(true);
    try {
      const existing = await findExistingClosingSession(session);
      if (existing?.closing_state === 'draft') {
        setNewClosingDefaults(null);
        setEditing(existing);
        setShowForm(true);
        toast.info('Resumed the existing draft closing for this branch, date, shift, and cashier.');
        return;
      }
      if (existing) {
        setNewClosingDefaults(null);
        setEditing(null);
        setShowForm(false);
        toast.info(existing.closing_state === 'locked'
          ? 'A locked closing already exists for this branch, date, shift, and cashier. Open it from history to request an authorized correction.'
          : 'A finalized closing already exists for this branch, date, shift, and cashier. Open it from history to request an authorized correction.');
        return;
      }
      // Opening is deliberately in-memory until Save Draft or Finalize. This
      // prevents accidental blank database records while the database uniqueness
      // constraint and save path protect the same key against concurrent creates.
      setEditing(null);
      setNewClosingDefaults({
        date: session.date,
        branch: session.branch,
        branch_id: session.branch_id || null,
        shift: session.shift,
        cashier_id: session.cashier_id || null,
        cashier_employee_id: session.cashier_id || null,
        cashier_name: session.cashier_name || '',
      });
      setNewClosingInstance((value) => value + 1);
      setShowForm(true);
      toast.success('New closing session opened. No record is created until you save it.');
    } catch (error) {
      toast.error(`Unable to open a closing session: ${error?.message || 'Unknown error'}`);
    } finally {
      setIsOpeningNewClosing(false);
    }
  }, [findExistingClosingSession, isOpeningNewClosing, sessionContext]);

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
            // Keep the existing debt record authoritative while retaining an
            // optional immutable Sales Source relationship for analysis.
            source_id: debtRecord.source_id || entry.source_id || null,
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
            source_id: entry.source_id || debtRecord.source_id || null,
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
            source_id: entry.source_id || null,
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
            source_id: entry.source_id || null,
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

      if (shouldRunFinalizationSideEffects(data)) {
        // Finalization is the only lifecycle transition that creates financial
        // integrations from this closing.
        console.log('[Sales:createMut] 3. Creating sales_invoice...');
        try {
          const invoiceNum = data.invoice_number || await generateSalesInvoiceNumber(data.restaurant_id, data.date);
          await createSalesInvoice({
            invoiceNumber: invoiceNum,
            saleId,
            saleData: data,
            restaurantId: data.restaurant_id,
            createdBy: data.created_by || user?.email,
          });
          console.log('[Sales:createMut] SUCCESS: sales_invoice created');
        } catch (invErr) {
          console.warn('[Sales:createMut] SKIPPED: Manual invoice creation failed:', invErr.message);
        }

        console.log('[Sales:createMut] 4. Running finalized side-effects...');
        try { await autoWalletTx(data, saleId); } catch (e) { console.error('[Sales:createMut] FAILED: autoWalletTx:', e.message); }
        try { await autoShortageOveageTx(data, saleId); } catch (e) { console.error('[Sales:createMut] FAILED: autoShortageOveageTx:', e.message); }
        try { await autoOwnerCapitalTx(data, saleId); } catch (e) { console.error('[Sales:createMut] FAILED: autoOwnerCapitalTx:', e.message); }
        try { await autoSettle(data, saleId, proofUrl || null, ocr || null, null); } catch (e) { console.warn('[Sales:createMut] SKIPPED: autoSettle:', e.message); }
        try { await autoSaveCreditDebts(data, saleId); } catch (e) { console.error('[Sales:createMut] FAILED: autoSaveCreditDebts:', e.message); }

        // Finalize invoice (PDF generation etc) — silent background task.
        autoGenerateInvoice(data, saleId);
        const total = dailySalesTotal(data);
        try {
          await notif.sale({ branch: data.branch, amount: total, action: 'create' });
        } catch (e) {
          console.warn('[Sales:createMut] SKIPPED: notification failed:', e.message);
        }
      } else {
        console.log('[Sales:createMut] Draft saved without finalized financial side-effects.');
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
    },
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, data, prev, proofUrl, ocr }) => {
      if ((isDriverSale(prev) || isDriverSale(data)) && !canManageDriverSales) {
        throw new Error('Only the restaurant Owner or assigned Branch Manager can edit a Driver Sale.');
      }
      const sale = await base44.entities.DailySales.update(id, data);
      if (shouldRunFinalizationSideEffects(data)) {
        await autoWalletTx(data, id, prev);
        // Update treasury transaction for approved shortage/overage.
        await autoShortageOveageTx(data, id);
        // Update Owner Capital Contribution treasury entry if purchases exceed sales.
        await autoOwnerCapitalTx(data, id);
        try { await autoSettle(data, id, proofUrl || null, ocr || null, prev); } catch (e) { console.warn('autoSettle skipped:', e.message); }
        // Debt Management remains the single source of truth for finalized credit sales.
        await autoSaveCreditDebts(data, id);
        // Re-generate invoice on finalization/update — silent background task.
        autoGenerateInvoice({ ...data, invoice_number: prev?.invoice_number }, id);
        const total = (data.restaurant_cash || 0) + (data.restaurant_network || 0) + (data.credit || 0);
        await notif.sale({ branch: data.branch, amount: total, action: 'update' });
      } else {
        console.log('[Sales:updateMut] Draft saved without finalized financial side-effects.');
      }
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
    // Ensure restaurant_id is included for correct scoping in Cash Register Center.
    if (activeRestaurant?.id) data.restaurant_id = activeRestaurant.id;

    if (editing) {
      if (editing.closing_state === 'locked' || editing.closing_state === 'finalized') {
        throw new Error(editing.closing_state === 'locked'
          ? 'This closing is locked. Request an authorized correction before changing it.'
          : 'This closing is finalized. Request an authorized correction before changing it.');
      }
      return updateMut.mutateAsync({ id: editing.id, data, prev: editing, proofUrl, ocr });
    }

    // A finalized closing is unique per restaurant, branch, date and shift. The
    // application checks both canonical and legacy branch rows before creating
    // side effects; the database constraint is the final concurrency safeguard.
    const session = {
      date: data.date,
      branch: data.branch,
      branch_id: data.branch_id || null,
      shift: data.shift,
      cashier_id: data.cashier_id || data.cashier_employee_id || null,
      cashier_name: data.cashier_name || '',
    };
    const baseQuery = () => supabase
      .from('daily_sales')
      .select('*')
      .eq('restaurant_id', data.restaurant_id)
      .eq('date', session.date)
      .eq('shift', session.shift)
      .limit(50);
    const [canonical, legacy] = await Promise.all([
      data.branch_id ? baseQuery().eq('branch_id', data.branch_id) : Promise.resolve({ data: [], error: null }),
      baseQuery().is('branch_id', null).eq('branch', data.branch),
    ]);
    if (canonical.error || legacy.error) throw canonical.error || legacy.error;
    const existing = Array.from(new Map([...(canonical.data || []), ...(legacy.data || [])]
      .map((record) => [record.id, record])).values())
      .find((record) => matchesSalesClosingSession(record, session)) || null;
    if (existing?.closing_state === 'draft') {
      return updateMut.mutateAsync({ id: existing.id, data, prev: existing, proofUrl, ocr });
    }
    if (existing?.closing_state === 'locked' || existing?.closing_state === 'finalized') {
      throw new Error(existing.closing_state === 'locked'
        ? 'This closing is locked. Open it from history to request an authorized correction.'
        : 'This closing is finalized. Open it from history to request an authorized correction.');
    }
    if (existing) return { ...existing, _alreadyExists: true };

    return createMut.mutateAsync({ data, proofUrl, ocr });
  };

  const handleRequestCorrection = async (closing) => {
    if (!closing?.id || !['finalized', 'locked'].includes(closing.closing_state)) {
      toast.error('Only finalized or locked closings can use the correction workflow.');
      return;
    }
    if (![ROLES.OWNER, ROLES.GENERAL_MANAGER].includes(role)) {
      toast.error('An Owner or General Manager must request a correction for this protected closing.');
      return;
    }
    try {
      // The correction request is intentionally a server-authorized RPC rather
      // than a direct row update. The function validates the authenticated
      // Owner/General Manager, appends the immutable audit event, and leaves all
      // financial, identity, and lifecycle fields untouched.
      const { data, error } = await supabase.rpc('request_daily_sales_closing_correction', {
        p_closing_id: closing.id,
      });
      if (error) throw error;
      setEditing((current) => current?.id === closing.id ? (data || current) : current);
      invalidateSalesQueries();
      toast.success('Authorized correction request recorded. Financial values remain protected until the approved correction workflow is completed.');
    } catch (error) {
      toast.error(`Unable to record correction request: ${error?.message || 'Server authorization denied.'}`);
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
        title="Sales Closing"
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
              <BarChart3 className="w-4 h-4 mr-1" /> History Summary
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowFilters(v => !v)} className="relative flex-none" aria-label="Filter closing history">
              <SlidersHorizontal className="w-4 h-4" />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-primary text-primary-foreground text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                  {activeFilterCount}
                </span>
              )}
            </Button>
            <Button size="sm" onClick={openNewClosing} disabled={isOpeningNewClosing} aria-busy={isOpeningNewClosing} className="w-full sm:w-auto">
              {isOpeningNewClosing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}{isOpeningNewClosing ? 'Opening…' : 'New Closing'}
            </Button>
          </div>
        }
      />

      {(showForm || editing) && (
        <section aria-label="Sales Closing" className="mb-4 overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
          <UnifiedSalesClosing
            key={editing?.id || `new-closing-${newClosingInstance}`}
            initial={editing || newClosingDefaults || undefined}
            onSubmit={handleSave}
            onCancel={() => { setEditing(null); setNewClosingDefaults(null); setShowForm(false); }}
            onNewClosing={openNewClosing}
            onRequestCorrection={handleRequestCorrection}
            onSessionContextChange={updateClosingSessionContext}
            isOpeningNewClosing={isOpeningNewClosing}
          />
        </section>
      )}

      {/* Financial Panel — toggled by Summary button */}
      {showFinancialPanel && (
        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <CustomerCollections date={todayStr} branch={isAllBranches ? filters.branch : selectedBranchKey} />
          <DailySummary date={todayStr} branch={isAllBranches ? filters.branch : selectedBranchKey} />
          <CashRegister date={todayStr} branch={isAllBranches ? filters.branch : selectedBranchKey} />
          <POSReconciliation date={todayStr} branch={isAllBranches ? filters.branch : selectedBranchKey} />
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
          <div className="mb-2 flex items-center justify-between gap-3"><h2 className="text-sm font-black uppercase tracking-wide text-foreground">Closing History</h2>{!canDelete && filtered.length > 0 && <p className="text-xs text-muted-foreground">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</p>}</div>
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
                    setNewClosingDefaults(null);
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
