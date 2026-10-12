import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({getSession:vi.fn(),rpc:vi.fn()}));
vi.mock('@/api/supabaseClient',()=>({supabase:{auth:{getSession:mocks.getSession},rpc:mocks.rpc}}));
import {platformOwnerApi} from '../src/lib/platformOwnerApi';
describe('Platform Owner session entry',()=>{
 beforeEach(()=>{vi.resetAllMocks();});
 it('does not call the restricted RPC for a signed-out visitor',async()=>{
  mocks.getSession.mockResolvedValue({data:{session:null},error:null});
  expect(await platformOwnerApi.snapshot()).toMatchObject({authenticated:false,authorized:false,session_expired:true});
  expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it('takes authorization and MFA exclusively from the server for a session',async()=>{
  mocks.getSession.mockResolvedValue({data:{session:{access_token:'test-token'}},error:null});
  const snapshot={authenticated:true,authorized:true,mfa_required:true,mfa_verified:false};
  mocks.rpc.mockResolvedValue({data:snapshot,error:null});
  expect(await platformOwnerApi.snapshot()).toEqual(snapshot);
  expect(mocks.rpc).toHaveBeenCalledWith('platform_owner_session_snapshot',{});
 });
 it('keeps a non-owner denied',async()=>{
  mocks.getSession.mockResolvedValue({data:{session:{access_token:'test-token'}},error:null});
  mocks.rpc.mockResolvedValue({data:{authenticated:true,authorized:false},error:null});
  expect((await platformOwnerApi.snapshot()).authorized).toBe(false);
 });
 it.each([{status:401},{code:'PGRST301'},{code:'PGRST303'}])('routes an expired RPC session back to sign in (%j)',async error=>{
  mocks.getSession.mockResolvedValue({data:{session:{access_token:'test-token'}},error:null});
  mocks.rpc.mockResolvedValue({data:null,error});
  expect(await platformOwnerApi.snapshot()).toMatchObject({authenticated:false,authorized:false});
 });
 it('handles a rejected refresh token without requesting platform data',async()=>{
  mocks.getSession.mockResolvedValue({data:{session:null},error:{code:'refresh_token_not_found'}});
  expect((await platformOwnerApi.snapshot()).authenticated).toBe(false);
  expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it.each([{status:503,message:'network unavailable'},{code:'42501',message:'permission denied'}])('preserves real backend errors for retry (%j)',async error=>{
  mocks.getSession.mockResolvedValue({data:{session:{access_token:'test-token'}},error:null});
  mocks.rpc.mockResolvedValue({data:null,error});
  await expect(platformOwnerApi.snapshot()).rejects.toBe(error);
 });
 it('preserves auth service outages rather than treating them as signed out',async()=>{
  const error={status:503,message:'unavailable'};
  mocks.getSession.mockResolvedValue({data:null,error});
  await expect(platformOwnerApi.snapshot()).rejects.toBe(error);
 });
});
