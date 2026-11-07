import { describe, it, expect } from 'vitest';
import { invitationCandidates, loadInvitationDirectory } from '../src/lib/invitationDirectory';
describe('invitation directory',()=>{
 const data={employees:[{id:'e',full_name:'Employee',email:'E@test.com',branch_id:'b'},{id:'foreign',branch_id:'other'}],suppliers:[{id:'s',name:'Supplier',phone:'12345678'}],memberships:[{id:'m',role:'manager',full_name:'Manager',branch_id:'b'},{id:'linked',role:'employee',email:'e@test.com',full_name:'Employee',branch_id:'b'}],invitations:[{id:'invite',role:'employee',email:'E@test.com',branch_id:'b'}]};
 it('switches roles and excludes another branch',()=>{
  expect(invitationCandidates(data,'manager','b').map(r=>r.full_name)).toEqual(['Manager']);
  expect(invitationCandidates(data,'supplier','b').map(r=>r.full_name)).toEqual(['Supplier']);
  expect(invitationCandidates(data,'employee','b')).toHaveLength(1);
 });
 it('keeps records with missing contacts available for completion',()=>{
  expect(invitationCandidates({employees:[{id:'a',full_name:'No contact',branch_id:'b'}]},'employee','b')[0].full_name).toBe('No contact');
 });
 it('loads every page with explicit organization filter and minimal fields',async()=>{
  const calls=[];
  const client={from:table=>({select:columns=>({eq:(key,value)=>({order:()=>({range:async(start,end)=>{calls.push({table,columns,key,value,start,end});return {data:table==='employees'&&start===0?Array.from({length:500},(_,id)=>({id})):[]};}})})})})};
  const result=await loadInvitationDirectory(client,'tenant');
  expect(result.employees).toHaveLength(500);
  expect(calls).toHaveLength(5);
  expect(calls.every(c=>c.key==='restaurant_id'&&c.value==='tenant'&&!c.columns.includes('salary'))).toBe(true);
 });
 it('propagates load errors rather than showing an empty successful list',async()=>{
  const client={from:()=>({select:()=>({eq:()=>({order:()=>({range:async()=>({error:new Error('denied')})})})})})};
  await expect(loadInvitationDirectory(client,'tenant')).rejects.toThrow('denied');
 });
});
