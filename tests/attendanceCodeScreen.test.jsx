// @vitest-environment jsdom
import React from 'react';
import {create,act} from 'react-test-renderer';
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
const state=vi.hoisted(()=>({status:{},mutations:[],rpc:vi.fn()}));
vi.mock('@/api/supabaseClient',()=>({supabase:{rpc:(...args)=>state.rpc(...args)}}));
vi.mock('@/lib/LanguageContext',()=>({useLanguage:()=>({translateLiteral:x=>x})}));
vi.mock('@tanstack/react-query',()=>({
 useQuery:()=>({data:state.status,isPending:false,isError:false,dataUpdatedAt:Date.parse("2026-11-07T10:00:00Z")}),
 useQueryClient:()=>({invalidateQueries:vi.fn()}),
 useMutation:options=>{state.mutations.push(options);return {mutate:vi.fn(),isPending:false};},
}));
import EmployeeMobileAttendance from '@/components/attendance/EmployeeMobileAttendance';
let view;
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-07T10:00:00Z'));state.mutations=[];state.rpc.mockReset();state.status={configured:true,branch_id:'branch',branch_name:'Branch',phase:'not_checked_in',can_check_in:true,server_now:'2026-11-07T10:00:00Z',code:'012345',code_action:'in',expires_at:'2026-11-07T10:00:02Z',mail_state:'pending'};});
afterEach(()=>{if(view)act(()=>view.unmount());vi.useRealTimers();});
describe('Employee attendance code screen',()=>{
 it('shows the current code with leading zero then removes it at expiry',()=>{
  act(()=>{view=create(<EmployeeMobileAttendance userId="employee"/>);});
  expect(JSON.stringify(view.toJSON())).toContain('012345');
  act(()=>vi.advanceTimersByTime(3000));
  expect(JSON.stringify(view.toJSON())).not.toContain('012345');
 });
 it('never shows an entry code as an exit credential or a completed shift credential',()=>{
  state.status.phase='checked_in';state.status.can_check_out=true;
  act(()=>{view=create(<EmployeeMobileAttendance userId="employee"/>);});
  expect(JSON.stringify(view.toJSON())).not.toContain('012345');
  state.status.phase='completed';act(()=>view.update(<EmployeeMobileAttendance userId="employee"/>));
  expect(JSON.stringify(view.toJSON())).toContain('Attendance has been completed');
  expect(view.root.findAllByType('input')).toHaveLength(0);
 });
 it('keeps Request Code visible before the opening window and permits early requests only when the server allows them',()=>{
  state.status={...state.status,phase:'waiting',can_check_in:false,request_action:'in',can_request_code:true,code:null,opens_at:'2026-11-07T10:10:00Z',shift_date:'2026-11-07'};
  act(()=>{view=create(<EmployeeMobileAttendance userId="employee"/>);});
  const request=view.root.findAllByType('button').find(b=>b.children.includes('Request new attendance code'));
  expect(request.props.disabled).toBe(false);
  expect(JSON.stringify(view.toJSON())).toContain('Your next shift opens at');
  expect(view.root.findAllByType('input')).toHaveLength(0);
  state.status={...state.status,can_request_code:false};act(()=>view.update(<EmployeeMobileAttendance userId="employee"/>));
  expect(view.root.findAllByType('button').find(b=>b.children.includes('Request new attendance code')).props.disabled).toBe(true);
 });
 it('revalidates server phase before requesting GPS or posting attendance',async()=>{
  act(()=>{view=create(<EmployeeMobileAttendance userId="employee"/>);});
  act(()=>view.root.findAllByType('input').find(n=>n.props.id==='employee-mobile-pin').props.onChange({target:{value:'012345'}}));
  state.rpc.mockResolvedValue({data:{configured:true,phase:'completed'}});
  const mutation=state.mutations[state.mutations.length-2];
  await expect(mutation.mutationFn()).rejects.toThrow('Attendance state changed');
  expect(state.rpc).toHaveBeenCalledTimes(1);
  expect(state.rpc).toHaveBeenCalledWith('erp_attendance_code_status');
 });
});
