/**
 * NetworkManagement — NEW module (v2, built from scratch 2026-06-20)
 *
 * Tabs: Dashboard | Network Accounts | POS Devices | Transfers | Reconciliation | Analytics
 *
 * Rules enforced:
 *  - branch_id required before creating a network account
 *  - network accounts are NEVER shown in the restaurant selector
 *  - accounts only appear for their own branch
 *  - Sales → Network Sales dropdown loads accounts WHERE branch_id = selected_branch
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Wifi, Plus, Edit2, Trash2, CheckCircle, XCircle, Building2, ArrowLeftRight, BarChart3, LayoutDashboard,
  TrendingUp, TrendingDown, DollarSign, AlertTriangle, RefreshCw, Search, Save,
  Smartphone, Network, FileCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { base44 } from '@/api/base44Client';
import { useTenant } from '@/lib/TenantContext';
import { useLanguage } from '@/lib/LanguageContext';
import PageHeader from '@/components/shared/PageHeader';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const PROVIDERS = ['Mada', 'Visa', 'Mastercard', 'STC Pay', 'Apple Pay', 'Tamara', 'Tabby', 'Other'];
const EMPTY_POS = { branch_id: '', device_name: '', device_serial: '', provider: '', network_account_id: '', status: 'active', notes: '' };
const CURRENCIES = ['SAR', 'USD', 'EUR', 'AED', 'KWD', 'BHD', 'QAR', 'OMR'];
const STATUS_COLORS = {
  active:   'bg-emerald-100 text-emerald-700 border-emerald-200',
  inactive: 'bg-slate-100 text-slate-600 border-slate-200',
  pending:  'bg-amber-100 text-amber-700 border-amber-200',
  matched:  'bg-emerald-100 text-emerald-700 border-emerald-200',
  variance: 'bg-red-100 text-red-700 border-red-200',
  completed:'bg-blue-100 text-blue-700 border-blue-200',
  failed:   'bg-red-100 text-red-700 border-red-200',
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const fmtAmt = (n, cur = 'SAR') => `${cur} ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };

// ─────────────────────────────────────────────────────────────────────────────
// STAT CARD
// ─────────────────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color = 'blue', trend }) {
  const colors = {
    blue:    'from-blue-500 to-blue-600',
    emerald: 'from-emerald-500 to-emerald-600',
    violet:  'from-violet-500 to-violet-600',
    amber:   'from-amber-500 to-amber-600',
  };
  return (
    <Card className="overflow-hidden">
      <div className={`h-1 bg-gradient-to-r ${colors[color]}`} />
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground font-medium truncate">{label}</p>
            <p className="text-2xl font-extrabold text-foreground mt-0.5 leading-none">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colors[color]} flex items-center justify-center shrink-0 ml-3`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${trend >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(trend).toFixed(1)}% vs last month
          </div>
        )}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BRANCH SELECTOR (used inside forms)
// ─────────────────────────────────────────────────────────────────────────────
function BranchSelect({ value, onChange, required, placeholder = 'Select branch...' }) {
  const { branches = [] } = useTenant();
  return (
    <Select value={value || 'none'} onValueChange={v => onChange(v === 'none' ? '' : v)} required={required}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">{placeholder}</SelectItem>
        {branches.map(b => (
          <SelectItem key={b.key || b.id || b.name} value={String(b.key || b.id || b.name)}>
            {b.label || b.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NETWORK ACCOUNT FORM
// ─────────────────────────────────────────────────────────────────────────────
const EMPTY_ACCOUNT = {
  branch_id: '', network_name: '', network_provider: '', account_name: '',
  account_number: '', iban: '', currency: 'SAR', status: 'active', notes: '',
};

function NetworkAccountForm({ initial, onSubmit, onCancel }) {
  const [form, setForm] = useState({ ...EMPTY_ACCOUNT, ...initial });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const { branches } = useTenant();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.branch_id) return;
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Branch — REQUIRED */}
      <div>
        <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
          Branch <span className="text-red-500">*</span>
        </Label>
        <BranchSelect value={form.branch_id} onChange={v => set('branch_id', v)} required />
        {!form.branch_id && (
          <p className="text-xs text-amber-600 mt-1">Branch selection is required.</p>
        )}
      </div>

      {/* Network Name */}
      <div>
        <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Network Name</Label>
        <Input value={form.network_name || ''} onChange={e => set('network_name', e.target.value)}
          placeholder="e.g. Main POS Network" className="h-10" />
      </div>

      {/* Account Name */}
      <div>
        <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Account Name</Label>
        <Input value={form.account_name || ''} onChange={e => set('account_name', e.target.value)}
          placeholder="e.g. Mada Terminal 1" className="h-10" />
      </div>

      {/* Provider */}
      <div>
        <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Provider</Label>
        <Select value={form.network_provider || ''} onValueChange={v => set('network_provider', v)}>
          <SelectTrigger><SelectValue placeholder="Select provider..." /></SelectTrigger>
          <SelectContent>
            {PROVIDERS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Account Number + IBAN */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Account Number</Label>
          <Input value={form.account_number || ''} onChange={e => set('account_number', e.target.value)}
            placeholder="Account #" className="h-10" />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Currency</Label>
          <Select value={form.currency || 'SAR'} onValueChange={v => set('currency', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* IBAN */}
      <div>
        <Label className="text-xs font-semibold text-muted-foreground mb-1 block">IBAN</Label>
        <Input value={form.iban || ''} onChange={e => set('iban', e.target.value)}
          placeholder="SA..." className="h-10 font-mono text-sm" />
      </div>

      {/* Status */}
      <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
        <div>
          <p className="text-sm font-medium">Active</p>
          <p className="text-xs text-muted-foreground">Account is available for transactions</p>
        </div>
        <Switch
          checked={form.status === 'active'}
          onCheckedChange={v => set('status', v ? 'active' : 'inactive')}
        />
      </div>

      {/* Notes */}
      <div>
        <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Notes</Label>
        <Textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)}
          placeholder="Optional notes..." rows={2} className="resize-none" />
      </div>

      <div className="flex gap-2 pt-2">
        <Button type="submit" className="flex-1 h-11 font-bold" disabled={!form.branch_id}>
          <Save className="w-4 h-4 mr-2" />Save Account
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1 h-11">Cancel</Button>
        )}
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NETWORK ACCOUNTS TAB
// ─────────────────────────────────────────────────────────────────────────────
function NetworkAccountsTab({ accounts, branches, currency, onRefresh }) {
  const qc = useQueryClient();
  const { ownerFilter, activeRestaurant } = useTenant();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [search, setSearch] = useState('');
  const [filterBranch, setFilterBranch] = useState('all');

  const createMut = useMutation({
    mutationFn: (data) => {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.branch_id);
      return base44.entities.NetworkAccount.create({
        ...data,
        branch: isUuid ? undefined : data.branch_id,
        branch_id: isUuid ? data.branch_id : null,
        restaurant_id: activeRestaurant?.id || '',
        created_by: ownerFilter?.created_by || '',
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['network_accounts'] }); setShowForm(false); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.NetworkAccount.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['network_accounts'] }); setEditing(null); },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.NetworkAccount.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['network_accounts'] }); setDeleting(null); },
  });

  const toggleStatus = useCallback((acc) => {
    updateMut.mutate({ id: acc.id, data: { status: acc.status === 'active' ? 'inactive' : 'active', is_active: acc.status !== 'active' } });
  }, [updateMut]);

  const filtered = useMemo(() => {
    let list = accounts;
    if (filterBranch !== 'all') list = list.filter(a => a.branch_id === filterBranch || a.branch === filterBranch);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        (a.network_name || '').toLowerCase().includes(q) ||
        (a.account_name || '').toLowerCase().includes(q) ||
        (a.network_provider || '').toLowerCase().includes(q) ||
        (a.account_number || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [accounts, filterBranch, search]);

  const getBranchName = (acc) => {
    const b = branches.find(br => br.key === acc.branch_id || br.id === acc.branch_id || br.name === acc.branch_id || br.key === acc.branch || br.name === acc.branch);
    return b?.name || acc.branch_id || acc.branch || '—';
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search accounts..." className="pl-9 h-10" />
        </div>
        <Select value={filterBranch} onValueChange={setFilterBranch}>
          <SelectTrigger className="w-full sm:w-44 h-10">
            <SelectValue placeholder="All branches" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            {branches.map(b => (
              <SelectItem key={b.key || b.name} value={b.key || b.name}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => setShowForm(true)} className="h-10 shrink-0">
          <Plus className="w-4 h-4 mr-1" />Add Account
        </Button>
      </div>

      {/* Account Cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Wifi className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No network accounts found</p>
          <p className="text-sm mt-1">Add your first network account to get started</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map(acc => (
            <Card key={acc.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${acc.status === 'active' ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                  <Wifi className={`w-5 h-5 ${acc.status === 'active' ? 'text-emerald-600' : 'text-slate-400'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm truncate">{acc.account_name || acc.network_name || 'Unnamed Account'}</p>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[acc.status] || STATUS_COLORS.inactive}`}>
                      {acc.status || 'inactive'}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                    {acc.network_provider && (
                      <span className="text-xs text-muted-foreground">{acc.network_provider}</span>
                    )}
                    {acc.account_number && (
                      <span className="text-xs text-muted-foreground font-mono">#{acc.account_number}</span>
                    )}
                    {acc.currency && (
                      <span className="text-xs text-muted-foreground">{acc.currency}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <Building2 className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{getBranchName(acc)}</span>
                  </div>
                  {acc.iban && (
                    <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">{acc.iban}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-7 w-7"
                    onClick={() => setEditing(acc)} title="Edit">
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className={`h-7 w-7 ${acc.status === 'active' ? 'text-amber-600' : 'text-emerald-600'}`}
                    onClick={() => toggleStatus(acc)}
                    title={acc.status === 'active' ? 'Deactivate' : 'Activate'}>
                    {acc.status === 'active' ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                    onClick={() => setDeleting(acc)} title="Delete">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Network Account</DialogTitle></DialogHeader>
          <NetworkAccountForm
            onSubmit={(data) => createMut.mutate(data)}
            onCancel={() => setShowForm(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Network Account</DialogTitle></DialogHeader>
          {editing && (
            <NetworkAccountForm
              initial={editing}
              onSubmit={(data) => updateMut.mutate({ id: editing.id, data })}
              onCancel={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Network Account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleting?.account_name || deleting?.network_name}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground"
              onClick={() => deleteMut.mutate(deleting.id)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// POS DEVICES TAB
// ─────────────────────────────────────────────────────────────────────────────
function PosDevicesTab({ accounts, branches, currency }) {
  const qc = useQueryClient();
  const { ownerFilter, activeRestaurant } = useTenant();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [filterBranch, setFilterBranch] = useState('all');

  const { data: devices = [], isLoading } = useQuery({
    queryKey: ['network_pos_devices', activeRestaurant?.id],
    queryFn: () => base44.entities.NetworkPosDevice.filter({ restaurant_id: activeRestaurant?.id || '' }, '-created_at', 200),
    enabled: !!activeRestaurant?.id,
    staleTime: 30000,
  });

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.NetworkPosDevice.create({ ...data, restaurant_id: activeRestaurant?.id || '' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['network_pos_devices'] }); setShowForm(false); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.NetworkPosDevice.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['network_pos_devices'] }); setEditing(null); },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.NetworkPosDevice.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['network_pos_devices'] }); setDeleting(null); },
  });

  const filtered = useMemo(() => {
    if (filterBranch === 'all') return devices;
    return devices.filter(d => d.branch_id === filterBranch);
  }, [devices, filterBranch]);

  const getAccountName = (id) => {
    const a = accounts.find(a => a.id === id);
    return a ? (a.account_name || a.network_name || 'Account') : '—';
  };

  const getBranchName = (branchId) => {
    const b = branches.find(br => br.key === branchId || br.id === branchId || br.name === branchId);
    return b?.name || branchId || '—';
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <Select value={filterBranch} onValueChange={setFilterBranch}>
          <SelectTrigger className="w-full sm:w-44 h-10">
            <SelectValue placeholder="All branches" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            {branches.map(b => (
              <SelectItem key={b.key || b.name} value={b.key || b.name}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => setShowForm(true)} className="h-10 sm:ml-auto shrink-0">
          <Plus className="w-4 h-4 mr-1" />Add POS Device
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading devices...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Smartphone className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No POS devices found</p>
          <p className="text-sm mt-1">Assign POS devices to network accounts</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map(dev => (
            <Card key={dev.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${dev.status === 'active' ? 'bg-blue-100' : 'bg-slate-100'}`}>
                  <Smartphone className={`w-5 h-5 ${dev.status === 'active' ? 'text-blue-600' : 'text-slate-400'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{dev.device_name}</p>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[dev.status] || STATUS_COLORS.inactive}`}>
                      {dev.status}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                    {dev.provider && <span>{dev.provider}</span>}
                    {dev.device_serial && <span className="font-mono">S/N: {dev.device_serial}</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{getBranchName(dev.branch_id)}</span>
                    {dev.network_account_id && (
                      <span className="flex items-center gap-1"><Wifi className="w-3 h-3" />{getAccountName(dev.network_account_id)}</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(dev)}>
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleting(dev)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      {(showForm || editing) && (
        <Dialog open={true} onOpenChange={() => { setShowForm(false); setEditing(null); }}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing ? 'Edit POS Device' : 'Add POS Device'}</DialogTitle></DialogHeader>
            <PosDeviceForm
              initial={editing}
              accounts={accounts}
              onSubmit={(data) => editing ? updateMut.mutate({ id: editing.id, data }) : createMut.mutate(data)}
              onCancel={() => { setShowForm(false); setEditing(null); }}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirm */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete POS Device?</AlertDialogTitle>
            <AlertDialogDescription>Delete "{deleting?.device_name}"?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground"
              onClick={() => deleteMut.mutate(deleting.id)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PosDeviceForm({ initial, accounts = [], onSubmit, onCancel }) {
  const [form, setForm] = useState({ ...EMPTY_POS, ...(initial || {}) });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const { branches = [] } = useTenant();

  // Filter accounts by selected branch
  const branchAccounts = useMemo(() => {
    if (!form.branch_id) return accounts;
    return accounts.filter(a => a.branch_id === form.branch_id || a.branch === form.branch_id);
  }, [accounts, form.branch_id]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.branch_id || !form.device_name) return;
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Branch <span className="text-red-500">*</span></Label>
        <BranchSelect value={form.branch_id} onChange={v => { set('branch_id', v); set('network_account_id', ''); }} required />
      </div>
      <div>
        <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Device Name <span className="text-red-500">*</span></Label>
        <Input required value={form.device_name} onChange={e => set('device_name', e.target.value)} placeholder="e.g. POS Terminal 1" className="h-10" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Serial Number</Label>
          <Input value={form.device_serial || ''} onChange={e => set('device_serial', e.target.value)} placeholder="S/N" className="h-10 font-mono text-sm" />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Provider</Label>
          <Select value={form.provider || ''} onValueChange={v => set('provider', v)}>
            <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>{PROVIDERS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Assign to Network Account</Label>
        <Select value={form.network_account_id || 'none'} onValueChange={v => set('network_account_id', v === 'none' ? '' : v)}>
          <SelectTrigger><SelectValue placeholder={form.branch_id ? 'Select account...' : 'Select branch first'} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {branchAccounts.map(a => (
              <SelectItem key={a.id} value={String(a.id)}>{a.account_name || a.network_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
        <p className="text-sm font-medium">Active</p>
        <Switch checked={form.status === 'active'} onCheckedChange={v => set('status', v ? 'active' : 'inactive')} />
      </div>
      <div>
        <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Notes</Label>
        <Textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2} className="resize-none" />
      </div>
      <div className="flex gap-2 pt-2">
        <Button type="submit" className="flex-1 h-11 font-bold" disabled={!form.branch_id || !form.device_name}>
          <Save className="w-4 h-4 mr-2" />Save Device
        </Button>
        {onCancel && <Button type="button" variant="outline" onClick={onCancel} className="flex-1 h-11">Cancel</Button>}
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSFERS TAB
// ─────────────────────────────────────────────────────────────────────────────
const EMPTY_TRANSFER = { from_account_id: '', to_account_id: '', amount: '', currency: 'SAR', transfer_date: today(), reference: '', notes: '' };

function TransfersTab({ accounts, currency }) {
  const qc = useQueryClient();
  const { activeRestaurant } = useTenant();
  const [showForm, setShowForm] = useState(false);

  const { data: transfers = [], isLoading } = useQuery({
    queryKey: ['network_transfers', activeRestaurant?.id],
    queryFn: () => base44.entities.NetworkTransfer.filter({ restaurant_id: activeRestaurant?.id || '' }, '-created_at', 200),
    enabled: !!activeRestaurant?.id,
    staleTime: 30000,
  });

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.NetworkTransfer.create({ ...data, restaurant_id: activeRestaurant?.id || '' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['network_transfers'] }); setShowForm(false); },
  });

  const getAccountLabel = (id) => {
    const a = accounts.find(a => a.id === id);
    return a ? (a.account_name || a.network_name || 'Account') : id || '—';
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowForm(true)} className="h-10">
          <Plus className="w-4 h-4 mr-1" />New Transfer
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading transfers...</div>
      ) : transfers.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ArrowLeftRight className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No transfers yet</p>
          <p className="text-sm mt-1">Transfer funds between network accounts</p>
        </div>
      ) : (
        <div className="space-y-3">
          {transfers.map(t => (
            <Card key={t.id} className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                  <ArrowLeftRight className="w-4 h-4 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{getAccountLabel(t.from_account_id)}</span>
                    <ArrowLeftRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium truncate">{getAccountLabel(t.to_account_id)}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                    <span>{t.transfer_date}</span>
                    {t.reference && <span>Ref: {t.reference}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-sm">{fmtAmt(t.amount, t.currency || currency)}</p>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[t.status] || STATUS_COLORS.completed}`}>
                    {t.status}
                  </Badge>
                </div>
              </div>
              {t.notes && <p className="text-xs text-muted-foreground mt-2 pl-12">{t.notes}</p>}
            </Card>
          ))}
        </div>
      )}

      {/* Transfer Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Transfer</DialogTitle></DialogHeader>
          <TransferForm
            accounts={accounts}
            currency={currency}
            onSubmit={(data) => createMut.mutate(data)}
            onCancel={() => setShowForm(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TransferForm({ accounts, currency, onSubmit, onCancel }) {
  const [form, setForm] = useState({ ...EMPTY_TRANSFER, currency });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.from_account_id || !form.to_account_id || !form.amount) return;
    if (form.from_account_id === form.to_account_id) return;
    onSubmit(form);
  };

  const activeAccounts = accounts.filter(a => a.status === 'active' || a.is_active);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label className="text-xs font-semibold text-muted-foreground mb-1 block">From Account <span className="text-red-500">*</span></Label>
        <Select required value={form.from_account_id} onValueChange={v => set('from_account_id', v)}>
          <SelectTrigger><SelectValue placeholder="Select source account..." /></SelectTrigger>
          <SelectContent>
            {activeAccounts.map(a => <SelectItem key={a.id} value={a.id}>{a.account_name || a.network_name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs font-semibold text-muted-foreground mb-1 block">To Account <span className="text-red-500">*</span></Label>
        <Select required value={form.to_account_id} onValueChange={v => set('to_account_id', v)}>
          <SelectTrigger><SelectValue placeholder="Select destination account..." /></SelectTrigger>
          <SelectContent>
            {activeAccounts.filter(a => a.id !== form.from_account_id).map(a => (
              <SelectItem key={a.id} value={a.id}>{a.account_name || a.network_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Amount <span className="text-red-500">*</span></Label>
          <Input required type="number" step="0.01" min="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0.00" className="h-10" />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Currency</Label>
          <Select value={form.currency} onValueChange={v => set('currency', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Date</Label>
          <Input type="date" value={form.transfer_date} onChange={e => set('transfer_date', e.target.value)} className="h-10" />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Reference</Label>
          <Input value={form.reference || ''} onChange={e => set('reference', e.target.value)} placeholder="Ref #" className="h-10" />
        </div>
      </div>
      <div>
        <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Notes</Label>
        <Textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2} className="resize-none" />
      </div>
      <div className="flex gap-2 pt-2">
        <Button type="submit" className="flex-1 h-11 font-bold"
          disabled={!form.from_account_id || !form.to_account_id || !form.amount || form.from_account_id === form.to_account_id}>
          <ArrowLeftRight className="w-4 h-4 mr-2" />Transfer
        </Button>
        {onCancel && <Button type="button" variant="outline" onClick={onCancel} className="flex-1 h-11">Cancel</Button>}
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RECONCILIATION TAB
// ─────────────────────────────────────────────────────────────────────────────
const EMPTY_RECON = { branch_id: '', network_account_id: '', recon_date: today(), expected_amount: '', actual_amount: '', notes: '' };

function ReconciliationTab({ accounts, branches, currency }) {
  const qc = useQueryClient();
  const { activeRestaurant } = useTenant();
  const [showForm, setShowForm] = useState(false);
  const [filterBranch, setFilterBranch] = useState('all');

  const { data: recons = [], isLoading } = useQuery({
    queryKey: ['network_reconciliations', activeRestaurant?.id],
    queryFn: () => base44.entities.NetworkReconciliation.filter({ restaurant_id: activeRestaurant?.id || '' }, '-created_at', 200),
    enabled: !!activeRestaurant?.id,
    staleTime: 30000,
  });

  const createMut = useMutation({
    mutationFn: (data) => {
      const variance = Number(data.actual_amount || 0) - Number(data.expected_amount || 0);
      const status = Math.abs(variance) < 0.01 ? 'matched' : 'variance';
      return base44.entities.NetworkReconciliation.create({
        ...data, restaurant_id: activeRestaurant?.id || '', variance, status,
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['network_reconciliations'] }); setShowForm(false); },
  });

  const filtered = useMemo(() => {
    if (filterBranch === 'all') return recons;
    return recons.filter(r => r.branch_id === filterBranch);
  }, [recons, filterBranch]);

  const getAccountName = (id) => {
    const a = accounts.find(a => a.id === id);
    return a ? (a.account_name || a.network_name) : '—';
  };

  const getBranchName = (branchId) => {
    const b = branches.find(br => br.key === branchId || br.name === branchId);
    return b?.name || branchId || '—';
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <Select value={filterBranch} onValueChange={setFilterBranch}>
          <SelectTrigger className="w-full sm:w-44 h-10">
            <SelectValue placeholder="All branches" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            {branches.map(b => (
              <SelectItem key={b.key || b.name} value={b.key || b.name}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => setShowForm(true)} className="h-10 sm:ml-auto shrink-0">
          <Plus className="w-4 h-4 mr-1" />New Settlement
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading reconciliations...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No reconciliations yet</p>
          <p className="text-sm mt-1">Record daily settlements and detect variances</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => {
            const variance = Number(r.variance || 0);
            const hasVariance = Math.abs(variance) >= 0.01;
            return (
              <Card key={r.id} className={`p-4 ${hasVariance ? 'border-red-200' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${hasVariance ? 'bg-red-100' : 'bg-emerald-100'}`}>
                    {hasVariance
                      ? <AlertTriangle className="w-4 h-4 text-red-600" />
                      : <CheckCircle className="w-4 h-4 text-emerald-600" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{r.recon_date}</p>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[r.status] || STATUS_COLORS.pending}`}>
                        {r.status}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{getBranchName(r.branch_id)}</span>
                      {r.network_account_id && <span className="flex items-center gap-1"><Wifi className="w-3 h-3" />{getAccountName(r.network_account_id)}</span>}
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">Expected</p>
                        <p className="font-semibold">{fmtAmt(r.expected_amount, currency)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Actual</p>
                        <p className="font-semibold">{fmtAmt(r.actual_amount, currency)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Variance</p>
                        <p className={`font-bold ${hasVariance ? 'text-red-600' : 'text-emerald-600'}`}>
                          {variance >= 0 ? '+' : ''}{fmtAmt(variance, currency)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                {r.notes && <p className="text-xs text-muted-foreground mt-2 pl-12">{r.notes}</p>}
              </Card>
            );
          })}
        </div>
      )}

      {/* Reconciliation Form */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Daily Settlement</DialogTitle></DialogHeader>
          <ReconForm
            accounts={accounts}
            currency={currency}
            onSubmit={(data) => createMut.mutate(data)}
            onCancel={() => setShowForm(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReconForm({ accounts, currency, onSubmit, onCancel }) {
  const [form, setForm] = useState({ ...EMPTY_RECON });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const variance = Number(form.actual_amount || 0) - Number(form.expected_amount || 0);
  const hasVariance = form.expected_amount && form.actual_amount && Math.abs(variance) >= 0.01;

  const branchAccounts = useMemo(() => {
    if (!form.branch_id) return accounts;
    return accounts.filter(a => a.branch_id === form.branch_id || a.branch === form.branch_id);
  }, [accounts, form.branch_id]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.branch_id) return;
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Branch <span className="text-red-500">*</span></Label>
        <BranchSelect value={form.branch_id} onChange={v => { set('branch_id', v); set('network_account_id', ''); }} required />
      </div>
      <div>
        <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Network Account</Label>
        <Select value={form.network_account_id || 'all'} onValueChange={v => set('network_account_id', v === 'all' ? '' : v)}>
          <SelectTrigger><SelectValue placeholder={form.branch_id ? 'Select account...' : 'Select branch first'} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All accounts</SelectItem>
            {branchAccounts.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.account_name || a.network_name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Settlement Date</Label>
        <Input type="date" value={form.recon_date} onChange={e => set('recon_date', e.target.value)} className="h-10" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Expected Amount</Label>
          <Input type="number" step="0.01" min="0" value={form.expected_amount} onChange={e => set('expected_amount', e.target.value)} placeholder="0.00" className="h-10" />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Actual Amount</Label>
          <Input type="number" step="0.01" min="0" value={form.actual_amount} onChange={e => set('actual_amount', e.target.value)} placeholder="0.00" className="h-10" />
        </div>
      </div>
      {form.expected_amount && form.actual_amount && (
        <div className={`rounded-lg px-4 py-3 ${hasVariance ? 'bg-red-50 border border-red-200' : 'bg-emerald-50 border border-emerald-200'}`}>
          <div className="flex items-center gap-2">
            {hasVariance ? <AlertTriangle className="w-4 h-4 text-red-600" /> : <CheckCircle className="w-4 h-4 text-emerald-600" />}
            <span className={`text-sm font-semibold ${hasVariance ? 'text-red-700' : 'text-emerald-700'}`}>
              {hasVariance ? `Variance: ${variance >= 0 ? '+' : ''}${fmtAmt(variance, currency)}` : 'Balanced — no variance'}
            </span>
          </div>
        </div>
      )}
      <div>
        <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Notes</Label>
        <Textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2} className="resize-none" />
      </div>
      <div className="flex gap-2 pt-2">
        <Button type="submit" className="flex-1 h-11 font-bold" disabled={!form.branch_id}>
          <FileCheck className="w-4 h-4 mr-2" />Record Settlement
        </Button>
        {onCancel && <Button type="button" variant="outline" onClick={onCancel} className="flex-1 h-11">Cancel</Button>}
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS TAB
// ─────────────────────────────────────────────────────────────────────────────
function AnalyticsTab({ accounts, branches, currency, salesData }) {
  // Revenue by network account
  const revenueByAccount = useMemo(() => {
    const map = {};
    (salesData || []).forEach(s => {
      const entries = (() => {
        try { return JSON.parse(s.pos_entries_json || '[]'); } catch { return []; }
      })();
      entries.forEach(e => {
        const id = e.device_id || e.account_id || 'unknown';
        map[id] = (map[id] || 0) + Number(e.amount || 0);
      });
    });
    return Object.entries(map)
      .map(([id, total]) => {
        const acc = accounts.find(a => a.id === id);
        return { id, name: acc ? (acc.account_name || acc.network_name) : 'Unknown', total };
      })
      .sort((a, b) => b.total - a.total);
  }, [salesData, accounts]);

  // Revenue by branch
  const revenueByBranch = useMemo(() => {
    const map = {};
    (salesData || []).forEach(s => {
      const branch = s.branch || 'Unknown';
      const net = Number(s.restaurant_network || s.network || 0);
      map[branch] = (map[branch] || 0) + net;
    });
    return Object.entries(map)
      .map(([branch, total]) => {
        const b = branches.find(br => br.key === branch || br.name === branch);
        return { branch, name: b?.name || branch, total };
      })
      .sort((a, b) => b.total - a.total);
  }, [salesData, branches]);

  const totalNetworkRevenue = revenueByBranch.reduce((s, r) => s + r.total, 0);
  const maxBranch = revenueByBranch[0]?.total || 1;
  const maxAccount = revenueByAccount[0]?.total || 1;

  return (
    <div className="space-y-6">
      {/* Revenue by Branch */}
      <Card className="p-4">
        <h3 className="font-bold text-sm mb-4 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" />Revenue by Branch
        </h3>
        {revenueByBranch.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No sales data available</p>
        ) : (
          <div className="space-y-3">
            {revenueByBranch.map(r => (
              <div key={r.branch}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium">{r.name}</span>
                  <span className="font-bold">{fmtAmt(r.total, currency)}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all"
                    style={{ width: `${(r.total / maxBranch) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Top Network Accounts */}
      <Card className="p-4">
        <h3 className="font-bold text-sm mb-4 flex items-center gap-2">
          <Wifi className="w-4 h-4 text-emerald-500" />Top Network Accounts
        </h3>
        {revenueByAccount.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No POS entry data available</p>
        ) : (
          <div className="space-y-3">
            {revenueByAccount.slice(0, 10).map((r, i) => (
              <div key={r.id}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    {r.name}
                  </span>
                  <span className="font-bold">{fmtAmt(r.total, currency)}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-full transition-all"
                    style={{ width: `${(r.total / maxAccount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Summary */}
      <Card className="p-4 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Total Network Revenue (all time)</p>
            <p className="text-2xl font-extrabold text-primary mt-0.5">{fmtAmt(totalNetworkRevenue, currency)}</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center">
            <BarChart3 className="w-6 h-6 text-primary" />
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD TAB
// ─────────────────────────────────────────────────────────────────────────────
function DashboardTab({ accounts, currency, salesData, recons }) {
  const totalAccounts = accounts.length;
  const activeAccounts = accounts.filter(a => a.status === 'active' || a.is_active).length;

  const todayStr = today();
  const monthStr = monthStart();

  const todaySales = useMemo(() =>
    (salesData || [])
      .filter(s => s.date === todayStr)
      .reduce((sum, s) => sum + Number(s.restaurant_network || s.network || 0), 0),
    [salesData, todayStr]
  );

  const monthlySales = useMemo(() =>
    (salesData || [])
      .filter(s => s.date >= monthStr)
      .reduce((sum, s) => sum + Number(s.restaurant_network || s.network || 0), 0),
    [salesData, monthStr]
  );

  const pendingRecons = (recons || []).filter(r => r.status === 'pending').length;
  const varianceRecons = (recons || []).filter(r => r.status === 'variance').length;

  return (
    <div className="space-y-4">
      {/* Overview Cards */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={Network} label="Total Networks" value={totalAccounts} color="blue" />
        <StatCard icon={CheckCircle} label="Active Networks" value={activeAccounts} color="emerald" />
        <StatCard icon={DollarSign} label="Today's Network Sales" value={fmtAmt(todaySales, currency)} color="violet" />
        <StatCard icon={TrendingUp} label="Monthly Network Sales" value={fmtAmt(monthlySales, currency)} color="amber" />
      </div>

      {/* Alerts */}
      {(pendingRecons > 0 || varianceRecons > 0) && (
        <Card className="p-4 border-amber-200 bg-amber-50">
          <h3 className="font-bold text-sm text-amber-800 mb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />Reconciliation Alerts
          </h3>
          <div className="space-y-1">
            {pendingRecons > 0 && (
              <p className="text-xs text-amber-700">{pendingRecons} settlement{pendingRecons > 1 ? 's' : ''} pending review</p>
            )}
            {varianceRecons > 0 && (
              <p className="text-xs text-red-700 font-semibold">{varianceRecons} variance{varianceRecons > 1 ? 's' : ''} detected — requires attention</p>
            )}
          </div>
        </Card>
      )}

      {/* Recent Accounts */}
      <Card className="p-4">
        <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
          <Wifi className="w-4 h-4 text-primary" />Network Accounts
          <Badge variant="secondary" className="ml-auto text-xs">{totalAccounts}</Badge>
        </h3>
        {accounts.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No accounts yet</p>
        ) : (
          <div className="space-y-2">
            {accounts.slice(0, 5).map(acc => (
              <div key={acc.id} className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full shrink-0 ${acc.status === 'active' || acc.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                <span className="text-xs font-medium flex-1 truncate">{acc.account_name || acc.network_name || 'Unnamed'}</span>
                <span className="text-xs text-muted-foreground">{acc.network_provider || ''}</span>
              </div>
            ))}
            {accounts.length > 5 && (
              <p className="text-xs text-muted-foreground text-center pt-1">+{accounts.length - 5} more</p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function NetworkManagement() {
  const { ownerFilter, activeRestaurant, branches } = useTenant();
  const { currency } = useLanguage();
  const [activeTab, setActiveTab] = useState('dashboard');

  // ── Fetch network accounts (scoped to owner, never restaurant selector)
  const { data: accounts = [], isLoading: loadingAccounts, refetch: refetchAccounts } = useQuery({
    queryKey: ['network_accounts', ownerFilter, activeRestaurant?.id],
    queryFn: () => {
      const filter = activeRestaurant?.id
        ? { restaurant_id: activeRestaurant.id }
        : { created_by: ownerFilter?.created_by || '__none__' };
      return base44.entities.NetworkAccount.filter(filter, '-created_date', 500);
    },
    staleTime: 30000,
    enabled: !!(ownerFilter?.created_by || activeRestaurant?.id),
  });

  // ── Fetch sales data for analytics/dashboard
  const { data: salesData = [] } = useQuery({
    queryKey: ['daily_sales_network', activeRestaurant?.id],
    queryFn: () => {
      const filter = activeRestaurant?.id
        ? { restaurant_id: activeRestaurant.id }
        : { created_by: ownerFilter?.created_by || '__none__' };
      return base44.entities.DailySales.filter(filter, '-date', 500);
    },
    staleTime: 60000,
    enabled: !!(ownerFilter?.created_by || activeRestaurant?.id),
  });

  // ── Fetch reconciliations for dashboard alerts
  const { data: recons = [] } = useQuery({
    queryKey: ['network_reconciliations_dash', activeRestaurant?.id],
    queryFn: () => base44.entities.NetworkReconciliation.filter({ restaurant_id: activeRestaurant?.id || '' }, '-created_at', 100),
    enabled: !!activeRestaurant?.id,
    staleTime: 60000,
  });

  const TAB_CONFIG = [
    { id: 'dashboard',     label: 'Dashboard',      icon: LayoutDashboard },
    { id: 'accounts',      label: 'Accounts',        icon: Wifi },
    { id: 'pos',           label: 'POS',             icon: Smartphone },
    { id: 'transfers',     label: 'Transfers',       icon: ArrowLeftRight },
    { id: 'reconciliation',label: 'Reconciliation',  icon: FileCheck },
    { id: 'analytics',     label: 'Analytics',       icon: BarChart3 },
  ];

  return (
    <div className="pb-20">
      <PageHeader
        title="Network Management"
        action={
          <Button variant="outline" size="sm" onClick={() => refetchAccounts()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        }
      />

      {/* Tab Navigation — horizontal scroll on mobile */}
      <div className="overflow-x-auto -mx-4 px-4 mb-4">
        <div className="flex gap-1 min-w-max">
          {TAB_CONFIG.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      {loadingAccounts ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {activeTab === 'dashboard' && (
            <DashboardTab accounts={accounts} currency={currency} salesData={salesData} recons={recons} />
          )}
          {activeTab === 'accounts' && (
            <NetworkAccountsTab accounts={accounts} branches={branches} currency={currency} onRefresh={refetchAccounts} />
          )}
          {activeTab === 'pos' && (
            <PosDevicesTab accounts={accounts} branches={branches} currency={currency} />
          )}
          {activeTab === 'transfers' && (
            <TransfersTab accounts={accounts} currency={currency} />
          )}
          {activeTab === 'reconciliation' && (
            <ReconciliationTab accounts={accounts} branches={branches} currency={currency} />
          )}
          {activeTab === 'analytics' && (
            <AnalyticsTab accounts={accounts} branches={branches} currency={currency} salesData={salesData} />
          )}
        </>
      )}
    </div>
  );
}
