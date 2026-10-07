// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import { useDocumentLocalization } from '../src/lib/useDocumentLocalization';
import { treasuryMessages, treasuryText } from '../src/lib/treasuryLocalization';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
function Harness({lang, placeholder='Search'}) {
  useDocumentLocalization({lang, translateLiteral: value=>({Search:{ar:'بحث',fa:'جستجو'},Name:{ar:'اسم',fa:'نام'}}[value]?.[lang] || value)});
  return <div><section><input placeholder={placeholder}/><span>Search</span></section><p data-i18n-skip="true">فرع الريان</p></div>;
}
async function render(props) {
  if(!container) {container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);}
  await act(async()=>{root.render(<Harness {...props}/>);await new Promise(r=>setTimeout(r,0));});
}
afterEach(async()=>{if(root) await act(async()=>root.unmount());container?.remove();root=null;container=null;});
it('translates nested attributes on mount and restores English through FA and AR switches',async()=>{
  await render({lang:'ar'});expect(container.querySelector('input').placeholder).toBe('بحث');
  expect(container.querySelector('span').textContent).toBe('بحث');
  await render({lang:'fa'});expect(container.querySelector('input').placeholder).toBe('جستجو');
  expect(container.querySelector('span').textContent).toBe('جستجو');
  await render({lang:'en'});expect(container.querySelector('input').placeholder).toBe('Search');
  expect(container.querySelector('span').textContent).toBe('Search');
  expect(container.querySelector('p').textContent).toBe('فرع الريان');
});
it('adopts changed React placeholders instead of restoring old cached attributes',async()=>{
  await render({lang:'ar'});
  await render({lang:'ar',placeholder:'Name'});
  expect(container.querySelector('input').placeholder).toBe('اسم');
  await render({lang:'en',placeholder:'Name'});
  expect(container.querySelector('input').placeholder).toBe('Name');
});
it('provides every settlement message in all three app languages',()=>{
  for(const [source,entry] of Object.entries(treasuryMessages)) {
    expect(entry.en).toBe(source);expect(entry.fa).toBeTruthy();expect(entry.ar).toBeTruthy();
    expect(treasuryText(source,'fa')).toBe(entry.fa);
    expect(treasuryText(source,'ar')).toBe(entry.ar);
  }
  expect(treasuryText('Owner spending and returns exceed the amount received.','en')).not.toMatch(/[\u0600-\u06ff]/);
});
