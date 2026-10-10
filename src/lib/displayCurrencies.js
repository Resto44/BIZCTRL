/**
 * ISO 4217 codes for the owner workspace's personal currency preference.
 * This is a PRESENTATION preference, not an exchange-rate engine.
 * Never use a chosen display currency to rewrite stored financial amounts.
 */
export const DISPLAY_CURRENCIES = Object.freeze([
  { code: 'SAR', name: 'Saudi Riyal' },
  { code: 'USD', name: 'US Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'AFN', name: 'Afghan Afghani' },
  { code: 'AED', name: 'UAE Dirham' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'INR', name: 'Indian Rupee' },
  { code: 'PKR', name: 'Pakistani Rupee' },
  { code: 'CNY', name: 'Chinese Yuan' },
  { code: 'JPY', name: 'Japanese Yen' },
  { code: 'CAD', name: 'Canadian Dollar' },
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'CHF', name: 'Swiss Franc' },
  { code: 'KWD', name: 'Kuwaiti Dinar' },
  { code: 'QAR', name: 'Qatari Riyal' },
  { code: 'BHD', name: 'Bahraini Dinar' },
  { code: 'OMR', name: 'Omani Rial' },
  { code: 'EGP', name: 'Egyptian Pound' },
  { code: 'TRY', name: 'Turkish Lira' },
  { code: 'IRR', name: 'Iranian Rial' },
  { code: 'IQD', name: 'Iraqi Dinar' },
  { code: 'RUB', name: 'Russian Ruble' },
  { code: 'KRW', name: 'South Korean Won' },
  { code: 'SGD', name: 'Singapore Dollar' },
  { code: 'HKD', name: 'Hong Kong Dollar' },
  { code: 'MYR', name: 'Malaysian Ringgit' },
  { code: 'IDR', name: 'Indonesian Rupiah' },
  { code: 'THB', name: 'Thai Baht' },
  { code: 'ZAR', name: 'South African Rand' },
  { code: 'BRL', name: 'Brazilian Real' },
]);

export const DISPLAY_CURRENCY_CODES = Object.freeze(DISPLAY_CURRENCIES.map(item => item.code));
const LOCALES = { ar: 'ar-SA', fa: 'fa-AF', en: 'en-US' };

export function localizedCurrencyName(code, lang = 'en') {
  const item = DISPLAY_CURRENCIES.find(entry => entry.code === code);
  if (!item) return code;
  try {
    const name = new Intl.DisplayNames([LOCALES[lang] || LOCALES.en], { type: 'currency' }).of(code);
    return name && name !== code ? name : item.name;
  } catch {
    return item.name;
  }
}

export function filterDisplayCurrencies(query = '', lang = 'en') {
  const normalized = String(query).trim().toLocaleLowerCase();
  if (!normalized) return DISPLAY_CURRENCIES;
  return DISPLAY_CURRENCIES.filter(item =>
    [item.code, item.name, localizedCurrencyName(item.code, lang)]
      .some(value => value.toLocaleLowerCase().includes(normalized)));
}
