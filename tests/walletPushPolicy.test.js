import {describe,it,expect} from 'vitest';
import {walletDeliveryAllowed,walletMessage,walletTestMessage} from '../supabase/functions/wallet-push/messages.ts';
const id='11111111-1111-4111-8111-111111111111';
const event={request_id:id,restaurant_id:'tenant',recipient_id:'user',recipient_role:'beneficiary',status:'pending'};
const request={id,restaurant_id:'tenant',person_id:'person',status:'pending',kind:'fund_wallet',amount:45,currency:'SAR',note:'PRIVATE NOTE'};
const person={id:'person',restaurant_id:'tenant',user_id:'user',is_active:true,name:'Recipient'};
const device={user_id:'user',restaurant_id:'tenant',enabled:true};
const business={name:'Business',is_active:true};
describe('Wallet push delivery boundary',()=>{
 it('delivers only to the exact active beneficiary',()=>expect(walletDeliveryAllowed(device,event,request,person,business,false)).toBe(true));
 it.each([
  [{...device,user_id:'outsider'},event,request,person,business,false],
  [device,{...event,restaurant_id:'other'},request,person,business,false],
  [device,event,{...request,status:'posted'},person,business,false],
  [device,event,request,{...person,user_id:'other'},business,false],
  [device,event,request,{...person,is_active:false},business,false],
  [device,event,request,person,{...business,is_active:false},false],
  [{...device,enabled:false},event,request,person,business,false],
  [device,{...event,recipient_role:'owner'},request,person,business,false],
 ])('cancels stale, disabled or unauthorized recipients (%#)',(...args)=>expect(walletDeliveryAllowed(...args)).toBe(false));
 it('requires current owner membership for owner events',()=>expect(walletDeliveryAllowed(device,{...event,recipient_role:'owner'},request,person,business,true)).toBe(true));
 it.each(['en','ar','fa'])('renders %s with an exact record link and no private notes',lang=>{
  const p=walletMessage(event,request,person,business,lang);expect(p.url).toBe('/wallet-portal?wallet_request='+id);expect(p.body).toContain('SAR');expect(p.body).not.toContain(request.note);expect(p.body).not.toContain(id);expect(p.tag).toBe('wallet:'+id);
  expect(walletMessage({...event,recipient_role:'owner',status:'posted'},request,person,business,lang).url).toBe('/sponsor-treasury?wallet_request='+id);
  expect(walletTestMessage(lang,false).url).toBe('/wallet-portal');
 });
});
