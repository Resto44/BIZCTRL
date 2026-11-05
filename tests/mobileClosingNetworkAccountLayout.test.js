import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('mobile Sales Closing network entry', () => {
  it('renders aligned cash and card amount fields, with a separate branch-scoped network selector', () => {
    const closing = source('../src/components/sales/UnifiedSalesClosing.jsx');
    const start = closing.indexOf('data-testid="offline-sales-audit"');
    const end = closing.indexOf('{posUnavailable &&', start);
    const section = closing.slice(start, end);
    expect(section).toContain('items-end');
    expect(section).toContain('min-h-10');
    expect(section).toContain('quick-closing-cashSales');
    expect(section).toContain('quick-closing-network-');
    expect(section).toContain('data-testid="closing-primary-network-selector"');
    expect(section.indexOf('quick-closing-network-')).toBeLessThan(section.indexOf('closing-primary-network-selector'));
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
