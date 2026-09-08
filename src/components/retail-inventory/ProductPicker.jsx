import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { searchMasterProducts } from '@/lib/productCatalogRepository';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { fieldClass, Empty, ErrorNotice, Pagination, ProductIdentity } from './InventoryUI';
import { useInventoryCopy } from './inventoryCopy';
export function ProductPicker({ ctx, open, onClose, onSelect, multiple = true }) {
  const c = useInventoryCopy(); const [search, setSearch] = useState(''); const [query, setQuery] = useState(''); const [page, setPage] = useState(1); const [selected, setSelected] = useState({});
  useEffect(() => { const timer = setTimeout(() => { setQuery(search); setPage(1); }, 250); return () => clearTimeout(timer); }, [search]);
  useEffect(() => { if (open) setSelected({}); }, [open]);
  const data = useQuery({ queryKey: ['retail-inventory', ctx.restaurantId, 'picker', query, page], queryFn: () => searchMasterProducts({ restaurantId: ctx.restaurantId, query, page, pageSize: 30, status: 'active' }), enabled: open && ctx.enabled, staleTime: 30000 });
  return <Dialog open={open} onOpenChange={(v) => !v && onClose()}><DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{c.selectProduct}</DialogTitle><DialogDescription>{c.search}</DialogDescription></DialogHeader><div className="relative"><Search className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" /><input autoFocus className={`${fieldClass} ps-9`} placeholder={c.search} value={search} onChange={(e) => setSearch(e.target.value)} /></div>{data.error ? <ErrorNotice error={data.error} retry={data.refetch} /> : <div className="space-y-2">{(data.data?.rows || []).map((p) => <button type="button" key={p.id} className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-start ${selected[p.id] ? 'border-primary bg-blue-50 dark:bg-blue-950' : ''}`} onClick={() => { if (!multiple) { onSelect([{ ...p.product_data, ...p }]); onClose(); } else setSelected((s) => { const next = { ...s }; if (next[p.id]) delete next[p.id]; else next[p.id] = { ...p.product_data, ...p }; return next; }); }}><ProductIdentity product={p} /><input type="checkbox" checked={Boolean(selected[p.id])} readOnly tabIndex={-1} aria-label={p.name} /></button>)}{!data.isFetching && !data.data?.rows?.length && <Empty>{c.noMaster}</Empty>}</div>}<Pagination page={page} total={data.data?.total || 0} onChange={setPage} busy={data.isFetching} />{multiple && <Button disabled={!Object.keys(selected).length || ctx.busy} onClick={async () => { try { await onSelect(Object.values(selected)); onClose(); } catch { /* The command owner reports the error and keeps the selection available for retry. */ } }}>{c.add} · {Object.keys(selected).length}</Button>}</DialogContent></Dialog>;
}
