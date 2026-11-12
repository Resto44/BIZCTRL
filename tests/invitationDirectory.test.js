import { describe, it, expect } from 'vitest';
import { invitationCandidates, loadInvitationDirectory } from '../src/lib/invitationDirectory';
describe('invitation directory',()=>{
 const data={drivers:[{id:'d1',full_name:'Driver One',phone:'0501111111',branch_id:'b'},{id:'d2',full_name:'Driver Two',phone:'0502222222',branch_id:'b'},{id:'d3',full_name:'Driver Three',phone:'0503333333',branch_id:'b'},{id:'other-driver',full_name:'Other branch',phone:'0504444444',branch_id:'other'}],employees:[{id:'e',full_name:'Employee',email:'E@test.com',branch_id:'b'},{id:'foreign',branch_id:'other'}],suppliers:[{id:'s',name:'Supplier',phone:'12345678'}],memberships:[{id:'m',role:'manager',full_name:'Manager',branch_id:'b'},{id:'linked',role:'employee',email:'e@test.com',full_name:'Employee',branch_id:'b'}],invitations:[{id:'invite',role:'employee',email:'E@test.com',branch_id:'b'}]};
 it('switches roles and excludes another branch',()=>{
  expect(invitationCandidates(data,'manager','b').map(r=>r.full_name)).toEqual(['Manager']);
  expect(invitationCandidates(data,'supplier','b').map(r=>r.full_name)).toEqual(['Supplier']);
  expect(invitationCandidates(data,'employee','b')).toHaveLength(1);
  expect(invitationCandidates(data,'driver','b').map(r=>r.full_name)).toEqual(['Driver One','Driver Two','Driver Three']);
 });
 it('shows ALL managers of the selected store across branches and preserves their account states',()=>{
  const dataset={memberships:[
    {id:'m1',role:'manager',full_name:'First Manager',email:'one@demo.test',branch_id:'b',status:'approved'},
    {id:'m2',role:'manager',full_name:'Second Manager',email:'two@demo.test',branch_id:'other',status:'suspended'},
    {id:'m3',role:'employee',full_name:'Not a Manager',branch_id:'b',status:'approved'},
  ],invitations:[
    {id:'i1',role:'manager',full_name:'Invited Manager',email:'invited@demo.test',branch_id:'other',status:'pending'},
    {id:'duplicate',role:'manager',full_name:'Duplicate invite',email:'one@demo.test',branch_id:'b',status:'pending'},
  ]};
  const result=invitationCandidates(dataset,'manager','b');
  expect(result.map(x=>x.full_name)).toEqual(['First Manager','Second Manager','Invited Manager']);
  expect(result.map(x=>x.branch_id)).toEqual(['b','other','other']);
  expect(result.every(x=>x.canCreateInvitation===false)).toBe(true);
  expect(result.find(x=>x.id==='m2')?.status).toBe('suspended');
 });
 it('keeps separate manager assignments on distinct branches even if the verified email matches',()=>{
  const m={role:'manager',full_name:'One Manager',email:'manager@demo.test',status:'approved'};
  const result=invitationCandidates({memberships:[
    {...m,id:'branch-a',branch_id:'b'},
    {...m,id:'branch-b',branch_id:'other'},
  ]},'manager','b');
  expect(result.map(x=>x.id)).toEqual(['branch-a','branch-b']);
 });
 it('never uses another role as a manager candidate and does not treat a registered manager as inviteable',()=>{
  const entries=invitationCandidates({
    memberships:[{id:'1',role:'employee',full_name:'Employee',branch_id:'b'},
      {id:'2',role:'manager',full_name:'Active Manager',branch_id:'b',status:'approved'}],
  },'manager','b');
  expect(entries.map(x=>x.full_name)).toEqual(['Active Manager']);
  expect(entries[0].canCreateInvitation).toBe(false);
 });
 it('does not duplicate a driver when an invitation has the same normalized phone',()=>{
  const candidates=invitationCandidates({drivers:[{id:'d1',full_name:'Driver One',phone:'+966 50 123 4567',branch_id:'b'}],invitations:[{id:'invite-d1',role:'driver',phone:'966501234567',branch_id:'b'}]},'driver','b');
  expect(candidates).toHaveLength(1);
  expect(candidates[0]).toMatchObject({id:'d1',source:'record'});
 });
 it('keeps records with missing contacts available for completion',()=>{
  expect(invitationCandidates({employees:[{id:'a',full_name:'No contact',branch_id:'b'}]},'employee','b')[0].full_name).toBe('No contact');
 });
 it('loads every page with explicit organization filter and minimal fields',async()=>{
  const calls=[];
  const client={from:table=>({select:columns=>({eq:(key,value)=>({order:()=>({range:async(start,end)=>{calls.push({table,columns,key,value,start,end});return {data:table==='employees'&&start===0?Array.from({length:500},(_,id)=>({id})):table==='drivers'&&start===0?[{id:'d1'},{id:'d2'},{id:'d3'}]:[]};}})})})})};
  const result=await loadInvitationDirectory(client,'tenant');
  expect(result.employees).toHaveLength(500);
  expect(result.drivers).toHaveLength(3);
  expect(calls).toHaveLength(6);
  expect(calls.find(c=>c.table==='drivers').columns).toBe('id,full_name,email,phone,branch_id');
  expect(calls.every(c=>c.key==='restaurant_id'&&c.value==='tenant'&&!c.columns.includes('salary'))).toBe(true);
 });
 it('propagates load errors rather than showing an empty successful list',async()=>{
  const client={from:()=>({select:()=>({eq:()=>({order:()=>({range:async()=>({error:new Error('denied')})})})})})};
  await expect(loadInvitationDirectory(client,'tenant')).rejects.toThrow('denied');
 });
});
