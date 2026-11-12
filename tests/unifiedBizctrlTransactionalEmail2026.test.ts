import {describe,it,expect} from 'vitest';
import {renderBizctrlTransactionalEmail} from '../supabase/functions/_shared/bizctrlEmailTemplate.ts';

const token='a'.repeat(64);
const expiresAt='2026-11-19T10:34:33.203Z';
const staffUrl='https://mybizctrl.site/erp-register?token='+token;
const customerUrl='https://mybizctrl.site/customer-portal#invite='+token;
describe('unified secure BizCTRL transactional email design',()=>{
 it.each(['owner','manager','employee','supplier','driver','wallet'])('branded role email for %s never changes token or destination',role=>{
  const r=renderBizctrlTransactionalEmail({
   kind:'staff',name:'دابر خان',role,businessName:'Supermarket <script>alert(1)</script>',
   businessType:'supermarket',branchName:'Main',url:staffUrl,expiresAt,
  });
  expect(r.subject.toLowerCase()).toContain(role);
  expect(r.html).toContain('Activate ERP account');
  expect(r.html).toContain('href="'+staffUrl+'"');
  expect(r.html).toContain('lang="ar" dir="rtl"');
  expect(r.html).toContain('lang="fa" dir="rtl"');
  expect(r.html).toContain('width:100%;max-width:600px');
  expect(r.html).toContain('&lt;script&gt;');
  expect(r.html).not.toContain('<script>');
  expect(r.html).toContain('Supermarket');
  expect(r.html).toContain('Main');
  expect(r.html).toContain('Riyadh, UTC+3');
  expect(r.html).toContain('support@mybizctrl.site');
  expect(r.text).toContain(staffUrl);
  expect(r.text).toContain('separate verification message');
 });
 it('customer portal retains its own single use link and separate auth verification step',()=>{
  const email=renderBizctrlTransactionalEmail({kind:'customer',name:'امان',
   businessName:'My Supermarket',businessType:'supermarket',url:customerUrl,expiresAt});
  expect(email.html).toContain('Open invitation & register');
  expect(email.html).toContain('My Supermarket');
  expect(email.text).toContain('Reopen this invitation');
  expect(email.text).toContain('verification email is requested only after you register');
 });
 it('keeps employee OTP leading zeros and does not pretend it activates a new account',()=>{
  const email=renderBizctrlTransactionalEmail({kind:'attendance',name:'Employee',
   businessName:'Shop',businessType:'retail',code:'001042',phase:'in',
   url:'https://mybizctrl.site/erp-login',expiresAt});
  expect(email.html).toContain('001042');
  expect(email.text).toContain('001042');
  expect(email.html).toContain('Open employee dashboard');
  expect(email.html).not.toContain('Activate ERP account');
  expect(()=>renderBizctrlTransactionalEmail({kind:'attendance',url:'https://mybizctrl.site/erp-login',expiresAt,code:'12345'})).toThrow('INVALID_ATTENDANCE_CODE');
 });
 it('forbids external hosts, lookalike sites, arbitrary paths, query injection and wrong tokens',()=>{
  for(const url of [
   'https://mybizctrl.site.evil.com/erp-register?token='+token,
   'https://example.com/erp-register?token='+token,
   'https://mybizctrl.site/erp-register?token=bad',
   'https://mybizctrl.site/erp-register?token='+token+'&redirect=evil',
   'https://mybizctrl.site/erp-register?token='+token+'#access',
   'https://mybizctrl.site/erp-login?token='+token,
  ])expect(()=>renderBizctrlTransactionalEmail({kind:'staff',url,expiresAt})).toThrow('INVALID_BIZCTRL_EMAIL_URL');
 });
 it('refuses invalid expiry and escapes malicious display fields',()=>{
  expect(()=>renderBizctrlTransactionalEmail({kind:'staff',url:staffUrl,expiresAt:'invalid'})).toThrow('INVALID_BIZCTRL_EMAIL_EXPIRY');
  const r=renderBizctrlTransactionalEmail({kind:'staff',url:staffUrl,expiresAt,
   name:'<img src=x onerror=evil()>',role:'employee',businessName:'Store'});
  expect(r.html).toContain('&lt;img');
  expect(r.html).not.toContain('<img src');
 });
});
