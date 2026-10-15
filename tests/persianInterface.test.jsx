// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { LanguageProvider, useLanguage } from '../src/lib/LanguageContext';
import { translateInterface } from '../src/lib/translateInterface';
import arabicUiPhrases from '../src/lib/arabicUiPhrases';
import persianUiPhrases from '../src/lib/persianUiPhrases';
import { normalizeLanguage } from '../src/lib/localization';
import { useNotify } from '../src/lib/useNotify';
import { toast } from 'sonner';
vi.mock('../src/lib/ownerPush', () => ({ watchPushLanguage: () => () => {} }));
vi.mock('../src/lib/TenantContext', () => ({useTenant: () => ({})}));
vi.mock('../src/lib/AuthContext', () => ({useAuth: () => ({user:{}})}));
vi.mock('../src/lib/notificationEngine', () => ({ notify: {} }));
vi.mock('sonner', () => ({toast:{success:vi.fn(),error:vi.fn(),info:vi.fn(),warning:vi.fn()}}));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let container, root, controls, notifications;
function Harness({count=17, open=true, status='Approved'}) {
  controls = useLanguage(); notifications = useNotify();
  return <><h1>Cash register</h1><p>{`Invoices (${count})`}</p><input placeholder="Search ERP modules" defaultValue="Cash register"/>
    <select defaultValue="Approved"><option>{status}</option><option value="pending">Pending</option></select>
    <div translate="no">Cash register</div><div data-i18n-skip="true">Cash register</div>
    <div contentEditable suppressContentEditableWarning>Cash register</div>
    {open && createPortal(<aside aria-label="Quick Access">System Settings</aside>,document.body)}
  </>;
}
async function render(props={}) {
  if(!root) { container=document.createElement('div'); document.body.appendChild(container); root=createRoot(container); }
  await act(async()=>{root.render(<LanguageProvider><Harness {...props}/></LanguageProvider>);await new Promise(r=>setTimeout(r,0));});
}
afterEach(async()=>{if(root) await act(async()=>root.unmount());container?.remove();root=null;container=null;localStorage.clear();vi.clearAllMocks();});
it('provides reviewed Persian translations for every added phrase and keeps unknown values unchanged',()=>{
  expect(Object.keys(persianUiPhrases).length).toBeGreaterThan(800);
  for(const [source,fa] of Object.entries(persianUiPhrases)) {
    expect(fa).toMatch(/[\u0600-\u06ff]/);expect(translateInterface(source,'fa')).toBe(fa);
  }
  expect(translateInterface('INV-001 / branch-007','fa')).toBe('INV-001 / branch-007');
  expect(translateInterface('  Expenses &amp; purchases  ','fa')).toBe('هزینه‌ها و خریدها');
  expect(normalizeLanguage('fa-IR')).toBe('fa');expect(normalizeLanguage('ar-SA')).toBe('ar');
});
it('localizes native options without changing enum values and preserves editable content',async()=>{
  localStorage.setItem('rc_lang','fa'); await render();
  expect(container.querySelector('h1').textContent).toBe('صندوق نقد');
  expect(container.querySelector('select').value).toBe('Approved');
  expect(container.querySelector('option').textContent).not.toBe('Approved');
  expect(container.querySelector('option[value="pending"]').textContent).not.toBe('Pending');
  expect(container.querySelector('input').placeholder).toBe('جستجوی بخش‌های سیستم');
  expect(container.querySelector('input').value).toBe('Cash register');
  expect(container.querySelector('[translate="no"]').textContent).toBe('Cash register');
  expect(container.querySelector('[contenteditable]').textContent).toBe('Cash register');
  expect(document.querySelector('aside').textContent).toBe('تنظیمات سیستم');
  expect(document.querySelector('aside').getAttribute('aria-label')).toBe('دسترسی سریع');
  expect(document.documentElement.lang).toBe('fa');expect(document.documentElement.dir).toBe('rtl');
});
it('restores English after FA/AR switches and updates live counts and newly opened portals',async()=>{
  localStorage.setItem('rc_lang','fa');await render({open:false});
  await render({count:18,open:true});expect(container.querySelector('p').textContent).toContain('(18)');expect(container.querySelector('p').textContent).not.toContain('Invoices');
  await act(async()=>{controls.setLang('ar');});
  await act(async()=>{controls.setLang('en');});
  expect(container.querySelector('h1').textContent).toBe('Cash register');expect(container.querySelector('p').textContent).toBe('Invoices (18)');
  expect(container.querySelector('option').textContent).toBe('Approved');expect(container.querySelector('select').value).toBe('Approved');
  expect(document.querySelector('aside').textContent).toBe('System Settings');expect(document.documentElement.dir).toBe('ltr');
});
it('synchronizes other tabs and sends localized success and error messages without crashing',async()=>{
  await render();
  await act(async()=>{window.dispatchEvent(new StorageEvent('storage',{key:'rc_lang',newValue:'fa'}));});
  expect(controls.lang).toBe('fa');expect(localStorage.getItem('rc_lang')).toBe('fa');
  notifications.success('All changes saved');notifications.error('Save failed');
  expect(toast.success).toHaveBeenCalledWith('تمام تغییرات ذخیره شد');expect(toast.error).toHaveBeenCalledWith('ذخیره انجام نشد');
});

it('updates implicit option values when React replaces an option label and localizes date labels only',async()=>{
  localStorage.setItem('rc_lang','fa');await render();await render({status:'Rejected'});
  expect(container.querySelector('option').value).toBe('Rejected');
  expect(container.querySelector('option').textContent).toBe('ردشده');
  expect(translateInterface('Tuesday, October 13','fa')).toBe('سه‌شنبه, اکتوبر 13');
  expect(translateInterface('Invoice October 13','fa')).toBe('Invoice October 13');
});

it('renders Arabic on initial load and updates Arabic counts, portals, placeholders and toasts', async () => {
  localStorage.setItem('rc_lang', 'ar-SA');
  await render({open: false});
  expect(controls.lang).toBe('ar');
  expect(container.querySelector('h1').textContent).toBe('صندوق النقد');
  expect(container.querySelector('input').placeholder).toBe('البحث في وحدات ERP');
  expect(container.querySelector('input').value).toBe('Cash register');
  expect(container.querySelector('select').value).toBe('Approved');
  expect(container.querySelector('option').textContent).toBe('معتمد');
  await render({count: 28, open: true});
  expect(container.querySelector('p').textContent).toBe('الفواتير (28)');
  expect(document.querySelector('aside').textContent).toBe('إعدادات النظام');
  expect(document.querySelector('aside').getAttribute('aria-label')).toBe('وصول سريع');
  expect(document.documentElement.dir).toBe('rtl');
  notifications.success('All changes saved');
  notifications.error('Save failed');
  expect(toast.success).toHaveBeenCalledWith('تم حفظ جميع التغييرات');
  expect(toast.error).toHaveBeenCalledWith('فشل الحفظ');
  expect(controls.t('tier_vip')).toBe('عميل مميز');
  await act(async () => controls.setLang('fa'));
  expect(document.querySelector('aside').textContent).toBe('تنظیمات سیستم');
  await act(async () => controls.setLang('en'));
  expect(container.querySelector('p').textContent).toBe('Invoices (28)');
  expect(document.querySelector('aside').textContent).toBe('System Settings');
  await act(async () => controls.setLang('ar'));
  expect(document.querySelector('aside').textContent).toBe('إعدادات النظام');
});

it('covers the added Arabic catalog without translating unknown business identifiers', () => {
  expect(Object.keys(arabicUiPhrases).length).toBeGreaterThan(2000);
  for (const [source, value] of Object.entries(arabicUiPhrases)) {
    expect(value).toMatch(/[\u0600-\u06ff]/);
    expect(translateInterface(source, 'ar')).toBe(value);
  }
  expect(translateInterface('INV-001 / branch-007', 'ar')).toBe('INV-001 / branch-007');
  expect(translateInterface('Tuesday, October 13', 'ar')).not.toMatch(/Tuesday|October/);
});
