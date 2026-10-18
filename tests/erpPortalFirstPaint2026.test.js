import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const get = p => readFileSync(p,'utf8');
const auth = get('src/api/supabaseClient.js');
const subscriptions = get('src/lib/SubscriptionContext.jsx');
const manager = get('src/pages/ManagerDashboardERP.jsx');
const supplier = get('src/pages/SupplierPortalERP.jsx');
const wallet = get('src/pages/PartnerPortal.jsx');

describe('Enterprise portal first paint without prematurely granting access',()=>{
  it('starts both remote auth validations together and fails closed on either result',()=>{
    const start = auth.slice(auth.indexOf('const auth = {'));
    expect(start).toContain('const [verifiedUserResult, contextResult] = await Promise.all([');
    expect(start).toContain('supabase.auth.getUser()');
    expect(start).toContain("supabase.rpc('erp_get_session_context')");
    expect(start).toContain('if (error || !user) return null;');
    expect(start).toContain('if (contextError || !sessionContext)');
    expect(start).toContain('return null;');
    expect(start).not.toContain('user.user_metadata.role');
  });
  it('never uses secondary UI identity load as subscription entitlement authority',()=>{
    expect(subscriptions).toContain("supabase.rpc('erp_subscription_snapshot')");
    expect(subscriptions).toContain('const tenantReady = !isLoadingAuth && !loadingRestaurants;');
    expect(subscriptions).toContain('if (snapshotResult.error) throw snapshotResult.error;');
    expect(subscriptions).not.toContain('loadingPortalIdentity');
    expect(subscriptions).toContain('if (!summaryRef.current?.found) setLoading(true)');
  });
  it('keeps manager money widgets skeletonized until their independent source queries finish',()=>{
    expect(manager).toContain('const salesKpiLoading = loadingSales || yesterdaySalesLoading;');
    expect(manager).toContain('const grossProfitLoading = loadingSales || loadingPurchases;');
    expect(manager).toContain('const netProfitLoading = grossProfitLoading || loadingExpenses;');
    expect(manager).toContain('loading={netProfitLoading}');
    expect(manager).toContain('loading={loadingTreasury}');
    expect(manager).toContain('salesTrendLoading ? <Skeleton');
    expect(manager).toContain('recentActivityLoading ? <Skeleton');
  });
  it('does not claim zero invoices or no activity while supplier finance is still loading',()=>{
    expect(supplier).toContain('if (supplierProfileLoading) return <PortalDataState loading/>;');
    expect(supplier).toContain("invoicesLoading ? '…' : showTotal('outstanding')");
    expect(supplier).toContain("!invoicesLoading && invoices.length > 0");
    expect(supplier).toContain("!isLoading && !invoicesLoading && pending.length === 0 && invoices.length === 0");
  });
  it('preserves wallet auth routing and owner approval instead of granting access from signup metadata',()=>{
    expect(wallet).toContain("<PeopleMemberships");
    expect(wallet).toContain("erp_partner_portal_accounts");
    expect(wallet).toContain("erp_accept_partner_invitation");
    expect(wallet).toContain("partner-portal-accounts");
    expect(wallet).not.toContain("supabase.from('wallet_transactions').insert");
  });
});