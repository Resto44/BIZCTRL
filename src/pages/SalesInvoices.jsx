/**
 * SalesInvoices — Invoice Archive
 * Features: Search, Filter by Date, Filter by Branch, View, Download, Reprint, Reshare
 */
import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PageHeader from '@/components/shared/PageHeader';
import EmptyState from '@/components/shared/EmptyState';
import {
  Search, Download, Printer, MessageCircle, FileText, Eye,
  CheckCircle2, TrendingDown, TrendingUp, Calendar, Building2, Share2
} from 'lucide-react';
import {
  openInvoicePrint,
  downloadInvoicePDF,
  printInvoice,
  shareInvoiceWhatsApp,
  shareInvoiceNative,
} from '@/lib/salesInvoiceService';

function CashStatusBadge({ status }) {
  if (!status) return null;
  const config = {
    Balanced: { color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
    Shortage: { color: 'bg-red-100 text-red-700 border-red-200', icon: TrendingDown },
    Overage:  { color: 'bg-amber-100 text-amber-700 border-amber-200', icon: TrendingUp },
  };
  const c = config[status] || config.Balanced;
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${c.color}`}>
      <Icon className="w-3 h-3" />{status}
    </span>
  );
}

function InvoiceCard({ invoice, currency, onView, onDownload, onPrint, onWhatsApp, onShare }) {
  const fmt = (n) => `${currency}${Number(n || 0).toLocaleString()}`;
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-bold text-primary">{invoice.invoice_number}</p>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <Calendar className="w-3 h-3" />
            <span>{invoice.sale_date}</span>
            <Building2 className="w-3 h-3 ml-1" />
            <span>{invoice.branch}</span>
          </div>
        </div>
        <CashStatusBadge status={invoice.cash_status} />
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-lg bg-muted/50 p-2 text-center">
          <p className="text-muted-foreground">Opening</p>
          <p className="font-bold text-blue-600">{fmt(invoice.opening_cash)}</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-2 text-center">
          <p className="text-muted-foreground">Closing</p>
          <p className="font-bold">{fmt(invoice.closing_cash)}</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-2 text-center">
          <p className="text-muted-foreground">Total</p>
          <p className="font-bold text-primary">{fmt(invoice.sales_total)}</p>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-1">
        <Button size="sm" variant="outline" className="h-8 px-0 text-[10px]" onClick={() => onView(invoice)}>
          <Eye className="w-3 h-3 mr-0.5" />View
        </Button>
        <Button size="sm" variant="outline" className="h-8 px-0 text-[10px]" onClick={() => onDownload(invoice)}>
          <Download className="w-3 h-3 mr-0.5" />Save
        </Button>
        <Button size="sm" variant="outline" className="h-8 px-0 text-[10px]" onClick={() => onShare(invoice)}>
          <Share2 className="w-3 h-3 mr-0.5" />Share
        </Button>
        <Button size="sm" variant="outline" className="h-8 px-0 text-[10px]" onClick={() => onPrint(invoice)}>
          <Printer className="w-3 h-3 mr-0.5" />Print
        </Button>
        <Button size="sm" className="h-8 px-0 text-[10px] bg-green-600 hover:bg-green-700 text-white" onClick={() => onWhatsApp(invoice)}>
          <MessageCircle className="w-3 h-3 mr-0.5" />WA
        </Button>
      </div>
    </div>
  );
}

export default function SalesInvoices() {
  const { currency, lang, dir, translateLiteral } = useLanguage();
  const invoiceOptions = useMemo(() => ({ lang, dir, translateLiteral }), [lang, dir, translateLiteral]);
  const { branches, activeRestaurant, ownerFilter } = useTenant();
  const [search, setSearch] = useState('');
  const [filterBranch, setFilterBranch] = useState('all');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [viewInvoice, setViewInvoice] = useState(null);

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['sales_invoices', ownerFilter, activeRestaurant?.id],
    queryFn: async () => {
      // MULTI-TENANT SECURITY: always filter by created_by (owner email)
      let query = supabase
        .from('sales_invoices')
        .select('*')
        .order('sale_date', { ascending: false })
        .order('created_date', { ascending: false })
        .limit(500);
      // Apply tenant isolation
      if (ownerFilter?.created_by) {
        query = query.eq('created_by', ownerFilter.created_by);
      } else if (ownerFilter?.branch) {
        query = query.eq('branch', ownerFilter.branch);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!(ownerFilter?.created_by || ownerFilter?.branch),
    staleTime: 30000,
  });

  const filtered = useMemo(() => {
    return invoices.filter(inv => {
      if (filterBranch !== 'all' && inv.branch !== filterBranch) return false;
      if (filterFrom && inv.sale_date < filterFrom) return false;
      if (filterTo && inv.sale_date > filterTo) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          inv.invoice_number?.toLowerCase().includes(q) ||
          inv.branch?.toLowerCase().includes(q) ||
          inv.cashier_name?.toLowerCase().includes(q) ||
          inv.notes?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [invoices, filterBranch, filterFrom, filterTo, search]);

  const fmt = (n) => `${currency}${Number(n || 0).toLocaleString()}`;

  return (
    <div>
      <PageHeader
        title="Sales Invoices"
        subtitle="Invoice archive — search, view, download, reprint, reshare"
      />

      {/* Filters */}
      <div className="space-y-2 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9 h-10"
            placeholder="Search invoice number, branch, cashier..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Select value={filterBranch} onValueChange={setFilterBranch}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="All Branches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {branches.map(b => <SelectItem key={b.key} value={b.key}>{b.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input
            type="date"
            className="h-9 text-sm"
            value={filterFrom}
            onChange={e => setFilterFrom(e.target.value)}
            placeholder="From"
          />
          <Input
            type="date"
            className="h-9 text-sm"
            value={filterTo}
            onChange={e => setFilterTo(e.target.value)}
            placeholder="To"
          />
        </div>
        {filtered.length > 0 && (
          <p className="text-xs text-muted-foreground">{filtered.length} invoice{filtered.length !== 1 ? 's' : ''}</p>
        )}
      </div>

      {/* Invoice List */}
      {isLoading ? (
        <p className="text-center text-muted-foreground text-sm py-8">Loading invoices...</p>
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {filtered.map(inv => (
            <InvoiceCard
              key={inv.id}
              invoice={inv}
              currency={currency}
              onView={(i) => setViewInvoice(i)}
              onDownload={(i) => downloadInvoicePDF(i, 'BizCTRL', currency, invoiceOptions)}
              onPrint={(i) => printInvoice(i, 'BizCTRL', currency, invoiceOptions)}
              onWhatsApp={(i) => shareInvoiceWhatsApp(i, currency, invoiceOptions)}
              onShare={(i) => shareInvoiceNative(i, 'BizCTRL', currency, invoiceOptions)}
            />
          ))}
        </div>
      )}

      {/* View Invoice Dialog */}
      <Dialog open={!!viewInvoice} onOpenChange={(open) => { if (!open) setViewInvoice(null); }}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              {viewInvoice?.invoice_number}
            </DialogTitle>
          </DialogHeader>
          {viewInvoice && (
            <div className="space-y-4">
              {/* Invoice Details */}
              <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Date</span>
                  <span className="font-medium">{viewInvoice.sale_date}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Branch</span>
                  <span className="font-medium">{viewInvoice.branch}</span>
                </div>
                {viewInvoice.cashier_name && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Cashier</span>
                    <span className="font-medium">{viewInvoice.cashier_name}</span>
                  </div>
                )}
                {viewInvoice.shift && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Shift</span>
                    <span className="font-medium">{viewInvoice.shift}</span>
                  </div>
                )}
              </div>

              {/* Cash Register */}
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 space-y-2">
                <p className="text-xs font-bold text-emerald-800 uppercase">Cash Register</p>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Opening Cash</span>
                  <span className="font-medium text-blue-600">{fmt(viewInvoice.opening_cash)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Closing Cash</span>
                  <span className="font-medium">{fmt(viewInvoice.closing_cash)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Cash Difference</span>
                  <span className={`font-bold ${Number(viewInvoice.cash_difference) < 0 ? 'text-red-600' : Number(viewInvoice.cash_difference) > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {Number(viewInvoice.cash_difference) >= 0 ? '+' : ''}{fmt(viewInvoice.cash_difference)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Cash Status</span>
                  <CashStatusBadge status={viewInvoice.cash_status} />
                </div>
              </div>

              {/* Sales */}
              <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 space-y-2">
                <p className="text-xs font-bold text-blue-800 uppercase">Sales Breakdown</p>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Cash Sales (Closing − Opening)</span>
                  <span className="font-medium text-emerald-600">
                    {fmt(viewInvoice.cash_sales ?? Math.max(0, Number(viewInvoice.closing_cash) - Number(viewInvoice.opening_cash)))}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Network Sales</span>
                  <span className="font-medium">{fmt(viewInvoice.network_sales)}</span>
                </div>
                {Number(viewInvoice.credit_sales) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Credit Sales</span>
                    <span className="font-medium">{fmt(viewInvoice.credit_sales)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm border-t border-blue-200 pt-2">
                  <span className="font-bold">Sales Total</span>
                  <span className="font-bold text-primary">{fmt(viewInvoice.sales_total)}</span>
                </div>
              </div>

              {viewInvoice.notes && (
                <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                  <span className="font-medium">Notes: </span>{viewInvoice.notes}
                </div>
              )}

              {/* Action buttons */}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="h-10" onClick={() => downloadInvoicePDF(viewInvoice, 'BizCTRL', currency, invoiceOptions)}>
                  <Download className="w-4 h-4 mr-1" />Download
                </Button>
                <Button variant="outline" className="h-10" onClick={() => openInvoicePrint(viewInvoice, 'BizCTRL', currency, invoiceOptions)}>
                  <FileText className="w-4 h-4 mr-1" />View PDF
                </Button>
                <Button variant="outline" className="h-10" onClick={() => shareInvoiceNative(viewInvoice, 'BizCTRL', currency, invoiceOptions)}>
                  <Share2 className="w-4 h-4 mr-1" />Share PDF
                </Button>
                <Button variant="outline" className="h-10" onClick={() => printInvoice(viewInvoice, 'BizCTRL', currency, invoiceOptions)}>
                  <Printer className="w-4 h-4 mr-1" />Print
                </Button>
                <Button className="h-10 col-span-2 bg-green-600 hover:bg-green-700 text-white" onClick={() => shareInvoiceWhatsApp(viewInvoice, currency, invoiceOptions)}>
                  <MessageCircle className="w-4 h-4 mr-1" />WhatsApp Share
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
