// @vitest-environment jsdom
import React from 'react';
import {create,act} from 'react-test-renderer';
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
const state=vi.hoisted(()=>({query:{}}));
vi.mock('@/api/supabaseClient',()=>({supabase:{rpc:vi.fn()}}));
vi.mock('@/lib/LanguageContext',()=>({useLanguage:()=>({translateLiteral:x=>x})}));
vi.mock('@tanstack/react-query',()=>({useQuery:()=>state.query}));
import OwnerLiveLocations from '@/components/attendance/OwnerLiveLocations';
let view;
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-07T13:00:00Z'));state.query={isError:false,data:{server_now:'2026-11-07T13:00:00Z',receivedOnClient:Date.now(),employees:[{session_id:'s',employee_name:'Test',branch_name:'Branch',received_at:'2026-11-07T13:00:00Z',status:'inside',latitude:28.123456,longitude:36.123456,accuracy_m:5,distance_m:0,branch_latitude:28.123456,branch_longitude:36.123456,radius_m:100}]}};});
afterEach(()=>{act(()=>view?.unmount());vi.useRealTimers();});
describe('Owner location freshness',()=>{
 it('removes both coordinates and external map link at 120 seconds even without a new server response',()=>{
  act(()=>{view=create(<OwnerLiveLocations restaurantId="r"/>);});
  expect(view.root.findAllByType('a')).toHaveLength(1);
  act(()=>vi.advanceTimersByTime(120000));
  expect(JSON.stringify(view.toJSON())).not.toContain('28.123456');
  expect(view.root.findAllByType('a')).toHaveLength(0);
  expect(JSON.stringify(view.toJSON())).toContain('Unknown — no fresh shared location');
 });
 it('does not present cached position as live when refresh fails',()=>{
  state.query.isError=true;act(()=>{view=create(<OwnerLiveLocations restaurantId="r"/>);});
  expect(view.root.findAllByType('a')).toHaveLength(0);
  expect(JSON.stringify(view.toJSON())).not.toContain('28.123456');
  expect(JSON.stringify(view.toJSON())).toContain('Presence cannot be confirmed.');
 });
});
