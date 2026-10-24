import closingInterfacePhrases from './closing/closingInterfacePhrases.js';
import { translateInterfaceDate } from './interfaceDates.js';
import translations from './i18n.js';
import localizedPhrases from './localizedPhrases.js';
import arabicUiPhrases from './arabicUiPhrases.js';
import persianUiPhrases from './persianUiPhrases.js';
import erpInterfacePhrases from './erpInterfacePhrases.js';
import { interpolate, normalizeLanguage } from './localization.js';

// Numeric UI counters can render in the same DOM text node as the label.
// Translate only known count-unit words; never parse arbitrary business data.
const LOCALIZED_COUNT_UNITS = new Set([
  'item','items','product','products','branch','branches','employee','employees',
  'record','records','order','orders','day','days','ticket','tickets',
  'notification','notifications','shift','shifts','driver','drivers',
]);

// Normalize typography, not business values. Matching stays whole-phrase only.
export const normalizeInterfacePhrase = value => String(value).replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/\s+/g, ' ').trim();
const catalogs = { en: new Map(), fa: new Map(), ar: new Map() };
for (const [key, english] of Object.entries(translations.en)) {
  if (typeof english !== 'string') continue;
  for (const lang of Object.keys(catalogs)) {
    catalogs[lang].set(normalizeInterfacePhrase(english), translations[lang]?.[key] ?? english);
  }
}
for (const [source, entry] of Object.entries(localizedPhrases)) {
  for (const lang of ['fa', 'ar']) if (entry[lang]) catalogs[lang].set(normalizeInterfacePhrase(source), entry[lang]);
}

// Explicit, reviewed translations for later ERP modules, independent of the
// fallback DOM-localization path. Safe exact-phrase lookup only.
for (const [source, entry] of Object.entries(erpInterfacePhrases)) {
  for (const lang of ['ar', 'fa']) {
    if (entry[lang]) catalogs[lang].set(normalizeInterfacePhrase(source), entry[lang]);
  }
}

for (const [source, value] of Object.entries(persianUiPhrases)) catalogs.fa.set(normalizeInterfacePhrase(source), value);

for (const [source, value] of Object.entries(arabicUiPhrases)) catalogs.ar.set(normalizeInterfacePhrase(source), value);

for (const [source, entry] of Object.entries(closingInterfacePhrases)) {
  for (const lang of ['fa', 'ar']) {
    const key = normalizeInterfacePhrase(source);
    if (!catalogs[lang].has(key) || catalogs[lang].get(key) === source) catalogs[lang].set(key, entry[lang]);
  }
}

const folded = Object.fromEntries(Object.entries(catalogs).map(([lang, catalog]) => [lang, new Map([...catalog].map(([k,v]) => [k.toLowerCase(),v]))]));

export function translateInterface(value, language, values) {
  if (value === null || value === undefined || value === '') return value;
  const lang = normalizeLanguage(language);
  const source = normalizeInterfacePhrase(value);
  const lookup = phrase => catalogs[lang].get(phrase) ?? (lang === 'en' ? undefined : folded[lang].get(phrase.toLowerCase()));
  const exact = lookup(source);
  if (exact !== undefined && (exact !== source || lang === 'en')) return interpolate(exact, values);
  // React and third-party controls may render a label and count as one node.
  // Preserve the numeric payload; never translate arbitrary substrings or IDs.
  const counted = source.match(/^(.*?)\s*(\([\d,]+\)|[:：…]|\.\.\.|[()·—])$/);
  if (counted && lookup(counted[1]) !== undefined) return `${interpolate(lookup(counted[1]), values)}${counted[2].startsWith('(') ? ' ' : ''}${counted[2]}`;
  if (lang !== 'en') {
    const numberFirst = source.match(/^([+-]?\d[\d,.]*)\s+([A-Za-z]+)$/);
    if (numberFirst && LOCALIZED_COUNT_UNITS.has(numberFirst[2].toLowerCase())) {
      const unit = lookup(numberFirst[2]);
      if (unit && unit !== numberFirst[2]) return `${numberFirst[1]} ${unit}`;
    }
    const metric = source.match(/^([A-Za-z][A-Za-z /&-]{1,35}):\s*([+-]?(?:(?:SAR|USD|EUR|AED)\s*)?[\d,]+(?:\.[\d]+)?%?)$/);
    if (metric) {
      const translatedLabel = lookup(metric[1]) ?? lookup(metric[1] + ':');
      if (translatedLabel && translatedLabel !== metric[1] && translatedLabel !== metric[1] + ':')
        return `${translatedLabel.replace(/:$/, '')}: ${metric[2]}`;
    }
  }
  return interpolate(translateInterfaceDate(source, lang) ?? source, values);
}
