import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import translations from './i18n';
import localizedPhrases from './localizedPhrases';
import useDocumentLocalization from './useDocumentLocalization';
import {
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
  createEnglishPhraseIndex,
  formatLocalizedCurrency,
  formatLocalizedDate,
  formatLocalizedNumber,
  getLanguageMeta,
  interpolate,
  normalizeLanguage,
  translateDataLabel,
} from './localization';

const LanguageContext = createContext();
const safeGet = (key, fallback) => {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
};

const englishPhraseIndex = createEnglishPhraseIndex(translations);

export function LanguageProvider({ children }) {
  const [lang, setLanguage] = useState(() => normalizeLanguage(safeGet(LANGUAGE_STORAGE_KEY, 'en')));
  const [currency, setCurrency] = useState(() => safeGet('rc_currency', 'SAR'));
  const [regionalPreferences, setRegionalPreferences] = useState(() => {
    try {
      const parsed = JSON.parse(safeGet('rc_regional_preferences', '{}'));
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  });
  const [darkMode, setDarkMode] = useState(() => safeGet('rc_dark', 'false') === 'true');

  const locale = useMemo(() => getLanguageMeta(lang), [lang]);
  const dir = locale.direction;
  const isRTL = dir === 'rtl';

  const setLang = useCallback((nextLanguage) => {
    setLanguage(normalizeLanguage(nextLanguage));
  }, []);

  const t = useCallback((key, values) => {
    const message = translations[lang]?.[key] ?? translations.en?.[key] ?? key;
    return interpolate(message, values);
  }, [lang]);

  const translateLiteral = useCallback((value, values) => {
    if (value === null || value === undefined || value === '') return value;
    const source = String(value).trim();
    const phraseTranslation = localizedPhrases[source]?.[lang];
    if (phraseTranslation) return interpolate(phraseTranslation, values);
    const key = englishPhraseIndex.get(source);
    return key ? t(key, values) : interpolate(source, values);
  }, [lang, t]);

  const translateLabel = useCallback((value, fallback) => translateDataLabel(value, t, fallback), [t]);
  const formatNumber = useCallback((value, options = {}) => {
    const decimalPlaces = Number.isInteger(regionalPreferences.decimal_places) ? regionalPreferences.decimal_places : 2;
    return formatLocalizedNumber(value, lang, { maximumFractionDigits: decimalPlaces, ...options });
  }, [lang, regionalPreferences.decimal_places]);
  const formatDate = useCallback((value, options = {}) => {
    const format = regionalPreferences.date_format || 'YYYY-MM-DD';
    const formatOptions = format === 'DD/MM/YYYY'
      ? { day: '2-digit', month: '2-digit', year: 'numeric' }
      : format === 'MM/DD/YYYY'
        ? { month: '2-digit', day: '2-digit', year: 'numeric' }
        : { year: 'numeric', month: '2-digit', day: '2-digit' };
    return formatLocalizedDate(value, lang, { ...formatOptions, ...options });
  }, [lang, regionalPreferences.date_format]);
  const formatMoney = useCallback((value, options = {}) => {
    const decimalPlaces = Number.isInteger(regionalPreferences.decimal_places) ? regionalPreferences.decimal_places : 2;
    return formatLocalizedCurrency(value, lang, currency, { currencyDisplay: regionalPreferences.currency_display || 'symbol', maximumFractionDigits: decimalPlaces, ...options });
  }, [lang, currency, regionalPreferences.currency_display, regionalPreferences.decimal_places]);

  useDocumentLocalization({ lang, translateLiteral });

  useEffect(() => {
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    } catch {
      // Storage can be unavailable in private browsing; the active in-memory language still works.
    }
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.style.setProperty('--app-direction', dir);
    document.body?.setAttribute('dir', dir);
  }, [lang, dir]);

  useEffect(() => {
    try {
      localStorage.setItem('rc_currency', currency);
    } catch {
      // Currency remains available for the current session if storage is unavailable.
    }
  }, [currency]);

  useEffect(() => {
    try {
      localStorage.setItem('rc_regional_preferences', JSON.stringify(regionalPreferences || {}));
    } catch {
      // Regional display preferences remain available for the active session if storage is unavailable.
    }
  }, [regionalPreferences]);

  useEffect(() => {
    try {
      localStorage.setItem('rc_dark', darkMode);
    } catch {
      // Theme remains available for the current session if storage is unavailable.
    }
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  const value = useMemo(() => ({
    lang,
    setLang,
    locale,
    languages: SUPPORTED_LANGUAGES,
    dir,
    isRTL,
    t,
    translateLiteral,
    translateLabel,
    currency,
    setCurrency,
    regionalPreferences,
    setRegionalPreferences,
    darkMode,
    setDarkMode,
    formatNumber,
    formatDate,
    formatMoney,
  }), [lang, setLang, locale, dir, isRTL, t, translateLiteral, translateLabel, currency, regionalPreferences, darkMode, formatNumber, formatDate, formatMoney]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (ctx) return ctx;
  const locale = getLanguageMeta('en');
  return {
    lang: 'en',
    setLang: () => {},
    locale,
    languages: SUPPORTED_LANGUAGES,
    dir: 'ltr',
    isRTL: false,
    t: (key) => translations.en?.[key] ?? key,
    translateLiteral: (value) => value,
    translateLabel: (value) => value,
    currency: 'SAR',
    setCurrency: () => {},
    regionalPreferences: {},
    setRegionalPreferences: () => {},
    darkMode: false,
    setDarkMode: () => {},
    formatNumber: (value) => String(value ?? ''),
    formatDate: (value) => String(value ?? ''),
    formatMoney: (value, options) => formatLocalizedCurrency(value, 'en', 'SAR', options),
  };
}
