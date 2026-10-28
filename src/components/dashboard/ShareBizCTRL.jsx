import React, { useState } from 'react';
import { Copy, MessageCircle, Share2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { SAAS_SHARE_COPY, SAAS_SHARE_IMAGE, SAAS_SHARE_URL, whatsappShareHref } from '@/lib/saasShare';

export default function ShareBizCTRL({ lang = 'en', compact = false }) {
  const copy = SAAS_SHARE_COPY[lang] || SAAS_SHARE_COPY.en;
  const [message, setMessage] = useState(copy.message);
  const [status, setStatus] = useState('');
  const rtl = lang === 'fa' || lang === 'ar';
  async function copyLink() {
    try { await navigator.clipboard.writeText(SAAS_SHARE_URL); setStatus(copy.copied); }
    catch { setStatus(copy.failed); }
  }
  return <Dialog onOpenChange={(open) => { if (open) { setMessage(copy.message); setStatus(''); } }}>
    <DialogTrigger asChild><button type="button" className={`${compact ? 'w-full px-2 text-xs' : 'mt-3 px-4 text-sm'} inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-background py-2 font-bold text-blue-700 dark:text-blue-300`}><Share2 className="h-4 w-4" />{copy.title}</button></DialogTrigger>
    <DialogContent dir={rtl ? 'rtl' : 'ltr'} className="max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-2xl p-5">
      <DialogHeader><DialogTitle>{copy.title}</DialogTitle><DialogDescription>{copy.hint}</DialogDescription></DialogHeader>
      <img src={SAAS_SHARE_IMAGE} width="1200" height="630" alt="BizCTRL — Business ERP" className="w-full rounded-xl" />
      <label className="grid gap-2 text-sm font-semibold">{copy.label}<textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={700} rows={3} className="w-full resize-y rounded-xl border border-input bg-background p-3 font-normal leading-7" /></label>
      <input aria-label={copy.copy} readOnly value={SAAS_SHARE_URL} dir="ltr" onFocus={(event) => event.target.select()} className="w-full min-w-0 rounded-xl border border-input bg-muted/40 p-3 text-sm" />
      <div className="grid gap-2 sm:grid-cols-2">
        <a href={whatsappShareHref(message)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 text-sm font-bold text-white hover:bg-emerald-800"><MessageCircle className="h-5 w-5" />{copy.whatsapp}</a>
        <button type="button" onClick={copyLink} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-input px-3 text-sm font-bold"><Copy className="h-4 w-4" />{copy.copy}</button>
      </div>
      <p role="status" aria-live="polite" className="text-sm">{status}</p>
      <p className="text-xs leading-6 text-muted-foreground">{copy.note}</p>
    </DialogContent>
  </Dialog>;
}
