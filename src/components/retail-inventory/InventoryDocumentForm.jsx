import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { inventoryRPC, productName, validateInventoryLines } from '@/lib/retailInventory';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ProductPicker } from './ProductPicker';
import { Field, fieldClass, ErrorNotice, ProductIdentity } from './InventoryUI';
import { useInventoryCopy } from './inventoryCopy';
const makeLine = (p) => ({ ...p, key: crypto.randomUUID(), product_id: p.product_id || p.id, quantity: p.suggested_quantity || 1, unit_cost: p.average_cost || p.purchase_cost || p.default_cost || 0, unit_mode: 'unit', batch_number: p.batch_number || '', expiry_date: p.expiry_date || '' });

export default function InventoryDocumentForm({ ctx, config, onClose, onCreated }) {
  const c = useInventoryCopy(); const { lang } = useLanguage();
  const [requestKey] = useState(() => crypto.randomUUID());
  const [branchId, setBranchId] = useState(config.branch_id || ctx.branchId || '');
  const [warehouseId, setWarehouseId] = useState(config.warehouse_id || ctx.warehouseId || '');
  const [destination, setDestination] = useState('');
  const [supplier, setSupplier] = useState(config.supplier_id || '');
  const [notes, setNotes] = useState(config.notes || '');
  const [lines, setLines] = useState(() => (config.lines || []).map(makeLine));
  const [picker, setPicker] = useState(false); const [error, setError] = useState(null);
  const [savedDocument, setSavedDocument] = useState(null);
  const kind = config.kind;
  const suppliers = useQuery({ queryKey: ['retail-inventory', ctx.restaurantId, 'suppliers'], queryFn: async () => { const { data, error: err } = await supabase.from('suppliers').select('id,name').eq('restaurant_id', ctx.restaurantId).order('name').limit(1000); if (err) throw err; return data; }, enabled: ['receipt', 'return', 'reorder'].includes(kind) });
  const po = useQuery({ queryKey: ['retail-inventory', ctx.restaurantId, 'order', config.order_id], queryFn: () => inventoryRPC('purchase_order', { p_order_id: config.order_id }), enabled: Boolean(config.order_id), staleTime: Infinity, refetchOnWindowFocus: false });
  useEffect(() => { if (!po.data) return; setBranchId(po.data.branch_id || ''); setSupplier(po.data.supplier_id || ''); setLines((po.data.lines || []).filter((l) => Number(l.remaining) > 0).map((l) => ({ ...makeLine(l), quantity: Number(l.remaining), unit_cost: Number(l.unit_price || 0) }))); }, [po.data]);
  const warehouses = ctx.snapshot.warehouses.filter((w) => w.branch_id === branchId);
  const selectedWarehouse = warehouses.find((w) => w.id === warehouseId) || warehouses.find((w) => w.is_default);
  const patch = (key, values) => setLines((old) => old.map((l) => l.key === key ? { ...l, ...values } : l));
  const chooseProducts = async (products) => {
    let stock = [];
    if (selectedWarehouse?.id) {
      const result = await supabase.from('retail_inventory_stock').select('product_id,pack_size,average_cost').eq('restaurant_id', ctx.restaurantId).eq('warehouse_id', selectedWarehouse.id).in('product_id', products.map((p) => p.id));
      if (result.error) { toast.error(result.error.message); throw result.error; }
      stock = result.data || [];
    }
    const byProduct = new Map(stock.map((row) => [row.product_id, row]));
    setLines((old) => [...old, ...products.map((p) => makeLine({ ...p, ...byProduct.get(p.id), product_id: p.id }))].slice(0, 100));
  };
  const create = async (e) => {
    e.preventDefault(); setError(null);
    if (!branchId) return setError(new Error(c.requiredBranch));
    if (kind !== 'count') { const problem = validateInventoryLines(kind, lines); if (problem) return setError(new Error(problem)); }
    try {
      const doc = savedDocument || await ctx.run({ command: 'create', requestKey, payload: { kind, branch_id: branchId, warehouse_id: selectedWarehouse?.id || null, destination_warehouse_id: destination || null, supplier_id: supplier || null, purchase_order_id: config.order_id || null, notes, product_ids: kind === 'count' ? lines.map((l) => l.product_id) : undefined,
        lines: lines.map((l) => ({ product_id: l.product_id, quantity: Number(l.quantity), unit_cost: Number(l.unit_cost), unit_mode: l.unit_mode, batch_number: l.batch_number, expiry_date: l.expiry_date || null, lot_id: l.lot_id || null })) } });
      setSavedDocument(doc);
      toast.success(c.success); onCreated?.(doc); onClose();
    } catch (err) { setError(err); }
  };
  return <><Dialog open onOpenChange={(v) => !v && !ctx.busy && onClose()}><DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>{c[kind]}</DialogTitle><DialogDescription>{kind === 'count' ? c.countHint : kind === 'receipt' ? c.actionConfirm : c.ownerReview}</DialogDescription></DialogHeader><form onSubmit={create} className="space-y-4" dir={lang === 'en' ? 'ltr' : 'rtl'}>
    <div className="grid gap-3 sm:grid-cols-2"><Field label={c.branch}><select required className={fieldClass} value={branchId} disabled={Boolean(config.order_id) || ctx.isBranchScoped} onChange={(e) => { setBranchId(e.target.value); setWarehouseId(''); }}><option value="">{c.branch}</option>{ctx.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field><Field label={c.warehouse}><select className={fieldClass} value={selectedWarehouse?.id || ''} onChange={(e) => setWarehouseId(e.target.value)}><option value="">{c.warehouse} · Main store</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field></div>
    {kind === 'transfer' && <Field label={c.destination}><select required className={fieldClass} value={destination} onChange={(e) => setDestination(e.target.value)}><option value="">{c.destination}</option>{ctx.snapshot.warehouses.filter((w) => w.id !== selectedWarehouse?.id).map((w) => <option key={w.id} value={w.id}>{ctx.branches.find((b) => b.id === w.branch_id)?.name} · {w.name}</option>)}</select>{ctx.snapshot.warehouses.length < 2 && <span>{c.noDestination}</span>}</Field>}
    {['receipt', 'return', 'reorder'].includes(kind) && <Field label={c.supplier}><select className={fieldClass} value={supplier} required={kind === 'reorder'} disabled={Boolean(config.order_id)} onChange={(e) => setSupplier(e.target.value)}><option value="">{c.optional}</option>{suppliers.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
    {config.order_id && <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-800">{c.linkedPO}: {po.data?.order_number || '…'}</p>}
    {(error || po.error || suppliers.error) && <ErrorNotice error={error || po.error || suppliers.error} />}
    <div className="space-y-3">{lines.map((l) => <div key={l.key} className="space-y-3 rounded-2xl border p-3"><div className="flex items-center justify-between gap-3"><ProductIdentity product={{ ...l, name: productName(l, lang) }} /><Button type="button" variant="ghost" size="icon" aria-label={c.remove} onClick={() => setLines((old) => old.filter((x) => x.key !== l.key))}><Trash2 className="h-4 w-4" /></Button></div>{kind !== 'count' && <><div className="grid grid-cols-2 gap-3 sm:grid-cols-3"><Field label={c.quantity}><input required type="number" step="0.001" min={kind === 'adjustment' ? undefined : '0.001'} className={fieldClass} value={l.quantity} onChange={(e) => patch(l.key, { quantity: e.target.value })} /></Field><Field label={c.unit}><select className={fieldClass} value={l.unit_mode} onChange={(e) => patch(l.key, { unit_mode: e.target.value })}><option value="unit">{l.unit || c.unit}</option>{Number(l.pack_size) > 1 && <option value="pack">{c.carton} × {l.pack_size}</option>}</select></Field><Field label={c.unitCost}><input type="number" min="0" step="0.000001" required className={fieldClass} value={l.unit_cost} onChange={(e) => patch(l.key, { unit_cost: e.target.value })} /></Field></div>{(kind === 'receipt' || kind === 'adjustment') && <div className="grid grid-cols-2 gap-3"><Field label={c.batch}><input className={fieldClass} required={kind === 'receipt' && l.batch_tracked} value={l.batch_number} onChange={(e) => patch(l.key, { batch_number: e.target.value })} /></Field><Field label={c.expiryDate}><input type="date" className={fieldClass} required={kind === 'receipt' && l.expiry_tracked} value={l.expiry_date} onChange={(e) => patch(l.key, { expiry_date: e.target.value })} /></Field></div>}</>}</div>)}</div>
    {!config.order_id && <Button type="button" variant="outline" className="w-full gap-2 rounded-xl" onClick={() => setPicker(true)} disabled={lines.length >= 100}><Plus className="h-4 w-4" />{c.addLine}{kind === 'count' && ` · ${c.optional}`}</Button>}
    {kind !== 'count' && <p className="text-xs text-muted-foreground">{c.baseCostHint}</p>}
    <Field label={c.notes}><textarea className={fieldClass} rows={3} placeholder={c.notesHint} value={notes} required={['return', 'adjustment'].includes(kind)} minLength={['return', 'adjustment'].includes(kind) ? 3 : undefined} onChange={(e) => setNotes(e.target.value)} /></Field>
    <div className="sticky bottom-0 flex gap-2 bg-background py-2"><Button className="flex-1 rounded-xl" disabled={ctx.busy || po.isFetching || Boolean(config.order_id && !po.data)} type="submit">{ctx.busy ? c.pending : c.create}</Button><Button type="button" variant="outline" onClick={onClose} disabled={ctx.busy}>{c.close}</Button></div>
  </form></DialogContent></Dialog><ProductPicker ctx={ctx} open={picker} onClose={() => setPicker(false)} onSelect={chooseProducts} /></>;
}
