import React, { useEffect, useRef, useState } from 'react';
import { BrowserQRCodeReader } from '@zxing/browser';
import { Camera, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/LanguageContext';

// Local packaged scanner; does not download executable JS from a public CDN.
export default function QRScanner({ onScan, onClose }) {
  const { translateLiteral: tr } = useLanguage();
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const activeRef = useRef(true);
  const acceptedRef = useRef(false);
  const [error, setError] = useState('');
  const [manualCode, setManualCode] = useState('');

  useEffect(() => {
    activeRef.current = true;
    acceptedRef.current = false;
    const reader = new BrowserQRCodeReader();
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera unavailable');
        const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current,
          (result, _error, scannerControls) => {
            if (!result || acceptedRef.current || !activeRef.current) return;
            acceptedRef.current = true;
            scannerControls?.stop();
            controlsRef.current?.stop();
            onScan(result.getText());
          });
        if (activeRef.current) controlsRef.current = controls;
        else controls.stop();
      } catch {
        if (activeRef.current) setError(tr('Camera permission unavailable. Enter code manually.'));
      }
    };
    start();
    return () => {
      activeRef.current = false;
      controlsRef.current?.stop();
    };
    // A scanner session must remain stable while the modal is mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitManual = () => {
    const code = manualCode.trim();
    if (!code || acceptedRef.current) return;
    acceptedRef.current = true;
    controlsRef.current?.stop();
    onScan(code);
  };
  return (
    <div className="flex max-h-[85dvh] flex-col gap-3 overflow-y-auto p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Camera className="h-4 w-4" />{tr('Scan Employee QR Code')}</h2>
        <Button type="button" size="icon" variant="ghost" aria-label={tr('Close')}
          onClick={() => { controlsRef.current?.stop(); onClose(); }}><X className="h-4 w-4" /></Button>
      </div>
      <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-slate-900">
        <video ref={videoRef} muted playsInline autoPlay className="h-full w-full object-cover" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-[20%] rounded-xl border-2 border-white/80" />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <label className="text-xs text-muted-foreground" htmlFor="manual-employee-qr">{tr('Or enter code manually')}</label>
      <div className="flex min-w-0 gap-2">
        <input
          id="manual-employee-qr"
          className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
          autoComplete="off"
          value={manualCode}
          onChange={e => setManualCode(e.target.value.slice(0, 120))}
          placeholder={tr('Employee QR code')}
          onKeyDown={e => { if (e.key === 'Enter') submitManual(); }}
        />
        <Button type="button" size="sm" disabled={!manualCode.trim()} onClick={submitManual}>{tr('Submit')}</Button>
      </div>
    </div>
  );
}
