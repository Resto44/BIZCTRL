import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const read = file => readFile(new URL(file, import.meta.url), 'utf8');

describe('Customer Portal mobile compact layout', () => {
 it('starts close to the safe-area viewport without negative offset or fixed height', async () => {
  const page = await read('../src/pages/CustomerPortal.jsx');
  expect(page).toContain('data-i18n-skip="true"');
  expect(page).toContain('space-y-3 overflow-x-clip px-3 pb-4 pt-1 sm:space-y-5 sm:p-6');
  expect(page).toContain('justify-between gap-2 border-b pb-3 sm:gap-4 sm:pb-5');
  expect(page).toContain('text-2xl font-black leading-tight');
  expect(page).toContain('min-h-11 rounded-lg border bg-white px-2 py-1');
  expect(page).toContain('min-h-11 w-full min-w-0 max-w-full truncate');
  expect(page).toContain('sm:space-y-5 sm:p-6');
  expect(page).not.toMatch(/(?:-mt-|top-\[-|translate-y-\[-)/);
 });
 it('keeps authenticated identity visible while compressing card space and retaining account boundaries', async () => {
  const [page, identity] = await Promise.all([
   read('../src/pages/CustomerPortal.jsx'),
   read('../src/components/customer/CustomerIdentityCard.jsx')
  ]);
  expect(page).toContain('<CustomerIdentityCard key={account.id} account={account} lang={lang}/>');
  expect(page).toContain("customerPortalRpc('erp_customer_portal_accounts')");
  expect(identity).toContain('data-testid="customer-display-name"');
  expect(identity).toContain('size-10 shrink-0');
  expect(identity).toContain('mt-2 grid min-w-0');
  expect(identity).toContain('sm:mt-3 sm:grid-cols-2 sm:pt-3');
  expect(identity).toContain('account?.branch_name');
 });
 it('preserves mobile analytics period filters, RTL locale and push controls', async () => {
  const [dashboard, push, page] = await Promise.all([
   read('../src/components/customer/CustomerAnalyticsDashboard.jsx'),
   read('../src/components/notifications/PortalPushSettings.jsx'),
   read('../src/pages/CustomerPortal.jsx')
  ]);
  expect(dashboard).toContain('space-y-3 overflow-x-clip rounded-3xl');
  expect(dashboard).toContain('sm:space-y-4 sm:p-5');
  expect(dashboard).toContain('grid-cols-2 gap-2 min-[440px]:grid-cols-3');
  expect(push).toContain('min-h-11 cursor-pointer list-none');
  expect(push).toContain('px-3 py-2');
  expect(page).toContain("dir={lang==='en'?'ltr':'rtl'}");
  expect(page).toContain('PortalPushSettings');
  expect(page).toContain('CustomerAnalyticsDashboard');
 });
});
