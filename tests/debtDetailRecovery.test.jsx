// @vitest-environment jsdom
import React from 'react';
import { create, act } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn() }));
vi.mock('@/api/base44Client', () => ({base44:{entities:{CollectionAction:{create:mocks.save}}}}));
vi.mock('@/api/supabaseClient', () => ({supabase:{}}));
vi.mock('@/lib/debtCollection', async original => ({...await original(), readDebtHistory:mocks.read}));
vi.mock('@/lib/AuthContext', () => ({useAuth:()=>({user:{email:'staff@example.test'}})}));
vi.mock('@/lib/LanguageContext', () => ({useLanguage:()=>({lang:'en'})}));
vi.mock('@/components/ui/sheet', () => ({Sheet:({children})=><div>{children}</div>,SheetContent:({children})=><div>{children}</div>,SheetHeader:({children})=><div>{children}</div>,SheetTitle:({children})=><h2>{children}</h2>}));
vi.mock('@/components/ui/select', () => {
 const Part=({children})=><div>{children}</div>;
 return {Select:Part,SelectContent:Part,SelectItem:Part,SelectTrigger:Part,SelectValue:Part};
});
import DebtDetailSheet from '@/components/debts/DebtDetailSheet';
let tree;
afterEach(()=>{if(tree)act(()=>tree.unmount());vi.clearAllMocks();});
const debt={id:'d',restaurant_id:'r',party_name:'Customer'};
describe('debt history failure recovery',()=>{
 it('shows a retry instead of false empty history and recovers',async()=>{
  mocks.read.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([[],[{id:'a',notes:'Followed up',created_date:'2026-11-15T10:00:00Z',action_type:'call'}]]);
  await act(async()=>{tree=create(<DebtDetailSheet debt={debt} open/>);});
  expect(tree.root.findAllByProps({role:'alert'})).toHaveLength(1);
  expect(JSON.stringify(tree.toJSON())).not.toContain('No payments recorded');
  const retry=tree.root.findAllByType('button').find(b=>b.children.includes('Retry'));
  await act(async()=>retry.props.onClick());
  expect(tree.root.findAllByProps({role:'alert'})).toHaveLength(0);
  expect(JSON.stringify(tree.toJSON())).toContain('Followed up');
 });
 it('resets saving after a write failure and retains the form',async()=>{
  mocks.read.mockResolvedValue([[],[]]);mocks.save.mockRejectedValue(new Error('offline'));
  await act(async()=>{tree=create(<DebtDetailSheet debt={debt} open/>);});
  act(()=>tree.root.findAllByType('button').find(b=>b.children.includes('+ Add Action')).props.onClick());
  await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));
  expect(tree.root.findAllByProps({role:'alert'})).toHaveLength(1);
  expect(tree.root.findByProps({type:'submit'}).props.disabled).toBe(false);
 });
 it('ignores a previous debt response after switching records',async()=>{
  let resolveOld;
  mocks.read.mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve;})).mockResolvedValueOnce([[],[{id:'new',notes:'New debt',action_type:'call'}]]);
  await act(async()=>{tree=create(<DebtDetailSheet debt={debt} open/>);});
  await act(async()=>tree.update(<DebtDetailSheet debt={{...debt,id:'second'}} open/>));
  await act(async()=>resolveOld([[],[{id:'old',notes:'Old debt',action_type:'call'}]]));
  expect(JSON.stringify(tree.toJSON())).toContain('New debt');
  expect(JSON.stringify(tree.toJSON())).not.toContain('Old debt');
 });
});
