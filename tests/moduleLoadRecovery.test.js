import {expect,it,vi} from 'vitest';
import {recoverModuleLoad} from '../src/lib/moduleLoadRecovery';
const error=new TypeError('Importing a module script failed.');
function browser(href='https://example.test/partner-portal#invite=private-token') {
 const data=new Map();
 return {navigator:{onLine:true},location:{href,replace:vi.fn()},sessionStorage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)}};
}
it('recovers Safari module failures preserving the full invitation',()=>{
 const b=browser();expect(recoverModuleLoad(error,b)).toBe(true);
 expect(b.location.replace).toHaveBeenCalledWith('https://example.test/partner-portal?__app_reload=1#invite=private-token');
 expect(recoverModuleLoad(error,b)).toBe(false);
});
it('preserves query invitation and auth callback parameters',()=>{
 const b=browser('https://example.test/partner-portal?invite=token&code=callback');
 recoverModuleLoad(error,b);const u=new URL(b.location.replace.mock.calls[0][0]);
 expect(u.searchParams.get('invite')).toBe('token');expect(u.searchParams.get('code')).toBe('callback');
});
it('does not loop when storage is unavailable',()=>{
 const b=browser();b.sessionStorage.getItem=()=>{throw Error('blocked');};
 expect(recoverModuleLoad(error,b)).toBe(true);
 b.location.href=b.location.replace.mock.calls[0][0];expect(recoverModuleLoad(error,b)).toBe(false);
});
it('does not reload offline or for application errors',()=>{
 const b=browser();b.navigator.onLine=false;expect(recoverModuleLoad(error,b)).toBe(false);
 b.navigator.onLine=true;expect(recoverModuleLoad(Error('Unauthorized'),b)).toBe(false);expect(b.location.replace).not.toHaveBeenCalled();
});
it('recognizes Chromium dynamic import failure',()=>{
 expect(recoverModuleLoad(Error('Failed to fetch dynamically imported module: /assets/page-old.js'),browser())).toBe(true);
});
