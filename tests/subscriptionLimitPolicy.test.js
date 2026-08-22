import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationPath = new URL('../src/supabase/20260821_subscription_limit_policy.sql', import.meta.url);
const ownerRegistrationMigrationPath = new URL('../src/supabase/20260822_owner_registration_initial_branch_scope_guard.sql', import.meta.url);
const billingPath = new URL('../src/pages/Billing.jsx', import.meta.url);
const contextPath = new URL('../src/lib/SubscriptionContext.jsx', import.meta.url);
const employeePath = new URL('../src/pages/Employees.jsx', import.meta.url);
const branchPath = new URL('../src/pages/BranchManagement.jsx', import.meta.url);
const restaurantPath = new URL('../src/pages/RestaurantManager.jsx', import.meta.url);
const invitationUiPath = new URL('../src/components/owner/OwnerStaffProvisioning.jsx', import.meta.url);
const landingPath = new URL('../src/pages/LandingPage.jsx', import.meta.url);
const pricingCardsPath = new URL('../src/components/marketing/PublicPricingCards.jsx', import.meta.url);
const superAdminPath = new URL('../src/pages/SuperAdmin.jsx', import.meta.url);

const PLAN_POLICY = {
  starter_20: { price: 1000, users: 3, branches: 1, employees: 5 },
  growth_40: { price: 2000, users: 10, branches: 3, employees: 15 },
  enterprise_100: { price: 5000, users: 30, branches: 10, employees: 50 },
};

describe('central subscription limit policy', () => {
  it('keeps existing canonical catalog IDs and defines each approved price and capacity in one forward-only migration', async () => {
    const migration = await readFile(migrationPath, 'utf8');

    for (const [planId, policy] of Object.entries(PLAN_POLICY)) {
      expect(migration).toContain(`WHEN '${planId}' THEN ${policy.price}`);
      expect(migration).toContain(`WHEN '${planId}' THEN ${policy.users}`);
      expect(migration).toContain(`WHEN '${planId}' THEN ${policy.branches}`);
      expect(migration).toContain(`WHEN '${planId}' THEN ${policy.employees}`);
    }

    expect(migration).toContain("WHERE id IN ('starter_20', 'growth_40', 'enterprise_100')");
    expect(migration).not.toMatch(/paddle_price_id\s*=/);
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\.(branches|employees|erp_memberships)/i);
  });

  it('enforces each capacity at the server boundary and blocks the next resource rather than trusting client state', async () => {
    const migration = await readFile(migrationPath, 'utf8');

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.erp_enforce_subscription_capacity()');
    expect(migration).toContain("v_resource := 'branches'");
    expect(migration).toContain("v_resource := 'employees'");
    expect(migration).toContain("v_resource := 'users'");
    expect(migration).toContain('IF v_count >= v_limit THEN');
    expect(migration).toContain("MESSAGE = 'SUBSCRIPTION_LIMIT_REACHED'");
    expect(migration).toContain("'billing_route', '/billing'");
    expect(migration).toContain("'upgrade_message'");
    expect(migration).toContain('CREATE TRIGGER subscription_capacity_branches');
    expect(migration).toContain('CREATE TRIGGER subscription_capacity_employees');
    expect(migration).toContain('CREATE TRIGGER subscription_capacity_memberships');
  });

  it('prevents user-limit bypasses through invitation issuance and concurrent direct API writes', async () => {
    const migration = await readFile(migrationPath, 'utf8');

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.create_erp_invitation(');
    expect(migration).toContain('v_capacity := public.erp_subscription_capacity_state(p_restaurant_id, true);');
    expect(migration).toContain('PERFORM pg_advisory_xact_lock(hashtext(p_restaurant_id::text));');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.erp_enforce_subscription_invitation_capacity()');
    expect(migration).toContain('CREATE TRIGGER subscription_capacity_invitations');
    expect(migration).toContain("v_used := coalesce((v_capacity -> 'usage' ->> 'users')::bigint, 0);");
    expect(migration).toContain('IF v_used >= v_limit THEN');
  });

  it('permits only the nested auth-triggered owner seed branch while retaining normal client scope enforcement', async () => {
    const migration = await readFile(ownerRegistrationMigrationPath, 'utf8');

    expect(migration).toContain('v_is_auth_owner_seed boolean := false;');
    expect(migration).toContain("IF TG_TABLE_NAME = 'branches' THEN");
    expect(migration).toContain('auth.uid() IS NULL');
    expect(migration).toContain('pg_trigger_depth() > 1');
    expect(migration).toContain('-- branch trigger rows');
    expect(migration).toContain("NEW.branch_key LIKE 'main-%'");
    expect(migration).toContain('restaurant.tenant_id = NEW.tenant_id');
    expect(migration).toContain("lower(coalesce(restaurant.created_by, '')) = lower(coalesce(NEW.created_by, ''))");
    expect(migration).toContain('AND NOT v_is_auth_owner_seed');
    expect(migration).toContain("MESSAGE = 'SUBSCRIPTION_SCOPE_DENIED'");
    expect(migration).not.toContain('DISABLE ROW LEVEL SECURITY');
  });

  it('prevents employee tenant-scope omission from bypassing the server limit', async () => {
    const [migration, employees] = await Promise.all([
      readFile(migrationPath, 'utf8'),
      readFile(employeePath, 'utf8'),
    ]);

    expect(migration).toContain("IF TG_TABLE_NAME = 'employees' AND v_restaurant_id IS NULL THEN");
    expect(migration).toContain('v_restaurant_id := public.auth_user_restaurant_id();');
    expect(migration).toContain("NEW.restaurant_id := v_restaurant_id;");
    expect(migration).toContain("MESSAGE = 'SUBSCRIPTION_SCOPE_REQUIRED'");
    expect(employees).toContain('restaurant_id: activeRestaurant?.id || null');
    expect(employees).toContain("withinLimit('employees')");
  });

  it('preserves existing data during downgrades and reports server-derived overages for creation blocking', async () => {
    const [migration, context, billing] = await Promise.all([
      readFile(migrationPath, 'utf8'),
      readFile(contextPath, 'utf8'),
      readFile(billingPath, 'utf8'),
    ]);

    expect(migration).toContain("'exceeded_limits', v_exceeded");
    expect(migration).toContain("'is_within_capacity', jsonb_array_length(v_exceeded) = 0");
    expect(migration).toContain("'exceeded_limits', coalesce(v_capacity -> 'exceeded_limits', '[]'::jsonb)");
    expect(migration).toContain('Existing records are never deleted during a downgrade');
    expect(context).toContain('exceededLimits');
    expect(context).toContain('isResourceExceeded');
    expect(billing).toContain('Existing data is retained. Creation is blocked only for resources above the current plan limit.');
    expect(billing).toContain('Upgrade Plan required for additional resources.');
  });

  it('keeps pricing, Billing, and creation interfaces connected to centralized plan data and clear upgrade messaging', async () => {
    const [landing, cards, billing, branch, restaurant, invitationUi] = await Promise.all([
      readFile(landingPath, 'utf8'),
      readFile(pricingCardsPath, 'utf8'),
      readFile(billingPath, 'utf8'),
      readFile(branchPath, 'utf8'),
      readFile(restaurantPath, 'utf8'),
      readFile(invitationUiPath, 'utf8'),
    ]);

    expect(landing).toContain("from('subscription_plans')");
    expect(cards).toContain('planCapacities(plan)');
    expect(billing).toContain('limits, usage, exceededLimits, isWithinCapacity');
    expect(branch).toContain("withinLimit('branches')");
    expect(restaurant).toContain("withinLimit('branches')");
    expect(invitationUi).toContain('subscriptionLimitErrorMessage');
  });

  it('removes the legacy direct tenant plan and capacity mutation path', async () => {
    const superAdmin = await readFile(superAdminPath, 'utf8');

    expect(superAdmin).not.toContain('const handlePlanChange');
    expect(superAdmin).not.toContain('price: 49');
    expect(superAdmin).not.toContain('price: 99');
    expect(superAdmin).not.toContain('price: 299');
    expect(superAdmin).toContain('Subscription plans, status, pricing, and capacities are canonical');
    expect(superAdmin).toContain('canonical Platform Owner subscription controls');
  });
});
