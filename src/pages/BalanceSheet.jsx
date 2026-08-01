/**
 * BalanceSheet — Enterprise Balance Sheet
 * Assets: Cash, Inventory, Receivable
 * Liabilities: Payable (supplier invoices outstanding)
 * Equity: Assets − Liabilities
 */
import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { computeProcurementKPIs } from '@/lib/procurementEngine';
import PageHeader from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import BranchSelect from '@/components/shared/BranchSelect';
import { useState } from 'react';
import {
  Wallet, Package, CreditCard, Banknote,
  TrendingUp, TrendingDown, Scale,
} from 'lucide-react';

function LedgerRow({ label, value, color = 'default', bold = false, separator = false }) {
  const colorMap = {
    default: 'text-foreground',
    green:   'text-emerald-600 dark:text-emerald-400',
    red:     'text-red-600 dark:text-red-400',
    amber:   'text-amber-600 dark:text-amber-400',
    blue:    'text-blue-600 dark:text-blue-400',
    purple:  'text-purple-600 dark:text-purple-400',
    muted:   'text-muted-foreground',
  };
  return (
    <>
      {separator && <div className="border-t border-border/60 my-1.5" />}
      <div className={`flex items-center justify-between py-1.5 px-1 rounded ${bold ? 'bg-muted/30' : ''}`}>
        <span className={`text-xs ${bold ? 'font-semibold' : 'font-medium'} text-muted-foreground`}>{label}</span>
        <span className={`text-sm ${bold ? 'font-black' : 'font-semibold'} ${colorMap[color]}`}>{value}</span>
      </div>
    </>
  );
}

function SectionCard({ title, icon: Icon, color, children, total, totalLabel, totalColor }) {
  const colorMap = {
    blue:   'bg-blue-100 dark:bg-blue-900/40 text-blue-600',
    amber:  'bg-amber-100 dark:bg-amber-900/40 text-amber-600',
    red:    'bg-red-100 dark:bg-red-900/40 text-red-600',
    green:  'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600',
    purple: 'bg-purple-100 dark:bg-purple-900/40 text-purple-600',
  };
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorMap[color] || colorMap.blue}`}>
            <Icon className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-bold text-foreground">{title}</h3>
        </div>
        {children}
        {total !== undefined && (
          <LedgerRow label={totalLabel || `Total ${title}`} value={total} color={totalColor || 'default'} bold separator />
        )}
      </CardContent>
    </Card>
  );
}

export default function BalanceSheet() {
  const { currency } = useLanguage();
  const { activeRestaurant } = useTenant();
  const [branch, setBranch] = useState('all');

  const fmt = (n) => `${currency}${(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const enabled = !!activeRestaurant?.id;
  const orgFilter = activeRestaurant?.id ? { restaurant_id: activeRestaurant.id } : null;

  // ── Data Queries ─────────────────────────────────────────────────────────────
  const { data: inventory = [], isLoading: loadingInv } = useQuery({
    queryKey: ['bs_inventory', orgFilter, branch],
    queryFn: () => base44.entities.Inventory.filter(orgFilter || {}, 'product_name', 500),
    staleTime: 60000, enabled,
  });

  const { data: walletTransactions = [], isLoading: loadingWallet } = useQuery({
    queryKey: ['bs_wallet', orgFilter, branch],
    queryFn: () => base44.entities.WalletTransaction.filter(orgFilter || {}, '-transaction_date', 2000),
    staleTime: 30000, enabled,
  });

  const { data: debtRecords = [], isLoading: loadingDebts } = useQuery({
    queryKey: ['bs_debts', orgFilter, branch],
    queryFn: () => base44.entities.DebtRecord.filter(orgFilter || {}, '-date', 1000),
    staleTime: 30000, enabled,
  });

  const { data: supplierInvoices = [], isLoading: loadingInvoices } = useQuery({
    queryKey: ['bs_supplier_invoices', activeRestaurant?.id, branch],
    queryFn: async () => {
      if (!activeRestaurant?.id) return [];
      const { data, error } = await supabase
        .from('supplier_invoices')
        .select('*')
        .eq('restaurant_id', activeRestaurant.id)
        .order('date', { ascending: false })
        .limit(2000);
      if (error) return [];
      return data || [];
    },
    staleTime: 30000, enabled,
  });

  // ── Calculations ─────────────────────────────────────────────────────────────
  const balanceSheet = useMemo(() => {
    const branchFilter = (arr, field = 'branch') =>
      branch === 'all' ? arr : arr.filter(r => r[field] === branch);

    // Cash (from wallet transactions)
    const walletTxns = branchFilter(walletTransactions, 'branch');
    const cashIn  = walletTxns.filter(t => t.direction === 'in').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const cashOut = walletTxns.filter(t => t.direction === 'out').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const cash = cashIn - cashOut;

    // Inventory value
    const invItems = branchFilter(inventory, 'branch');
    const inventoryValue = invItems.reduce((s, item) =>
      s + ((item.quantity || 0) * (item.unit_cost || item.avg_cost || item.cost_price || 0)), 0);

    // Receivable (open customer debts)
    const receivables = branchFilter(debtRecords, 'branch')
      .filter(d => d.type === 'receivable' && d.status !== 'paid' && d.status !== 'written_off');
    const totalReceivable = receivables.reduce((s, d) => s + (Number(d.remaining_amount) || 0), 0);

    // Total Assets
    const totalAssets = cash + inventoryValue + totalReceivable;

    // Payable (outstanding supplier invoices)
    const branchInvoices = branchFilter(supplierInvoices, 'branch');
    const kpis = computeProcurementKPIs(branchInvoices, []);
    const totalPayable = kpis.outstandingPayables;

    // Equity
    const equity = totalAssets - totalPayable;

    return { cash, inventoryValue, totalReceivable, totalAssets, totalPayable, equity };
  }, [inventory, walletTransactions, debtRecords, supplierInvoices, branch]);

  const isLoading = loadingInv || loadingWallet || loadingDebts || loadingInvoices;

  return (
    <div className="space-y-5 pb-20">
      <PageHeader title="Balance Sheet" />

      <BranchSelect value={branch} onChange={setBranch} includeAll />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><div className="h-32 bg-muted rounded animate-pulse" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Assets */}
          <SectionCard title="Assets" icon={TrendingUp} color="blue" total={fmt(balanceSheet.totalAssets)} totalLabel="Total Assets" totalColor="blue">
            <LedgerRow label="Cash & Wallet" value={fmt(balanceSheet.cash)} color="blue" />
            <LedgerRow label="Inventory Value" value={fmt(balanceSheet.inventoryValue)} color="blue" />
            <LedgerRow label="Accounts Receivable" value={fmt(balanceSheet.totalReceivable)} color="blue" />
          </SectionCard>

          {/* Liabilities */}
          <SectionCard title="Liabilities" icon={TrendingDown} color="red" total={fmt(balanceSheet.totalPayable)} totalLabel="Total Liabilities" totalColor="red">
            <LedgerRow label="Accounts Payable (Suppliers)" value={fmt(balanceSheet.totalPayable)} color="red" />
          </SectionCard>

          {/* Equity */}
          <SectionCard title="Equity" icon={Scale} color={balanceSheet.equity >= 0 ? 'green' : 'amber'} total={fmt(balanceSheet.equity)} totalLabel="Owner's Equity" totalColor={balanceSheet.equity >= 0 ? 'green' : 'red'}>
            <LedgerRow label="Total Assets" value={fmt(balanceSheet.totalAssets)} color="blue" />
            <LedgerRow label="Total Liabilities" value={`(${fmt(balanceSheet.totalPayable)})`} color="red" />
          </SectionCard>

          {/* Summary Card */}
          <Card className="border-2 border-primary/20 bg-primary/5">
            <CardContent className="p-4">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Balance Sheet Summary</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-lg font-black text-blue-600">{fmt(balanceSheet.totalAssets)}</p>
                  <p className="text-[10px] text-muted-foreground font-medium">Total Assets</p>
                </div>
                <div>
                  <p className="text-lg font-black text-red-600">{fmt(balanceSheet.totalPayable)}</p>
                  <p className="text-[10px] text-muted-foreground font-medium">Total Liabilities</p>
                </div>
                <div>
                  <p className={`text-lg font-black ${balanceSheet.equity >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(balanceSheet.equity)}</p>
                  <p className="text-[10px] text-muted-foreground font-medium">Equity</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
