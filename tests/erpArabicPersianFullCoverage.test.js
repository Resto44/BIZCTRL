import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { translateInterface } from '../src/lib/translateInterface.js';
import translations from '../src/lib/i18n.js';

describe('ERP Arabic and Persian user-facing language contracts',()=>{
  it('localizes the previously untranslated VIP subscription tier',()=>{
    expect(translations.ar.tier_vip).toContain('المميزة');
    expect(translations.fa.tier_vip).toContain('ویژه');
    expect(translations.en.tier_vip).toBe('VIP');
  });
  it.each(['ar','fa'])('localizes dynamic numeric counters but never financial values or account data in %s', lang=>{
    expect(translateInterface('15 items',lang)).not.toBe('15 items');
    expect(translateInterface('4 employees',lang)).not.toBe('4 employees');
    expect(translateInterface('Amount: SAR 1,750',lang)).not.toBe('Amount: SAR 1,750');
    expect(translateInterface('Amount: SAR 1,750',lang)).toContain('SAR 1,750');
    expect(translateInterface('15 Chicken Majlis',lang)).toBe('15 Chicken Majlis');
    expect(translateInterface('SA12345678',lang)).toBe('SA12345678');
    expect(translateInterface('main-9a50614652',lang)).toBe('main-9a50614652');
    expect(translateInterface('AB-9099',lang)).toBe('AB-9099');
  });
  it('keeps regular text English in English mode',()=>{
    expect(translateInterface('15 items','en')).toBe('15 items');
    expect(translateInterface('Amount: SAR 1,750','en')).toBe('Amount: SAR 1,750');
  });
  it('translates operational inventory card statuses directly instead of relying on observer timing',()=>{
    const source=readFileSync(new URL('../src/pages/InventoryCommandCenter.jsx',import.meta.url),'utf8');
    expect(source).toContain("const { t, currency, translateLiteral: tr } = useLanguage();");
    expect(source).toContain("{tr('Out of Stock')}");
    expect(source).toContain("{tr('Inventory by Category')}");
    expect(source).toContain("{tr('All items are well-stocked!')}");
    expect(source).toContain("{tr('Order Now')}");
    expect(source).toContain("{lowStock.length} {tr('items need restocking')}");
  });
  it('covers key Arabic/Persian payroll, treasury, PDF and inventory status phrases',()=>{
    for(const phrase of [
      'PDF report','Payroll sections','Record attendance',
      'Two linked postings: branch cash decreases, Owner cash increases.',
      'All items are well-stocked!','Inventory by Category','items need restocking',
    ]) {
      for(const language of ['ar','fa']) {
        expect(translateInterface(phrase,language),`${language} ${phrase}`).not.toBe(phrase);
      }
    }
  });
});
