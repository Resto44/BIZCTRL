export const ERP_SETTINGS_KEY = 'erp_settings_center_v1';

export const DEFAULT_ERP_SETTINGS = Object.freeze({
  finance: {
    currencyCode: 'SAR',
    currencySymbol: 'SAR',
    decimalPrecision: 2,
    exchangeRates: false,
    vatEnabled: false,
    defaultVatRate: 15,
    taxInclusivePricing: false,
    vatRegistrationNumber: '',
    fiscalYear: 'jan-dec',
    accountingMethod: 'accrual',
    lockClosedPeriods: true,
    negativeStockPosting: 'blocked',
    salesInvoicePrefix: 'SAL',
    purchaseInvoicePrefix: 'PUR',
    creditNotePrefix: 'CRN',
  },
  access: {
    requireManagerMfa: false,
    ownerApprovalRoleChanges: true,
    autoExpireInvitations: true,
    invitationExpiryHours: 72,
  },
  automation: {
    purchaseApproval: { enabled: true, threshold: 1000 },
    lowStockAlerts: { enabled: true },
    closingReminder: { enabled: true, time: '23:30' },
    overdueReceivables: { enabled: false, days: 7 },
  },
  security: {
    automaticBackup: true,
    backupIntervalHours: 6,
    sessionTimeoutMinutes: 30,
    auditRetentionYears: 7,
  },
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function mergeERPSettings(base, incoming) {
  if (!isPlainObject(base)) return incoming;
  const output = { ...base };
  if (!isPlainObject(incoming)) return output;

  Object.entries(incoming).forEach(([key, value]) => {
    output[key] = isPlainObject(value) && isPlainObject(base[key])
      ? mergeERPSettings(base[key], value)
      : value;
  });
  return output;
}

export function parseERPSettings(value) {
  if (!value) return mergeERPSettings(DEFAULT_ERP_SETTINGS, {});
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return mergeERPSettings(DEFAULT_ERP_SETTINGS, parsed);
  } catch {
    return mergeERPSettings(DEFAULT_ERP_SETTINGS, {});
  }
}

export function financeControlIssues(finance = {}) {
  const issues = [];
  if (finance.vatEnabled && !String(finance.vatRegistrationNumber || '').trim()) {
    issues.push('VAT registration number is required while VAT is enabled.');
  }
  if (finance.vatEnabled && !(Number(finance.defaultVatRate) >= 0)) {
    issues.push('Default VAT rate must be zero or greater.');
  }
  ['salesInvoicePrefix', 'purchaseInvoicePrefix', 'creditNotePrefix'].forEach((key) => {
    if (!String(finance[key] || '').trim()) issues.push('Every document type needs a prefix.');
  });
  return issues;
}

export function activeAutomationCount(automation = {}) {
  return Object.values(automation).filter((rule) => rule?.enabled).length;
}

