// @vitest-environment jsdom
import React from 'react';
import {act,create} from 'react-test-renderer';
import {describe,it,expect,vi,afterEach} from 'vitest';
const mocks=vi.hoisted(()=>({request:vi.fn(),current:vi.fn(),supported:vi.fn(),sync:vi.fn().mockResolvedValue({ok:true})}));
vi.mock('@/lib/ownerPush',()=>({pushRequest:mocks.request,currentPushSubscription:mocks.current,pushSupported:mocks.supported,syncWalletPushLanguage:mocks.sync,applicationKey:()=>new Uint8Array([1])}));
import WalletPushSettings from '../src/components/wallet-banking/WalletPushSettings';
const text=n=>typeof n==='string'?n:(n.children||[]).map(text).join('');
const button=(t,label)=>t.root.findAllByType('button').find(b=>text(b)===label);
afterEach(()=>vi.unstubAllGlobals());
async function setup({permission='granted',enabled=false,supported=true}={}){
 const sub={endpoint:'https://web.push.apple.com/test',toJSON:()=>({endpoint:'https://web.push.apple.com/test',keys:{p256dh:'key',auth:'auth'}})};
 const requestPermission=vi.fn().mockResolvedValue(permission),subscribe=vi.fn().mockResolvedValue(sub),register=vi.fn().mockResolvedValue({});
 vi.stubGlobal('Notification',{permission:enabled?'granted':'default',requestPermission});
 vi.stubGlobal('navigator',{serviceWorker:{register,ready:Promise.resolve({pushManager:{getSubscription:async()=>null,subscribe}})}});
 mocks.supported.mockReturnValue(supported);mocks.current.mockResolvedValue(enabled?sub:null);
 mocks.request.mockReset().mockImplementation(async action=>action==='config'?{publicKey:'key'}:action==='status'?{enabled}:{ok:true});
 let tree;await act(async()=>{tree=create(<WalletPushSettings restaurantId="tenant" lang="en"/>);});
 return {tree,requestPermission,subscribe,register,sub};
}
describe('Wallet device push controls',()=>{
 it('requires an explicit permission click before creating a subscription',async()=>{
  const {tree,requestPermission,subscribe}=await setup();expect(requestPermission).not.toHaveBeenCalled();
  await act(async()=>button(tree,'Enable notifications').props.onClick());expect(requestPermission).toHaveBeenCalledOnce();expect(subscribe).toHaveBeenCalledOnce();
  expect(mocks.request).toHaveBeenCalledWith('subscribe',expect.objectContaining({restaurantId:'tenant',language:'en'}),'wallet-push');expect(text(tree.root)).toContain('Enabled on this device');tree.unmount();
 });
 it('does not subscribe when permission is refused',async()=>{
  const {tree,register}=await setup({permission:'denied'});await act(async()=>button(tree,'Enable notifications').props.onClick());expect(register).not.toHaveBeenCalled();expect(text(tree.root)).toContain('Allow notifications in device settings');tree.unmount();
 });
 it('only sends a test after the test button is clicked and disables wallet scope only',async()=>{
  const {tree,sub}=await setup({enabled:true});expect(mocks.request.mock.calls.some(c=>c[0]==='test')).toBe(false);
  await act(async()=>button(tree,'Send test').props.onClick());expect(mocks.request).toHaveBeenCalledWith('test',{restaurantId:'tenant',endpoint:sub.endpoint,language:'en'},'wallet-push');
  await act(async()=>button(tree,'Turn off wallet alerts').props.onClick());expect(mocks.request).toHaveBeenCalledWith('unsubscribe',expect.objectContaining({restaurantId:'tenant'}),'wallet-push');expect(text(tree.root)).toContain('Not enabled on this device');tree.unmount();
 });
 it('explains unsupported browsers without requesting permission',async()=>{
  const {tree,requestPermission}=await setup({supported:false});expect(button(tree,'Enable notifications').props.disabled).toBe(true);expect(requestPermission).not.toHaveBeenCalled();tree.unmount();
 });
});

describe('Wallet notification language visibility',()=>{
 it('shows active language and synchronizes a change without sending a test',async()=>{
  const {tree,sub}=await setup({enabled:true});
  await act(async()=>tree.update(<WalletPushSettings restaurantId="tenant" lang="fa"/>));
  expect(mocks.sync).toHaveBeenLastCalledWith(sub.endpoint,'fa');
  expect(text(tree.root)).toContain('فارسی');expect(text(tree.root)).toContain('مطابق زبان انتخاب‌شدۀ برنامه');
  expect(text(tree.root)).toContain('پیش از تأیید');expect(text(tree.root)).toContain('پس از تأیید یا رد');
  expect(mocks.request.mock.calls.some(c=>c[0]==='test')).toBe(false);
  tree.unmount();
 });
});
