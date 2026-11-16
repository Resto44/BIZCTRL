import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

const html=readFileSync('index.html','utf8');
const app=readFileSync('src/App.jsx','utf8');
const main=readFileSync('src/main.jsx','utf8');
const scene=readFileSync('src/components/StartupLoadingScene.jsx','utf8');
const logo=readFileSync('src/components/BrandLogo.jsx','utf8');

describe('BizCTRL launch screen - fast and branded on iOS PWA and desktop',()=>{
 it('shows the real BizCTRL approved logo and lightweight brand BEFORE JS downloads',()=>{
  expect(html).toContain('<style id="bizctrl-startup-critical">');
  expect(html).toContain('<div id="root">');
  expect(html.indexOf('<div id="root">')).toBeLessThan(html.indexOf('<script type="module" src="/src/main.jsx">'));
  expect(html).toContain('bzc-startup bzc-startup--full');
  expect(html).toContain('Opening your workspace');
  expect(html).toContain('Your business. In control.');
  expect(logo).toContain("'/icons/bizctrl-icon-192-v3.png'");
  expect(html).toContain('src="/icons/bizctrl-icon-192-v3.png"');
  expect(scene).toContain('src="/icons/bizctrl-icon-192-v3.png"');
  expect(html.match(/id="root"/g)).toHaveLength(1);
 });
 it('renders crisp, reduced-motion-friendly CSS without external animation/font/video dependency',()=>{
  expect(html).toContain('min-height:100svh');
  expect(html).toContain('min-height:100dvh');
  expect(html).not.toContain('bzc-startup--inline');
  expect(html).toContain('env(safe-area-inset-bottom)');
  expect(html).toContain('prefers-reduced-motion:reduce');
  expect(html).toContain('bzc-startup-progress');
  expect(html).toContain('transform:translate3d');
  expect(html).toContain('@keyframes bzc-startup-orbit');
  expect(html).not.toMatch(/https:\/\/fonts\./);
  expect(html).not.toContain('<video');
  expect(scene).not.toMatch(/setTimeout|requestAnimationFrame|fetch\(|await |\.rpc\(|performance\.now/);
  expect(scene).not.toContain('minDuration');
  expect(scene).toContain('role="status"');
  expect(scene).toContain('aria-live="polite"');
  expect(scene).toContain("lang = 'en'");
  expect(scene).toContain("ar:");
  expect(scene).toContain("fa:");
  // Critical CSS and static markup must not make slow mobile first byte heavy.
  expect(html.length).toBeLessThan(11000);
 });
 it('immediately replaces preboot HTML with React, with no artificial hold',()=>{
  expect(main).toContain("ReactDOM.createRoot(document.getElementById('root')).render(");
  expect(main).toContain('<App />');
  expect(main).not.toContain('setTimeout(() => document.getElementById');
  expect(app).toContain('import StartupLoadingScene');
  expect(app).toContain('!hasERPWorkspaceMounted()');
  expect(app).toContain('<RouteLoadingFallback fullPage />');
  expect(scene).toContain('className="bzc-startup bzc-startup--full"');
  expect(scene).not.toContain('compact');
  expect(app).toContain('function StartupGateLoader()');
  expect(app).toContain('return hasERPWorkspaceMounted()');
  expect(app).toContain(': <StartupLoadingScene lang={lang} />;');
  expect(app).toContain("if (decision === 'checking') return <PageLoader />;");
  expect(app).toContain('const PageLoader = ()');
  expect(app).toContain('if (isLoadingAuth)');
  expect(app).toContain('<StartupGateLoader />');
 });
 it('retains timeout, retry, sign-in recovery and authorization safety',()=>{
  expect(app).toContain('setTimeout(() => setStalled(true), 12000)');
  expect(app).toContain('data-testid="erp-startup-stalled"');
  expect(app).toContain('window.location.reload()');
  expect(app).toContain("withStartupDeadline(supabase.auth.getSession(), 9000, 'ROOT_GET_SESSION_TIMEOUT')");
  expect(app).toContain("setDecision('authorization-error')");
  expect(app).toContain("if (isLoadingAuth && timedOut)");
  expect(app).toContain('onClick={checkUserAuth}');
  expect(app).toContain('PortalStartupRecovery');
  expect(app).toContain('StandaloneCustomerAuthBoundary');
 });
});
