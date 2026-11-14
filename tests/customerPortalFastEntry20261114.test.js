import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const app = readFileSync('src/App.jsx','utf8');
const page = readFileSync('src/pages/CustomerPortal.jsx','utf8');
const order = readFileSync('src/components/customer/CustomerOrderEntry.jsx','utf8');
const auth = readFileSync('src/lib/AuthContext.jsx','utf8');

describe('Customer Portal fast-entry / mobile performance',()=>{
 it('isolates independent verified customer login from ERP AuthProvider bootstrap',()=>{
  expect(app).toContain('function StandaloneCustomerAuthBoundary({ children })');
  expect(app).toContain("pathname.replace(/\\/+$/, '') === '/customer-portal'");
  expect(app).toContain('? children');
  expect(app).toContain(': <AuthProvider>{children}</AuthProvider>');
  expect(app).toContain('<StandaloneCustomerAuthBoundary>');
  expect(app).toContain('</StandaloneCustomerAuthBoundary>');
  // The existing ERP guard remains on every non-customer route.
  expect(auth).toContain('base44.auth.me()');
  expect(app).toContain('const CustomerPortal = lazy(');
  expect(app).toContain('<CustomerPortal /></Suspense>');
 });
 it('only fetches authorized customer accounts and one statement during first paint',()=>{
  expect(page).toContain("customerPortalRpc('erp_customer_portal_accounts')");
  expect(page).toContain("customerPortalRpc('erp_customer_portal_statement'");
  expect(page).toContain("setOpened({order:false,analytics:false,push:false})");
  expect(page).toContain("opened.order&&<section");
  expect(page).toContain("opened.analytics&&<section");
  expect(page).toContain("opened.push&&<section");
  expect(page).toContain('data-testid="customer-portal-quick-sections"');
  expect(page).toContain('data-testid="customer-open-order"');
  expect(page).toContain('data-testid="customer-open-analytics"');
  expect(page).toContain('data-testid="customer-open-push"');
  expect(page).toContain("lazy(() => import('@/components/customer/CustomerAnalyticsDashboard'))");
  expect(page).toContain("lazy(() => import('@/components/customer/CustomerOrderEntry'))");
  expect(page).toContain("lazy(() => import('@/components/notifications/PortalPushSettings'))");
 });
 it('preserves customer and account isolation, invitation verification and signout',()=>{
  expect(page).toContain("session?.user?.id,account?.id");
  expect(page).toContain("client.removeQueries({queryKey:['customer-portal']})");
  expect(page).toContain("customerPortalRpc('erp_customer_portal_accept'");
  expect(page).toContain('withPortalReadDeadline(supabase.auth.getSession(),8000');
  expect(page).toContain('<CustomerIdentityCard key={account.id} account={account} lang={lang}/>');
  expect(page).toContain("<CustomerOrderEntry key={'customer-order-'+account.id} account={account} lang={lang}/>");
  expect(page).toContain('<CustomerAnalyticsDashboard key={account.id} account={account} lang={lang}/>');
  expect(page).toContain("PortalPushSettings key={'push-'+account.id}");
 });
 it('reduces background network churn and retains explicit fresh-data access',()=>{
  expect(page).not.toContain('refetchInterval:5000');
  expect(page).not.toContain('refetchInterval:20000');
  expect(page).toContain('refetchInterval:60000,refetchIntervalInBackground:false');
  expect(page).toContain('refetchInterval:45000,refetchIntervalInBackground:false');
  expect(page).toContain("onClick={refreshDashboard}");
  expect(page).toContain("onClick={()=>statement.refetch()}");
  expect(order).toContain('refetchInterval:30000,refetchIntervalInBackground:false');
 });
 it('renders a bounded amount of customer product cards while keeping all items searchable',()=>{
  expect(order).toContain('const [visibleLimit,setVisibleLimit]=useState(32)');
  expect(order).toContain('filterPortalOrderProducts(catalog,activeCategory,search)');
  expect(order).toContain('displayed.slice(0,visibleLimit).map(item');
  expect(order).toContain('displayed.length>visibleLimit');
  expect(order).toContain('setVisibleLimit(value=>value+32)');
  expect(order).toContain('data-testid="customer-order-more-products"');
  expect(order).toContain('setVisibleLimit(32)');
  expect(order).toContain('const selected=customerOrderCart(catalog,cart)');
  expect(order).toContain('customerOrderCartTotal(selected)');
  expect(order).toContain('p_customer_id:account.id');
  expect(order).toContain('p_items:selected.map(x=>({id:x.id,quantity:x.quantity}))');
 });
});
