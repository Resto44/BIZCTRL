// @vitest-environment jsdom
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {startShiftLocationSharing} from '../src/lib/shiftLocationSharing';
let rpc,geo,visibility,onState,stop;
const flush=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
const point=()=>({coords:{latitude:28,longitude:36,accuracy:5},timestamp:Date.now()});
beforeEach(()=>{
 vi.useFakeTimers();rpc=vi.fn(async name=>({data:name.endsWith('_start')?'consent-token':null}));
 geo={getCurrentPosition:vi.fn()};visibility=new EventTarget();visibility.visibilityState='visible';onState=vi.fn();
});
afterEach(()=>{stop?.();stop=null;vi.useRealTimers();});
const start=()=>{stop=startShiftLocationSharing({sessionId:'shift',rpc,geolocation:geo,visibility,onState});};
describe('consented shift location lifecycle',()=>{
 it('requests a new fix for every heartbeat instead of replaying a cached location',async()=>{
  start();await flush();expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);
  await geo.getCurrentPosition.mock.calls[0][0](point());await flush();
  expect(rpc.mock.calls.filter(([n])=>n.endsWith('_update'))).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(30000);
  expect(geo.getCurrentPosition).toHaveBeenCalledTimes(2);
  expect(rpc.mock.calls.filter(([n])=>n.endsWith('_update'))).toHaveLength(1);
 });
 it('stops on hidden page and rejects a pending GPS callback',async()=>{
  start();await flush();visibility.visibilityState='hidden';visibility.dispatchEvent(new Event('visibilitychange'));
  await geo.getCurrentPosition.mock.calls[0][0](point());await flush();await vi.advanceTimersByTimeAsync(60000);
  expect(rpc.mock.calls.some(([n])=>n.endsWith('_update'))).toBe(false);
  expect(rpc).toHaveBeenCalledWith('erp_attendance_location_stop',{p_session:'shift',p_token:'consent-token'});
  expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);
 });
 it('revokes late consent if unmounted or checked out while start is pending',async()=>{
  let resolve;rpc.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));start();stop();
  resolve({data:'late-token'});await flush();
  expect(geo.getCurrentPosition).not.toHaveBeenCalled();
  expect(rpc).toHaveBeenCalledWith('erp_attendance_location_stop',{p_session:'shift',p_token:'late-token'});
 });
 it('does not send an old GPS fix or retry after a permission failure',async()=>{
  start();await flush();await geo.getCurrentPosition.mock.calls[0][0]({...point(),timestamp:Date.now()-16000});
  expect(rpc.mock.calls.some(([n])=>n.endsWith('_update'))).toBe(false);
  expect(onState).toHaveBeenLastCalledWith('error');
  await vi.advanceTimersByTimeAsync(60000);expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);
 });
 it('supports Supabase RPC thenables without a catch method when stopping',async()=>{
  rpc.mockImplementation(name=>({then:resolve=>resolve({data:name.endsWith('_start')?'token':null})}));
  start();await flush();expect(()=>stop()).not.toThrow();
  expect(rpc).toHaveBeenCalledWith('erp_attendance_location_stop',{p_session:'shift',p_token:'token'});
 });
 it('stops collecting after server rejects an expired or closed session',async()=>{
  rpc.mockImplementation(async name=>name.endsWith('_update')?{error:new Error('closed')}:{data:'token'});
  start();await flush();await geo.getCurrentPosition.mock.calls[0][0](point());
  await vi.advanceTimersByTimeAsync(60000);expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);
  expect(onState).toHaveBeenLastCalledWith('error');
 });
});
