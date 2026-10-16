/**
 * Cross-reference the source-literal audit against the ACTUAL runtime lookup.
 * Locale-key parity by itself cannot detect strings rendered directly in JSX.
 * This is a candidate triage report; it is not proof that every candidate is
 * user-facing (some are code, account data, external brand names or templates).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { translateInterface } from '../src/lib/translateInterface.js';
import './audit-i18n-coverage.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const audit = JSON.parse(fs.readFileSync(path.join(root, 'reports/i18n-coverage-audit.json'), 'utf8'));
const knownTokens = /^(?:[\d\W]+|(?:SAR|ERP|POS|SKU|VAT|PDF|IBAN|GPS|QR|AI|ID|USD|API|BI|PWA|MFA|SMS|CSV|Excel|WhatsApp|BizCTRL)(?:\s*[/·—+]+\s*(?:ERP|POS|VAT|PDF|SAR|USD))*)$/i;
const isEnglishCopy = source => {
  if (!/[a-z]{2}/i.test(source) || /[\u0600-\u08ff]/.test(source)) return false;
  if (source.includes('${') || /[{}=><]/.test(source)) return false;
  if (/^(?:[\w./@:#-]+|[\d\s:,.+\-–]+)$/.test(source)) return false;
  if (knownTokens.test(source)) return false;
  if (/^https?:|^\w+:\/\//.test(source)) return false;
  return true;
};
const candidates = audit.candidates.map(entry => {
  const phrases = entry.phrases.filter(isEnglishCopy).map(source => ({
    source,
    arMissing: translateInterface(source, 'ar') === source,
    faMissing: translateInterface(source, 'fa') === source,
  })).filter(r => r.arMissing || r.faMissing);
  return { file: entry.file, phrases };
}).filter(entry => entry.phrases.length);
const out = { generatedAt: new Date().toISOString(),
  fileCount: candidates.length,
  distinctMissing: new Set(candidates.flatMap(x => x.phrases.map(z=>z.source))).size,
  arMissing: candidates.reduce((a,v)=>a+v.phrases.filter(p=>p.arMissing).length,0),
  faMissing: candidates.reduce((a,v)=>a+v.phrases.filter(p=>p.faMissing).length,0),
  candidates,
};
fs.writeFileSync(path.join(root,'reports/erp-runtime-translation-gaps.json'),JSON.stringify(out,null,2));
console.log('Runtime translation gap candidates:',JSON.stringify({
 fileCount:out.fileCount,distinctMissing:out.distinctMissing,
 arMissing:out.arMissing,faMissing:out.faMissing,
 top:candidates.slice().sort((a,b)=>b.phrases.length-a.phrases.length).slice(0,35)
 .map(e=>({file:e.file,count:e.phrases.length}))
},null,2));
