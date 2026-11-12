import {describe,it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
const root=new URL('../supabase/templates/',import.meta.url);
const names=['confirmation','recovery','invite','magic_link','email_change','reauthentication'];
describe('Brand-aligned Supabase Auth template sources (deployment remains separate)',()=>{
 it.each(names)('%s uses same accessible button and safe email-client design',async name=>{
  const html=await readFile(new URL(name+'.html',root),'utf8');
  expect(html).toContain('BizCTRL · Business ERP System');
  expect(html).toContain('width:100%;max-width:600px');
  expect(html).toContain('<table role="presentation"');
  expect(html).toContain('lang="ar" dir="rtl"');
  expect(html).toContain('lang="fa" dir="rtl"');
  expect(html).toContain('support@mybizctrl.site');
  expect(html).toContain('target="_blank"');
  expect(html).toContain('https://mybizctrl.site');
  expect(html).not.toContain('AAaa@@2020');
 });
 it.each(names.filter(name=>name!=='reauthentication'))('%s keeps provider-generated ConfirmationURL intact',async name=>{
  const html=await readFile(new URL(name+'.html',root),'utf8');
  expect(html).toContain('href="{{ .ConfirmationURL }}"');
  expect(html).toContain('{{ .ConfirmationURL }}');
  expect(html).not.toContain('{{ .TokenHash }}');
 });
 it('reauthentication preserves provider code rather than inventing a verification URL',async()=>{
  const html=await readFile(new URL('reauthentication.html',root),'utf8');
  expect(html).toContain('{{ .Token }}');
  expect(html).not.toContain('{{ .ConfirmationURL }}');
 });
});
