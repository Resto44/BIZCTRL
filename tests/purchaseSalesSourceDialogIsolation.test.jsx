// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import {SalesSourceDialog,newSalesClosingSource} from '@/components/sales/SalesClosingCustomizationDialogs';
import {WorkspaceTabVisibilityProvider} from '@/lib/WorkspaceTabVisibilityContext';
import {Dialog,DialogContent,DialogTitle} from '@/components/ui/dialog';

vi.mock('@/lib/LanguageContext',()=>({
 useLanguage:()=>({lang:'en',t:key=>key,translateLiteral:value=>value})
}));
let container,root;
beforeEach(()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 globalThis.ResizeObserver=class{observe(){} unobserve(){} disconnect(){}};
 window.matchMedia=vi.fn(()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
 container=document.createElement('div');
 document.body.appendChild(container);
 root=createRoot(container);
});
afterEach(async()=>{
 await act(async()=>root.unmount());
 container.remove();
 document.querySelectorAll('[data-radix-portal]').forEach(node=>node.remove());
 vi.restoreAllMocks();
});
const source={...newSalesClosingSource(),name_en:'Preserve my draft',category:'other'};
function Workspace({active,onSave,onClose}){
 return <>
  <WorkspaceTabVisibilityProvider active={active==='sources'}>
   <SalesSourceDialog editor={{mode:'create',source}} onSave={onSave} onClose={onClose} paymentMethods={[]} branches={[]}/>
  </WorkspaceTabVisibilityProvider>
  <WorkspaceTabVisibilityProvider active={active==='purchase'}>
   <Dialog open={active==='purchase'}>
    <DialogContent><DialogTitle>Purchase Invoice</DialogTitle></DialogContent>
   </Dialog>
  </WorkspaceTabVisibilityProvider>
 </>;
}
describe('Owner workspace purchase must not reveal Sales Source popup from an inactive tab',()=>{
 it('hides the source portal behind Purchase Invoice and restores its draft only when its own tab is active',async()=>{
  const onSave=vi.fn(),onClose=vi.fn();
  await act(async()=>root.render(<Workspace active="sources" onSave={onSave} onClose={onClose}/>));
  expect(document.body.textContent).toContain('salesClosing.dialog.addSource');
  expect(document.body.textContent).toContain('Preserve my draft');
  await act(async()=>root.render(<Workspace active="purchase" onSave={onSave} onClose={onClose}/>));
  expect(document.body.textContent).toContain('Purchase Invoice');
  expect(document.body.textContent).not.toContain('salesClosing.dialog.addSource');
  expect(onClose).not.toHaveBeenCalled();
  await act(async()=>root.render(<Workspace active="sources" onSave={onSave} onClose={onClose}/>));
  expect(document.body.textContent).toContain('salesClosing.dialog.addSource');
  expect(document.body.textContent).toContain('Preserve my draft');
 });
 it('does not show a source popup on a normal purchase route even when its cached editor remains open',async()=>{
  await act(async()=>root.render(<Workspace active="purchase" onSave={vi.fn()} onClose={vi.fn()}/>));
  expect([...document.querySelectorAll('[role="dialog"]')].some(node=>node.textContent.includes('Add Sales Source'))).toBe(false);
  expect(document.body.textContent).toContain('Purchase Invoice');
 });
});
