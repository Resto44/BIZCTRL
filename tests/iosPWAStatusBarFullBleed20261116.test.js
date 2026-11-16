import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const entry = readFileSync('index.html', 'utf8');
const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8'));
const scene = readFileSync('src/components/StartupLoadingScene.jsx', 'utf8');
const header = readFileSync('src/components/layout/ERPHeader.jsx', 'utf8');

describe('iOS 26+ Home Screen status bar and BizCTRL launch', () => {
  it('does not force the deprecated black-translucent status bar style or a fake fixed overlay', () => {
    expect(entry).toContain('name="apple-mobile-web-app-capable" content="yes"');
    expect(entry).not.toContain('<meta name="apple-mobile-web-app-status-bar-style"');
    expect(entry).not.toContain('html::before{content:');
    expect(entry).toContain('viewport-fit=cover');
    expect(entry).toContain('name="theme-color" content="#061539"');
  });
  it('uses a dark page source color but keeps mobile ERP header clear and interactive', () => {
    expect(entry).toContain('html,body{margin:0;background:#061539}');
    expect(header).toContain('bg-card px-2 py-1');
    expect(header).toContain('lg:backdrop-blur-md');
    expect(header).not.toContain('pt-[env(safe-area-inset-top,0px)] backdrop-blur-md');
    expect(header).toContain('pt-[env(safe-area-inset-top,0px)]');
  });
  it('keeps full-height startup and safe-area padding', () => {
    expect(entry).toContain('min-height:100svh;min-height:100dvh');
    expect(entry).toContain('padding-top:max(30px,env(safe-area-inset-top))');
    expect(entry).toContain('padding-bottom:max(34px,env(safe-area-inset-bottom))');
    expect(entry).not.toContain('.bzc-startup--inline');
    expect(scene).toContain('bzc-startup--full');
    expect(manifest.display).toBe('standalone');
    expect(manifest.background_color).toBe('#061539');
  });
  it('preserves fast, no-network initial paint and single preboot', () => {
    expect(entry.match(/id="bizctrl-preboot"/g)).toHaveLength(1);
    expect(entry.length).toBeLessThan(11000);
    expect(entry).not.toContain('<video');
  });
});
