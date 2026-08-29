import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

describe('Owner AI Copilot contract', () => {
  it('keeps the secure Copilot module available without forcing a floating overlay into the new dashboard', async () => {
    const [dock, dashboard, panel] = await Promise.all([
      source('../src/components/dashboard/QuickActionsDock.jsx'),
      source('../src/pages/OwnerDashboard.jsx'),
      source('../src/components/dashboard/OwnerCopilotPanel.jsx'),
    ]);

    expect(dock).toContain('onOpenCopilot');
    expect(dock).toContain("label: 'AI Copilot'");
    expect(dock).toContain('Ask anything about your business or BizCTRL.');
    expect(dashboard).not.toContain('<QuickActionsDock');
    expect(dashboard).not.toContain('<OwnerCopilotPanel');
    expect(dashboard).toContain('data-testid="owner-mega-dashboard"');
    expect(panel).toContain("supabase.functions.invoke('owner-copilot'");
    expect(panel).toContain('fixed inset-0 z-[130]');
    expect(panel).toContain('overflow-y-auto overscroll-contain');
  });

  it('keeps the mobile panel within the viewport without converting the Copilot page into a horizontal scroller', async () => {
    const panel = await source('../src/components/dashboard/OwnerCopilotPanel.jsx');

    expect(panel).toContain('fixed inset-0 z-[130] flex min-w-0 w-full max-w-full overflow-hidden box-border');
    expect(panel).toContain('h-[100dvh] w-full min-w-0 max-w-full flex-col overflow-hidden');
    expect(panel).toContain('flex-wrap items-center gap-1.5 overflow-visible');
    expect(panel).toContain('md:flex-nowrap md:overflow-x-auto');
    expect(panel).not.toContain('shrink-0 items-center gap-2 overflow-x-auto border-b');
    expect(panel).toContain('w-full min-w-0 max-w-full shrink-0 border-t');
    expect(panel).toContain('min-w-0 w-full max-h-28 min-h-10 flex-1');
    expect(panel).toContain('[overflow-wrap:anywhere]');
  });

  it('uses a server-side JWT-protected function and canonical tenant, subscription, branch, and route context', async () => {
    const [edge, panel] = await Promise.all([
      source('../supabase/functions/owner-copilot/index.ts'),
      source('../src/components/dashboard/OwnerCopilotPanel.jsx'),
    ]);

    expect(edge).toContain('const authorization = req.headers.get("Authorization")');
    expect(edge).toContain('caller.auth.getUser()');
    expect(edge).toContain('erp_get_authenticated_portal_identity');
    expect(edge).toContain('erp_subscription_snapshot');
    expect(edge).toContain('BRANCH_SCOPE_DENIED');
    expect(edge).toContain('GEMINI_API_KEY');
    expect(edge).toContain('AI_PROVIDER');
    expect(edge).toContain('generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    expect(edge).toContain('AI_COPILOT_PROVIDER_AUTH_FAILED');
    expect(edge).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(panel).toContain('ERP_NAV_GROUPS');
    expect(panel).toContain('availableModules');
    expect(panel).not.toContain('OPENAI_API_KEY');
    expect(panel).not.toContain('GEMINI_API_KEY');
  });

  it('keeps business reads controlled and creates an expense only after explicit confirmation', async () => {
    const edge = await source('../supabase/functions/owner-copilot/index.ts');

    for (const tool of [
      'get_dashboard_summary',
      'get_branch_sales',
      'get_monthly_expenses',
      'get_top_products',
      'get_customer_debt',
      'get_subscription_status',
      'explain_module_access',
      'prepare_create_expense',
    ]) {
      expect(edge).toContain(`name: "${tool}"`);
    }
    expect(edge).toContain('confirmation_required');
    expect(edge).toContain('ACTION_CONFIRMATION_REQUIRED');
    expect(edge).toContain('body.operation === "confirm_action"');
    expect(edge).toContain("caller.from(\"expenses\").insert({");
    expect(edge).toContain("request.action_type !== \"create_expense\"");
  });

  it('persists conversations and observability records with tenant-isolated RLS policies', async () => {
    const migration = await source('../supabase/migrations/20260823_owner_copilot.sql');

    for (const table of ['copilot_conversations', 'copilot_messages', 'copilot_action_requests', 'copilot_tool_events']) {
      expect(migration).toContain(`public.${table}`);
      expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    }
    expect(migration).toContain('copilot_conversations_tenant_user');
    expect(migration).toContain('copilot_messages_tenant_user');
    expect(migration).toContain('erp_memberships');
    expect(migration).toContain("m.status = 'approved'");
  });
});
