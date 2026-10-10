import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  DISPLAY_CURRENCIES, DISPLAY_CURRENCY_CODES, filterDisplayCurrencies, localizedCurrencyName,
} from '../src/lib/displayCurrencies.js';

describe('30 global currencies in BizCTRL workspace settings', () => {
  it('exposes 30 unique valid ISO 4217 currencies including four existing choices', () => {
    expect(DISPLAY_CURRENCIES).toHaveLength(30);
    expect(new Set(DISPLAY_CURRENCY_CODES).size).toBe(30);
    ['SAR','USD','EUR','AFN','AED','GBP','INR','PKR','CNY','JPY','CAD','AUD',
     'CHF','KWD','QAR','BHD','OMR','EGP','TRY','IRR','IQD','RUB','KRW','SGD',
     'HKD','MYR','IDR','THB','ZAR','BRL'].forEach(code=>{
      expect(DISPLAY_CURRENCY_CODES).toContain(code);
      expect(() => new Intl.NumberFormat('en-US',{style:'currency',currency:code}).format(123.45))
        .not.toThrow();
    });
  });

  it('supports searching by ISO code, English name, and Arabic / Persian local names', () => {
    expect(filterDisplayCurrencies('sar').map(c=>c.code)).toContain('SAR');
    expect(filterDisplayCurrencies('afghani').map(c=>c.code)).toContain('AFN');
    expect(filterDisplayCurrencies('canadian').map(c=>c.code)).toContain('CAD');
    for(const lang of ['ar','fa']){
      const translation=localizedCurrencyName('SAR',lang);
      expect(translation).toBeTruthy();
      expect(filterDisplayCurrencies(translation,lang).map(c=>c.code)).toContain('SAR');
    }
    expect(filterDisplayCurrencies('unknown-qqq')).toHaveLength(0);
    expect(filterDisplayCurrencies('  ')).toHaveLength(30);
  });

  it('wires the picker to personal settings, preserves AFN and never touches organization/base settings', async () => {
    const page=await readFile(new URL('../src/pages/SettingsPage.jsx',import.meta.url),'utf8');
    const picker=await readFile(new URL('../src/components/settings/DisplayCurrencyPicker.jsx',import.meta.url),'utf8');
    const lang=await readFile(new URL('../src/lib/LanguageContext.jsx',import.meta.url),'utf8');
    expect(page).toContain('<DisplayCurrencyPicker value={currency} onChange={setCurrency} lang={lang} />');
    expect(page).toContain('Financial amounts are not converted.');
    expect(picker).toContain('filterDisplayCurrencies(query, lang)');
    expect(picker).toContain('max-h-[min(50dvh,320px)]');
    expect(picker).toContain("onClick={() => { onChange(item.code); setOpen(false); setQuery(''); }}");
    expect(lang).toContain("localStorage.setItem('rc_currency', currency)");
    expect(page).not.toContain('patchFinance(');
    expect(picker).not.toContain('exchangeRates');
  });
});
