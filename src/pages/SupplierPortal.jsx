import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Building2, FileText, Package, CheckCircle2, AlertCircle,
  CreditCard, BarChart3, ShoppingCart
} from 'lucide-react';
import { format } from 'date-fns';

const STATUS_BADGE = {
  pending:  { cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30',   label: 'Pending' },
  approved: { cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', label: 'Approved' },
  paid:     { cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30',      label: 'Paid' },
  partial:  { cls: 'bg-purple-500/20 text-purple-400 border-purple-500/30', label: 'Partial' },
  unpaid:   { cls: 'bg-red-500/20 text-red-400 border-red-500/30',         label: 'Unpaid' },
  rejected: { cls: 'bg-red-500/20 text-red-400 border-red-500/30',         label: 'Rejected' },
};

function StatCard({ icon: Icon, label, value, sub, color = 'text-cyan-400' }) {
  return (
    <Card className="p-4 bg-white/5 border-white/10">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-slate-400 text-xs font-medium">{label}</span>
      </div>
      <p className={`text-2xl font-black ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </Card>
  );
}

export default function SupplierPortal() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');

  // Fetch supplier invite / profile
  const { data: supplierProfile } = useQuery({
    queryKey: ['supplier_profile', user?.email],
    queryFn: async () => {
      if (!user?.email) return null;
      const { data } = await supabase
        .from('supplier_invites')
        .select('*')
        .eq('email', user.email)
        .eq('status', 'approved')
        .maybeSingle();
      return data;
    },
    enabled: !!user?.email,
  });

  // Fetch purchase orders for this supplier
  const { data: purchaseOrders = [] } = useQuery({
    queryKey: ['supplier_purchase_orders', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('*')
        .eq('supplier_email', user.email)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) { console.warn('[SupplierPortal] POs:', error.message); return []; }
      return data || [];
    },
    enabled: !!user?.email,
  });

  // Fetch supplier invoices
  const { data: invoices = [] } = useQuery({
    queryKey: ['supplier_invoices_portal', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      const { data, error } = await supabase
        .from('supplier_invoices')
        .select('*')
        .eq('supplier_email', user.email)
        .order('date', { ascending: false })
        .limit(100);
      if (error) { console.warn('[SupplierPortal] invoices:', error.message); return []; }
      return data || [];
    },
    enabled: !!user?.email,
  });

  // KPIs
  const totalInvoiced = invoices.reduce((s, i) => s + (parseFloat(i.total_amount) || 0), 0);
  const totalPaid = invoices
    .filter(i => i.status === 'paid')
    .reduce((s, i) => s + (parseFloat(i.total_amount) || 0), 0);
  const outstanding = totalInvoiced - totalPaid;
  const pendingPOs = purchaseOrders.filter(po => po.status === 'pending').length;

  const TABS = [
    { id: 'overview',  label: 'Overview',        icon: BarChart3 },
    { id: 'orders',    label: 'Purchase Orders',  icon: ShoppingCart },
    { id: 'invoices',  label: 'Invoices',         icon: FileText },
    { id: 'payments',  label: 'Payments',         icon: CreditCard },
  ];

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white">
                {supplierProfile?.supplier_name || 'Supplier Portal'}
              </h1>
              <p className="text-slate-400 text-xs">
                {supplierProfile?.contact_name || user?.full_name || user?.email}
              </p>
            </div>
          </div>
        </div>
        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 border">
          <CheckCircle2 className="w-3 h-3 mr-1" /> Approved Supplier
        </Badge>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={FileText}    label="Total Invoiced"  value={`${totalInvoiced.toLocaleString()}`}  sub="All time"         color="text-cyan-400" />
        <StatCard icon={CheckCircle2} label="Total Paid"     value={`${totalPaid.toLocaleString()}`}      sub="Received"         color="text-emerald-400" />
        <StatCard icon={AlertCircle} label="Outstanding"     value={`${outstanding.toLocaleString()}`}    sub="Balance due"      color={outstanding > 0 ? 'text-amber-400' : 'text-slate-400'} />
        <StatCard icon={ShoppingCart} label="Pending POs"   value={pendingPOs}                           sub="Awaiting action"  color="text-purple-400" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 border-b border-white/10">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-all border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-cyan-400 text-white'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <h2 className="text-white font-bold">Recent Activity</h2>
          {invoices.length === 0 && purchaseOrders.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-12 h-12 text-slate-700 mx-auto mb-3" />
              <p className="text-slate-400">No activity yet</p>
              <p className="text-slate-600 text-sm mt-1">Purchase orders and invoices will appear here once created.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {[...purchaseOrders.slice(0, 3).map(po => ({ ...po, _type: 'po' })),
                ...invoices.slice(0, 3).map(inv => ({ ...inv, _type: 'invoice' }))]
                .sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date))
                .slice(0, 6)
                .map(item => (
                  <Card key={`${item._type}-${item.id}`} className="p-3 bg-white/5 border-white/10">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          item._type === 'po' ? 'bg-purple-500/20' : 'bg-cyan-500/20'
                        }`}>
                          {item._type === 'po'
                            ? <ShoppingCart className="w-4 h-4 text-purple-400" />
                            : <FileText className="w-4 h-4 text-cyan-400" />
                          }
                        </div>
                        <div>
                          <p className="text-white text-sm font-medium">
                            {item._type === 'po' ? `PO #${item.po_number || item.id?.slice(0,8)}` : `Invoice #${item.invoice_number || item.id?.slice(0,8)}`}
                          </p>
                          <p className="text-slate-500 text-xs">
                            {item.date || item.created_at ? format(new Date(item.date || item.created_at), 'MMM d, yyyy') : ''}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-white font-bold text-sm">
                          {parseFloat(item.total_amount || item.amount || 0).toLocaleString()}
                        </p>
                        {item.status && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${(STATUS_BADGE[item.status] || STATUS_BADGE.pending).cls}`}>
                            {(STATUS_BADGE[item.status] || STATUS_BADGE.pending).label}
                          </span>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'orders' && (
        <div className="space-y-3">
          <h2 className="text-white font-bold">Purchase Orders</h2>
          {purchaseOrders.length === 0 ? (
            <div className="text-center py-12">
              <ShoppingCart className="w-12 h-12 text-slate-700 mx-auto mb-3" />
              <p className="text-slate-400">No purchase orders yet</p>
            </div>
          ) : (
            purchaseOrders.map(po => (
              <Card key={po.id} className="p-4 bg-white/5 border-white/10">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-white font-bold text-sm">PO #{po.po_number || po.id?.slice(0,8)}</p>
                    <p className="text-slate-400 text-xs mt-0.5">{po.date ? format(new Date(po.date), 'MMM d, yyyy') : ''}</p>
                    {po.notes && <p className="text-slate-500 text-xs mt-1">{po.notes}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-white font-bold">{parseFloat(po.total_amount || 0).toLocaleString()}</p>
                    {po.status && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${(STATUS_BADGE[po.status] || STATUS_BADGE.pending).cls}`}>
                        {(STATUS_BADGE[po.status] || STATUS_BADGE.pending).label}
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {activeTab === 'invoices' && (
        <div className="space-y-3">
          <h2 className="text-white font-bold">Invoices</h2>
          {invoices.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-slate-700 mx-auto mb-3" />
              <p className="text-slate-400">No invoices yet</p>
            </div>
          ) : (
            invoices.map(inv => (
              <Card key={inv.id} className="p-4 bg-white/5 border-white/10">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-white font-bold text-sm">
                      Invoice #{inv.invoice_number || inv.id?.slice(0,8)}
                    </p>
                    <p className="text-slate-400 text-xs mt-0.5">
                      {inv.date ? format(new Date(inv.date), 'MMM d, yyyy') : ''}
                    </p>
                    {inv.supplier_name && <p className="text-slate-500 text-xs">{inv.supplier_name}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-white font-bold">{parseFloat(inv.total_amount || 0).toLocaleString()}</p>
                    {inv.status && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${(STATUS_BADGE[inv.status] || STATUS_BADGE.pending).cls}`}>
                        {(STATUS_BADGE[inv.status] || STATUS_BADGE.pending).label}
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {activeTab === 'payments' && (
        <div className="space-y-3">
          <h2 className="text-white font-bold">Payment History</h2>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-3 bg-emerald-500/10 border-emerald-500/20 text-center">
              <p className="text-emerald-400 font-black text-xl">{totalPaid.toLocaleString()}</p>
              <p className="text-xs text-slate-400">Total Paid</p>
            </Card>
            <Card className="p-3 bg-amber-500/10 border-amber-500/20 text-center">
              <p className="text-amber-400 font-black text-xl">{outstanding.toLocaleString()}</p>
              <p className="text-xs text-slate-400">Outstanding</p>
            </Card>
            <Card className="p-3 bg-cyan-500/10 border-cyan-500/20 text-center">
              <p className="text-cyan-400 font-black text-xl">{totalInvoiced.toLocaleString()}</p>
              <p className="text-xs text-slate-400">Total Invoiced</p>
            </Card>
          </div>
          {/* Paid invoices */}
          {invoices.filter(i => i.status === 'paid').length === 0 ? (
            <div className="text-center py-8">
              <CreditCard className="w-10 h-10 text-slate-700 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">No payments recorded yet</p>
            </div>
          ) : (
            invoices.filter(i => i.status === 'paid').map(inv => (
              <Card key={inv.id} className="p-4 bg-white/5 border-white/10">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white text-sm font-medium">Invoice #{inv.invoice_number || inv.id?.slice(0,8)}</p>
                    <p className="text-slate-500 text-xs">{inv.date ? format(new Date(inv.date), 'MMM d, yyyy') : ''}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-emerald-400 font-bold">{parseFloat(inv.total_amount || 0).toLocaleString()}</p>
                    <p className="text-[10px] text-emerald-500">Paid</p>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
