import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(repoRoot, 'src', 'supabase', '20260822_enterprise_initial_trial_lifecycle.sql');

async function readMigration() {
  return readFile(migrationPath, 'utf8');
}

describe('canonical Enterprise initial trial lifecycle', () => {
  it('provisions a 30-day Enterprise TRIAL for new restaurants and preserves the restaurant uniqueness guard', async () => {
    const sql = await readMigration();

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.provision_organization_trial_subscription()');
    expect(sql).toContain("'enterprise_100', 'TRIAL', current_date, current_date + 30");
    expect(sql).toContain('ON CONFLICT (restaurant_id) WHERE restaurant_id IS NOT NULL DO NOTHING');
    expect(sql).not.toContain("'starter_20', 'TRIAL', current_date, current_date + 30");
  });

  it('uses the same Enterprise trial only for the canonical fallback and returns an existing subscription first', async () => {
    const sql = await readMigration();

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.ensure_erp_subscription(p_restaurant_id uuid, p_org_key text DEFAULT NULL)');
    expect(sql).toContain('PERFORM pg_advisory_xact_lock(hashtext(p_restaurant_id::text));');
    expect(sql).toContain('IF v_subscription.id IS NOT NULL THEN\n    RETURN v_subscription;\n  END IF;');
    expect(sql).toContain("v_org_key, p_restaurant_id, p_restaurant_id::text, 'enterprise_100', 'TRIAL'");
  });

  it('corrects only ongoing unpaid application-provisioned Starter trials without creating or marking payments', async () => {
    const sql = await readMigration();

    expect(sql).toContain("WHERE s.plan = 'starter_20'");
    expect(sql).toContain("AND s.subscription_status = 'TRIAL'");
    expect(sql).toContain("AND s.payment_provider = 'none'");
    expect(sql).toContain('AND s.trial_end >= current_date');
    expect(sql).toContain('FROM public.subscription_payments p');
    expect(sql).toContain('WHERE p.subscription_id = s.id');
    expect(sql).not.toContain('INSERT INTO public.subscription_payments');
    expect(sql).not.toContain("SET status = 'paid'");
  });
});
