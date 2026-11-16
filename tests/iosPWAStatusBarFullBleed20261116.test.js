import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const entry = readFileSync('index.html', 'utf8');
const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8'));
const scene = readFileSync('src/components/StartupLoadingScene.jsx', 'utf8');
const header = readFileSync('src/components/layout/ERPHeader.jsx', 'utf8');

describe('iOS Home Screen status bar and full-height BizCTRL splash', () => {
  it('uses edge-to-edge iOS Home Screen status bar instead of default system-white band', () => {
    expect(entry).toContain('name="apple-mobile-web-app-capable" content="yes"');
    expect(entry).toContain('name="apple-mobile-web-app-status-bar-style" content="black-translucent"');
    expect(entry).not.toContain('name="apple-mobile-web-app-status-bar-style" content="default"');
    expect(entry).toContain('viewport-fit=cover');
    expect(entry).toContain('name="theme-color" content="#061539"');
  });
  it('keeps a dark non-interactive safe-area surface in installed iOS, not Safari tabs', () => {
    expect(entry).toContain('@supports (-webkit-touch-callout:none)');
    expect(entry).toContain('@media (display-mode:standalone)');
    expect(entry).toContain('height:env(safe-area-inset-top,0px)');
    expect(entry).toContain('background:#06102b;pointer-events:none;');
    expect(entry).toContain('html,body{margin:0;background:#061539}');
    expect(header).toContain('pt-[env(safe-area-inset-top,0px)]');
  });
  it('keeps splash full-viewport with safe-area padding, including the home indicator', () => {
    expect(entry).toContain('min-height:100svh;min-height:100dvh');
    expect(entry).toContain('padding-top:max(30px,env(safe-area-inset-top))');
    expect(entry).toContain('padding-bottom:max(34px,env(safe-area-inset-bottom))');
    expect(entry).not.toContain('.bzc-startup--inline');
    expect(scene).toContain('bzc-startup--full');
    expect(manifest.display).toBe('standalone');
    expect(manifest.background_color).toBe('#061539');
    expect(manifest.theme_color).toBe('#061539');
  });
  it('does not add script, network dependency or authentication behavior to initial paint', () => {
    expect(entry.match(/name="apple-mobile-web-app-status-bar-style"/g)).toHaveLength(1);
    expect(entry.length).toBeLessThan(11000);
    expect(entry).not.toContain('<video');
  });
});
