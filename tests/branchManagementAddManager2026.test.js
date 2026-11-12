import {describe,it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {branchManagerState} from '../src/lib/branchManagerState.js';
const path='../src/pages/BranchManagement.jsx';
const source=()=>readFile(new URL(path,import.meta.url),'utf8');
const branch={id:'branch-1',key:'main',label:'فرع رئيسي تبوك'};
const dbBranches=[{id:'branch-1',branch_key:'main',name:'فرع رئيسي تبوك'}];
describe('Branch Management Add Manager ERP 2026',()=>{
  it('does not treat legacy manager_name as an actual manager with ERP permission',()=>{
    const result=branchManagerState({branch:{...branch,manager_name:'Typed Manager'},dbBranches,memberships:[]});
    expect(result).toMatchObject({kind:'legacy',members:[]});
  });
  it('shows the approved manager assigned to the matching canonical branch',()=>{
    const members=[
      {id:'wrong-role',role:'employee',branch_id:'branch-1',status:'approved'},
      {id:'wrong-branch',role:'manager',branch_id:'branch-2',status:'approved'},
      {id:'good',role:'manager',branch_id:'branch-1',full_name:'Approved manager',status:'approved'},
    ];
    const result=branchManagerState({branch,dbBranches,memberships:members});
    expect(result.kind).toBe('approved');
    expect(result.members.map(x=>x.id)).toEqual(['good']);
  });
  it('distinguishes suspended manager and true empty branch',()=>{
    const manager={role:'manager',branch_id:'branch-1',status:'suspended',email:'m@example.test'};
    expect(branchManagerState({branch,dbBranches,memberships:[manager]}).kind).toBe('suspended');
    expect(branchManagerState({branch,dbBranches,memberships:[]}).kind).toBe('empty');
  });
  it('does not claim absence of managers when query failed, is loading or branch could not be verified',()=>{
    expect(branchManagerState({branch,dbBranches,loading:true}).kind).toBe('loading');
    expect(branchManagerState({branch,dbBranches,error:true}).kind).toBe('error');
    expect(branchManagerState({branch,dbBranches:[],memberships:[]}).kind).toBe('unresolved');
  });
  it('matches canonical branch key but does not attach managers of another branch',()=>{
    const alt={key:'main'};
    const entries=[{id:'correct',role:'manager',branch_id:'branch-1',status:'approved'},
      {id:'foreign',role:'manager',branch_id:'branch-X',status:'approved'}];
    expect(branchManagerState({branch:alt,dbBranches,memberships:entries}).members.map(x=>x.id)).toEqual(['correct']);
  });
  it('renders Add Manager in page header and each branch card; routes through secured staff invitation page',async()=>{
    const s=await source();
    expect(s).toContain('data-testid="branch-add-manager-header"');
    expect(s).toContain('data-testid="branch-add-manager-action"');
    expect(s).toContain("navigate('/staff-invitations'");
    expect(s).toContain('managerInvitation:{');
    expect(s).toContain('branchId:canonical?.id');
    expect(s).toContain('resolveManagerState(b)');
    expect(s).toContain("if (error) throw error;");
    expect(s).not.toContain("if (error) { console.error('[BM] memberships load error', error); return []; }");
    expect(s).not.toContain("b.manager_email ? (");
  });
  it('prefills selected role and canonical branch only after authorized server RPCs',async()=>{
    const s=await readFile(new URL('../src/components/owner/OwnerStaffProvisioning.jsx',import.meta.url),'utf8');
    expect(s).toContain('useLocation()');
    expect(s).toContain('list_erp_owned_organizations');
    expect(s).toContain('list_erp_owned_branches');
    expect(s).toContain('managerPrefill.current?.restaurantId');
    expect(s).toContain("role: verifiedIntent ? 'manager' : current.role");
    expect(s).toContain('requestedBranch?.id');
    expect(s).toContain('if(verifiedIntent)managerPrefill.current=null');
    expect(s).toContain("supabase.rpc('create_erp_invitation'");
    expect(s).not.toContain("supabase.from('erp_memberships').insert");
  });
});
