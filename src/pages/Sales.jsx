import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useLanguage } from '@/lib/LanguageContext';
import PageHeader from '@/components/shared/PageHeader';
// SalesForm removed to enforce single ERP workspace entry point
import ERPSalesWorkspace from '@/components/sales/ERPSalesWorkspace';
import SalesListItem from '@/components/sales/SalesListItem';
import EmptyState from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Plus, Download, SlidersHorizontal, BarChart3, FileText, Share2, Printer, MessageCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { downloadCSV, downloadPDF, buildSalesCSV, buildSalesPDF } from '@/lib/exportUtils';
import ExportDialog from '@/components/shared/ExportDialog';
import SalesFilterSidebar from '@/components/sales/SalesFilterSidebar';
import { useNotify } from '@/lib/useNotify';
import { useNetworkSettlement } from '@/hooks/useNetworkSettlement';
import { useAuth } from '@/lib/AuthContext';
import { useTenant } from '@/lib/TenantContext';
import { format } from 'date-fns';
import CustomerCollections from '@/components/sales/CustomerCollections';
import DailySummary from '@/components/sales/DailySummary';
import CashRegister from '@/components/sales/CashRegister';
import POSReconciliation from '@/components/sales/POSReconciliation';
import {
  generateSalesInvoiceNumber,
  createSalesInvoice,
  generateAndUploadPDF,
  shareInvoiceNative,
  openInvoicePrint,
  downloadInvoicePDF,
  printInvoice,
  shareInvoiceWhatsApp,
} from '@/lib/salesInvoiceService';

export default function Sales() {
  const { t, currency } = useLanguage();
  const { branches } = useTenant();
  const qc = useQueryClient();
  const notif = useNotify();
  const { user } = useAuth();
  const { orgId, ownerFilter, activeRestaurant } = useTenant();
  const { autoSettle } = useNetworkSettlement({ orgId, user, currency });
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showFinancialPanel, setShowFinancialPanel] = useState(false);
  const [filters, setFilters] = useState({ branch: 'all', from: '', to: '', minTotal: '', maxTotal: '' });
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  // Invoice state — shown after successful save
  const [savedInvoice, setSavedInvoice] = useState(null);
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ['sales', ownerFilter],
    queryFn: () => base44.entities.DailySales.filter(ownerFilter || {}, '-date', 2000), staleTime: 120000,
    enabled: !!ownerFilter?.created_by,
  });

  // Only create wallet transactions for COUNTER (restaurant) sales.
  const autoWalletTx = async (saleData, saleId, prevSale = null) => {
    try {
      const promises = [];
      const base = { 
        transaction_date: saleData.date, 
        branch: saleData.branch, 
        auto_generated: true, 
        reference_id: saleId,
        restaurant_id: saleData.restaurant_id || activeRestaurant?.id
      };

      if (prevSale) {
        const existing = await base44.entities.WalletTransaction.filter({ reference_id: prevSale.id, auto_generated: true });
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
    // Case (b): owner capital to cover purchases > sales operating loss
    const purchasesContrib = Number(saleData.owner_capital_contribution) || 0;

    if (cashContrib <= 0 && purchasesContrib <= 0) return;

    try {
      // Remove any existing owner-capital txs for this sale to avoid duplicates
      const existing = await base44.entities.WalletTransaction.filter({
        reference_id: saleId,
        auto_generated: true,
      });
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
          restaurant_id: saleData.restaurant_id || activeRestaurant?.id
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
          notes: `Operating loss covered by owner. Sales=${saleData.total_sales || 0}, Purchases=${saleData.approved_purchases_total || 0}. Not classified as sales revenue.`,
          restaurant_id: saleData.restaurant_id || activeRestaurant?.id
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
    const shortageAmt = Number(saleData.cash_shortage_amount) || 0;
    const overageAmt  = Number(saleData.cash_overage_amount)  || 0;

    const isApprovedShortage = cashStatus === 'Shortage' && saleData.manager_approval && shortageAmt > 0;
    const isOverage           = cashStatus === 'Overage'  && overageAmt > 0;
    if (!isApprovedShortage && !isOverage) return;

    try {
      // Remove any existing shortage/overage tx for this sale
      const existing = await base44.entities.WalletTransaction.filter({
        reference_id: saleId,
        auto_generated: true,
      });
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
          restaurant_id: saleData.restaurant_id || activeRestaurant?.id
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
          restaurant_id: saleData.restaurant_id || activeRestaurant?.id
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
    try { entries = JSON.parse(saleData.credit_entries_json); } catch { return; }
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
          const existing = await base44.entities.DebtRecord.filter({ id: customerId });
          debtRecord = existing[0];
        } else {
          // Look up by name + branch + type=receivable to avoid duplicates
          const existing = await base44.entities.DebtRecord.filter({ 
            party_name: customerName, 
            branch: saleData.branch, 
            type: 'receivable' 
          });
          debtRecord = existing[0];
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
            restaurant_id: saleData.restaurant_id || activeRestaurant?.id
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
            restaurant_id: saleData.restaurant_id || activeRestaurant?.id
          });
          
          await base44.entities.DebtPayment.create({
            debt_id: newDebt.id,
            party_name: customerName,
            date: saleData.date,
            amount: -amt,
            payment_method: 'credit',
            notes: `Credit sale — ${saleData.date}`,
            recorded_by: user?.email || '',
            restaurant_id: saleData.restaurant_id || activeRestaurant?.id
          });
        }

        // UPDATE CUSTOMER OUTSTANDING BALANCE (BUG 2)
        // We look up the customer by name or ID and increment their balance
        try {
          const customers = await base44.entities.Customer.filter(
            customerId ? { id: customerId } : { customer_name: customerName }
          );
          if (customers[0]) {
            const c = customers[0];
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

  // Auto-generate invoice after sale save
  const autoGenerateInvoice = async (saleData, saleId) => {
    try {
      // The invoice is now auto-created by the DB trigger (AFTER INSERT/UPDATE).
      // We just need to wait a moment and fetch it to show the dialog/PDF.
      const restaurantId = activeRestaurant?.id;
      
      // Give the DB a moment to process the trigger
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Fetch the generated invoice from the DB
      const { data: invoices } = await base44.entities.SalesInvoice.filter({ sale_id: saleId });
      const invoice = invoices && invoices[0];

      if (!invoice) {
        console.warn('[Sales] Invoice not found in DB after trigger');
        return;
      }

      // Phase 8: Generate and store permanent PDF
      try {
        await generateAndUploadPDF(invoice, 'RestoCTRL', currency);
        // Re-fetch to get the pdf_url
        const { data: updatedInv } = await base44.entities.SalesInvoice.filter({ id: invoice.id });
        if (updatedInv && updatedInv[0]) {
          setSavedInvoice(updatedInv[0]);
        } else {
          setSavedInvoice(invoice);
        }
      } catch (pdfErr) {
        console.error('[Sales] PDF generation failed:', pdfErr);
        setSavedInvoice(invoice);
      }

      setShowInvoiceDialog(true);
      qc.invalidateQueries({ queryKey: ['sales_invoices'] });
      return invoice;
    } catch (err) {
      console.warn('[Sales] Invoice generation failed:', err.message);
    }
  };

  const createMut = useMutation({
    mutationFn: async ({ data, proofUrl, ocr }) => {
      // ── TRANSACTION-LIKE WORKFLOW (Requirement 5) ──
      // 1. Insert parent Sale record first (Requirement 2)
      const sale = await base44.entities.DailySales.create(data);
      if (!sale?.id) throw new Error('Failed to create sale record');

      // 2. Wait for the returned Sale ID (Requirement 3)
      const saleId = sale.id;

      // 3. Create sales_invoices using exactly that Sale ID (Requirement 4)
      // Note: A DB trigger fn_daily_sales_sync_invoice already exists, 
      // but it might be failing or racing. We ensure the invoice exists here.
      try {
        const invoiceNum = data.invoice_number || await generateSalesInvoiceNumber(data.restaurant_id, data.date);
        await createSalesInvoice({
          invoiceNumber: invoiceNum,
          saleId: saleId,
          saleData: data,
          restaurantId: data.restaurant_id,
          createdBy: data.created_by || user?.email
        });
      } catch (invErr) {
        console.warn('[Sales] Manual invoice creation failed (might already exist via trigger):', invErr.message);
      }

      // 4. Run secondary side-effects
      await autoWalletTx(data, saleId);
      await autoShortageOveageTx(data, saleId);
      await autoOwnerCapitalTx(data, saleId);
      try { await autoSettle(data, saleId, proofUrl || null, ocr || null, null); } catch (e) { console.warn('autoSettle skipped:', e.message); }
      await autoSaveCreditDebts(data, saleId);
      
      // 5. Finalize invoice (PDF generation etc)
      await autoGenerateInvoice(data, saleId);
      
      const total = (data.restaurant_cash || 0) + (data.restaurant_network || 0) + (data.credit || 0);
      await notif.sale({ branch: data.branch, amount: total, action: 'create' });
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
      setShowForm(false);
    },
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, data, prev, proofUrl, ocr }) => {
      const sale = await base44.entities.DailySales.update(id, data);
      await autoWalletTx(data, id, prev);
      // FIX 5: Update treasury transaction for approved shortage/overage
      await autoShortageOveageTx(data, id);
      // Rule 6: Update Owner Capital Contribution treasury entry if purchases > sales
      await autoOwnerCapitalTx(data, id);
      try { await autoSettle(data, id, proofUrl || null, ocr || null, prev); } catch (e) { console.warn('autoSettle skipped:', e.message); }
      // Save customer credit entries to Debt Management (single source of truth)
      await autoSaveCreditDebts(data, id);
      // Re-generate invoice on update (upsert by invoice_number)
      await autoGenerateInvoice({ ...data, invoice_number: prev?.invoice_number }, id);
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
      setEditing(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (sale) => {
      await base44.entities.DailySales.delete(sale.id);
      await notif.sale({ branch: sale.branch, action: 'delete' });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['sales_today'] });
      qc.invalidateQueries({ queryKey: ['sales_month'] });
      qc.invalidateQueries({ queryKey: ['sales_today_live'] });
      qc.invalidateQueries({ queryKey: ['sales_yesterday_live'] });
      qc.invalidateQueries({ queryKey: ['sales_month_live'] });
      qc.invalidateQueries({ queryKey: ['sales_sources'] });
      qc.invalidateQueries({ queryKey: ['dashboard_metrics'] });
      qc.invalidateQueries({ queryKey: ['reports'] });
      setDeleting(null);
    },
  });

  const handleSave = async (data, proofUrl, ocr) => {
    // Ensure restaurant_id is included for correct scoping in Cash Register Center
    if (activeRestaurant?.id) {
      data.restaurant_id = activeRestaurant.id;
    }
    const existing = sales.find(s => s.date === data.date && s.branch === data.branch);
    if (existing && !editing) {
      await updateMut.mutateAsync({ id: existing.id, data, prev: existing, proofUrl, ocr });
      setShowForm(false);
    } else if (editing) {
      await updateMut.mutateAsync({ id: editing.id, data, prev: editing, proofUrl, ocr });
    } else {
      await createMut.mutateAsync({ data, proofUrl, ocr });
    }
  };

  const filtered = useMemo(() => {
    return sales.filter(s => {
      if (!s.date) return false;
      if (filters.branch !== 'all' && s.branch !== filters.branch) return false;
      if (filters.from && s.date < filters.from) return false;
      if (filters.to && s.date > filters.to) return false;
      const total = (Number(s.restaurant_cash) || Number(s.cash) || 0) + (Number(s.restaurant_network) || Number(s.network) || 0) + (Number(s.credit) || 0);
      if (filters.minTotal && total < Number(filters.minTotal)) return false;
      if (filters.maxTotal && total > Number(filters.maxTotal)) return false;
      return true;
    });
  }, [sales, filters]);

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
      downloadPDF({ filename: `${filename}.pdf`, title: t('daily_sales'), subtitle, headers, rows, totalsRow, currency });
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
          {filtered.length > 0 && (
            <p className="text-xs text-muted-foreground mb-2">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</p>
          )}
          {isLoading ? (
            <p className="text-center text-muted-foreground text-sm py-8">{t('loading')}</p>
          ) : filtered.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-2">
              {filtered.map(s => (
                <SalesListItem
                  key={s.id}
                  sale={s}
                  onEdit={(sale) => { setEditing(sale); setShowForm(false); }}
                  onDelete={(sale) => setDeleting(sale)}
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

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={(open) => { if (!open) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirm_delete')}</AlertDialogTitle>
            <AlertDialogDescription></AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMut.mutate(deleting)}>{t('delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Invoice Share/Download Dialog */}
      <Dialog open={showInvoiceDialog} onOpenChange={setShowInvoiceDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Invoice Generated
            </DialogTitle>
          </DialogHeader>
          {savedInvoice && (
            <div className="space-y-4">
              <div className="rounded-xl bg-primary/5 border border-primary/20 px-4 py-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Invoice Number</p>
                <p className="text-xl font-bold text-primary">{savedInvoice.invoice_number}</p>
                <p className="text-xs text-muted-foreground mt-1">{savedInvoice.branch} · {savedInvoice.sale_date}</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="flex items-center gap-2 h-11"
                  onClick={() => downloadInvoicePDF(savedInvoice, 'RestoCTRL', currency)}
                >
                  <Download className="w-4 h-4" />
                  Download
                </Button>
                <Button
                  variant="outline"
                  className="flex items-center gap-2 h-11"
                  onClick={() => openInvoicePrint(savedInvoice, 'RestoCTRL', currency)}
                >
                  <FileText className="w-4 h-4" />
                  View PDF
                </Button>
                <Button
                  variant="outline"
                  className="flex items-center gap-2 h-11"
                  onClick={() => shareInvoiceNative(savedInvoice, 'RestoCTRL', currency)}
                >
                  <Share2 className="w-4 h-4" />
                  Share PDF
                </Button>
                <Button
                  variant="outline"
                  className="flex items-center gap-2 h-11"
                  onClick={() => printInvoice(savedInvoice, 'RestoCTRL', currency)}
                >
                  <Printer className="w-4 h-4" />
                  Print
                </Button>
                <Button
                  className="flex items-center gap-2 h-11 col-span-2 bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => shareInvoiceWhatsApp(savedInvoice, currency)}
                >
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp Share
                </Button>
              </div>

              <Button variant="ghost" className="w-full" onClick={() => setShowInvoiceDialog(false)}>
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ExportDialog open={showExport} onClose={() => setShowExport(false)} onExport={handleExport} title={t('daily_sales')} />
    </div>
  );
}
