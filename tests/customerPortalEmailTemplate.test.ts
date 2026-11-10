import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { renderCustomerInvitationEmail } from '../supabase/functions/customer-portal-invitation-email/emailTemplate.ts';

const token = 'a'.repeat(64);
const url = 'https://mybizctrl.site/customer-portal#invite=' + token;
const expiresAt = '2026-11-17T19:58:53.849Z';

describe('Customer invitation transactional email', () => {
  it('renders a genuinely clickable CTA and a readable fallback link', () => {
    const { html, text, subject } = renderCustomerInvitationEmail({
      customerName: 'ابو قلندر', invitationUrl: url, expiresAt,
    });
    expect(subject).toContain('BizControl');
    expect(html).toContain('href="' + url + '"');
    expect(html).toContain('Activate customer invitation');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('<table role="presentation"');
    expect(html).toContain('width:100%;max-width:600px');
    expect(html).toContain('lang="ar" dir="rtl"');
    expect(html).toContain('lang="fa" dir="rtl"');
    expect(html).toContain('support@mybizctrl.site');
    expect(html).toContain('Riyadh, UTC+3');
    expect(text).toContain(url);
    expect(text).toContain('separate Supabase Auth confirmation message');
    expect(text).toContain('ابو قلندر');
  });

  it('escapes customer-provided names and refuses other destination hosts or tokens', () => {
    const { html } = renderCustomerInvitationEmail({
      customerName: '<img src=x onerror="alert(1)">', invitationUrl: url, expiresAt,
    });
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    expect(html).not.toContain('<img src=x');
    for (const badUrl of [
      'https://example.com/customer-portal#invite=' + token,
      'https://mybizctrl.site/erp-login#invite=' + token,
      'https://mybizctrl.site/customer-portal#invite=short',
      'https://mybizctrl.site.evil.com/customer-portal#invite=' + token,
    ]) {
      expect(() => renderCustomerInvitationEmail({
        customerName: 'Customer', invitationUrl: badUrl, expiresAt,
      })).toThrow('INVALID_CUSTOMER_INVITATION_URL');
    }
  });

  it('keeps the OTP signup verification separate from a customer invitation', () => {
    const { html, text } = renderCustomerInvitationEmail({
      customerName: 'Test', invitationUrl: url, expiresAt,
    });
    expect(html).toContain('separate verification message');
    expect(html).toContain('The invitation button does not replace the separate email verification step');
    expect(text).toContain('Reopen this invitation');
  });

  it('sends HTML and plain text from the same verified owner-only edge handler', async () => {
    const code = await readFile(new URL('../supabase/functions/customer-portal-invitation-email/index.ts', import.meta.url), 'utf8');
    expect(code).toContain("import { renderCustomerInvitationEmail } from './emailTemplate.ts'");
    expect(code).toContain('renderCustomerInvitationEmail({');
    expect(code).toContain('subject, html, text');
    expect(code).toContain("'Idempotency-Key': 'customer-invite-html-v2-'");
    expect(code).toContain("if (digest !== invitation.token_hash)");
    expect(code).toContain('delivery_confirmed: false');
  });
});
