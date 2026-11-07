// @vitest-environment jsdom
import React from 'react';
import {create,act} from 'react-test-renderer';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
const mock=vi.hoisted(()=>({start:vi.fn(),stop:vi.fn()}));
vi.mock('@/api/supabaseClient',()=>({supabase:{rpc:vi.fn()}}));
vi.mock('@/lib/LanguageContext',()=>({useLanguage:()=>({translateLiteral:x=>x})}));
vi.mock('@/lib/shiftLocationSharing',()=>({startShiftLocationSharing:(...args)=>mock.start(...args)}));
import EmployeeLiveLocation from '@/components/attendance/EmployeeLiveLocation';
let view;
beforeEach(()=>{sessionStorage.clear();mock.start.mockReset();mock.stop.mockReset();mock.start.mockImplementation(options=>{options.onState('sharing');return mock.stop;});});
afterEach(()=>{if(view)act(()=>view.unmount());});
it('requires new consent then remembers only the current shift across remounts',()=>{
 act(()=>{view=create(<EmployeeLiveLocation sessionId="s"/>);});
 expect(mock.start).not.toHaveBeenCalled();
 act(()=>view.root.findByType('button').props.onClick());
 expect(mock.start).toHaveBeenCalledTimes(1);expect(mock.start.mock.calls[0][0].resumeOnVisible).toBe(true);
 act(()=>view.unmount());act(()=>{view=create(<EmployeeLiveLocation sessionId="s"/>);});
 expect(mock.start).toHaveBeenCalledTimes(2);
 act(()=>view.update(<EmployeeLiveLocation sessionId="other"/>));
 expect(mock.start).toHaveBeenCalledTimes(2);
});
it('manual stop overrides initial check-in consent and does not restart after remount',()=>{
 function Parent(){const [consent,setConsent]=React.useState(true);return <EmployeeLiveLocation sessionId="s" startWithConsent={consent} onStop={()=>setConsent(false)}/>;}
 act(()=>{view=create(<Parent/>);});expect(mock.start).toHaveBeenCalledTimes(1);
 act(()=>view.root.findByType('button').props.onClick());
 expect(sessionStorage.getItem('attendance-history-consent:s')).toBe(null);
 expect(mock.start).toHaveBeenCalledTimes(1);
 act(()=>view.unmount());act(()=>{view=create(<EmployeeLiveLocation sessionId="s"/>);});
 expect(mock.start).toHaveBeenCalledTimes(1);
});
