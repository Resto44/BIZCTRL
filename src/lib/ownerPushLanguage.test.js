import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const auth=vi.hoisted(()=>({getSession:vi.fn()}));
vi.mock('@/api/supabaseClient',()=>({supabase:{auth},SUPABASE_URL:'https://example.test',SUPABASE_ANON_KEY:'public'}));
import {syncPushLanguage} from './ownerPush';
let subscription;
beforeEach(()=>{
 auth.getSession.mockResolvedValue({data:{session:{access_token:'user-token'}}});
 subscription=vi.fn().mockResolvedValue({endpoint:'https://web.push.apple.com/device-one'});
 vi.stubGlobal('window',{isSecureContext:true,PushManager:{},Notification:{}});
 vi.stubGlobal('navigator',{serviceWorker:{getRegistration:vi.fn().mockResolvedValue({pushManager:{getSubscription:subscription}})}});
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({synced:true})}));
});
afterEach(()=>vi.unstubAllGlobals());
describe('device language synchronization',()=>{
 it('updates only the existing device, in language-change order',async()=>{
  const first=syncPushLanguage('fa');const second=syncPushLanguage('ar');
  await Promise.all([first,second]);
  expect(fetch.mock.calls.map(c=>JSON.parse(c[1].body))).toEqual([
   {endpoint:'https://web.push.apple.com/device-one',language:'fa'},
   {endpoint:'https://web.push.apple.com/device-one',language:'ar'},
  ]);
  expect(fetch.mock.calls[0][0]).toBe('https://example.test/functions/v1/owner-push/language');
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer user-token');
 });
 it('does not register or send when signed out or no push subscription exists',async()=>{
  auth.getSession.mockResolvedValue({data:{session:null}});
  await syncPushLanguage('fa');expect(fetch).not.toHaveBeenCalled();
  auth.getSession.mockResolvedValue({data:{session:{access_token:'user-token'}}});
  subscription.mockResolvedValue(null);await syncPushLanguage('en');expect(fetch).not.toHaveBeenCalled();
 });
 it('recovers after a failed sync so the next language can be saved',async()=>{
  fetch.mockRejectedValueOnce(new Error('Offline'));
  await expect(syncPushLanguage('fa')).rejects.toThrow('Offline');
  await expect(syncPushLanguage('en')).resolves.toBeUndefined();
  expect(JSON.parse(fetch.mock.calls[1][1].body).language).toBe('en');
 });
});
