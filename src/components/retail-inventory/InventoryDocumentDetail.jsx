import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useRole } from '@/lib/RoleContext';
import { useLanguage } from '@/lib/LanguageContext';
import { documentActions, inventoryRPC } from '@/lib/retailInventory';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, fieldClass, ErrorNotice, ProductIdentity, Status } from './InventoryUI';
import { useInventoryCopy } from './inventoryCopy';
export default function InventoryDocumentDetail({ ctx, document, onClose }) {
  const c = useInventoryCopy(); const { role, can, user } = useRole(); const { formatMoney, formatNumber, formatDate } = useLanguage();
  const [counts, setCounts] = useState({}); const [error, setError] = useState(null); const [confirm, setConfirm] = useState(null);
  const query = useQuery({ queryKey: ['retail-inventory', ctx.restaurantId, 'document', document.id], queryFn: () => inventoryRPC('document', { p_document_id: document.id }), enabled: Boolean(document.id), staleTime: 0 });
  const d = { ...document, ...query.data }; const lines = d.lines || [];
  const actions = documentActions(d, { owner: role === 'owner', edit: can?.updateInventory, purchase: can?.createPurchases, userId: user?.id, branchId: ctx.isBranchScoped ? ctx.branchId : null });
  const run = async (command) => { setError(null); try {
    if (d.kind === 'count' && ['save_count', 'submit'].includes(command)) {
      await ctx.run({ command: 'save_count', payload: { document_id: d.id, lines: lines.filter((l) => counts[l.id] !== undefined && counts[l.id] !== '').map((l) => ({ id: l.id, counted_quantity: Number(counts[l.id]) })) } });
    }
    if (command !== 'save_count') await ctx.run({ command, payload: { document_id: d.id } });
    setConfirm(null); setCounts({}); await query.refetch(); toast.success(c.success);
  } catch (err) { setError(err); setConfirm(null); } };
  return <Dialog open onOpenChange={(v) => !v && !ctx.busy && onClose()}><DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>{d.document_number || c.details}</DialogTitle><DialogDescription>{c[d.kind]} · {d.branch_name || c.branch} · {d.warehouse_name || c.source}{d.destination_name && ` → ${d.destination_name}`}</DialogDescription></DialogHeader><div className="flex items-center justify-between gap-2"><Status status={d.status} /><span className="text-xs text-muted-foreground">{formatDate(d.created_at)}</span></div>{d.notes && <p className="rounded-xl bg-muted p-3 text-sm">{d.notes}</p>}{(error || query.error) && <ErrorNotice error={error || query.error} retry={query.refetch} />}
    <div className="space-y-3">{lines.map((l) => <div key={l.id} className="rounded-xl border p-3"><ProductIdentity product={l} compact /><div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground"><span>{l.batch_number}</span><span>{l.expiry_date}</span></div>{d.kind === 'count' ? <div className="mt-3 grid grid-cols-3 items-end gap-2"><div><p className="text-[10px] text-muted-foreground">{c.expected}</p><b>{formatNumber(l.expected_quantity)}</b></div><Field label={c.counted}>{d.status === 'draft' ? <input className={fieldClass} type="number" min="0" step="0.001" value={counts[l.id] ?? l.counted_quantity ?? ''} disabled={!can?.updateInventory} onChange={(e) => setCounts((old) => ({ ...old, [l.id]: e.target.value }))} /> : <b>{l.counted_quantity ?? '—'}</b>}</Field><div><p className="text-[10px] text-muted-foreground">{c.variance}</p><b>{(counts[l.id] ?? l.counted_quantity) == null || counts[l.id] === '' ? '—' : formatNumber(Number(counts[l.id] ?? l.counted_quantity) - Number(l.expected_quantity))}</b></div></div> : <div className="mt-2 flex justify-between text-sm"><b>{formatNumber(Math.abs(l.quantity))} {l.unit}</b><span>{formatMoney(Math.abs(l.quantity) * l.unit_cost)}</span></div>}</div>)}</div>
    {confirm ? <div className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-950"><p className="font-bold">{c[confirm]}</p><p className="text-sm">{c.actionConfirm}</p><div className="flex gap-2"><Button disabled={ctx.busy} onClick={() => run(confirm)}>{ctx.busy ? c.pending : c.confirm}</Button><Button variant="outline" disabled={ctx.busy} onClick={() => setConfirm(null)}>{c.close}</Button></div></div> : <div className="sticky bottom-0 flex flex-wrap gap-2 bg-background py-2">{actions.map((a) => <Button key={a} variant={['cancel', 'reject'].includes(a) ? 'outline' : 'default'} disabled={ctx.busy || query.isFetching} className="rounded-xl" onClick={() => a === 'save_count' ? run(a) : setConfirm(a)}>{c[a]}</Button>)}</div>}
  </DialogContent></Dialog>;
}
