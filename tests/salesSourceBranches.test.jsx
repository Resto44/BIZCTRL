// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/LanguageContext', () => ({useLanguage: () => ({lang:'en',t:key=>key})}));
import { SalesSourceDialog, newSalesClosingSource } from '@/components/sales/SalesClosingCustomizationDialogs';
let root, container;
const branches=[{id:'branch-a',name:'فرع الريان'},{id:'branch-b',name:'فرع دخل'}];
const checkbox=name=>[...document.querySelectorAll('label')].find(label=>label.textContent===name)?.querySelector('input');
const button=text=>[...document.querySelectorAll('button')].find(button=>button.textContent===text);
beforeEach(()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  globalThis.ResizeObserver=class{observe(){} unobserve(){} disconnect(){}};
  window.matchMedia=vi.fn(()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
  container=document.createElement('div');document.body.append(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.restoreAllMocks();});
it('selects multiple branches, deselects one, and submits the remaining selection with other fields intact',async()=>{
  const onSave=vi.fn();
  const source={...newSalesClosingSource(),name_en:'Delivery',is_global:false,allows_driver_entries:true};
  await act(async()=>root.render(<SalesSourceDialog editor={{mode:'create',source}} branches={branches} onSave={onSave} onClose={()=>{}}/>));
  await act(async()=>checkbox('فرع الريان').click());
  expect(checkbox('فرع الريان').checked).toBe(true);
  await act(async()=>checkbox('فرع دخل').click());
  expect(checkbox('فرع الريان').checked).toBe(true);
  expect(checkbox('فرع دخل').checked).toBe(true);
  await act(async()=>checkbox('فرع الريان').click());
  expect(checkbox('فرع الريان').checked).toBe(false);
  await act(async()=>button('salesClosing.dialog.saveSource').click());
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({name_en:'Delivery',allows_driver_entries:true,is_global:false,branch_ids:['branch-b']}));
});
it('retains an existing selection and prevents saving after all branches are unchecked',async()=>{
  const onSave=vi.fn();
  const source={...newSalesClosingSource(),name_en:'Counter',is_global:false,branch_ids:['branch-a']};
  await act(async()=>root.render(<SalesSourceDialog editor={{mode:'edit',source}} branches={branches} onSave={onSave} onClose={()=>{}}/>));
  expect(checkbox('فرع الريان').checked).toBe(true);
  await act(async()=>checkbox('فرع الريان').click());
  expect(checkbox('فرع الريان').checked).toBe(false);
  await act(async()=>button('salesClosing.dialog.saveSource').click());
  expect(onSave).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain('salesSourceManagement.branchRequired');
});
it('enables customer credit entries, replaces driver mode and saves the linked accounting settings',async()=>{
  const onSave=vi.fn();
  const source={...newSalesClosingSource(),name_en:'Corporate credit',allows_driver_entries:true,requires_pos_device:true};
  await act(async()=>root.render(<SalesSourceDialog editor={{mode:'create',source}} branches={branches} onSave={onSave} onClose={()=>{}}/>));
  await act(async()=>document.querySelector('[aria-label="Customer credit-linked entries"]').click());
  expect(document.querySelector('[aria-label="Customer credit-linked entries"]').getAttribute('aria-checked')).toBe('true');
  await act(async()=>button('salesClosing.dialog.saveSource').click());
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({name_en:'Corporate credit',requires_customer:true,default_payment_method:'credit',allows_driver_entries:false,included_in_cash_register:false,requires_pos_device:false}));
});
it('can turn customer credit mode off on a custom source',async()=>{
  const onSave=vi.fn();
  const source={...newSalesClosingSource(),name_en:'Corporate credit',requires_customer:true,default_payment_method:'credit'};
  await act(async()=>root.render(<SalesSourceDialog editor={{mode:'edit',source}} branches={branches} onSave={onSave} onClose={()=>{}}/>));
  await act(async()=>document.querySelector('[aria-label="Customer credit-linked entries"]').click());
  await act(async()=>button('salesClosing.dialog.saveSource').click());
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({requires_customer:false,default_payment_method:'cash'}));
});
