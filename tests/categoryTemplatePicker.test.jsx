// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const f=vi.hoisted(()=>({lang:'en',mode:'retail',install:vi.fn(),tenant:{activeRestaurantId:'11111111-1111-4111-8111-111111111111'}}));
vi.mock('@/api/supabaseClient',()=>({base44:{entities:{ProductCategory:{create:vi.fn(),get:vi.fn()}}},supabase:{}}));
vi.mock('@/lib/TenantContext',()=>({useTenant:()=>f.tenant}));
vi.mock('@/lib/BusinessModeContext',()=>({useBusinessMode:()=>({activeMode:f.mode})}));
vi.mock('@/lib/LanguageContext',()=>({useLanguage:()=>({lang:f.lang})}));
vi.mock('@/lib/categoryTemplates/install',()=>({installCategoryTemplate:f.install}));
import Picker from '../src/components/categories/CategoryTemplatePicker';
let root,container,qc;
const click=async text=>act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes(text)).click());
beforeEach(()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;f.lang='en';f.mode='retail';f.install.mockReset().mockResolvedValue({created:30,skipped:0});
 f.tenant={activeRestaurantId:'11111111-1111-4111-8111-111111111111'};
 container=document.createElement('div');document.body.append(container);root=createRoot(container);qc=new QueryClient();
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();qc.clear();});
const render=()=>act(async()=>root.render(<QueryClientProvider client={qc}><Picker/></QueryClientProvider>));
it('lets users deselect groups and adds only the selected tree',async()=>{
 await render();await click('Start with');expect(document.querySelectorAll('input[type=checkbox]')).toHaveLength(10);
 await act(async()=>document.querySelector('input[type=checkbox]').click());await click('Add selected');
 expect(f.install).toHaveBeenCalledTimes(1);expect(f.install.mock.calls[0][0].groups).toHaveLength(9);
 expect(document.querySelector('[role=status]').textContent).toContain('Categories added');
});
it.each([['ar','ابدأ','rtl'],['fa','شروع','rtl']])('shows localized editable names in %s',async(lang,open,dir)=>{
 f.lang=lang;await render();await click(open);expect(document.querySelector('[role=dialog]').getAttribute('dir')).toBe(dir);
 expect(document.querySelector('input:not([type=checkbox])').value).toBe(lang==='ar'?'الفواكه والخضروات':'میوه و سبزیجات');
});
it('reports partial failures honestly and allows retry',async()=>{
 f.install.mockRejectedValueOnce(Error('offline'));await render();await click('Start with');await click('Add selected');
 expect(document.querySelector('[role=alert]').textContent).toContain('Some categories may already be saved');await click('Add selected');expect(f.install).toHaveBeenCalledTimes(2);
});
it('closes stale templates after a tenant change',async()=>{
 await render();await click('Start with');f.tenant={activeRestaurantId:'22222222-2222-4222-8222-222222222222'};await render();expect(document.querySelector('[role=dialog]')).toBeNull();expect(f.install).not.toHaveBeenCalled();
});
