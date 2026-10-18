// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import PartnerInvitationLink from '@/components/settlement/PartnerInvitationLink';
import {partnerText} from '@/lib/partnerTreasury';
const invitation='https://example.test/partner-portal#invite=complete-private-token';
let host,root;
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:vi.fn().mockResolvedValue()}});Object.defineProperty(navigator,'share',{configurable:true,writable:true,value:undefined});document.execCommand=vi.fn().mockReturnValue(false);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function mount(lang='fa'){await act(async()=>root.render(<PartnerInvitationLink invitation={invitation} t={partnerText(lang)}/>));}
it.each(['fa','ar','en'])('copies the complete token and shows confirmation in %s',async(lang)=>{await mount(lang);await act(async()=>host.querySelectorAll('button')[0].click());expect(navigator.clipboard.writeText).toHaveBeenCalledWith(invitation);expect(host.querySelector('[role="status"]').textContent).toBe(partnerText(lang).copied);});
it('opens native share with the full URL',async()=>{navigator.share=vi.fn().mockResolvedValue();await mount();await act(async()=>host.querySelectorAll('button')[1].click());expect(navigator.share).toHaveBeenCalledWith({title:partnerText('fa').portal,url:invitation});expect(navigator.clipboard.writeText).not.toHaveBeenCalled();});
it('leaves cancellation alone',async()=>{navigator.share=vi.fn().mockRejectedValue({name:'AbortError'});await mount();await act(async()=>host.querySelectorAll('button')[1].click());expect(navigator.clipboard.writeText).not.toHaveBeenCalled();expect(host.querySelector('[role="status"]').textContent).toBe('');});
it('copies when native sharing is unavailable',async()=>{await mount();await act(async()=>host.querySelectorAll('button')[1].click());expect(navigator.clipboard.writeText).toHaveBeenCalledWith(invitation);});
it('selects all of the link and gives manual instructions when clipboard is blocked',async()=>{navigator.clipboard.writeText.mockRejectedValue(Error('denied'));await mount();await act(async()=>host.querySelectorAll('button')[0].click());const input=host.querySelector('input');expect(input.selectionStart).toBe(0);expect(input.selectionEnd).toBe(invitation.length);expect(host.querySelector('[role="status"]').textContent).toBe(partnerText('fa').copyManually);});
