import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/api/supabaseClient';
import { useRole } from '@/lib/RoleContext';
import { useLanguage } from '@/lib/LanguageContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, fieldClass, Empty, ErrorNotice, ProductIdentity, Status } from './InventoryUI';
import { useInventoryCopy } from './inventoryCopy';
export function InventoryStockDetail({ ctx, product, onClose, onAction }) {
  const c = useInventoryCopy(); const { can } = useRole(); const { formatMoney, formatNumber } = useLanguage();
  const [settings, setSettings] = useState({ min_stock: product.min_stock || 0, max_stock: product.max_stock || 0, pack_size: product.pack_size || 1, bin_location: product.bin_location || '' }); const [error, setError] = useState(null);
  const query = useQuery({ queryKey: ['retail-inventory', ctx.restaurantId, 'stock-detail', product.id], queryFn: async () => {
    const [lots, locations, ledger] = await Promise.all([
      supabase.from('retail_inventory_lots').select('*').eq('restaurant_id', ctx.restaurantId).eq('balance_id', product.id).neq('quantity', 0).order('expiry_date').limit(1000),
      supabase.from('retail_inventory_stock').select('*').eq('restaurant_id', ctx.restaurantId).eq('product_id', product.product_id).order('branch_name').limit(500),
      supabase.from('retail_inventory_ledger').select('*').eq('restaurant_id', ctx.restaurantId).eq('balance_id', product.id).order('created_at', { ascending: false }).limit(30),
    ]); const err = lots.error || locations.error || ledger.error; if (err) throw err; return { lots: lots.data, locations: locations.data, ledger: ledger.data };
  } });
  const save = async (e) => { e.preventDefault(); try { await ctx.run({ command: 'settings', payload: { ...settings, warehouse_id: product.warehouse_id, product_id: product.product_id } }); toast.success(c.success); } catch (err) { setError(err); } };
  return <Dialog open onOpenChange={(v) => !v && onClose()}><DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>{c.details}</DialogTitle><DialogDescription>{product.branch_name} · {product.warehouse_name}</DialogDescription></DialogHeader><ProductIdentity product={product} />{(error || query.error) && <ErrorNotice error={error || query.error} retry={query.refetch} />}
    <div className="grid grid-cols-3 gap-2 rounded-xl bg-blue-50 p-4 text-center text-blue-950">{[['onHand', product.on_hand], ['reserved', product.reserved], ['available', product.available]].map(([label, value]) => <div key={label}><p className="text-xs">{c[label]}</p><b className="text-xl">{formatNumber(value)}</b></div>)}</div>
    <h3 className="font-bold">{c.branches}</h3><div className="space-y-2">{query.data?.locations.map((row) => <div key={row.id} className="flex justify-between gap-2 rounded-xl border p-3 text-sm"><span>{row.branch_name} · {row.warehouse_name}</span><b>{formatNumber(row.available)} {row.unit}</b></div>)}</div>
    <h3 className="font-bold">{c.batches}</h3><p className="text-xs text-muted-foreground">{c.fefo}</p>{query.data?.lots.length ? query.data.lots.map((lot) => <div key={lot.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm"><div><b>{lot.batch_number || '—'}</b><p className="text-xs text-muted-foreground">{lot.expiry_date || '—'} · {formatNumber(lot.quantity)} {product.unit}</p></div>{lot.quarantined && <Status status="quarantine" />}{can?.updateInventory && <Button size="sm" variant="outline" onClick={() => { onClose(); onAction({ kind: 'adjustment', branch_id: product.branch_id, warehouse_id: product.warehouse_id, lines: [{ ...product, lot_id: lot.id, batch_number: lot.batch_number, expiry_date: lot.expiry_date, suggested_quantity: -Math.abs(Number(lot.quantity)) }] }); }}>{c.adjustment}</Button>}</div>) : <Empty />}
    {can?.updateInventory && <form onSubmit={save} className="space-y-3 rounded-2xl border p-4"><h3 className="font-bold">{c.settings}</h3><div className="grid grid-cols-2 gap-3">{[['min_stock', 'min'], ['max_stock', 'max'], ['pack_size', 'pack'], ['bin_location', 'location']].map(([key, label]) => <Field key={key} label={c[label]}><input className={fieldClass} type={key === 'bin_location' ? 'text' : 'number'} step="0.001" min={key === 'pack_size' ? '0.001' : '0'} required={key !== 'bin_location'} value={settings[key]} onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.value }))} /></Field>)}</div><Button disabled={ctx.busy} type="submit">{c.save}</Button></form>}
    <h3 className="font-bold">{c.movements} · 30</h3><div className="space-y-2">{query.data?.ledger.map((m) => <div key={m.id} className="flex justify-between gap-3 border-b py-2 text-xs"><div><b>{c[m.kind] || m.kind}</b><p className="text-muted-foreground">{m.reference_label}</p></div><div className="text-end"><b>{Number(m.quantity) > 0 ? '+' : ''}{formatNumber(m.quantity)}</b><p>{formatMoney(m.unit_cost)}</p></div></div>)}</div>
  </DialogContent></Dialog>;
}
export function InventorySettingsDialog({ ctx, config, onClose }) {
  const c = useInventoryCopy(); const [branch, setBranch] = useState(ctx.branchId || ''); const [text, setText] = useState(''); const [error, setError] = useState(null);
  const submit = async (e) => { e.preventDefault(); try { await ctx.run({ command: config.kind, payload: config.kind === 'warehouse' ? { branch_id: branch, name: text } : { lot_id: config.lot_id, notes: text } }); toast.success(c.success); onClose(); } catch (err) { setError(err); } };
  return <Dialog open onOpenChange={(v) => !v && !ctx.busy && onClose()}><DialogContent><DialogHeader><DialogTitle>{config.kind === 'warehouse' ? c.createWarehouse : c.release}</DialogTitle><DialogDescription>{config.kind === 'warehouse' ? c.warehouse : c.reasonRequired}</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-4">{error && <ErrorNotice error={error} />}{config.kind === 'warehouse' && <Field label={c.branch}><select required className={fieldClass} value={branch} onChange={(e) => setBranch(e.target.value)}><option value="">{c.branch}</option>{ctx.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>}<Field label={config.kind === 'warehouse' ? c.warehouseName : c.notes}><input required minLength={config.kind === 'warehouse' ? 1 : 3} maxLength={100} className={fieldClass} value={text} onChange={(e) => setText(e.target.value)} /></Field><Button disabled={ctx.busy} type="submit">{c.confirm}</Button></form></DialogContent></Dialog>;
}
