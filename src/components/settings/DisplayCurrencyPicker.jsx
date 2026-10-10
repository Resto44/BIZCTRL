import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { DISPLAY_CURRENCIES, filterDisplayCurrencies, localizedCurrencyName } from '@/lib/displayCurrencies';

const UI_TEXT = {
  en: { search: 'Search currency or ISO code', empty: 'No matching currency', selected: 'Current display currency' },
  ar: { search: 'ابحث عن العملة أو رمزها', empty: 'لا توجد عملة مطابقة', selected: 'عملة العرض الحالية' },
  fa: { search: 'جست‌وجوی نام یا کد ارز', empty: 'ارز مطابق پیدا نشد', selected: 'ارز نمایشی فعلی' },
};

export default function DisplayCurrencyPicker({ value, onChange, lang = 'en' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const translations = UI_TEXT[lang] || UI_TEXT.en;
  const matchingCurrencies = useMemo(() => filterDisplayCurrencies(query, lang), [query, lang]);
  const selected = DISPLAY_CURRENCIES.find(item => item.code === value);
  const selectedName = selected ? localizedCurrencyName(selected.code, lang) : value;

  return (
    <Popover open={open} onOpenChange={next => {
      setOpen(next);
      if (!next) setQuery('');
    }}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={translations.selected} aria-expanded={open}
          className="mt-1 flex min-h-10 w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-start text-sm font-bold text-slate-900 shadow-sm transition hover:border-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
          <span className="min-w-0 truncate" dir="auto">
            {value}{selectedName && selectedName !== value ? <span className="ms-2 text-xs font-medium text-slate-500 dark:text-slate-400">— {selectedName}</span> : null}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6}
        className="w-[min(88vw,360px)] rounded-2xl border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={query} onChange={event => setQuery(event.target.value)}
            placeholder={translations.search} aria-label={translations.search}
            className="h-10 ps-9 text-sm" />
        </div>
        <div className="mt-2 max-h-[min(50dvh,320px)] overflow-y-auto overscroll-contain rounded-xl"
          role="listbox" aria-label={translations.selected}>
          {matchingCurrencies.length === 0
            ? <p className="px-3 py-6 text-center text-xs text-muted-foreground">{translations.empty}</p>
            : matchingCurrencies.map(item => (
              <button key={item.code} type="button" role="option" aria-selected={value === item.code}
                onClick={() => { onChange(item.code); setOpen(false); setQuery(''); }}
                className={'flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-start text-sm transition hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none dark:hover:bg-slate-800 dark:focus-visible:bg-slate-800 ' +
                  (value === item.code ? 'bg-blue-50 font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' : 'text-slate-800 dark:text-slate-200')}>
                <span className="flex min-w-0 items-center gap-3">
                  <span className="w-10 shrink-0 font-bold tabular-nums" dir="ltr">{item.code}</span>
                  <span className="min-w-0 break-words text-xs" dir="auto">{localizedCurrencyName(item.code, lang)}</span>
                </span>
                {value === item.code && <Check className="h-4 w-4 shrink-0" />}
              </button>
            ))}
        </div>
        <div className="border-t border-slate-100 px-2 pt-2 text-end text-[11px] text-slate-500 dark:border-slate-800">
          {matchingCurrencies.length} / {DISPLAY_CURRENCIES.length}
        </div>
      </PopoverContent>
    </Popover>
  );
}
