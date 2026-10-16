import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const currentDir = dirname(fileURLToPath(import.meta.url));
const root=resolve(currentDir,'..');
const read=p=>readFileSync(resolve(root,p),'utf8');

describe('BizCTRL new Safari and Chrome icon',()=>{
  it('uses approved glossy brand source and generates all expected real PNG assets',()=>{
    const result=spawnSync(process.execPath,['scripts/generate-pwa-icons.mjs'],{cwd:root,encoding:'utf8'});
    expect(result.status, result.stderr).toBe(0);
    const files=[
      ['favicon-16-v3.png',16],['favicon-32-v3.png',32],
      ['apple-touch-icon-180-v3.png',180],
      ['bizctrl-icon-192-v3.png',192],['bizctrl-icon-512-v3.png',512],
      ['bizctrl-icon-maskable-192-v3.png',192],['bizctrl-icon-maskable-512-v3.png',512],
      ['icon-96.png',96],['icon-192.png',192]
    ];
    for(const [path,size] of files){
      const buffer=readFileSync(resolve(root,'public/icons',path));
      expect(buffer.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(buffer.readUInt32BE(16)).toBe(size);
      expect(buffer.readUInt32BE(20)).toBe(size);
      expect(buffer.byteLength).toBeGreaterThan(500);
    }
  });
  it('sets the Safari home-screen icon and Chrome tab favicons to versioned PNGs',()=>{
    const html=read('index.html');
    expect(html).toContain('href="/icons/apple-touch-icon-180-v3.png"');
    expect(html).toContain('href="/icons/favicon-16-v3.png"');
    expect(html).toContain('href="/icons/favicon-32-v3.png"');
    expect(html).not.toContain('href="/favicon.svg"');
    expect(html).toContain('href="/manifest.json?v=bizctrl-20261017-v3"');
  });
  it('manifest advertises correct sizes and does not incorrectly mark normal icons maskable',()=>{
    const manifest=JSON.parse(read('public/manifest.json'));
    expect(manifest.name).toContain('BizCTRL');
    expect(manifest.icons).toHaveLength(4);
    const purposes=manifest.icons.map(icon=>icon.purpose);
    expect(purposes).toEqual(['any','any','maskable','maskable']);
    for(const icon of manifest.icons){
      expect(icon.src.endsWith('-v3.png')).toBe(true);
      expect(['192x192','512x512']).toContain(icon.sizes);
      expect(icon.type).toBe('image/png');
    }
  });
  it('rolls the service worker image cache and prevents stale long-cache response',()=>{
    const sw=read('public/sw.js');
    expect(sw).toContain("const CACHE_VERSION = 'v14'");
    expect(sw).toContain("icon: '/icons/bizctrl-icon-192-v3.png'");
    const vercel=JSON.parse(read('vercel.json'));
    const iconHeader=vercel.headers.find(item=>item.source==='/icons/(.*)');
    expect(iconHeader.headers).toContainEqual({key:'Cache-Control',value:'no-cache, max-age=0, must-revalidate'});
    const pkg=JSON.parse(read('package.json'));
    expect(pkg.scripts.build).toContain('node scripts/generate-pwa-icons.mjs');
    expect(read('scripts/generate-pwa-icons.mjs')).toContain('APPROVED_BIZCTRL_PNG_BASE64');
    expect(read('src/components/BrandLogo.jsx')).toContain('bizctrl-icon-192-v3.png');
  });
});