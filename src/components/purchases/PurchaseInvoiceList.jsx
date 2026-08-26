/**
 * PurchaseInvoiceList — Phase 7
 * Displays purchase invoices with overdue color coding,
 * status badges, and quick actions.
 */

import React, { useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/LanguageContext';
import { Pencil, Trash2, CheckCircle2, Clock, AlertCircle, Eye, Square, CheckSquare } from 'lucide-react';
import { getOverdueInfo } from '@/lib/procurementEngine';
import { approveInvoice } from '@/lib/procurementEngine';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { useRole, ROLES } from '@/lib/RoleContext';

const STATUS_CONFIG = {
  draft:     { label: 'Draft',    cls: 'bg-gray-100 text-gray-700 border-gray-200', Icon: Clock },
  pending:   { label: 'Pending',  cls: 'bg-yellow-100 text-yellow-700 border-yellow-200', Icon: Clock },
  approved:  { label: 'Approved', cls: 'bg-blue-100 text-blue-700 border-blue-200', Icon: CheckCircle2 },
  paid:      { label: 'Paid',     cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
  partial:   { label: 'Partial',  cls: 'bg-orange-100 text-orange-700 border-orange-200', Icon: Clock },
  unpaid:    { label: 'Unpaid',   cls: 'bg-red-100 text-red-700 border-red-200', Icon: AlertCircle },
  cancelled: { label: 'Cancelled',cls: 'bg-gray-100 text-gray-500 border-gray-200', Icon: AlertCircle },
};

const OVERDUE_COLORS = {
  yellow: 'border-l-4 border-l-yellow-400 bg-yellow-50/30',
  orange: 'border-l-4 border-l-orange-400 bg-orange-50/30',
  red:    'border-l-4 border-l-red-500 bg-red-50/30',
};

const isMutableDraft = (invoice) =>
  invoice?.status === 'draft' && !['approved', 'auto_approved'].includes(invoice?.approval_status);

export default function PurchaseInvoiceList({ invoices = [], onEdit, onDelete, onBulkDelete, onView }) {
  const { currency } = useLanguage();
  const { user } = useAuth();
  const { role } = useRole();
  const qc = useQueryClient();
  const isOwner = role === ROLES.OWNER;
  const canDelete = role === ROLES.OWNER || role === ROLES.MANAGER || role === ROLES.GENERAL_MANAGER;
  const [selectedIds, setSelectedIds] = useState(new Set());
  const mutableDrafts = invoices.filter(isMutableDraft);

  const toggleSelect = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === mutableDrafts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(mutableDrafts.map((invoice) => invoice.id)));
    }
  }, [selectedIds.size, mutableDrafts]);

  const handleApprove = async (invoice) => {
    try {
      await approveInvoice(invoice.id, user?.email);
      qc.invalidateQueries({ queryKey: ['supplier_invoices'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['debt_records'] });
    } catch (err) {
      console.error('Approval error:', err);
    }
  };

  if (invoices.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No invoices found</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Only unapproved drafts may be removed. Finalized invoices require the canonical correction workflow. */}
      {canDelete && onBulkDelete && mutableDrafts.length > 0 && (
        <div className="flex items-center gap-2 py-1">
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={toggleSelectAll}
          >
            {selectedIds.size === mutableDrafts.length
              ? <CheckSquare className="w-4 h-4 text-primary" />
              : <Square className="w-4 h-4" />}
            {selectedIds.size === mutableDrafts.length ? 'Deselect All Drafts' : 'Select All Drafts'}
          </button>
          {selectedIds.size > 0 && (
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs text-destructive hover:text-destructive/80 ml-auto"
              onClick={() => { onBulkDelete(Array.from(selectedIds)); setSelectedIds(new Set()); }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Drafts ({selectedIds.size})
            </button>
          )}
        </div>
      )}
      {invoices.map(inv => {
        const { isOverdue, daysOverdue, color } = getOverdueInfo(inv);
        const statusCfg = STATUS_CONFIG[inv.status] || STATUS_CONFIG.draft;
        const StatusIcon = statusCfg.Icon;
        const remaining = (inv.total_amount || 0) - (inv.paid_amount || 0);

        return (
          <Card key={inv.id} className={`p-3 ${isOverdue ? OVERDUE_COLORS[color] : ''} ${selectedIds.has(inv.id) ? 'ring-2 ring-primary/50' : ''}`}>

            <div className="flex items-start gap-3">
              {canDelete && isMutableDraft(inv) && (
                <button type="button" onClick={() => toggleSelect(inv.id)} className="text-muted-foreground hover:text-primary mt-0.5 flex-shrink-0">
                  {selectedIds.has(inv.id) ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                </button>
              )}
              <div className="flex-1 min-w-0">
                {/* Top row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold truncate">{inv.supplier_name || 'Unknown Supplier'}</span>
                  <Badge className={`text-[10px] border ${statusCfg.cls} flex items-center gap-1`}>
                    <StatusIcon className="w-2.5 h-2.5" />
                    {statusCfg.label}
                  </Badge>
                  {inv.approval_status === 'pending' && isOwner && (
                    <Badge className="text-[10px] bg-yellow-100 text-yellow-700 border border-yellow-200">
                      Needs Approval
                    </Badge>
                  )}
                  {isOverdue && (
                    <Badge className={`text-[10px] ${color === 'red' ? 'bg-red-100 text-red-700 border-red-200' : color === 'orange' ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-yellow-100 text-yellow-700 border-yellow-200'} border`}>
                      {daysOverdue}d overdue
                    </Badge>
                  )}
                </div>

                {/* Invoice details */}
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                  {inv.invoice_number && <span>#{inv.invoice_number}</span>}
                  <span>{inv.date}</span>
                  {inv.branch && <span className="bg-secondary px-1.5 py-0.5 rounded">{inv.branch}</span>}
                  {inv.due_date && <span>Due: {inv.due_date}</span>}
                </div>

                {/* Amounts */}
                <div className="flex items-center gap-3 mt-1.5 text-xs flex-wrap">
                  <span className="font-semibold text-sm">{currency}{(inv.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  {inv.paid_amount > 0 && (
                    <span className="text-emerald-600">Paid: {currency}{(inv.paid_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  )}
                  {remaining > 0.01 && (
                    <span className="text-red-600 font-medium">Remaining: {currency}{remaining.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  )}
                </div>

                {/* Items count */}
                {inv.items?.length > 0 && (
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {inv.items.length} item{inv.items.length !== 1 ? 's' : ''}
                    {inv.items.slice(0, 2).map((item, i) => (
                      <span key={i}> · {item.product_name || 'Item'}</span>
                    ))}
                    {inv.items.length > 2 && <span> · +{inv.items.length - 2} more</span>}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-1 flex-shrink-0">
                {onView && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onView(inv)}>
                    <Eye className="w-3.5 h-3.5" />
                  </Button>
                )}
                {onEdit && isMutableDraft(inv) && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(inv)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                )}
                {isOwner && inv.approval_status === 'pending' && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600" onClick={() => handleApprove(inv)} title="Approve Invoice">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </Button>
                )}
                {onDelete && canDelete && isMutableDraft(inv) && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(inv)} title="Delete Draft Invoice">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
