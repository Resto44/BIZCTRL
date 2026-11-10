import {describe, expect, it} from 'vitest';
import {readFile} from 'node:fs/promises';

const componentPath = new URL('../src/components/customer/CustomerAnalyticsDashboard.jsx',import.meta.url);
const pagePath = new URL('../src/pages/CustomerPortal.jsx',import.meta.url);
const rpcPath = new URL('../src/lib/customerPortal.js',import.meta.url);
const migrationPath = new URL('../supabase/migrations/20261110211500_customer_portal_erp_analytics.sql',import.meta.url);

describe('Customer ERP analytics / isolation and responsive dashboard',()=>{
 it('adds 6 dated periods and a bounded custom interval without mixing all-time balances',async()=>{
  const [component,page]=await Promise.all([readFile(componentPath,'utf8'),readFile(pagePath,'utf8')]);
  for(const key of ["'day'","'week'","'month'","'3m'","'6m'","'year'","'custom'"])expect(component).toContain(key);
  expect(component).toContain("p_customer_id:account.id,p_period:effectivePeriod");
  expect(component).toContain("refetchInterval:60000");
  expect(component).toContain('Date.parse(custom.to)-Date.parse(custom.from)');
  expect(component).toContain('>366');
  expect(page).toContain("lazy(() => import('@/components/customer/CustomerAnalyticsDashboard'))");
  expect(page).toContain('key={account.id} account={account} lang={lang}');
  expect(page).toContain('t.allTime');
 });
 it('renders truthful, localized, mobile charts and no-data/error states',async()=>{
  const c=await readFile(componentPath,'utf8');
  for(const name of ['AreaChart','BarChart','PieChart','paymentMethods','noData','fail','coverage','history'])expect(c).toContain(name);
  expect(c).toContain('records===0');
  expect(c).toContain("query.isError");
  expect(c).toContain("grid grid-cols-1 gap-3 sm:grid-cols-3");
  expect(c).toContain('min-w-0 max-w-full');
  expect(c).toContain("lang==='ar'");
  expect(c).toContain('تحليلات حساب العميل');
  expect(c).toContain('آنالیز حساب مشتری');
  expect(c).not.toContain('Math.random');
  expect(c).not.toContain('mockData');
 });
 it('uses a single authorized backend RPC for trend aggregation rather than fetching paginated statement screens',async()=>{
  const sql=await readFile(migrationPath,'utf8');
  const rpc=await readFile(rpcPath,'utf8');
  expect(sql).toContain('customer_portal_private.analytics');
  expect(sql).toContain('a.user_id = auth.uid()');
  expect(sql).toContain('a.active IS TRUE');
  expect(sql).toContain('d.restaurant_id=c.restaurant_id');
  expect(sql).toContain('p.restaurant_id=c.restaurant_id');
  expect(sql).toContain('o.restaurant_id=c.restaurant_id');
  expect(sql).toContain('c.branch_id IS NULL OR');
  expect(sql).toContain("d.party_type='customer'");
  expect(sql).toContain("d.type='receivable'");
  expect(sql).toContain("SECURITY DEFINER SET search_path = ''");
  expect(sql).toContain('SECURITY INVOKER SET search_path');
  expect(sql).toContain('REVOKE ALL ON FUNCTION public.erp_customer_portal_analytics');
  expect(sql).toContain('FROM PUBLIC,anon');
  expect(sql).toContain('TO authenticated');
  expect(sql).toContain('jsonb_agg');
  expect(sql).toContain('generate_series');
  expect(sql).not.toContain('DROP TABLE');
  expect(sql).not.toContain('DELETE FROM');
  expect(rpc).toContain('withPortalReadDeadline');
 });
 it('does not overlap iPhone date filters',async()=>{
  const page=await readFile(pagePath,'utf8');
  expect(page).toContain('grid grid-cols-1 items-end gap-3');
  expect(page).toContain('mt-1 w-full min-w-0 max-w-full');
  expect(page).toContain('overflow-x-auto pb-2');
 });
});
