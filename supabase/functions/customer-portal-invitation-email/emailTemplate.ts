// HTML+text transactional customer invitation. Keep the same verified email-bound token flow.
type CustomerEmailArgs = { customerName: string; invitationUrl: string; expiresAt: string };

const escapeHtml = (value: string): string => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
} as Record<string, string>)[char] || char);

export function renderCustomerInvitationEmail({ customerName, invitationUrl, expiresAt }: CustomerEmailArgs) {
  const name = (customerName || '').trim() || 'Customer';
  // The caller constructs the invitation URL from a validated 256-bit token. Restrict the origin/path here too.
  const target = new URL(invitationUrl);
  if (target.origin !== 'https://mybizctrl.site' || target.pathname !== '/customer-portal' ||
      !/^#invite=[0-9a-f]{64}$/i.test(target.hash)) {
    throw new Error('INVALID_CUSTOMER_INVITATION_URL');
  }
  const safeUrl = escapeHtml(target.toString());
  const safeName = escapeHtml(name);
  const expiryDate = new Date(expiresAt);
  if (!Number.isFinite(expiryDate.getTime())) throw new Error('INVALID_CUSTOMER_INVITATION_EXPIRY');
  const expiryLabel = new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Riyadh',
  }).format(expiryDate) + ' (Riyadh, UTC+3)';
  const safeExpiry = escapeHtml(expiryLabel);
  const subject = 'BizControl | Your customer portal invitation';
  const text = [
    'BizControl — Customer portal invitation',
    '',
    'Hello ' + name + ',',
    'You have been invited to see your purchases, payments and account statement.',
    'OPEN YOUR INVITATION: ' + target.toString(),
    '',
    'Expires: ' + expiryLabel + ' · Valid once only.',
    '1. Open the invitation with the button or link above.',
    '2. Sign in or register using the SAME EMAIL this invitation was delivered to.',
    '3. New account? Verify your email via the separate Supabase Auth confirmation message.',
    '4. Reopen this invitation and select Activate invitation after verification.',
    '',
    'العربية: افتح رابط الدعوة وسجّل بنفس البريد الإلكتروني. إذا كان الحساب جديداً، أكّد البريد من رسالة منفصلة ثم فعّل الدعوة.',
    'فارسی دری: لینک دعوت را باز کنید و با همین ایمیل وارد شوید. اگر حساب تازه است، ایمیل را از پیام جداگانه تأیید کنید و بعد دعوت را فعال نمایید.',
    '',
    'Do not forward this private, single-use invitation link.',
    'Need help? support@mybizctrl.site',
  ].join('\n');

  // Inline CSS and table layout maximize compatibility with Gmail, iOS Mail and Outlook.
  // Meaningful visible link text and an unshortened fallback help when a client strips button styling.
  const html = `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>BizControl customer portal invitation</title>
</head>
<body style="margin:0;padding:0;background-color:#edf3f5;color:#172639;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
<div style="display:none;font-size:1px;color:#edf3f5;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">Your secure BizControl customer invitation. Use the button below to open the portal.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#edf3f5;"><tr><td align="center" style="padding:26px 12px 36px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #dce7eb;border-radius:18px;overflow:hidden;">
<tr><td style="background-color:#102d3a;padding:27px 30px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="color:#ffffff;font-size:24px;line-height:30px;font-weight:800;letter-spacing:-.5px;">&#9679; <span style="color:#62d1c1;">Biz</span>Control</td>
<td align="right" style="color:#b6d5db;font-size:11px;letter-spacing:1px;text-transform:uppercase;">CUSTOMER ACCESS</td>
</tr></table></td></tr>
<tr><td style="padding:32px 30px 18px;">
<p style="margin:0 0 10px;color:#08776e;font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase;">Secure account invitation</p>
<h1 style="margin:0 0 17px;color:#12263a;font-size:27px;line-height:1.2;font-weight:800;">Your customer portal is ready</h1>
<p style="margin:0 0 13px;color:#25384c;font-size:16px;line-height:1.7;">Hello <strong>${safeName}</strong>,</p>
<p style="margin:0 0 24px;color:#405269;font-size:15px;line-height:1.8;">You are invited to view your <strong>purchases, payments and account statements</strong> in BizControl.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 16px;"><tr><td align="center" bgcolor="#087d72" style="background-color:#087d72;border-radius:12px;">
<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:17px 30px;border-radius:12px;border:1px solid #087d72;background-color:#087d72;color:#ffffff;font-size:17px;font-weight:800;line-height:23px;text-decoration:none;">Activate customer invitation &#8594;</a>
</td></tr></table>
<p style="margin:0 0 24px;text-align:center;color:#677788;font-size:12px;line-height:1.6;">Opens your secure BizControl customer portal</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #cbe6e2;background-color:#f1faf8;border-radius:10px;"><tr><td style="padding:15px 17px;color:#155d55;font-size:13px;line-height:1.6;"><strong>&#9200; Invitation expires:</strong> ${safeExpiry}<br><strong>Security:</strong> This link works once and is tied to the email that received it.</td></tr></table>
</td></tr>
<tr><td style="padding:7px 30px 20px;">
<h2 style="margin:0 0 12px;color:#152b3d;font-size:16px;line-height:1.4;">How to activate your access</h2>
<p style="margin:0 0 8px;color:#3e5165;font-size:14px;line-height:1.75;"><strong>1.</strong> Tap the green button above.</p>
<p style="margin:0 0 8px;color:#3e5165;font-size:14px;line-height:1.75;"><strong>2.</strong> Sign in or create an account using <strong>this same email address</strong>.</p>
<p style="margin:0 0 8px;color:#3e5165;font-size:14px;line-height:1.75;"><strong>3.</strong> If the account is new, confirm the email via the <strong>separate verification message</strong>.</p>
<p style="margin:0;color:#3e5165;font-size:14px;line-height:1.75;"><strong>4.</strong> Reopen your invitation and tap <strong>Activate invitation</strong>.</p>
</td></tr>
<tr><td style="padding:0 30px 22px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f7fa;border-radius:10px;"><tr><td style="padding:15px 17px;">
<p lang="ar" dir="rtl" style="margin:0 0 12px;color:#293d51;text-align:right;font-size:14px;line-height:1.9;"><strong>دعوة بوابة العميل:</strong> اضغط زر تفعيل الدعوة وسجّل بنفس البريد الإلكتروني. إذا كان حسابك جديداً، أكّد بريدك من رسالة منفصلة، ثم ارجع لتفعيل الدعوة.</p>
<p lang="fa" dir="rtl" style="margin:0;color:#293d51;text-align:right;font-size:14px;line-height:1.9;"><strong>دعوت پورتل مشتری:</strong> دکمهٔ دعوت را بزنید و با همین ایمیل وارد شوید. اگر حساب تازه است، نخست ایمیل خود را از پیام جداگانه تأیید کنید، بعد دعوت را فعال نمایید.</p>
</td></tr></table></td></tr>
<tr><td style="padding:0 30px 30px;">
<p style="margin:0 0 8px;color:#66798a;font-size:12px;line-height:1.7;"><strong>Button not working?</strong> Tap this <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="color:#087d72;text-decoration:underline;">secure invitation link</a> or copy the full URL below into your browser:</p>
<p style="margin:0;padding:12px 13px;color:#415468;background-color:#f5f7fa;border:1px solid #e1e8eb;border-radius:8px;font-size:11px;line-height:1.65;word-break:break-all;overflow-wrap:anywhere;"><a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="color:#32667a;text-decoration:underline;word-break:break-all;">${safeUrl}</a></p>
<p style="margin:14px 0 0;color:#6b7785;font-size:12px;line-height:1.7;">This message contains a private, single-use invitation. Do not forward it. The invitation button does not replace the separate email verification step.</p>
</td></tr>
<tr><td style="padding:21px 30px;background-color:#f7fafb;border-top:1px solid #e3eaee;">
<p style="margin:0 0 5px;color:#223648;font-size:13px;font-weight:700;">BizControl · Smarter business operations</p>
<p style="margin:0;color:#6b7989;font-size:12px;line-height:1.7;">Need help? <a href="mailto:support@mybizctrl.site" style="color:#087d72;text-decoration:underline;">support@mybizctrl.site</a><br>&copy; BizControl · <a href="https://mybizctrl.site" style="color:#087d72;text-decoration:none;">mybizctrl.site</a></p>
</td></tr>
</table></td></tr></table>
</body></html>`;
  return { subject, html, text };
}
