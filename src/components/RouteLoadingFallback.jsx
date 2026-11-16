import React from 'react';
import { useLanguage } from '@/lib/LanguageContext';

const copy = {
  en: 'Loading page…',
  ar: 'جارٍ فتح الصفحة…',
  fa: 'در حال بازکردن صفحه…',
};

// Only for already-booted ERP route chunks: no logo, launch screen, or app reset.
// The parent AppLayout stays mounted with its header, navigation and open tabs.
export default function RouteLoadingFallback({ fullPage = false }) {
  const { lang = 'en' } = useLanguage();
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="erp-route-loading"
      className={`flex w-full min-w-0 items-center justify-center bg-background p-6 text-foreground ${fullPage ? 'min-h-dvh' : 'min-h-[30vh]'}`}
    >
      <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
        <span aria-hidden="true" className="inline-block h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-primary/20 border-t-primary motion-reduce:animate-none" />
        <span>{copy[lang] || copy.en}</span>
      </div>
    </div>
  );
}
