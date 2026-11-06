// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { create, act } from 'react-test-renderer';
const state = vi.hoisted(() => ({ path: '/tasks', queries: [], calls: [], can: { viewTasks: true, recordAttendance: true }, tasks: [] }));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1', email: 'staff@example.test', full_name: 'Staff name', restaurant_id: 'org-1', branch_id: 'branch-1' }, logout: vi.fn() }) }));
vi.mock('@/lib/TenantContext', () => ({ useTenant: () => ({ managerBranchObject: null }) }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ translateLiteral: x => x, isRTL: false, lang: 'en' }) }));
vi.mock('@/lib/RoleContext', () => ({ useRole: () => ({ can: state.can }) }));
vi.mock('react-router-dom', () => ({ useLocation: () => ({ pathname: state.path, search: '' }), useNavigate: () => vi.fn(), Link: ({children}) => <a>{children}</a> }));
vi.mock('@tanstack/react-query', () => ({ useQuery: options => { state.queries.push(options); return { data: options.queryKey[0] === 'emp-tasks' ? state.tasks : [], refetch: vi.fn() }; } }));
vi.mock('@/api/supabaseClient', () => ({ supabase: { from: table => { state.calls.push(['from',table]); const query = {}; for (const method of ['select','eq','in','order','limit','or']) query[method] = (...args) => { state.calls.push([method,...args]); return query; }; query.then = resolve => resolve({data:[],error:null}); return query; } } }));
vi.mock('@/components/attendance/EmployeeMobileAttendance', () => ({ default: () => <div>Personal attendance</div> }));
vi.mock('@/components/help/HelpLink', () => ({default: () => null}));
vi.mock('@/components/shared/PortalDataState', () => ({default: () => <div>Data state</div>}));
vi.mock('@/lib/SubscriptionContext', () => ({useSubscription: () => ({loading:false,summary:{found:true},status:'TRIAL',trialDaysRemaining:20})}));
import EmployeeDashboard from '@/pages/EmployeeDashboardERP';
import SubscriptionStatusBanner from '@/components/subscription/SubscriptionStatusBanner';

beforeEach(() => { state.queries=[]; state.calls=[]; state.tasks=[]; state.path='/tasks'; state.can={ viewTasks:true,recordAttendance:true }; });
describe('Employee personal workspace', () => {
  it('scopes tasks to organization, branch and both supported own identifiers', async () => {
    act(() => { create(<EmployeeDashboard />); });
    await state.queries.find(q=>q.queryKey[0]==='emp-tasks').queryFn();
    expect(state.calls).toContainEqual(['eq','restaurant_id','org-1']);
    expect(state.calls).toContainEqual(['eq','branch_id','branch-1']);
    expect(state.calls).toContainEqual(['in','assigned_to',['user-1','staff@example.test']]);
    expect(state.queries.some(q=>q.queryKey[0]==='emp-profile')).toBe(false);
  });
  it('uses personal attendance without a management employee picker', () => {
    state.path='/employee-attendance'; let view;
    act(() => { view=create(<EmployeeDashboard/>); });
    const output=JSON.stringify(view.toJSON());
    expect(output).toContain('Personal attendance');
    expect(output).not.toContain('Select employee');
    expect(output).toContain('Staff name');
  });
  it('does not read tasks or offer attendance when permissions are absent', () => {
    state.can={}; let view; act(()=>{view=create(<EmployeeDashboard/>);});
    expect(state.queries.find(q=>q.queryKey[0]==='emp-tasks').enabled).toBeFalsy();
    expect(JSON.stringify(view.toJSON())).not.toContain('Personal attendance');
  });
  it('treats legacy done and completed as completed when filtering', () => {
    state.tasks=[{id:'1',title:'Legacy task',status:'done'},{id:'2',title:'Current task',status:'completed'},{id:'3',title:'Open task',status:'pending'}];
    let view; act(()=>{view=create(<EmployeeDashboard/>);});
    const open=view.root.findAllByType('button').find(b=>b.children.includes('Open'));
    act(()=>open.props.onClick());
    const output=JSON.stringify(view.toJSON());
    expect(output).toContain('Open task'); expect(output).not.toContain('Legacy task'); expect(output).not.toContain('Current task');
  });
  it('hides billing from employees without billing permission', () => {
    let view; act(()=>{view=create(<SubscriptionStatusBanner/>);}); expect(view.toJSON()).toBeNull();
    state.can.viewBilling=true; act(()=>{view.update(<SubscriptionStatusBanner/>);}); expect(view.toJSON()).not.toBeNull();
  });
});
