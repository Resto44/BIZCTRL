// @vitest-environment jsdom
import React from 'react';
import { create, act } from 'react-test-renderer';
import { describe, it, expect, vi } from 'vitest';
const state=vi.hoisted(()=>({data:{employees:[{id:'e',full_name:'Employee A',email:'a@test.com',branch_id:'b'}],memberships:[{id:'m',role:'manager',full_name:'Manager B',email:'b@test.com',branch_id:'b'}]}}));
vi.mock('@tanstack/react-query',()=>({useQuery:()=>({data:state.data,isPending:false,isError:false})}));
vi.mock('@/api/supabaseClient',()=>({supabase:{}}));
vi.mock('@/lib/LanguageContext',()=>({useLanguage:()=>({translateLiteral:x=>x})}));
import InvitationDirectory from '@/components/owner/InvitationDirectory';
describe('role directory interaction',()=>{
 it('shows role list immediately and passes selected identity once per click',()=>{
  const select=vi.fn();let view;
  act(()=>{view=create(<InvitationDirectory restaurantId="r" branchId="b" role="employee" onSelect={select}/>);});
  expect(JSON.stringify(view.toJSON())).toContain('Employee A');
  expect(JSON.stringify(view.toJSON())).not.toContain('Manager B');
  act(()=>view.root.findByType('button').props.onClick());
  expect(select).toHaveBeenCalledWith(expect.objectContaining({email:'a@test.com',full_name:'Employee A'}));
  act(()=>view.update(<InvitationDirectory restaurantId="r" branchId="b" role="manager" busy onSelect={select}/>));
  expect(JSON.stringify(view.toJSON())).toContain('Manager B');
  expect(JSON.stringify(view.toJSON())).not.toContain('Employee A');
  expect(view.root.findByType('button').props.disabled).toBe(true);
  act(()=>view.unmount());
 });
});
