import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = p => readFileSync(resolve(p), 'utf8');
const landing = read('src/pages/LandingPage.jsx');
const app = read('src/App.jsx');
const admin = read('platform-console/main.jsx');
const adminHtml = read('platform-console/index.html');
const config = read('vite.platform.config.js');
const workflow = read('.github/workflows/restaurant-products.yml');
const packageJSON = JSON.parse(read('package.json'));

describe('Dedicated Platform Owner control plane deployment', () => {
  it('excludes Platform Owner access from public marketing but preserves customer ERP and wallet entries', () => {
    expect(landing).not.toContain("path:'/platform-owner/login'");
    expect(landing).not.toContain('platformDescription:');
    expect(landing).not.toContain('Platform Owner');
    expect(landing).toContain("path:'/erp-login'");
    expect(landing).toContain("path:'/wallet-portal'");
    expect(landing).toContain('md:grid-cols-2');
  });

  it('builds a standalone owner-only entry without public SPA/ERP modules', () => {
    expect(config).toContain("root: path.resolve(process.cwd(), 'platform-console')");
    expect(config).toContain("outDir: path.resolve(process.cwd(), 'dist-platform')");
    expect(config).toContain("publicDir: path.resolve(process.cwd(), 'public')");
    expect(packageJSON.scripts['build:platform']).toContain('vite.platform.config.js');
    expect(workflow).toContain('pnpm run build:platform');
    expect(admin).toContain("import { LanguageProvider }");
    expect(admin).toContain('PlatformOwnerPortal');
    expect(admin).toContain('PlatformOwnerPasswordChange');
    expect(admin).toContain('<Toaster');
    expect(admin).not.toContain("import App from '@/App.jsx'");
    expect(admin).not.toContain('AppLayout');
    expect(admin).not.toContain('SubscriptionProvider');
    expect(admin).not.toContain('RootEntryRoute');
    expect(admin).not.toContain('LandingPage');
    expect(admin).not.toContain('RetailPOS');
    expect(admin).not.toContain('RestaurantPOS');
    expect(adminHtml).toContain('noindex,nofollow,noarchive');
  });

  it('only mounts platform login/recovery/dashboard in admin route tree; unknown URLs cannot reach ERP', () => {
    for(const route of ['/platform-owner/login','/platform-owner/recover','/platform-owner/new-owner-setup','/platform-owner/change-password','/platform-owner/*']) {
      expect(admin).toContain('path="' + route + '"');
    }
    expect(admin).toContain('<Route path="*" element={<Navigate to="/platform-owner/login" replace />} />');
    expect(admin).not.toContain('path="/erp-login"');
    expect(admin).not.toContain('path="/owner-command-center"');
  });

  it('preserves the legacy platform login during subdomain migration, with server-side platform authorization and MFA checks', () => {
    expect(app).toContain('path="/platform-owner/login"');
    const login = read('src/pages/PlatformOwnerLogin.jsx');
    const portal = read('src/pages/PlatformOwnerPortal.jsx');
    const sql = read('src/supabase/20260815_platform_owner_control_plane.sql');
    expect(login).toContain("supabase.auth.mfa.challenge");
    expect(login).toContain('platformOwnerApi.snapshot()');
    expect(portal).toContain('platformOwnerApi');
    expect(sql).toContain('platform_owner_assert()');
  });
});
