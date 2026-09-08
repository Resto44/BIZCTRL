import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Barcode, Loader2 } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { barcodeText } from '@/lib/barcodeCopy';
import { createProductBarcode } from '@/lib/productBarcodeRepository';
import { searchMasterProducts } from '@/lib/productCatalogRepository';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import BarcodeGenerator from './BarcodeGenerator';

export default function ProductBarcodeDialog({ restaurantId, initialProduct, onClose, onChanged }) {
  const { lang } = useLanguage();
  const queryClient = useQueryClient();
  const text = barcodeText(lang);
  const [product, setProduct] = useState(initialProduct || null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const alive = useRef(true);
  const pending = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (query === debouncedQuery) return undefined;
    const timer = setTimeout(() => { setDebouncedQuery(query); setPage(1); }, 250);
    return () => clearTimeout(timer);
  }, [query, debouncedQuery]);
  const products = useQuery({
    queryKey: ['barcode-product-picker', restaurantId, debouncedQuery, page],
    queryFn: () => searchMasterProducts({ restaurantId, query: debouncedQuery, page, pageSize: 20 }),
    enabled: Boolean(restaurantId) && !product,
    staleTime: 0,
  });
  const generate = async () => {
    if (!product?.id || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await createProductBarcode({ restaurantId, productId: product.id });
      if (alive.current) {
        setProduct((previous) => ({ ...previous, barcode: result.barcode }));
        setConfirmed(true);
      }
      await Promise.all([
        ...['products', 'erp-master-catalog', 'barcode-product-picker'].map((key) => queryClient.invalidateQueries({ queryKey: [key, restaurantId] })),
        onChanged?.(),
      ]);
    } catch (failure) {
      if (alive.current) setError(failure.message);
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const hasBarcode = typeof product?.barcode === 'string' && Boolean(product.barcode.trim());
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-1.5rem)] overflow-y-auto rounded-2xl sm:max-w-xl" dir={lang === 'ar' || lang === 'fa' ? 'rtl' : 'ltr'}>
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Barcode className="h-5 w-5 text-blue-600" />{text.create}</DialogTitle><DialogDescription>{text.internal}</DialogDescription></DialogHeader>
        {!product ? <div className="space-y-3">
          <Input aria-label={text.search} placeholder={text.search} value={query} onChange={(event) => setQuery(event.target.value)} />
          <p className="text-sm font-semibold">{text.choose}</p>
          {products.isPending ? <p role="status">{text.loading}</p> : products.isError ? <p role="alert" className="text-sm text-red-600">{products.error.message}</p> : <>
            {!products.data?.rows?.length && <p className="py-4 text-sm text-muted-foreground">{text.empty}</p>}
            <div className="max-h-[40dvh] space-y-2 overflow-y-auto">{products.data?.rows.map((row) => <button type="button" key={row.id} className="block min-h-14 w-full rounded-xl border p-3 text-start hover:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500" onClick={() => { setProduct(row.product_data || row); setConfirmed(false); setError(''); }}><span className="block truncate font-semibold" dir="auto">{row.name}</span><span className="block truncate font-mono text-xs text-muted-foreground" dir="ltr">{row.barcode || row.sku}</span></button>)}</div>
            <div className="flex items-center justify-between gap-2"><Button type="button" variant="outline" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>{text.previous}</Button><span className="text-sm">{page}</span><Button type="button" variant="outline" disabled={page * 20 >= (products.data?.total || 0)} onClick={() => setPage((current) => current + 1)}>{text.next}</Button></div>
          </>}
        </div> : <div className="space-y-4">
          <div className="rounded-xl bg-muted/50 p-3"><p className="font-bold" dir="auto">{product.name}</p><p className="font-mono text-xs text-muted-foreground" dir="ltr">{product.sku}</p><Button type="button" size="sm" variant="link" className="px-0" disabled={busy} onClick={() => { setProduct(null); setConfirmed(false); setError(''); }}>{text.change}</Button></div>
          {hasBarcode ? <><p role="status" className="text-sm text-emerald-700">{confirmed ? text.saved : text.preserved}</p><BarcodeGenerator key={product.id} product={product} saved /></> : <div className="rounded-xl border border-dashed p-5 text-center"><Barcode className="mx-auto mb-3 h-10 w-10 text-blue-600" /><p className="mb-4 text-sm text-muted-foreground">{text.noCode}</p><Button type="button" className="min-h-11 w-full" disabled={busy} onClick={generate}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{busy ? text.busy : text.generateSave}</Button></div>}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </div>}
      </DialogContent>
    </Dialog>
  );
}
