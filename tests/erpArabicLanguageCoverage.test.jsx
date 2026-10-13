// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,describe,expect,it} from 'vitest';
import {translateInterface} from '../src/lib/translateInterface.js';
import {erpInterfacePhrases} from '../src/lib/erpInterfacePhrases.js';
import persianUiPhrases from '../src/lib/persianUiPhrases.js';
import {useDocumentLocalization} from '../src/lib/useDocumentLocalization.js';
import {readFile} from 'node:fs/promises';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let root,container;
function Demo({lang}){
 useDocumentLocalization({lang,translateLiteral:value=>translateInterface(value,lang)});
 return <main>
  <nav><a href="/erp">Billing &amp; Subscription</a><span>Inventory &amp; Supply</span></nav>
  <section><h3>Treasury data unavailable</h3>
   <input placeholder="Product image URL"/>
   <button title="Close navigation">Close navigation</button>
   <label>Two-factor authentication</label>
  </section>
  <section data-i18n-skip="true"><code>account_00045</code><span>فرع الريان</span></section>
 </main>;
}
async function rerender(lang){
 if(!root){
  container=document.createElement('div');document.body.appendChild(container);
  root=createRoot(container);
 }
 await act(async()=>{root.render(<Demo lang={lang}/>);await new Promise(done=>setTimeout(done,0));});
}
afterEach(async()=>{if(root)await act(async()=>root.unmount());container?.remove();root=null;container=null;});

describe('Selected SaaS language applied throughout ERP',()=>{
 it('has reviewed non-English translations for every newly added phrase',()=>{
  expect(Object.keys(erpInterfacePhrases).length).toBeGreaterThanOrEqual(160);
  for(const [english,localized] of Object.entries(erpInterfacePhrases)){
   expect(localized.ar,english).toBeTruthy();
   expect(localized.fa,english).toBeTruthy();
   expect(translateInterface(english,'ar'),english).toBe(localized.ar);
   expect(translateInterface(english,'fa'),english).toBe(persianUiPhrases[english] ?? localized.fa);
   expect(translateInterface(english,'en'),english).toBe(english);
  }
 });
 it('switches complex ERP labels, navigation and placeholders without reload and preserves business data',async()=>{
  await rerender('en');expect(container.textContent).toContain('Billing & Subscription');
  await rerender('ar');
  expect(container.textContent).toContain('الفوترة والاشتراكات');
  expect(container.textContent).toContain('المخزون والتوريد');
  expect(container.textContent).toContain('بيانات الخزينة غير متاحة');
  expect(container.textContent).toContain('المصادقة الثنائية');
  expect(container.querySelector('input').getAttribute('placeholder')).toBe('رابط صورة المنتج');
  expect(container.querySelector('button').getAttribute('title')).toBe('إغلاق القائمة');
  expect(container.textContent).toContain('account_00045');
  expect(container.textContent).toContain('فرع الريان');
  await rerender('fa');
  expect(container.textContent).toContain('صورتحساب و اشتراک');
  expect(container.querySelector('input').getAttribute('placeholder')).toBe('لینک تصویر محصول');
  await rerender('en');
  expect(container.textContent).toContain('Billing & Subscription');
  expect(container.querySelector('input').getAttribute('placeholder')).toBe('Product image URL');
 });
 it('keeps already translated Arabic and formal IDs untouched',()=>{
  expect(translateInterface('المالك','ar')).toBe('المالك');
  expect(translateInterface('SA6210000001400038271200','ar')).toBe('SA6210000001400038271200');
  expect(translateInterface('FR-INV-10045','ar')).toBe('FR-INV-10045');
 });
 it('wires the catalog into the global source language resolver',async()=>{
  const source=await readFile(process.cwd()+'/src/lib/translateInterface.js','utf8');
  const provider=await readFile(process.cwd()+'/src/lib/LanguageContext.jsx','utf8');
  expect(source).toContain('erpInterfacePhrases');
  expect(provider).toContain('useDocumentLocalization({ lang, translateLiteral })');
  expect(provider).toContain("document.documentElement.setAttribute('dir', dir)");
  expect(provider).toContain("document.documentElement.setAttribute('lang', lang)");
 });
});
