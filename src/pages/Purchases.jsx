/**
 * Purchases — Enterprise Procurement & Accounts Payable
 * Full invoice-based workflow with overdue detection, multi-line items,
 * branch/status filtering, and supplier ledger integration.
 */

import React, { useEffect, useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { useBranchScope } from '@/lib/BranchScopeContext';
import { useRole, ROLES } from '@/lib/RoleContext';
import PageHeader from '@/components/shared/PageHeader';
import BranchSelect from '@/components/shared/BranchSelect';
import PurchaseInvoiceForm from '@/components/purchases/PurchaseInvoiceForm';
import PurchaseInvoiceList from '@/components/purchases/PurchaseInvoiceList';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import {
  Plus, BarChart3, BookOpen, Receipt, Search, AlertCircle, Clock
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { deletePurchaseInvoiceWithRollback, getOverdueInfo } from '@/lib/procurementEngine';

const STATUS_FILTERS = ['all', 'draft', 'pending', 'approved', 'paid', 'partial', 'unpaid', 'cancelled'];

export default function Purchases() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { currency } = useLanguage();
  const { activeRestaurant, branches } = useTenant();
  const { selectedBranchId, selectedBranchKey, isAllBranches, setSelectedBranchId } = useBranchScope();
  const { role } = useRole();
  const qc = useQueryClient();
  const isOwner = role === ROLES.OWNER;
  const canDelete = role === ROLES.OWNER || role === ROLES.MANAGER || role === ROLES.GENERAL_MANAGER;

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [bulkDeletingIds, setBulkDeletingIds] = useState(null);
  const filterBranch = isAllBranches ? 'all' : (selectedBranchKey || 'all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (searchParams.get('create') !== '1') return;
    setEditing(null);
    setShowForm(true);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('create');
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  // ── Fetch invoices ─────────────────────────────────────────────────────
  // Scope every request by the authenticated restaurant. For a selected branch,
  // canonical UUID records and legacy branch-keyed records are fetched server-side
  // and merged by primary key; no branch-name or client-side tenant-wide filter is used.
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['supplier_invoices', activeRestaurant?.id, selectedBranchId],
    queryFn: async () => {
      if (!activeRestaurant?.id) return [];
      const baseQuery = () => supabase.from('supplier_invoices').select('*')
        .eq('restaurant_id', activeRestaurant.id)
        .order('date', { ascending: false })
        .limit(5000);
      if (isAllBranches) {
        const { data, error } = await baseQuery();
        if (error) throw error;
        return data || [];
      }
      if (!selectedBranchId || !selectedBranchKey) return [];
      const [canonical, legacy] = await Promise.all([
        baseQuery().eq('branch_id', selectedBranchId),
        baseQuery().is('branch_id', null).eq('branch', selectedBranchKey),
      ]);
      if (canonical.error || legacy.error) throw canonical.error || legacy.error;
      return Array.from(new Map([...(canonical.data || []), ...(legacy.data || [])]
        .map((record) => [record.id, record])).values());
    },
    staleTime: 120000,
    enabled: Boolean(activeRestaurant?.id),
  });

  const invalidatePurchaseQueries = () => {
    qc.invalidateQueries({ queryKey: ['supplier_invoices'] });
    qc.invalidateQueries({ queryKey: ['supplier_invoices_dash'] });
    qc.invalidateQueries({ queryKey: ['supplier_payments'] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
    qc.invalidateQueries({ queryKey: ['debt_records'] });
    qc.invalidateQueries({ queryKey: ['purchases'] });
    qc.invalidateQueries({ queryKey: ['dashboard_metrics'] });
    qc.invalidateQueries({ queryKey: ['reports'] });
    qc.invalidateQueries({ queryKey: ['procurement_kpis'] });
  };

  // ── Delete mutation ────────────────────────────────────────────────────
  const deleteMut = useMutation({
    mutationFn: async (inv) => deletePurchaseInvoiceWithRollback(inv.id),
    onSuccess: () => {
      invalidatePurchaseQueries();
      setDeleting(null);
    },
  });

  const bulkDeleteMut = useMutation({
    mutationFn: async (ids) => {
      for (const id of ids) {
        await deletePurchaseInvoiceWithRollback(id);
      }
    },
    onSuccess: () => {
      invalidatePurchaseQueries();
      setBulkDeletingIds(null);
    },
  });

  // ── Filtered invoices ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return invoices.filter(inv => {
      const statusMatch = filterStatus === 'all' || inv.status === filterStatus;
      const searchMatch = !searchQuery ||
        (inv.supplier_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (inv.invoice_number || '').toLowerCase().includes(searchQuery.toLowerCase());
      return statusMatch && searchMatch;
    });
  }, [invoices, filterStatus, searchQuery]);

  // ── Summary stats ──────────────────────────────────────────────────────
  const totalOutstanding = invoices
    .filter(i => i.status !== 'paid' && i.status !== 'cancelled')
    .reduce((s, i) => s + ((i.total_amount || 0) - (i.paid_amount || 0)), 0);

  const overdueCount = invoices.filter(i => getOverdueInfo(i).isOverdue).length;
  const pendingApprovalCount = invoices.filter(i => i.approval_status === 'pending').length;

  const handleSuccess = () => {
    setShowForm(false);
    setEditing(null);
    qc.invalidateQueries({ queryKey: ['supplier_invoices'] });
    qc.invalidateQueries({ queryKey: ['supplier_invoices_dash'] });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Purchases"
        subtitle="Enterprise procurement & accounts payable"
        icon={<Receipt className="w-5 h-5" />}
        action={
          <Button size="sm" onClick={() => { setEditing(null); setShowForm(true); }} className="gap-1.5">
            <Plus className="w-4 h-4" /> New Invoice
          </Button>
        }
      />

      {/* Quick links */}
      <div className="flex gap-2">
        <Link to="/procurement-dashboard" className="flex-1">
          <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs h-8">
            <BarChart3 className="w-3.5 h-3.5" /> Dashboard
          </Button>
        </Link>
        <Link to="/supplier-ledger" className="flex-1">
          <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs h-8">
            <BookOpen className="w-3.5 h-3.5" /> Ledger
          </Button>
        </Link>
      </div>

      {/* Alert banners */}
      {overdueCount > 0 && (
        <Card className="p-2.5 bg-red-50 dark:bg-red-950 border-red-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <span className="text-xs text-red-700 font-medium">{overdueCount} overdue invoice{overdueCount !== 1 ? 's' : ''}</span>
          <Button size="sm" variant="ghost" className="ms-auto h-6 text-xs text-red-700" onClick={() => setFilterStatus('unpaid')}>View</Button>
        </Card>
      )}
      {pendingApprovalCount > 0 && isOwner && (
        <Card className="p-2.5 bg-yellow-50 dark:bg-yellow-950 border-yellow-200 flex items-center gap-2">
          <Clock className="w-4 h-4 text-yellow-600 flex-shrink-0" />
          <span className="text-xs text-yellow-700 font-medium">{pendingApprovalCount} invoice{pendingApprovalCount !== 1 ? 's' : ''} pending approval</span>
        </Card>
      )}

      {/* Outstanding summary */}
      {totalOutstanding > 0 && (
        <Card className="p-3 bg-orange-50/50 dark:bg-orange-950/20 border-orange-200">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Total Outstanding Payables</span>
            <span className="text-base font-bold text-orange-600">{currency}{totalOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
        </Card>
      )}

      {/* Filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search supplier or invoice #..."
            className="h-9 pl-8"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <BranchSelect
            value={filterBranch}
            onChange={(branchKey) => setSelectedBranchId(
              branchKey === 'all' ? 'all' : branches.find((branch) => (branch.key || branch.branch_key) === branchKey)?.id || 'all'
            )}
            includeAll
          />
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map(s => (
                <SelectItem key={s} value={s}>{s === 'all' ? 'All Status' : s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Invoice count */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{filtered.length} invoice{filtered.length !== 1 ? 's' : ''}</span>
        {filterStatus !== 'all' || filterBranch !== 'all' || searchQuery ? (
          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { setSelectedBranchId('all'); setFilterStatus('all'); setSearchQuery(''); }}>
            Clear filters
          </Button>
        ) : null}
      </div>

      {/* Invoice list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <PurchaseInvoiceList
          invoices={filtered}
          onEdit={(inv) => { setEditing(inv); setShowForm(true); }}
          onDelete={canDelete ? (inv) => setDeleting(inv) : null}
          onBulkDelete={canDelete ? (ids) => setBulkDeletingIds(ids) : null}
        />
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={open => { if (!open) { setShowForm(false); setEditing(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-primary" />
              {editing ? 'Edit Purchase Invoice' : 'New Purchase Invoice'}
            </DialogTitle>
          </DialogHeader>
          <PurchaseInvoiceForm
            invoice={editing}
            onSuccess={handleSuccess}
            onCancel={() => { setShowForm(false); setEditing(null); }}
          />
        </DialogContent>
      </Dialog>

      {/* Single Delete Confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={open => { if (!open) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete invoice {deleting?.invoice_number || deleting?.id?.slice(0, 8)} from {deleting?.supplier_name}, roll back inventory, and remove all related payment records. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => deleteMut.mutate(deleting)}
            >
              {deleteMut.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={!!bulkDeletingIds} onOpenChange={open => { if (!open) setBulkDeletingIds(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {bulkDeletingIds?.length} Invoice{bulkDeletingIds?.length !== 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {bulkDeletingIds?.length} invoice{bulkDeletingIds?.length !== 1 ? 's' : ''}, roll back inventory, and remove all related payment records. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => bulkDeleteMut.mutate(bulkDeletingIds)}
            >
              {bulkDeleteMut.isPending ? 'Deleting...' : 'Delete All'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
