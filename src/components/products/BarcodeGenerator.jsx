import { useMemo, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { barcodeText } from '@/lib/barcodeCopy';
import { barcodeDataUrl, downloadBarcodePng, labelPrintHtml, LABEL_SIZES } from '@/lib/barcodeLabels';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function BarcodeGenerator({ product, saved = false }) {
  const { lang, formatMoney } = useLanguage();
  const text = barcodeText(lang);
  const [size, setSize] = useState('60x40');
  const [copies, setCopies] = useState('1');
  const [showPrice, setShowPrice] = useState(false);
  const [error, setError] = useState('');
  const image = useMemo(() => {
    try { return barcodeDataUrl(product?.barcode); } catch { return null; }
  }, [product?.barcode]);
  const validCopies = Number.isInteger(Number(copies)) && Number(copies) >= 1 && Number(copies) <= 100;
  const priceValue = product?.selling_price ?? product?.default_price;
  const price = showPrice && priceValue != null && Number.isFinite(Number(priceValue)) ? formatMoney(Number(priceValue)) : '';
  const print = () => {
    if (!saved || !image || !validCopies) return;
    try {
      const html = labelPrintHtml({ product, size, copies: Number(copies), price, printText: text.print });
      const target = window.open('', '_blank');
      if (!target) { setError(text.popup); return; }
      target.opener = null;
      target.document.write(html);
      target.document.close();
      setError('');
    } catch { setError(text.invalid); }
  };
  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-3 text-center text-black">
        <p className="truncate text-sm font-semibold" dir="auto">{product?.name_ar || product?.name}</p>
        {product?.name_en && <p className="truncate text-xs" dir="auto">{product.name_en}</p>}
        {image ? <img src={image} alt={product.barcode} className="mx-auto h-28 max-w-full object-contain" /> : <p role="alert" className="py-6 text-sm text-red-600">{text.invalid}</p>}
        {price && <p className="font-bold">{price}</p>}
      </div>
      {!saved && <p className="text-sm text-amber-700">{text.draft}</p>}
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-sm">{text.size}<select value={size} onChange={(event) => setSize(event.target.value)} className="h-11 w-full rounded-md border bg-background px-2" aria-label={text.size}>{Object.keys(LABEL_SIZES).map((key) => <option key={key} value={key}>{key.replace('x', ' × ')} mm</option>)}</select></label>
        <label className="space-y-1 text-sm">{text.copies}<Input aria-label={text.copies} type="number" min="1" max="100" step="1" value={copies} onChange={(event) => setCopies(event.target.value)} /></label>
      </div>
      {priceValue != null && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={showPrice} onChange={(event) => setShowPrice(event.target.checked)} />{text.price}</label>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        <Button type="button" variant="outline" className="min-h-11" disabled={!saved || !image} onClick={() => { try { downloadBarcodePng(product.barcode); setError(''); } catch { setError(text.invalid); } }}><Download className="mr-2 h-4 w-4" />{text.download}</Button>
        <Button type="button" className="min-h-11" disabled={!saved || !image || !validCopies} onClick={print}><Printer className="mr-2 h-4 w-4" />{text.print}</Button>
      </div>
    </div>
  );
}
