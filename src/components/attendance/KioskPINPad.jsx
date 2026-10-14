import React, { useState } from 'react';
import { Delete } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';

// Six-digit PINs are verified by the database, never compared with employee rows in the browser.
// Keep controls compact enough to scroll fully above the mobile bottom bar.
export default function KioskPINPad({ onSubmit, loading = false, disabled = false }) {
  const { translateLiteral } = useLanguage();
  const [pin, setPin] = useState('');
  const press = (digit) => {
    if (loading || disabled || pin.length >= 6) return;
    const next = pin + digit;
    if (next.length === 6) {
      setPin('');
      onSubmit?.(next);
    } else setPin(next);
  };
  const del = () => setPin(p => p.slice(0, -1));

  return (
    <div className="flex w-full flex-col items-center gap-3 pb-2">
      <div className="flex gap-2" aria-label={translateLiteral('Six-digit PIN')}>
        {Array.from({ length: 6 }, (_, i) => (
          <span
            key={i}
            aria-hidden="true"
            className={`h-4 w-4 rounded-full border-2 transition-colors ${i < pin.length ? 'bg-primary border-primary' : 'border-muted-foreground/40'}`}
          />
        ))}
      </div>
      <div className="grid w-full max-w-[235px] grid-cols-3 gap-2" role="group" aria-label={translateLiteral('PIN keypad')}>
        {[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map((digit, index) => {
          if (digit === '') return <div key={index} aria-hidden="true" />;
          const back = digit === '⌫';
          return (
            <button
              type="button"
              key={index}
              onClick={() => back ? del() : press(String(digit))}
              disabled={loading || disabled}
              aria-label={back ? translateLiteral('Delete last digit') : String(digit)}
              className="flex h-12 min-w-0 items-center justify-center rounded-xl border bg-card text-xl font-semibold shadow-sm active:scale-95 disabled:opacity-40 sm:h-14"
            >
              {back ? <Delete className="h-5 w-5" /> : digit}
            </button>
          );
        })}
      </div>
      {loading && <p role="status" className="text-xs text-muted-foreground">{translateLiteral('Checking…')}</p>}
    </div>
  );
}
