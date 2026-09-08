import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Camera, ImagePlus, Loader2, ScanLine } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { decodeBarcodePhoto, normalizeBarcode, startBarcodeCamera } from '@/lib/barcodeScanner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const COPY = {
  en: {
    title: 'Scan barcode', hint: 'Point the rear camera at the whole barcode in good light.',
    starting: 'Opening camera… Allow camera access when asked.', scanning: 'Hold the barcode steady inside the frame.',
    paused: 'Camera stopped', restart: 'Open camera', stop: 'Stop camera', photo: 'Take / choose photo', reading: 'Reading photo…',
    code: 'Barcode or SKU', manual: 'Type a code, or use a USB / Bluetooth scanner and press Enter.', submit: 'Use code',
    permission: 'Camera access was denied. Allow it in your browser settings, then tap Open camera. You can also use a photo or enter the code.',
    noCamera: 'No camera was found. Use a photo or enter the code.', busyCamera: 'The camera is in use. Close the other camera app and try again.',
    secure: 'The camera needs a secure HTTPS connection. You can still use a photo or enter the code.',
    unavailable: 'Camera access is unavailable in this browser. Use a photo or enter the code.',
    cameraError: 'The camera stopped. Tap Open camera to try again, or use a photo.',
    decoderError: 'The scanner could not load. Check your connection and try again, or enter the code.',
    noBarcode: 'No barcode found. Take a closer, clearer photo with the whole barcode visible.',
    photoError: 'This photo could not be read. Try a JPG or PNG photo, or enter the code.', size: 'Choose a photo smaller than 10 MB.',
  },
  ar: {
    title: 'مسح الباركود', hint: 'وجّه الكاميرا الخلفية نحو الباركود بالكامل في إضاءة جيدة.',
    starting: 'جارٍ فتح الكاميرا… اسمح بالوصول عند الطلب.', scanning: 'ثبّت الباركود داخل الإطار.',
    paused: 'الكاميرا متوقفة', restart: 'فتح الكاميرا', stop: 'إيقاف الكاميرا', photo: 'التقاط / اختيار صورة', reading: 'جارٍ قراءة الصورة…',
    code: 'الباركود أو SKU', manual: 'أدخل الرمز، أو استخدم ماسح USB / Bluetooth واضغط Enter.', submit: 'استخدام الرمز',
    permission: 'تم رفض إذن الكاميرا. اسمح به من إعدادات المتصفح ثم افتح الكاميرا. يمكنك أيضاً استخدام صورة أو إدخال الرمز.',
    noCamera: 'لم يتم العثور على كاميرا. استخدم صورة أو أدخل الرمز.', busyCamera: 'الكاميرا مستخدمة. أغلق تطبيق الكاميرا الآخر وحاول مجدداً.',
    secure: 'تحتاج الكاميرا إلى اتصال HTTPS آمن. يمكنك استخدام صورة أو إدخال الرمز.', unavailable: 'الكاميرا غير متاحة في هذا المتصفح. استخدم صورة أو أدخل الرمز.',
    cameraError: 'توقفت الكاميرا. افتحها مجدداً أو استخدم صورة.', decoderError: 'تعذر تحميل الماسح. تحقق من الاتصال وحاول مجدداً أو أدخل الرمز.',
    noBarcode: 'لم يتم العثور على باركود. التقط صورة أوضح وأقرب للباركود بالكامل.', photoError: 'تعذرت قراءة الصورة. جرّب صورة JPG أو PNG أو أدخل الرمز.', size: 'اختر صورة أصغر من 10 ميغابايت.',
  },
  fa: {
    title: 'اسکن بارکد', hint: 'کمرهٔ عقب را در روشنایی مناسب به طرف تمام بارکد بگیرید.',
    starting: 'کمره باز می‌شود… در صورت درخواست، اجازهٔ کمره را بدهید.', scanning: 'بارکد را داخل کادر ثابت نگه دارید.',
    paused: 'کمره خاموش است', restart: 'بازکردن کمره', stop: 'خاموش‌کردن کمره', photo: 'گرفتن / انتخاب عکس', reading: 'در حال خواندن عکس…',
    code: 'بارکد یا SKU', manual: 'کد را وارد کنید یا با اسکنر USB / Bluetooth اسکن کرده Enter بزنید.', submit: 'استفاده از کد',
    permission: 'اجازهٔ کمره داده نشد. از تنظیمات مرورگر اجازه بدهید و دوباره کمره را باز کنید. عکس یا ورود دستی کد هم قابل استفاده است.',
    noCamera: 'کمره پیدا نشد. عکس یا کد را وارد کنید.', busyCamera: 'کمره مصروف است. برنامهٔ دیگر کمره را ببندید و دوباره کوشش کنید.',
    secure: 'کمره به اتصال امن HTTPS ضرورت دارد. می‌توانید عکس یا کد را وارد کنید.', unavailable: 'کمره در این مرورگر در دسترس نیست. عکس یا کد را وارد کنید.',
    cameraError: 'کمره متوقف شد. دوباره باز کنید یا عکس استفاده کنید.', decoderError: 'اسکنر لود نشد. اتصال را بررسی و دوباره کوشش کنید یا کد را وارد کنید.',
    noBarcode: 'بارکد پیدا نشد. عکس واضح‌تر و نزدیک‌تر از تمام بارکد بگیرید.', photoError: 'عکس خوانده نشد. عکس JPG یا PNG استفاده کنید یا کد را وارد کنید.', size: 'عکس کوچک‌تر از ۱۰ مگابایت انتخاب کنید.',
  },
};

function ScannerContent({ onScan, onClose }) {
  const { lang } = useLanguage();
  const c = COPY[lang] || COPY.en;
  const [code, setCode] = useState('');
  const [status, setStatus] = useState('starting');
  const [error, setError] = useState(null);
  const [cameraOn, setCameraOn] = useState(true);
  const [photoBusy, setPhotoBusy] = useState(false);
  const videoRef = useRef(null);
  const codeRef = useRef(null);
  const fileRef = useRef(null);
  const sessionRef = useRef(null);
  const photoRef = useRef(null);
  const completed = useRef(false);
  const callbacks = useRef({ onScan, onClose });
  callbacks.current = { onScan, onClose };

  const finish = (raw) => {
    const value = normalizeBarcode(raw);
    if (!value || completed.current) return;
    completed.current = true;
    sessionRef.current?.stop();
    photoRef.current?.abort();
    callbacks.current.onClose();
    callbacks.current.onScan(value);
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  useEffect(() => {
    if (!cameraOn) return;
    setError(null);
    const session = startBarcodeCamera(videoRef.current, {
      onResult: (value) => finishRef.current(value),
      onState: setStatus,
      onError: (key) => { setError(key); setStatus('paused'); setCameraOn(false); },
    });
    sessionRef.current = session;
    return () => session.stop();
  }, [cameraOn]);

  useEffect(() => {
    // Keyboard-wedge scanners need focus; avoid opening the phone keyboard over
    // the camera preview on touch devices.
    if (window.matchMedia?.('(pointer: fine)').matches) codeRef.current?.focus();
    const pause = () => { sessionRef.current?.stop(); setCameraOn(false); setStatus('paused'); };
    const visibility = () => { if (document.hidden) pause(); };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', pause);
    return () => {
      sessionRef.current?.stop();
      photoRef.current?.abort();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', pause);
    };
  }, []);

  const readPhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError('size'); return; }
    sessionRef.current?.stop();
    setCameraOn(false);
    setStatus('paused');
    photoRef.current?.abort();
    const controller = new AbortController();
    photoRef.current = controller;
    setPhotoBusy(true);
    setError(null);
    try {
      const value = await decodeBarcodePhoto(file, controller.signal);
      if (!controller.signal.aborted) { if (value) finish(value); else setError('noBarcode'); }
    } catch { if (!controller.signal.aborted) setError('photoError'); }
    finally { if (!controller.signal.aborted) setPhotoBusy(false); }
  };

  return <div dir={['ar', 'fa'].includes(lang) ? 'rtl' : 'ltr'} className="space-y-4">
    <DialogHeader className="text-start pe-6"><DialogTitle className="flex items-center gap-2"><ScanLine className="h-5 w-5 text-primary" />{c.title}</DialogTitle><DialogDescription>{c.hint}</DialogDescription></DialogHeader>
    <div className="relative aspect-[16/9] overflow-hidden rounded-2xl bg-slate-950">
      <video ref={videoRef} muted playsInline autoPlay aria-label={c.title} className="h-full w-full object-cover" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-6 inset-y-8 rounded-xl border-2 border-white/80" />
      {!cameraOn && <div className="absolute inset-0 grid place-items-center text-white"><Camera className="h-9 w-9 opacity-60" /></div>}
    </div>
    <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">{cameraOn && status === 'starting' && <Loader2 className="h-4 w-4 animate-spin" />}{photoBusy ? c.reading : c[status]}</p>
    {error && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">{c[error]}</p>}
    <div className="grid grid-cols-2 gap-2">
      <Button type="button" variant="outline" disabled={photoBusy} className="h-auto min-h-11 gap-2 whitespace-normal rounded-xl" onClick={() => { if (cameraOn) { sessionRef.current?.stop(); setStatus('paused'); } setCameraOn(!cameraOn); }}><Camera className="h-4 w-4 shrink-0" />{cameraOn ? c.stop : c.restart}</Button>
      <Button type="button" variant="outline" disabled={photoBusy} className="h-auto min-h-11 gap-2 whitespace-normal rounded-xl" onClick={() => { sessionRef.current?.stop(); setCameraOn(false); setStatus('paused'); fileRef.current?.click(); }}><ImagePlus className="h-4 w-4 shrink-0" />{c.photo}</Button>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" aria-label={c.photo} className="hidden" onChange={readPhoto} />
    </div>
    <form className="space-y-2 border-t pt-4" onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); finish(code); }}>
      <label htmlFor="scanner-barcode" className="block text-sm font-semibold">{c.code}</label>
      <div className="flex gap-2"><Input ref={codeRef} id="scanner-barcode" dir="ltr" value={code} onChange={(event) => setCode(event.target.value)} placeholder="0123456789012" maxLength={200} autoComplete="off" autoCapitalize="off" spellCheck={false} className="min-w-0 font-mono" /><Button type="submit" disabled={!normalizeBarcode(code)}>{c.submit}</Button></div>
      <p className="text-xs text-muted-foreground">{c.manual}</p>
    </form>
  </div>;
}

export default function BarcodeScanDialog({ open, onOpenChange, onScan }) {
  const location = useLocation();
  const origin = useRef(null);
  // Workspace tabs remain mounted when hidden. Never keep a camera or portal
  // alive on another route, even during the frame before effect cleanup.
  const active = open && (origin.current === null || origin.current === location.pathname);
  useEffect(() => {
    if (!open) origin.current = null;
    else if (origin.current === null) origin.current = location.pathname;
    else if (origin.current !== location.pathname) onOpenChange(false);
  }, [open, location.pathname, onOpenChange]);
  return <Dialog open={active} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl p-4 sm:p-6" onOpenAutoFocus={(event) => event.preventDefault()}>
      {active && <ScannerContent onScan={onScan} onClose={() => onOpenChange(false)} />}
    </DialogContent>
  </Dialog>;
}
