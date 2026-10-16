import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ownerReportArabic, ownerReportPersian, completeOwnerReportCopy } from '../src/lib/ownerReportTranslations';
import { translateInterface } from '../src/lib/translateInterface';

const source=readFileSync(new URL('../src/pages/OwnerDashboard.jsx',import.meta.url),'utf8');
const en=source.slice(source.indexOf('const EN = {'),source.indexOf('const COPY = {'));
const ar=source.slice(source.indexOf('  ar: { ...EN,'),source.indexOf('\n};',source.indexOf('  ar: { ...EN,')));
const fa=source.slice(source.indexOf('  fa: { ...EN,'),source.indexOf('  ar: { ...EN,'));
const keys=section=>new Set([...section.matchAll(/(?:^|[,\s{])(['"]?[\w-]+['"]?)\s*:\s*'/g)].map(m=>m[1].replace(/['"]/g,'')));

describe('Owner Report Center Arabic and Persian parity',()=>{
  it('has localized values for every inherited English report key',()=>{
    const english=keys(en), arabic=keys(ar), persian=keys(fa);
    const missingAr=[...english].filter(key=>!arabic.has(key)&&!(key in ownerReportArabic));
    const missingFa=[...english].filter(key=>!persian.has(key)&&!(key in ownerReportPersian));
    expect(missingAr).toEqual([]);
    expect(missingFa).toEqual([]);
  });
  it('overrides every untranslated page-specific Arabic key with proper script',()=>{
    for(const [key,label] of Object.entries(ownerReportArabic)){
      expect(label,key).toMatch(/[\u0600-\u06ff]/);
      expect(label,key).not.toBe('');
      expect(!(/^[a-z][a-z\s&.,-]+$/i.test(label)),key).toBe(true);
    }
  });
  it('changes rendered copy when language changes without touching money or IDs',()=>{
    const copy={sales:'Sales',purchases:'Purchases',branchCommand:'Branch command board'};
    const arCopy=completeOwnerReportCopy(copy,'ar');
    const faCopy=completeOwnerReportCopy(copy,'fa');
    expect(arCopy.sales).toBe('المبيعات');
    expect(faCopy.sales).toBe(translateInterface('Sales','fa'));
    expect(arCopy.branchCommand).toBe('لوحة إدارة الفروع');
    expect(completeOwnerReportCopy(copy,'en')).toEqual(copy);
  });
});
