import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { detectInstallBrowser, isInstalledWebApp } from '../src/hooks/usePWAInstall.js';

const entry = readFileSync('src/App.jsx', 'utf8');
const banner = readFileSync('src/components/pwa/PWAInstallBanner.jsx', 'utf8');
const modal = readFileSync('src/components/pwa/PWAInstallModal.jsx', 'utf8');
const hook = readFileSync('src/hooks/usePWAInstall.js', 'utf8');
const layout = readFileSync('src/components/layout/AppLayout.jsx', 'utf8');
const tour = readFileSync('src/components/onboarding/NewUserWelcomeTour.jsx', 'utf8');

describe('BizCTRL install experience on iPhone Safari/Chrome and Android', () => {
  it('recognizes both Safari and Chrome iPhone as iOS without promising browser API install', () => {
    expect(detectInstallBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1').isIOS).toBe(true);
    expect(detectInstallBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) CriOS/140.0 Mobile/15E148 Safari/604.1').isIOSChrome).toBe(true);
    expect(detectInstallBrowser('Mozilla/5.0 (Linux; Android 15) Chrome/141.0').isAndroid).toBe(true);
    expect(detectInstallBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 'MacIntel', 5).isIOS).toBe(true);
  });
  it('recognizes installed PWA modes to suppress repeated install popup', () => {
    expect(isInstalledWebApp({matchMedia: () => ({matches: true}),navigator:{standalone:false}})).toBe(true);
    expect(isInstalledWebApp({matchMedia: () => ({matches: false}),navigator:{standalone:true}})).toBe(true);
    expect(isInstalledWebApp({matchMedia: () => ({matches: false}),navigator:{standalone:false}})).toBe(false);
  });
  it('mounts the automatic invitation on real public landing and login, not preboot or sensitive invite routes', () => {
    expect(entry).toContain('function PublicInstallEntry()');
    expect(entry).toContain("pathname !== '/' && pathname !== '/erp-login'");
    expect(entry).toContain('<PublicPWAInstallBanner autoOpen />');
    expect(entry).toContain('<PublicInstallEntry />');
    expect(layout).toContain('!tourOpen && !isNewSaaSUser(user?.created_at) && <PWAInstallBanner />');
    expect(banner).toContain('bizctrl:install-popup-shown:20261116');
  });
  it('offers a genuine Android install only when the native event is supplied', () => {
    expect(hook).toContain("window.addEventListener('beforeinstallprompt'");
    expect(hook).toContain("window.addEventListener('appinstalled'");
    expect(hook).toContain('await deferredPrompt.prompt()');
    expect(banner).toContain('!install.isIOS && install.hasDeferredPrompt');
    expect(modal).toContain('!isIOS && hasDeferredPrompt');
  });
  it('gives distinct Safari and iPhone Chrome Share / Add to Home Screen steps', () => {
    expect(modal).toContain('isIOSChrome ? t.chrome : t.safari');
    expect(modal).toContain('Share next to the address bar');
    expect(modal).toContain('Open as Web App');
    expect(modal).toContain('No App Store download');
    expect(modal).toContain('cannot install a web app from a webpage button');
    expect(tour).toContain('isIOSChrome = /CriOS/i.test(browserAgent)');
    expect(tour).toContain('installCopy.iosChrome');
  });
  it('is non-invasive, has close and never-show, and stores presentation choices only', () => {
    expect(modal).toContain('aria-modal="true"');
    expect(modal).toContain('aria-labelledby="pwa-install-title"');
    expect(modal).toContain('onNeverShow');
    expect(hook).toContain('pwa_install_never_show');
    expect(hook).toContain("window.removeEventListener('beforeinstallprompt'");
    expect(hook).not.toMatch(/\.rpc\(|supabase|fetch\(|\.from\(/);
    expect(banner).toContain('install.isInstalled');
    expect(banner).toContain('markSeen()');
  });
});
