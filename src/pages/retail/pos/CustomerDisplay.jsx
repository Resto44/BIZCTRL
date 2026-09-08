import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import { CheckCircle2, Monitor, Package, ShoppingBasket, WifiOff } from 'lucide-react';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/api/supabaseClient';
import { cashierRpc, money, productName } from '@/lib/retailCashier';
import { subscribeCashierBroadcast } from '@/lib/cashierBroadcast';
import { useLanguage } from '@/lib/LanguageContext';
import { cashierCopy } from '@/components/retail-pos/cashierCopy';

function DisplaySession({ token }) {
  const { lang } = useLanguage();
  const c = cashierCopy(lang);
  // Never borrow the cashier's logged-in session for a customer-facing screen.
  const client = useMemo(() => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'bizctrl-customer-display' } }), []);
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [lastSuccess, setLastSuccess] = useState(0);
  const [now, setNow] = useState(Date.now());
  const refreshRef = useRef(() => {});
  const fresh = lastSuccess > 0 && now - lastSuccess < 12000;
  const valid = /^[a-f0-9]{64}$/.test(token);
  useEffect(() => {
    if (!valid) return undefined;
    let cancelled = false; let busy = false;
    const refresh = async () => {
      if (busy || cancelled) return;
      busy = true;
      try {
        const result = await cashierRpc('customer_display', { p_token: token }, client);
        if (!cancelled) { setData(result); setError(false); setLastSuccess(Date.now()); setNow(Date.now()); }
      } catch (e) {
        if (!cancelled && e.code === '42501') { setError(true); setData(null); setLastSuccess(0); }
      } finally { busy = false; }
    };
    refreshRef.current = refresh;
    void refresh();
    const timer = setInterval(refresh, 5000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    window.addEventListener('online', refresh);
    const offline = () => setLastSuccess(0);
    window.addEventListener('offline', offline);
    return () => { cancelled = true; clearInterval(timer); clearInterval(clock); window.removeEventListener('online', refresh); window.removeEventListener('offline', offline); };
  }, [client, token, valid]);
  useEffect(() => {
    if (!data?.topic) return undefined;
    let timer;
    const unsubscribe = subscribeCashierBroadcast(client, `customer-display:${data.topic}`, status => {
      if (status === 'changed' || status === 'SUBSCRIBED') { clearTimeout(timer); timer = setTimeout(() => void refreshRef.current(), 120); }
    });
    return () => { clearTimeout(timer); unsubscribe(); };
  }, [client, data?.topic]);
  const currency = data?.currency || 'SAR';
  const visible = fresh && !error ? data : null;
  return <main dir={lang === 'ar' || lang === 'fa' ? 'rtl' : 'ltr'} className="min-h-dvh bg-[#f3f6fb] p-4 text-slate-950 sm:p-8 lg:p-12">
    <div className="mx-auto max-w-[1550px]">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white"><ShoppingBasket size={30} /></span><div><p className="text-xs font-bold tracking-[.18em] text-blue-600">BIZCTRL · RETAIL</p><h1 className="text-2xl font-black sm:text-3xl">{data?.business_name || c.customerTitle}</h1><p className="text-sm text-slate-500">{data?.branch_name} {data?.device_code ? `· ${data.device_code}` : ''}</p></div></div><span className={`rounded-full px-4 py-2 text-sm font-bold ${visible ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{visible ? c.updated : c.stale}</span></header>
      {(!valid || error) ? <section role="alert" className="rounded-3xl border bg-white p-12 text-center"><Monitor className="mx-auto mb-5 h-16 w-16 text-slate-300" /><h2 className="text-xl font-bold">{c.displayInvalid}</h2></section> : !visible ? <section role="status" className="rounded-3xl border bg-white p-16 text-center"><WifiOff className="mx-auto mb-6 h-12 w-12 text-amber-500" /><p className="text-2xl font-bold">{c.stale}</p></section> : <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b p-6"><h2 className="text-xl font-black">{c.customerTitle}</h2><span className="text-slate-500">{visible.units} {c.units}</span></div>
          {!visible.lines?.length && <div className="p-16 text-center text-slate-500"><ShoppingBasket className="mx-auto mb-5 h-16 w-16 text-blue-200" /><p className="text-xl">{c.waiting}</p></div>}
          <div className="divide-y px-4 sm:px-6" aria-live="polite">{visible.lines?.map((line, index) => <div key={line.product_id} className={`flex items-center gap-4 py-5 ${index === visible.lines.length - 1 && visible.status === 'open' ? 'bg-blue-50/70' : ''}`}><div className="hidden h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-slate-50 sm:flex"><Package className="text-blue-500" size={28} /></div><div className="min-w-0 flex-1"><p className="text-base font-bold sm:text-xl">{productName(line, lang)}</p><p className="mt-1 text-sm text-slate-500" dir="ltr">{line.quantity} × {money(line.unit_price, currency)}</p></div><strong className="text-lg tabular-nums sm:text-2xl" dir="ltr">{money(line.line_total, currency)}</strong></div>)}</div>
        </section>
        <aside className="overflow-hidden rounded-3xl bg-[#102444] text-white shadow-xl lg:sticky lg:top-8"><div className="p-7"><p className="text-sm font-semibold text-blue-200">{c.total}</p><p className="mt-3 break-words text-5xl font-black tracking-tight tabular-nums" dir="ltr">{money(visible.net_total, currency)}</p><div className="mt-8 space-y-4 border-t border-white/15 pt-6 text-sm text-slate-300"><div className="flex justify-between gap-4"><span>{c.subtotal}</span><span dir="ltr">{money(visible.subtotal, currency)}</span></div><div className="flex justify-between gap-4"><span>{c.tax}</span><span dir="ltr">{money(visible.tax_total, currency)}</span></div></div></div><div className={`px-7 py-6 ${visible.status === 'paid' ? 'bg-emerald-500' : 'bg-blue-600'}`}>{visible.status === 'paid' ? <><CheckCircle2 size={30} /><h2 className="mt-3 text-2xl font-black">{c.paid}</h2><p className="mt-2 text-sm">{c.thankYou}</p></> : <p className="font-semibold">{c.updated}</p>}</div></aside>
      </div>}
    </div>
  </main>;
}

export default function CustomerDisplay() {
  const { hash } = useLocation();
  const token = hash.slice(1);
  return <DisplaySession key={token} token={token} />;
}
