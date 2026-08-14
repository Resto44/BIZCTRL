import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import translations from '../src/lib/i18n.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(root, 'src');
const reportRoot = path.join(root, 'reports');
fs.mkdirSync(reportRoot, { recursive: true });

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

const enKeys = Object.keys(translations.en || {}).filter((key) => key !== 'dir' && key !== 'lang');
const languages = ['ar', 'fa'];
const parity = Object.fromEntries(languages.map((lang) => {
  const locale = translations[lang] || {};
  const missing = enKeys.filter((key) => !(key in locale));
  const untranslated = enKeys.filter((key) => {
    const en = translations.en[key];
    const localized = locale[key];
    return typeof en === 'string' && typeof localized === 'string' && en === localized && /[A-Za-z]/.test(en);
  });
  return [lang, { keyCount: Object.keys(locale).length, missing, untranslated }];
}));

const englishCatalogValues = new Set(
  Object.values(translations.en || {})
    .filter((value) => typeof value === 'string' && /[A-Za-z]/.test(value))
);

const files = walk(sourceRoot).filter((file) => /\.(jsx?|tsx?)$/.test(file));
const report = [];
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const relative = path.relative(root, file);
  const literals = new Set();
  const add = (raw) => {
    const value = raw.replace(/\\["'`]/g, (m) => m.slice(1)).replace(/\s+/g, ' ').trim();
    if (!value || value.length < 2 || !/[A-Za-z]/.test(value)) return;
    if (/^(?:[\w./@:-]+|[A-Z_]+)$/.test(value)) return;
    if (value.startsWith('http') || value.startsWith('/') || value.includes('=>')) return;
    literals.add(value);
  };
  for (const match of content.matchAll(/>([^<>{}\n]*[A-Za-z][^<>{}\n]*)</g)) add(match[1]);
  for (const match of content.matchAll(/(?:placeholder|title|aria-label|alt)=['"]([^'"]*[A-Za-z][^'"]*)['"]/g)) add(match[1]);
  for (const match of content.matchAll(/(?:label|title|description|message|text):\s*['"`]([^'"`\n]*[A-Za-z][^'"`\n]*)['"`]/g)) add(match[1]);
  const hardcoded = [...literals].filter((value) => !englishCatalogValues.has(value));
  if (hardcoded.length) report.push({ file: relative, phrases: hardcoded.sort() });
}

const output = {
  generatedAt: new Date().toISOString(),
  localeParity: parity,
  sourceFilesScanned: files.length,
  candidateFileCount: report.length,
  candidatePhraseCount: report.reduce((total, entry) => total + entry.phrases.length, 0),
  candidates: report,
};
fs.writeFileSync(path.join(reportRoot, 'i18n-coverage-audit.json'), JSON.stringify(output, null, 2));

console.log(`Scanned ${files.length} source files.`);
for (const lang of languages) {
  console.log(`${lang}: ${parity[lang].keyCount} keys; missing=${parity[lang].missing.length}; exact-English=${parity[lang].untranslated.length}`);
}
console.log(`Candidate literals: ${output.candidatePhraseCount} across ${output.candidateFileCount} files.`);
console.log(`Report: ${path.join(reportRoot, 'i18n-coverage-audit.json')}`);
