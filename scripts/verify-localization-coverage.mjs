import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import translations from '../src/lib/i18n.js';
import localizedPhrases from '../src/lib/localizedPhrases.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const audit = JSON.parse(fs.readFileSync(path.join(root, 'reports/i18n-coverage-audit.json'), 'utf8'));
const languages = ['en', 'fa', 'ar'];
const englishValues = new Set(Object.values(translations.en).filter((value) => typeof value === 'string'));
const missingLocaleKeys = languages.flatMap((language) => {
  const reference = Object.keys(translations.en).filter((key) => !['dir', 'lang'].includes(key));
  return reference.filter((key) => !(key in translations[language])).map((key) => `${language}:${key}`);
});
const phraseEntries = Object.entries(localizedPhrases);
const invalidPhrases = phraseEntries.filter(([, value]) => !value?.fa || !value?.ar || typeof value.fa !== 'string' || typeof value.ar !== 'string');
const isUserFacingPhrase = (value) => {
  if (typeof value !== 'string') return false;
  const phrase = value.trim();
  if (phrase.length < 2 || phrase.length > 180 || !/[A-Za-z]/.test(phrase)) return false;
  if (phrase.includes('${') || ['=>', '&&', '||', '===', '!==', 'className', '?.', " ? '", ' : '].some((token) => phrase.includes(token))) return false;
  if (phrase.startsWith(('http://', 'https://', '/', './', '../'))) return false;
  return true;
};
const candidates = [...new Set(audit.candidates.flatMap((entry) => entry.phrases))].filter(isUserFacingPhrase);
const unresolved = candidates.filter((phrase) => !englishValues.has(phrase) && !localizedPhrases[phrase]);
const report = {
  coreLocaleKeys: Object.fromEntries(languages.map((language) => [language, Object.keys(translations[language]).length])),
  centralPhraseEntries: phraseEntries.length,
  auditedCandidatePhrases: candidates.length,
  unresolvedCandidatePhrases: unresolved,
  missingLocaleKeys,
  invalidPhrases: invalidPhrases.map(([phrase]) => phrase),
};
fs.writeFileSync(path.join(root, 'reports/localization-verification.json'), JSON.stringify(report, null, 2));
if (missingLocaleKeys.length || invalidPhrases.length || unresolved.length) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(`Localization coverage verified: ${report.coreLocaleKeys.en} core keys per language; ${phraseEntries.length} centralized literal entries; ${candidates.length} audited candidates resolved.`);
