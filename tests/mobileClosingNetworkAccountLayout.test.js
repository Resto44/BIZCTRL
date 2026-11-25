import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('mobile Sales Closing network entry', () => {
  it('groups cash separately and each network account with its own amount and direct add control', () => {
    const closing = source('../src/components/sales/UnifiedSalesClosing.jsx');
    const start = closing.indexOf('data-testid="offline-sales-audit"');
    const end = closing.indexOf('{posUnavailable &&', start);
    const section = closing.slice(start, end);
    expect(section).toContain('data-testid="closing-cash-sales-card"');
    expect(section).toContain('data-testid="closing-network-sales-card"');
    expect(section).toContain('min-h-12');
    expect(section).toContain('quick-closing-cashSales');
    expect(section).toContain('quick-closing-network-');
    expect(section).toContain("'closing-primary-network-selector'");
    expect(section.indexOf('closing-primary-network-selector')).toBeLessThan(section.indexOf('quick-closing-network-'));
    expect(section).toContain('onClick={addPos} disabled={!canAddNetworkRow}');
    expect(section).toContain('value={manualNetworkTotal}');
    expect(closing).not.toContain('showNetworkDetail');
    expect(section).toContain('data-testid="closing-network-empty-state"');
    expect(section).toContain('href="/network-management?tab=accounts"');
    expect(section).toContain('target="_blank"');
    expect(section).toContain('can?.viewNetworkAccounts');
    expect(section).toContain('reloadNetworks()');
  });

  it('disables already selected accounts in other POS rows and blocks extra rows without available devices', () => {
    const closing = source('../src/components/sales/UnifiedSalesClosing.jsx');
    const funding = source('../src/lib/closing/ClosingFunding.js');
    expect(closing).toContain("new Set(posEntries.map(closingNetworkAccountId).filter(Boolean))");
    expect(closing).toContain('disabled={selectedNetworkAccountIds.has(String(account.id)) && String(account.id) !== currentAccountId}');
    expect(closing).toContain("rows.some(row => row.id !== rowId && closingNetworkAccountId(row) === selectedId)");
    expect(closing).toContain('disabled={!canAddNetworkRow}');
    expect(closing).toContain("newStableRowId('pos')");
    expect(closing).toContain('data-testid="closing-duplicate-network-warning"');
    expect(closing).toContain('duplicateNetworkAccount ? networkDuplicateMessage');
    expect(funding).toContain('hasDuplicateClosingNetworkAccounts(entries)');
    expect(closing).toContain('validClosingNetworkEntries(posEntries, posDevices)');
    expect(closing).not.toContain('setPosEntries([])');
  });

  it('links recorded cash payments to the cash step and routes errors to the relevant editor', () => {
    const closing = source('../src/components/sales/UnifiedSalesClosing.jsx');
    expect(closing).toContain('data-testid="closing-cash-payments-link"');
    expect(closing).toContain('value={reconciliation.cashOut}');
    expect(closing).toContain('data-testid="closing-detail-navigation"');
    expect(closing).toContain("openDetails('credit')");
    expect(closing).toContain("openDetails('sources')");
    expect(closing).toContain('value={form.shift}');
    expect(closing).not.toContain('value={closingTr(form.shift)}');
    expect(closing).toContain('min-h-0 flex-1 space-y-3 overflow-y-auto');
    expect(closing).toContain('Back to closing');
    expect(closing.match(/<SimpleClosingCash/g)).toHaveLength(1);
  });

  it('keeps strict card-account validation and reloads network entries on account mutations', () => {
    const closing = source('../src/components/sales/UnifiedSalesClosing.jsx');
    const management = source('../src/pages/NetworkManagement.jsx');
    expect(closing).toContain('validClosingNetworkEntries(posEntries, posDevices)');
    expect(closing).toContain("activeClosingNetworkAccounts(all, activeRestaurant.id, selectedBranchId, form.branch, networkBranchAliases)");
    expect(closing).toContain("enabled: Boolean(activeRestaurant?.id && selectedBranchId)");
    expect(closing).toContain('closingNetworkBranchAliases(branches, selectedBranchId, form.branch)');
    expect(management.match(/invalidateQueries\(\{ queryKey: \['pos_devices_form'\] \}\)/g)).toHaveLength(3);
    expect(management).toContain("searchParams.get('tab') === 'accounts'");
    expect(closing).not.toContain('setPosEntries([])');
  });
});
