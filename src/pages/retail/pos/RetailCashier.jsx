import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Banknote, CheckCircle2, ChevronLeft, ChevronRight, CirclePause, CreditCard, Monitor, Package, Plus, Printer, Receipt, RefreshCw, ScanLine, Search, ShieldCheck, ShoppingBasket, Trash2, X } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { useTenant } from '@/lib/TenantContext';
import { useRole } from '@/lib/RoleContext';
import { useLanguage } from '@/lib/LanguageContext';
import { useRetailCashier } from '@/hooks/useRetailCashier';
import { cashierRpc, money, paymentBreakdown, printCashierReceipt, productName } from '@/lib/retailCashier';
import { normalizeBarcode } from '@/lib/barcodeScanner';
import { cashierCopy } from '@/components/retail-pos/cashierCopy';
import BarcodeScanDialog from '@/components/shared/BarcodeScanDialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const field = 'h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-white';
const secondary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200';
const primary = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-bold text-white hover:bg-blue-700 disabled:opacity-40';
const panel = 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-5';
function Field({ label, children }) { return <label className="grid gap-2 text-sm font-semibold">{label}{children}</label>; }
function Totals({ cart, c, currency }) {
  return <div className="space-y-2 text-sm">
    <div className="flex justify-between gap-3 text-slate-500"><span>{c.subtotal}</span><span dir="ltr">{money(cart?.subtotal, currency)}</span></div>
    {Number(cart?.discount_total) > 0 && <div className="flex justify-between gap-3 text-emerald-600"><span>{c.discount} ({cart.discount_percent}%)</span><span dir="ltr">{money(cart.discount_total, currency)}</span></div>}
    <div className="flex justify-between gap-3 text-slate-500"><span>{c.tax}</span><span dir="ltr">{money(cart?.tax_total, currency)}</span></div>
    <div className="flex flex-wrap items-end justify-between gap-2 border-t pt-3"><strong className="text-lg">{c.total}</strong><strong className="text-3xl tabular-nums" dir="ltr">{money(cart?.net_total, currency)}</strong></div>
  </div>;
}

function CashierDialog({ modal, close, api, lang, c, currency, onReceipt, onPair, onNew }) {
  const [values, setValues] = useState({ cashier_name: '', opening_cash: '0', counted_cash: '', notes: '', reason: '', percent: '0', quantity: String(modal.line?.quantity ?? 1), mode: 'cash', cash: String(modal.cart?.net_total ?? 0), card: '0', confirmed: false, reference: '' });
  const [localError, setLocalError] = useState(null);
  const [paper, setPaper] = useState('80mm');
  const [copied, setCopied] = useState(false);
  const set = (key, value) => setValues(v => ({ ...v, [key]: value }));
  const textInput = (key, label, type = 'text', required = true) => <Field label={label}><input className={field} type={type} step={type === 'number' ? key === 'quantity' ? '0.001' : '0.01' : undefined} min={type === 'number' ? '0' : undefined} required={required} value={values[key]} onChange={e => set(key, e.target.value)} /></Field>;
  const cart = modal.cart;
  const payment = paymentBreakdown(cart?.net_total, values.mode, values.cash, values.card);
  const titles = { payment: c.pay, quantity: c.quantity, open: c.openShift, close: c.closeShift, discount: c.discount, cancel: c.cancel, receipt: modal.receipt?.transaction_type === 'refund' ? c.refundReceipt : c.receipt, refund: c.refund, display: c.display };
  const submit = async e => {
    e.preventDefault(); setLocalError(null);
    try {
      let result;
      if (modal.type === 'payment') result = await api.command('checkout', { cart_id: cart.id, revision: cart.revision, payment_confirmed: values.confirmed, payments: payment.payments.map(p => ({ ...p, reference: p.payment_method === 'cash' ? null : values.reference })) });
      if (modal.type === 'quantity') result = await api.command('quantity', { product_id: modal.line.product_id, quantity: Number(values.quantity) });
      if (modal.type === 'open') result = await api.command('open_shift', { cashier_name: values.cashier_name, opening_cash: Number(values.opening_cash) });
      if (modal.type === 'close') result = await api.command('close_shift', { counted_cash: Number(values.counted_cash), notes: values.notes });
      if (modal.type === 'discount') result = await api.command('discount', { percent: Number(values.percent), reason: values.reason });
      if (modal.type === 'cancel') { await api.command('cancel'); await onNew(); }
      if (modal.type === 'refund') result = await api.command('refund', { cart_id: modal.receipt.cart_id, reason: values.reason, payment_confirmed: values.confirmed });
      if (result?.receipt) onReceipt(result.receipt); else close();
    } catch (error) { setLocalError(error.message); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !api.busy) close(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl" dir={lang === 'en' ? 'ltr' : 'rtl'}>
      <DialogHeader><DialogTitle>{titles[modal.type]}</DialogTitle><DialogDescription>{modal.type === 'display' ? c.pairHint : modal.type === 'close' ? c.closeHint : modal.type === 'refund' ? c.refundHint : modal.type === 'discount' ? c.discountHint : modal.type === 'payment' ? c.reserve : modal.type === 'cancel' ? c.confirmCancel : c.title}</DialogDescription></DialogHeader>
      <form onSubmit={submit} className="grid gap-4">
        {modal.type === 'open' && <>{textInput('cashier_name', c.cashier)}{textInput('opening_cash', c.opening, 'number')}</>}
        {modal.type === 'close' && <><div className="rounded-xl bg-blue-50 p-4 text-blue-900">{c.expected}: {money(api.snapshot?.expected_cash, currency)}</div>{textInput('counted_cash', c.counted, 'number')}{values.counted_cash !== '' && <p>{c.difference}: {money(Number(values.counted_cash) - Number(api.snapshot?.expected_cash), currency)}</p>}{textInput('notes', c.notes, 'text', false)}</>}
        {modal.type === 'quantity' && <><p className="font-bold">{productName(modal.line, lang)}</p>{textInput('quantity', c.quantity, 'number')}</>}
        {modal.type === 'discount' && <>{textInput('percent', `${c.discount} %`, 'number')}{textInput('reason', c.notes)}</>}
        {modal.type === 'payment' && <>
          <Totals cart={cart} c={c} currency={currency} />
          <div className="grid grid-cols-3 gap-2">{['cash', 'mada', 'card', 'apple_pay', 'mixed'].map(mode => <button className={cn(secondary, values.mode === mode && 'border-blue-500 bg-blue-50 text-blue-700')} type="button" key={mode} onClick={() => set('mode', mode)}>{mode === 'cash' ? <Banknote size={18} /> : <CreditCard size={18} />}{c[mode]}</button>)}</div>
          {values.mode !== 'cash' && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{c.bankHint}</p>}
          {['cash', 'mixed'].includes(values.mode) && textInput('cash', c.cashReceived, 'number')}
          {values.mode === 'mixed' && textInput('card', c.cardAmount, 'number')}
          {values.mode !== 'cash' && textInput('reference', c.reference, 'text', false)}
          {payment.valid && <p className="rounded-xl bg-emerald-50 p-3 text-lg font-bold text-emerald-800">{c.change}: {money(payment.change, currency)}</p>}
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-5 w-5" checked={values.confirmed} onChange={e => set('confirmed', e.target.checked)} required />{c.confirmPayment}</label>
        </>}
        {modal.type === 'refund' && <><p className="break-all">{modal.receipt.receipt_number}</p><strong className="text-2xl">{money(modal.receipt.net_total, currency)}</strong>{textInput('reason', c.notes)}<label className="flex items-start gap-3 text-sm"><input type="checkbox" className="h-5 w-5" required checked={values.confirmed} onChange={e => set('confirmed', e.target.checked)} />{c.confirmRefund}</label></>}
        {modal.type === 'receipt' && <>
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-4 font-bold text-emerald-800"><CheckCircle2 />{modal.receipt.transaction_type === 'refund' ? c.refundReceipt : c.paid}</div>
          <div className="text-sm text-slate-500"><p className="break-all">{modal.receipt.receipt_number}</p><p>{modal.receipt.business?.branch_name} · {modal.receipt.device_code} · {modal.receipt.cashier_name}</p><p>{new Date(modal.receipt.occurred_at).toLocaleString()}</p></div>
          <div className="max-h-56 overflow-auto divide-y">{modal.receipt.lines?.map(line => <div key={line.product_id} className="flex items-start justify-between gap-3 py-3 text-sm"><div>{productName(line, lang)}<p className="text-slate-500">{line.quantity} × {money(line.unit_price, currency)}</p></div><strong dir="ltr">{money(line.line_total, currency)}</strong></div>)}</div>
          <Totals cart={modal.receipt} c={c} currency={currency} />
          <p>{c.change}: {money(modal.receipt.change, currency)}</p>
          <Field label={c.paper}><select className={field} value={paper} onChange={e => setPaper(e.target.value)}><option value="80mm">80 mm</option><option value="A4">A4</option></select></Field>
          <button className={primary} type="button" onClick={() => { try { printCashierReceipt(modal.receipt, lang, paper); } catch (e) { setLocalError(e.message); } }}><Printer size={20} />{c.print}</button>
          {api.snapshot?.can_manage && api.snapshot?.shift?.status === 'open' && modal.receipt.transaction_type === 'sale' && !modal.receipt.refunded && <button className={secondary} type="button" onClick={() => onReceipt(modal.receipt, 'refund')}>{c.refund}</button>}
          {modal.receipt.refunded && <p className="text-amber-700">{c.refunded}</p>}
          <button className={secondary} type="button" disabled={Boolean(api.busy || api.pending)} onClick={async () => { try { await onNew(); close(); } catch (e) { setLocalError(e.message); } }}>{c.newSale}</button>
        </>}
        {modal.type === 'display' && <>
          {modal.link && <><input className={field} value={modal.link} readOnly aria-label={c.display} dir="ltr" /><div className="flex flex-wrap gap-2"><button className={secondary} type="button" onClick={async () => { try { await navigator.clipboard.writeText(modal.link); setCopied(true); } catch { setLocalError('Select and copy the link manually.'); } }}>{copied ? c.copied : c.copy}</button><a className={primary} href={modal.link} target="_blank" rel="noopener noreferrer">{c.openDisplay}</a></div></>}
          <button className={primary} type="button" disabled={Boolean(api.busy || api.pending)} onClick={async () => { try { await onPair(); } catch (e) { setLocalError(e.message); } }}><Monitor size={18} />{c.pair}</button>
          <button className={secondary} type="button" disabled={Boolean(api.busy || api.pending)} onClick={async () => { try { await api.command('revoke_display'); close(); } catch (e) { setLocalError(e.message); } }}>{c.revoke}</button>
        </>}
        {localError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{localError}</p>}
        {!['receipt', 'display'].includes(modal.type) && <button className={primary} type="submit" disabled={Boolean(api.busy || api.pending || !api.connected || (modal.type === 'payment' && (!values.confirmed || !payment.valid)))}>{api.busy ? '…' : modal.type === 'payment' ? c.confirmSale : modal.type === 'refund' ? c.refund : modal.type === 'cancel' ? c.cancel : c.save}</button>}
      </form>
    </DialogContent>
  </Dialog>;
}

function CashierStation({ deviceId, scope, active, lang, c }) {
  const api = useRetailCashier(deviceId, scope, active);
  const [tab, setTab] = useState('sell');
  const [scan, setScan] = useState('');
  const [camera, setCamera] = useState(false);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(null);
  const [message, setMessage] = useState(null);
  const [mobileCart, setMobileCart] = useState(false);
  const inputRef = useRef(null);
  const snapshot = api.snapshot;
  const cart = snapshot?.cart && (!snapshot.cart.expires_at || new Date(snapshot.cart.expires_at).getTime() > Date.now()) ? snapshot.cart : null;
  const currency = snapshot?.business?.currency || 'SAR';
  const locked = ['locked', 'retired', 'maintenance'].includes(snapshot?.device?.status);
  const ready = snapshot?.shift?.status === 'open' && !locked && api.connected && !api.pending;
  const editable = ready && cart?.status === 'open';
  useEffect(() => { const timer = setTimeout(() => { setQuery(search); setPage(1); }, 250); return () => clearTimeout(timer); }, [search]);
  useEffect(() => { if (!active) { setCamera(false); setModal(null); } }, [active]);
  const catalog = useQuery({
    queryKey: ['cashier-catalog', scope, deviceId, query, page],
    queryFn: () => cashierRpc('cashier_catalog', { p_device_id: deviceId, p_query: query, p_page: page }),
    enabled: active && Boolean(snapshot), staleTime: 3000, refetchInterval: active ? 15000 : false, retry: 1,
  });
  const perform = async fn => { try { setMessage(null); const result = await fn(); void catalog.refetch(); return result; } catch (e) { setMessage(e.message); return null; } };
  const newSale = () => api.command('new_sale');
  const showReceipt = (receipt, type = 'receipt') => setModal({ type, receipt });
  const pair = async () => { const result = await api.command('pair_display'); setModal({ type: 'display', link: `${window.location.origin}/retail/customer-display#${result.token}` }); };
  const scanCode = code => {
    const normalized = normalizeBarcode(code);
    if (!normalized || !editable) return;
    setScan('');
    void perform(() => api.command('scan', { code: normalized }));
    inputRef.current?.focus();
  };
  return <>
    <section className={cn(panel, 'space-y-4')}>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-black sm:text-2xl">{c.title}</h1><p className="mt-1 text-sm text-slate-500">{snapshot?.business?.branch_name} · {snapshot?.device?.code} · {snapshot?.shift?.cashier_name}</p></div><div className="flex flex-wrap items-center gap-2"><span role="status" className={cn('rounded-full px-3 py-2 text-xs font-semibold', api.connected ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800')}>{api.connected ? c.live : c.offline}</span><button type="button" className={secondary} onClick={() => void api.refresh()} aria-label={c.refresh}><RefreshCw size={18} /></button><button type="button" className={secondary} disabled={!ready || Boolean(api.busy)} onClick={() => setModal({ type: 'display' })}><Monitor size={18} /><span>{c.display}</span>{snapshot?.display_connected && <span className="h-2 w-2 rounded-full bg-emerald-500" />}</button></div></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[['sell', ScanLine], ['orders', Receipt], ['stock', Package], ['shift', Banknote]].map(([key, Icon]) => <button type="button" key={key} className={cn(secondary, tab === key && 'border-blue-500 bg-blue-50 text-blue-700')} aria-pressed={tab === key} onClick={() => setTab(key)}><Icon size={18} />{c[key]}</button>)}</div>
    </section>
    {api.pending && <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950"><p>{c.pending}</p><button type="button" className={cn(secondary, 'mt-3')} disabled={Boolean(api.busy)} onClick={() => void perform(async () => { const result = await api.retry(); if (result?.receipt) showReceipt(result.receipt); })}>{c.retry}</button></div>}
    {(message || api.error) && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{message || api.error}</p>}
    {!snapshot && <p className="p-6 text-center text-slate-500">{api.error ? c.refresh : '…'}</p>}
    {snapshot && !snapshot.shift && <section className={cn(panel, 'flex flex-wrap items-center justify-between gap-4')}><p>{c.closed}</p><button type="button" className={primary} disabled={locked || Boolean(api.pending)} onClick={() => setModal({ type: 'open' })}><Plus size={20} />{c.openShift}</button></section>}
    {locked && <p role="alert" className="rounded-xl bg-red-50 p-4 font-semibold text-red-700">{c.blocked}</p>}
    {snapshot && ['sell', 'stock'].includes(tab) && <div className={cn('grid gap-4', tab === 'sell' && 'xl:grid-cols-[minmax(0,1fr)_390px] 2xl:grid-cols-[minmax(0,1fr)_450px]')}>
      <section className={cn(panel, mobileCart && tab === 'sell' && 'hidden xl:block')}>
        {tab === 'sell' && <form onSubmit={e => { e.preventDefault(); scanCode(scan); }} className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-3 dark:bg-blue-950/30"><label className="mb-2 block text-xs font-semibold text-blue-800 dark:text-blue-200" htmlFor={`scan-${deviceId}`}>{c.scanHint}</label><div className="flex gap-2"><input ref={inputRef} id={`scan-${deviceId}`} value={scan} onChange={e => setScan(e.target.value)} className={field} placeholder={c.scan} autoComplete="off" dir="ltr" disabled={!editable || Boolean(modal)} /><button type="submit" className={primary} disabled={!editable || !scan}><Plus size={20} /></button><button type="button" className={secondary} disabled={!editable} onClick={() => setCamera(true)} aria-label={c.scan}><ScanLine size={22} /></button></div></form>}
        <div className="relative"><Search className="pointer-events-none absolute start-3 top-3.5 text-slate-400" size={20} /><input aria-label={c.search} className={cn(field, 'ps-10')} placeholder={c.search} value={search} onChange={e => setSearch(e.target.value)} /></div>
        {catalog.error && <p role="alert" className="py-4 text-red-600">{catalog.error.message}</p>}
        {catalog.isLoading && <p className="py-8 text-center">…</p>}
        {!catalog.isLoading && !catalog.error && !catalog.data?.rows?.length && <div className="py-12 text-center text-slate-500"><Package className="mx-auto mb-3 h-12 w-12 text-slate-300" /><p>{c.noProducts}</p><Link to="/inventory" className="mt-4 inline-block font-bold text-blue-600">{c.inventory}</Link></div>}
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">{catalog.data?.rows?.map(product => <button type="button" key={product.id} disabled={tab === 'stock' || !editable || Number(product.available) <= 0 || product.serial_tracked} onClick={() => void perform(() => api.command('quantity', latest => ({ product_id: product.id, quantity: Number(latest?.lines?.find(l => l.product_id === product.id)?.quantity || 0) + 1 })))} className="group relative flex min-h-44 flex-col items-start rounded-2xl border border-slate-200 p-3 text-start transition hover:border-blue-400 hover:shadow-md disabled:cursor-default disabled:hover:shadow-none dark:border-slate-700">
          <span className="mb-3 flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-slate-50 dark:bg-slate-900">{product.image_url ? <img src={product.image_url} alt="" referrerPolicy="no-referrer" className="h-full w-full object-contain" loading="lazy" onError={e => { e.currentTarget.style.display = 'none'; }} /> : <Package size={28} className="text-blue-500" />}</span>
          <strong className="line-clamp-2 text-sm">{productName(product, lang)}</strong><span className="mt-1 text-[11px] text-slate-500">{product.sku}</span><span className="mb-2 mt-auto pt-3 font-bold text-blue-700 dark:text-blue-300" dir="ltr">{money(product.price, currency)}</span><span className={cn('text-xs', Number(product.available) > 0 ? 'text-emerald-600' : 'text-red-500')}>{c.available}: {Number(product.available).toLocaleString()} {product.unit}</span>{!product.includes_tax && Number(product.tax_rate) > 0 && <span className="mt-1 text-[10px] text-slate-500">+ {product.tax_rate}% {c.tax}</span>}
        </button>)}</div>
        <div className="mt-5 flex items-center justify-between"><button type="button" className={secondary} disabled={page === 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={16} />{c.previous}</button><span className="text-sm text-slate-400">{page}</span><button type="button" className={secondary} disabled={!catalog.data?.has_more} onClick={() => setPage(p => p + 1)}>{c.next}<ChevronRight size={16} /></button></div>
      </section>
      {tab === 'sell' && <aside className={cn(panel, 'flex flex-col self-start xl:sticky xl:top-24', !mobileCart && 'hidden xl:flex')}>
        <header className="mb-4 flex items-center justify-between"><div><h2 className="text-lg font-black">{c.invoice}</h2><p className="text-xs text-slate-500">{cart?.id?.slice(0, 8)} · {Number(cart?.units || 0)} {c.units}</p></div><button type="button" className={cn(secondary, 'xl:hidden')} onClick={() => setMobileCart(false)} aria-label={c.back}><X size={18} /></button></header>
        {!cart?.lines?.length && <div className="py-12 text-center text-sm text-slate-500"><ShoppingBasket size={44} className="mx-auto mb-3 text-slate-300" />{c.empty}</div>}
        <div className="max-h-[48dvh] overflow-y-auto divide-y">{cart?.lines?.map(line => <div key={line.product_id} className="py-3"><div className="flex items-start justify-between gap-3"><strong className="text-sm">{productName(line, lang)}</strong><button type="button" className="min-h-11 min-w-11 text-red-500 disabled:opacity-40" disabled={!editable || Boolean(api.busy)} aria-label={`${c.remove}: ${productName(line, lang)}`} onClick={() => void perform(() => api.command('quantity', { product_id: line.product_id, quantity: 0 }))}><Trash2 size={17} className="mx-auto" /></button></div><div className="flex items-center justify-between gap-2"><button type="button" className={cn(secondary, 'min-w-16')} disabled={!editable || Boolean(api.busy)} onClick={() => setModal({ type: 'quantity', line })}>{line.quantity} {line.unit}</button><span className="text-xs text-slate-500" dir="ltr">× {money(line.unit_price, currency)}</span><strong className="text-sm" dir="ltr">{money(line.line_total, currency)}</strong></div></div>)}</div>
        <div className="mt-4"><Totals cart={cart} c={c} currency={currency} /></div>
        <div className="mt-4 grid grid-cols-3 gap-2"><button type="button" className={secondary} disabled={!editable || Boolean(api.busy) || !cart?.lines?.length} onClick={() => void perform(async () => { await api.command('hold'); await newSale(); })}><CirclePause size={17} /><span className="text-xs">{c.hold}</span></button><button type="button" className={secondary} disabled={!editable || Boolean(api.busy) || !snapshot.can_manage} onClick={() => setModal({ type: 'discount' })}><span className="text-xs">{c.discount}</span></button><button type="button" className={secondary} disabled={!editable || Boolean(api.busy)} onClick={() => setModal({ type: 'cancel' })}><span className="text-xs text-red-500">{c.cancel}</span></button></div>
        {cart ? <button type="button" className={cn(primary, 'mt-3 w-full text-lg')} disabled={!editable || Boolean(api.busy) || !cart.lines?.length} onClick={() => setModal({ type: 'payment', cart })}><CreditCard size={22} />{c.pay}</button> : <button type="button" className={cn(primary, 'mt-3')} disabled={!ready || Boolean(api.busy)} onClick={() => void perform(newSale)}><Plus size={20} />{c.newSale}</button>}
        <p className="mt-3 text-xs leading-relaxed text-slate-400">{c.reserve}</p>
      </aside>}
    </div>}
    {snapshot && tab === 'orders' && <div className="grid gap-4 lg:grid-cols-2"><section className={panel}><h2 className="mb-4 font-black">{c.held} ({snapshot.held.length})</h2>{!snapshot.held.length && <p className="text-sm text-slate-500">{c.noOrders}</p>}{snapshot.held.map(held => <div key={held.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-4"><div><strong>{money(held.cart.net_total, currency)}</strong><p className="text-xs text-slate-500">{held.cart.units} {c.units} · {c.expires} {new Date(held.expires_at).toLocaleTimeString()}</p></div><div className="flex gap-2"><button type="button" className={secondary} disabled={!ready || Boolean(api.busy)} onClick={() => void perform(async () => { await api.command('resume', { cart_id: held.id, revision: held.cart.revision }); setTab('sell'); setMobileCart(true); })}>{c.resume}</button><button type="button" className={secondary} aria-label={c.cancel} disabled={!ready || Boolean(api.busy)} onClick={() => void perform(() => api.command('cancel', { cart_id: held.id, revision: held.cart.revision }))}><Trash2 size={18} /></button></div></div>)}</section><section className={panel}><h2 className="mb-4 font-black">{c.history}</h2>{!snapshot.receipts.length && <p className="text-sm text-slate-500">{c.noOrders}</p>}{snapshot.receipts.map(receipt => <button type="button" key={receipt.id} className="flex w-full items-center justify-between gap-3 border-b py-4 text-start" onClick={() => void perform(async () => showReceipt(await cashierRpc('cashier_receipt', { p_device_id: deviceId, p_transaction_id: receipt.id })))}><div className="min-w-0"><p className="truncate text-sm font-semibold">{receipt.receipt_number}</p><p className="text-xs text-slate-500">{receipt.transaction_type === 'refund' ? c.refundReceipt : c.receipt} · {new Date(receipt.created_at).toLocaleString()}</p></div><strong className="shrink-0 text-sm" dir="ltr">{money(receipt.net_total, currency)}</strong></button>)}</section></div>}
    {snapshot && tab === 'shift' && <section className={cn(panel, 'space-y-5')}><div className="flex items-center gap-3"><ShieldCheck className="text-blue-600" /><h2 className="text-lg font-black">{c.shift}</h2></div><div className="grid gap-3 sm:grid-cols-3">{[[c.cashier, snapshot.shift?.cashier_name || '—'], [c.opening, money(snapshot.shift?.opening_cash, currency)], [c.expected, money(snapshot.expected_cash, currency)]].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-4 dark:bg-slate-900"><p className="text-xs text-slate-500">{label}</p><strong className="mt-2 block text-xl">{value}</strong></div>)}</div>{snapshot.shift && <button type="button" className={primary} disabled={!ready || Boolean(api.busy)} onClick={() => setModal({ type: 'close' })}>{c.closeShift}</button>}<p className="text-sm text-slate-500">{c.closeHint}</p></section>}
    {snapshot && tab === 'sell' && <button type="button" className="fixed inset-x-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30 flex items-center justify-between gap-3 rounded-2xl bg-blue-600 px-5 py-4 font-bold text-white shadow-lg xl:hidden" onClick={() => setMobileCart(v => !v)}><span className="flex items-center gap-2"><ShoppingBasket size={22} />{mobileCart ? c.sell : c.invoice} ({cart?.units || 0})</span><span dir="ltr">{money(cart?.net_total, currency)}</span></button>}
    <BarcodeScanDialog open={camera && active} onOpenChange={setCamera} onScan={scanCode} />
    {modal && active && <CashierDialog key={`${modal.type}:${modal.receipt?.id || modal.line?.product_id || ''}`} modal={modal} close={() => setModal(null)} api={api} lang={lang} c={c} currency={currency} onReceipt={showReceipt} onPair={pair} onNew={newSale} />}
  </>;
}

export default function RetailCashier() {
  const { activeRestaurant } = useTenant();
  const { user } = useRole();
  const { lang } = useLanguage();
  const c = cashierCopy(lang);
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const active = location.pathname === '/retail/cashier';
  const scope = `${activeRestaurant?.id}:${user?.id}`;
  const devices = useQuery({ queryKey: ['cashier-devices', scope], enabled: active && Boolean(activeRestaurant?.id), queryFn: async () => {
    const { data, error } = await supabase.from('retail_pos_devices').select('id, code, display_name, branch_id, branches(name)').eq('restaurant_id', activeRestaurant.id).order('code');
    if (error) throw error; return data || [];
  } });
  const requested = params.get('device');
  const selected = devices.data?.find(d => d.id === requested)?.id || (!requested ? devices.data?.[0]?.id : null);
  return <div className="mx-auto w-full max-w-[1720px] space-y-4 pb-44 text-slate-950 dark:text-white xl:pb-12" dir={lang === 'ar' || lang === 'fa' ? 'rtl' : 'ltr'}>
    <div className="flex flex-wrap items-end justify-between gap-3"><label className="grid w-full gap-1 text-xs font-semibold text-slate-500 sm:max-w-md">{c.device}<select className={field} value={selected || ''} onChange={e => setParams({ device: e.target.value })}><option value="" disabled>{c.device}</option>{devices.data?.map(d => <option key={d.id} value={d.id}>{d.branches?.name} · {d.code} · {d.display_name}</option>)}</select></label><Link to="/retail/pos-control" className={secondary}><Monitor size={18} />{c.control}</Link></div>
    {devices.error && <p role="alert" className="text-red-600">{devices.error.message}</p>}
    {!devices.isLoading && !selected && <p className={panel}>{c.noDevice}</p>}
    {selected && <CashierStation key={`${scope}:${selected}`} scope={scope} deviceId={selected} active={active} lang={lang} c={c} />}
  </div>;
}
