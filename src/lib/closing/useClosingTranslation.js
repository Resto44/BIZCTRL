import { useCallback } from 'react';
import { useLanguage } from '../LanguageContext';
import { translateInterface } from '../translateInterface';

// Explicit React localization also works inside dialogs excluded from DOM translation.
export function useClosingTranslation(language) {
  const { lang } = useLanguage();
  const selected = language || lang;
  return useCallback((text, values) => {
    if (typeof text === 'string') {
      const credit = text.match(/^Credit limit exceeded for (.+)\. Reduce the credit sale to the live available credit\.$/);
      if (credit) return translateInterface('Credit limit exceeded for {customer}. Reduce the credit sale to the live available credit.', selected, { customer: credit[1] });
      const required = text.match(/^(.+) is required\.$/);
      if (required) return translateInterface('{field} is required.', selected, { field: translateInterface(required[1], selected) });
    }
    return translateInterface(text, selected, values);
  }, [selected]);
}
