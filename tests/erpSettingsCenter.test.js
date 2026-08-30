import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  DEFAULT_ERP_SETTINGS,
  activeAutomationCount,
  financeControlIssues,
  mergeERPSettings,
  parseERPSettings,
} from '../src/lib/erpSettings.js';

const appPath = new URL('../src/App.jsx', import.meta.url);
const centerPath = new URL('../src/pages/SettingsPage.jsx', import.meta.url);
const scopePath = new URL('../src/components/settings/ERPSettingsUI.jsx', import.meta.url);

describe('ERP Settings Center', () => {
  it('merges stored organization settings without losing future defaults', () => {
    const settings = parseERPSettings(JSON.stringify({
      finance: { currencyCode: 'AFN' },
      automation: { purchaseApproval: { threshold: 2500 } },
    }));

    expect(settings.finance.currencyCode).toBe('AFN');
    expect(settings.finance.lockClosedPeriods).toBe(true);
    expect(settings.automation.purchaseApproval).toEqual({ enabled: true, threshold: 2500 });
    expect(settings.security.auditRetentionYears).toBe(7);
  });

  it('falls back to safe defaults for invalid saved JSON', () => {
    expect(parseERPSettings('{invalid json')).toEqual(DEFAULT_ERP_SETTINGS);
  });

  it('preserves nested values while applying a section patch', () => {
    const next = mergeERPSettings(DEFAULT_ERP_SETTINGS.automation, {
      closingReminder: { time: '22:00' },
    });

    expect(next.closingReminder).toEqual({ enabled: true, time: '22:00' });
    expect(next.lowStockAlerts.enabled).toBe(true);
  });

  it('reports incomplete financial controls instead of presenting a false healthy state', () => {
    const issues = financeControlIssues({
      ...DEFAULT_ERP_SETTINGS.finance,
      vatEnabled: true,
      vatRegistrationNumber: '',
      purchaseInvoicePrefix: '',
    });

    expect(issues).toContain('VAT registration number is required while VAT is enabled.');
    expect(issues).toContain('Every document type needs a prefix.');
  });

  it('counts only enabled standard automation rules', () => {
    expect(activeAutomationCount({
      first: { enabled: true },
      second: { enabled: false },
      third: { enabled: true },
      customRules: [{ enabled: true }],
    })).toBe(2);
  });

  it('registers the three owner-only detail routes and exposes them from the center', async () => {
    const [appSource, centerSource] = await Promise.all([
      readFile(appPath, 'utf8'),
      readFile(centerPath, 'utf8'),
    ]);

    ['/settings/finance', '/settings/access', '/settings/automation'].forEach((route) => {
      expect(appSource).toContain(`path="${route}"`);
      expect(centerSource).toContain(`to: '${route}'`);
    });
    expect(appSource.match(/RoleGuard permission="manageSettings"/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it('keeps the shared organization and branch selector interactive and responsive', async () => {
    const source = await readFile(scopePath, 'utf8');
    expect(source).toContain('onValueChange={setActiveRestaurant}');
    expect(source).toContain('onValueChange={setSelectedBranchId}');
    expect(source).toContain('disabled={isBranchScoped || !restaurantId}');
    expect(source).toContain('min-w-0');
    expect(source).toContain('w-full');
  });
});
