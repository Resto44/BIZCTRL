import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const edge = new URL('../supabase/functions/erp-invitation-email/index.ts', import.meta.url);

describe('ERP invitation email security', () => {
  it('requires a signed-in approved owner and verifies the exact pending invitation token', async () => {
    const s = await readFile(edge, 'utf8');
    expect(s).toContain('caller.auth.getUser()');
    expect(s).toContain(".eq('user_id',user.id).eq('restaurant_id',invite.restaurant_id)");
    expect(s).toContain(".eq('role','owner').eq('status','approved')");
    expect(s).toContain("invite.status!=='pending'");
    expect(s).toContain('Date.parse(invite.expires_at)<=Date.now()');
    expect(s).toContain('sha256Hex(token)');
    expect(s).toContain('tokenHash!==invite.token_hash');
  });
  it('sends only to a stored invitation email on a fixed application domain', async () => {
    const s = await readFile(edge, 'utf8');
    expect(s).toContain("to:[invite.email]");
    expect(s).toContain("https://mybizctrl.site/erp-register?token=");
    expect(s).toContain("Idempotency-Key':'erp-invitation-'+invite.id");
    expect(s).toContain("Deno.env.get('RESEND_API_KEY')");
    expect(s).toContain("Deno.env.get('REPORT_EMAIL_FROM')");
    expect(s).toContain('renderBizctrlTransactionalEmail({');
    expect(s).toContain('businessType:business.business_type');
    expect(s).toContain('subject,html,text');
    expect(s).toContain(".eq('id',invite.restaurant_id)");
    expect(s).not.toContain('body.email');
    expect(s).not.toContain('body.activation_url');
    expect(s).not.toContain('body.redirect_url');
  });
  it('does not mark email delivered when the provider merely accepted the request', async () => {
    const s = await readFile(edge, 'utf8');
    expect(s).toContain('provider_accepted:true,delivery_confirmed:false');
    expect(s).toContain("reject('EMAIL_PROVIDER_REJECTED',502)");
    expect(s).toContain("reject('INVITATION_EMAIL_NOT_CONFIGURED',503)");
  });
});
