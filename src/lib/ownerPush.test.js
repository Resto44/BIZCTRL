import { describe, it, expect } from 'vitest';
import { validSubscription,eventMessage } from '../../supabase/functions/owner-push/policy.ts';
const sub=(endpoint)=>({endpoint,keys:{p256dh:'a'.repeat(87),auth:'b'.repeat(22)}});
describe('owner push delivery boundaries',()=>{
 it('accepts the browser push providers',()=>{
  for(const url of ['https://fcm.googleapis.com/fcm/send/abc','https://web.push.apple.com/Q/abc','https://updates.push.services.mozilla.com/wpush/v2/abc'])expect(validSubscription(sub(url))).toBe(true);
 });
 it('rejects private hosts, HTTP, credentials, ports and lookalike domains',()=>{
  for(const url of ['https://127.0.0.1/a','http://fcm.googleapis.com/a','https://fcm.googleapis.com.evil.com/a','https://user@fcm.googleapis.com/a','https://fcm.googleapis.com:8443/a','https://evilpush.apple.com/a'])expect(validSubscription(sub(url))).toBe(false);
 });
 it('rejects missing or malformed encryption keys',()=>{
  expect(validSubscription({endpoint:'https://fcm.googleapis.com/a'})).toBe(false);
  expect(validSubscription({...sub('https://fcm.googleapis.com/a'),keys:{p256dh:'x',auth:'y'}})).toBe(false);
 });
 it('bounds notification text and includes the operation and branch',()=>{
  const text=eventMessage({action:'delete',entity:'daily_sales',reference:'Receipt 42',branch:'Main'});
  expect(text).toContain('Deleted');expect(text).toContain('daily sales');expect(text).toContain('Main');
  expect(eventMessage({action:'insert',entity:'products',reference:'x'.repeat(500)}).length).toBeLessThanOrEqual(350);
 });
});
