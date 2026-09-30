import { describe,it,expect,vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
function worker(){
 const handlers={};
 const self={addEventListener:(event,fn)=>{handlers[event]=fn;},location:{origin:'https://mybizctrl.site'},registration:{showNotification:vi.fn(()=>Promise.resolve())},clients:{matchAll:vi.fn(()=>Promise.resolve([])),openWindow:vi.fn(()=>Promise.resolve())}};
 vm.runInNewContext(readFileSync('public/sw.js','utf8'),{self,URL});
 return {self,handlers};
}
describe('background worker',()=>{
 it('displays incoming push with no open application window',async()=>{
  const {self,handlers}=worker();let pending;
  handlers.push({data:{json:()=>({title:'Sale',body:'Recorded',tag:'event-1'})},waitUntil:p=>{pending=p;}});
  await pending;
  expect(self.registration.showNotification).toHaveBeenCalledWith('Sale',expect.objectContaining({body:'Recorded',tag:'event-1'}));
 });
 it('still displays malformed push instead of silently losing it',async()=>{
  const {self,handlers}=worker();let pending;
  handlers.push({data:{json:()=>{throw new Error('bad JSON');}},waitUntil:p=>{pending=p;}});await pending;
  expect(self.registration.showNotification).toHaveBeenCalledWith('BizCTRL',expect.objectContaining({data:{url:'/notifications'}}));
 });
 it('opens only the same-origin notifications route',async()=>{
  const {self,handlers}=worker();let pending;
  handlers.notificationclick({notification:{close:vi.fn(),data:{url:'https://evil.invalid'}},waitUntil:p=>{pending=p;}});await pending;
  expect(self.clients.openWindow).toHaveBeenCalledWith('https://mybizctrl.site/notifications');
 });
});
