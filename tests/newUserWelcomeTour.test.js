import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  detectInstallDevice, getWelcomeTourStages, isNewSaaSUser,
  tourStorageKey, WELCOME_TOUR_OPEN_EVENT,
} from '../src/lib/newUserWelcomeTour.js';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const allOwnerPermissions = {
  manageSettings: true, viewBrandSettings: true, viewInventory: true,
  viewSuppliers: true, viewPurchases: true, viewSales: true,
  viewExpenses: true, viewReports: true, uploadSales: true,
};
const flatten = stages => stages.flatMap(stage => stage.modules.map(mod => mod.key));

describe('New SaaS user onboarding tutorial', () => {
  it('opens automatically only for new accounts and has an account-scoped local marker', () => {
    const now = new Date('2026-11-03T10:00:00.000Z');
    expect(isNewSaaSUser('2026-11-03T09:59:00.000Z', now)).toBe(true);
    expect(isNewSaaSUser('2026-10-20T10:00:00.000Z', now)).toBe(true);
    expect(isNewSaaSUser('2026-06-01T10:00:00.000Z', now)).toBe(false);
    expect(isNewSaaSUser('invalid', now)).toBe(false);
    expect(isNewSaaSUser(null, now)).toBe(false);
    expect(tourStorageKey('owner-1')).not.toBe(tourStorageKey('owner-2'));
    expect(tourStorageKey('owner-1')).toContain('owner-1');
  });

  it('shows installation before any ERP module and uses real platform instructions', () => {
    expect(detectInstallDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) AppleWebKit Safari')).toBe('ios-safari');
    expect(detectInstallDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) CriOS/123.0')).toBe('ios-other');
    expect(detectInstallDevice('Mozilla/5.0 (Linux; Android 14) Chrome')).toBe('android');
    expect(detectInstallDevice('Mozilla/5.0 (Macintosh) Safari')).toBe('desktop');
    expect(detectInstallDevice('Mozilla/5.0 (iPhone)', true)).toBe('installed');
    expect(getWelcomeTourStages({ role:'owner', mode:'restaurant', can: allOwnerPermissions })[0].key).toBe('install');
    const dialog = source('../src/components/onboarding/NewUserWelcomeTour.jsx');
    for (const locale of ['en:', 'fa:', 'ar:']) expect(dialog).toContain(locale);
    expect(dialog).toContain('Add to Home Screen');
    expect(dialog).toContain('Install app');
    expect(dialog).toContain('triggerInstall()');
  });

  it('guides a restaurant owner through settings, branches, products, POS, closing and reports', () => {
    const stages = getWelcomeTourStages({ role:'owner', mode:'restaurant', can: allOwnerPermissions });
    expect(stages.map(s => s.key)).toEqual(['install', 'setup', 'prepare', 'operate', 'review']);
    const modules = flatten(stages);
    for (const key of ['settings', 'branches', 'products', 'suppliers', 'purchases', 'restaurantPOS', 'sales', 'reports', 'payables']) {
      expect(modules).toContain(key);
    }
    expect(modules).not.toContain('retailPOS');
  });

  it('offers retail POS only to retail, not restaurant, warehouse or services', () => {
    for (const mode of ['restaurant', 'warehouse', 'services']) {
      expect(flatten(getWelcomeTourStages({ role:'owner', mode, can: allOwnerPermissions }))).not.toContain('retailPOS');
    }
    const retail = flatten(getWelcomeTourStages({ role:'owner', mode:'retail', can: allOwnerPermissions }));
    expect(retail).toContain('retailPOS');
    expect(retail).toContain('inventory');
    expect(retail).not.toContain('restaurantPOS');
    expect(flatten(getWelcomeTourStages({ role:'owner', mode:'warehouse', can: allOwnerPermissions }))).toContain('touchPOS');
    expect(flatten(getWelcomeTourStages({ role:'owner', mode:'services', can: allOwnerPermissions }))).toContain('touchPOS');
  });

  it('hides unauthorized and disabled modules rather than bypassing route guards', () => {
    const limited = getWelcomeTourStages({
      role:'manager', mode:'retail',
      can: { viewInventory:true, viewSales:true, viewPurchases:false, viewReports:false, viewSuppliers:false },
      configuration:{ business:{ disabled_modules:['retail_pos_control', 'product_management'] } },
    });
    const modules = flatten(limited);
    expect(modules).not.toContain('settings');
    expect(modules).not.toContain('branches');
    expect(modules).not.toContain('products');
    expect(modules).not.toContain('retailPOS');
    expect(modules).not.toContain('purchases');
    expect(modules).not.toContain('reports');
    expect(modules).toContain('inventory');
    const supplier = getWelcomeTourStages({ role:'supplier', mode:'restaurant', can:{} });
    expect(flatten(supplier)).toEqual(['supplierPortal']);
    expect(supplier[0].key).toBe('install');
  });

  it('integrates a dismissible dialog and manual replay without database writes', () => {
    const tour = source('../src/components/onboarding/NewUserWelcomeTour.jsx');
    const layout = source('../src/components/layout/AppLayout.jsx');
    const header = source('../src/components/layout/ERPHeader.jsx');
    const client = source('../src/api/supabaseClient.js');
    expect(layout).toContain('<NewUserWelcomeTour onVisibleChange={setTourOpen} />');
    expect(layout).toContain('!tourOpen && !isNewSaaSUser(user?.created_at)');
    expect(header).toContain('data-testid="open-saas-welcome-tour"');
    expect(header).toContain('new Event(WELCOME_TOUR_OPEN_EVENT)');
    expect(WELCOME_TOUR_OPEN_EVENT).toBe('bizctrl:open-welcome-tour');
    expect(client).toContain('created_at: user.created_at');
    expect(tour).toContain('HOME_ROUTES.has(location.pathname)');
    expect(tour).toContain("status: 'completed'");
    expect(tour).toContain("status: 'paused'");
    expect(tour).toContain('setStepIndex(index => Math.min(stages.length - 1, index + 1))');
    expect(tour).not.toContain('supabase.from(');
    expect(tour).not.toContain('localStorage.clear(');
  });
});
