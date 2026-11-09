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
