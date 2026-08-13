const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/pages/OwnerDashboard.jsx'), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const sectionIds = [
  'driver-analytics',
  'financial-center',
  'six-month-trend',
  'executive-summary',
  'operating-result',
  'cash-reconciliation',
  'sales-analytics',
  'additional-sales-sources',
  'purchase-analytics',
  'product-consumption',
  'inventory-analytics',
  'variable-expenses',
  'cash-flow',
  'price-intelligence',
  'active-alerts',
  'price-changes',
  'live-activity',
  'mode-insights',
];

assert(source.includes('const [expandedSection, setExpandedSection] = useState(null);'), 'Owner Dashboard sections must be collapsed by default.');
assert(source.includes('current === sectionId ? null : sectionId'), 'Owner Dashboard accordion must collapse the active section and open exactly one selected section.');
assert(source.includes('const DashboardAccordionSection = memo'), 'Owner Dashboard must use a shared accordion section shell.');
assert(source.includes('aria-expanded={isExpanded}'), 'Owner Dashboard accordion headers must expose their expanded state accessibly.');
assert(source.includes('transition-[grid-template-rows,opacity] duration-200'), 'Owner Dashboard accordion must animate expand/collapse smoothly.');
assert(source.includes('aria-hidden={!expanded}') && source.includes("inert={expanded ? undefined : ''}") && source.includes('{children}'), 'Collapsed section content must remain mounted without accepting focus so queries and widget state are preserved.');
assert(source.includes('sm:p-3') && source.includes('max-w-[8.5rem]') && source.includes('active:scale-[0.99]'), 'Owner Dashboard accordion headers must preserve responsive, touch-friendly controls.');

for (const id of sectionIds) {
  assert(source.includes(`id="${id}"`), `Owner Dashboard accordion is missing the ${id} section.`);
}

assert(source.includes('<DriverPerformance') && source.includes('id="driver-analytics"'), 'Driver Analytics must be wrapped by the canonical Owner Dashboard accordion.');
assert(source.includes('<PriceChangesWidget') && source.includes('id="price-changes"'), 'Price Changes must be wrapped by the canonical Owner Dashboard accordion.');
assert(source.includes('<LiveActivityFeed') && source.includes('id="live-activity"'), 'Live Activity must be wrapped by the canonical Owner Dashboard accordion.');
assert(source.includes('<ModeSpecificDashboardSection') && source.includes('id="mode-insights"'), 'Mode-specific ERP insights must be wrapped by the canonical Owner Dashboard accordion.');
assert(source.includes('summary={loadingActiveAlerts ? \'Loading…\' : `${activeAlertCount} active`}'), 'Active Alerts count must stay visible in the collapsed header.');
assert(source.includes('summary={fmt(execSummary.salesToday)}') && source.includes('summary={fmt(cashFlow.netCashFlow)}'), 'Financial totals must stay visible in compact headers.');

console.log(`Owner Dashboard accordion regression passed: ${sectionIds.length} sections are exclusive, collapsed by default, mounted safely, responsive, and accessible.`);
