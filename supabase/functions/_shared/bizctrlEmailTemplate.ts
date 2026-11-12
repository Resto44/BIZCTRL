/**
 * One responsive, email-client-safe BizCTRL brand for invitation and attendance mail.
 * Inputs are server-authorized records, never caller-provided destination/role/URL.
 * Do not log token-bearing URLs, OTPs or recipient addresses.
 */
export type BizctrlEmailKind = 'staff'|'customer'|'attendance'|'report';
export type BizctrlEmailArgs = {
 kind:BizctrlEmailKind;name?:string;role?:string;businessName?:string;
 businessType?:string;branchName?:string;url:string;expiresAt?:string;
 code?:string;phase?:'in'|'out';reportLabel?:string;
};
const escapeHtml=(value:unknown)=>String(value??'').replace(/[&<>"']/g,ch=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
} as Record<string,string>)[ch]||ch);
const truncate=(v:unknown,n=110)=>String(v??'').trim().slice(0,n);
const titleCase=(v:string)=>v.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
function verifiedLink(kind:BizctrlEmailKind,raw:string){
 const parsed=new URL(raw);
 const allow=(kind==='staff'&&parsed.pathname==='/erp-register'&&/^\?token=[0-9a-f]{64}$/i.test(parsed.search)&&!parsed.hash)
  ||(kind==='customer'&&parsed.pathname==='/customer-portal'&&/^#invite=[0-9a-f]{64}$/i.test(parsed.hash)&&!parsed.search)
  ||(kind==='attendance'&&parsed.pathname==='/erp-login'&&!parsed.search&&!parsed.hash)
  ||(kind==='report'&&parsed.pathname==='/scheduled-reports'&&!parsed.search&&!parsed.hash);
 if(parsed.origin!=='https://mybizctrl.site'||parsed.username||parsed.password||!allow)
  throw new Error('INVALID_BIZCTRL_EMAIL_URL');
 return parsed.toString();
}
export function renderBizctrlTransactionalEmail(input:BizctrlEmailArgs){
 const kind=input.kind,link=verifiedLink(kind,input.url);
 const name=truncate(input.name||'team member'),role=titleCase(truncate(input.role||'Member',70));
 const business=truncate(input.businessName||'BizCTRL',110),businessType=titleCase(truncate(input.businessType||'Business',60));
 const branch=truncate(input.branchName||'',100);
 let expiry='';
 if(kind==='staff'||kind==='customer'||kind==='attendance'){
  const date=new Date(input.expiresAt||'');
  if(!Number.isFinite(date.getTime()))throw new Error('INVALID_BIZCTRL_EMAIL_EXPIRY');
  expiry=new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Riyadh'}).format(date)+' (Riyadh, UTC+3)';
 }
 const isCode=kind==='attendance';
 if(isCode&&!/^\d{6}$/.test(input.code||''))throw new Error('INVALID_ATTENDANCE_CODE');
 const action=kind==='staff'?'Activate ERP account':kind==='customer'?'Activate customer invitation':
  kind==='attendance'?'Open employee dashboard':'Open report center';
 const headline=kind==='staff'?'Your ERP invitation is ready':
  kind==='customer'?'Your customer portal is ready':
  kind==='attendance'?'Your '+(input.phase==='out'?'Check Out':'Check In')+' code':
  'Your BizCTRL report is ready';
 const message=kind==='staff'?'You have been invited to join this business with '+role+' access.':
  kind==='customer'?'You are invited to view your purchases, payments and account statements.':
  kind==='attendance'?'Enter this one-time code in your employee dashboard while physically at your assigned branch.':
  'Your requested ERP report is attached to this email.';
 const subject=kind==='staff'?'BizCTRL — '+role+' account invitation':
  kind==='customer'?'BizControl | Your customer portal invitation':
  kind==='attendance'?'BizCTRL · '+(input.phase==='out'?'Check Out':'Check In')+' verification code':
  'BizCTRL · '+truncate(input.reportLabel||'ERP report',100);
 const verification=kind==='staff'||kind==='customer';
 const safety=verification?'This invitation works once. New accounts must verify their email through a separate verification message before they can sign in.':
  isCode?'Single use. The code expires at the time shown. Never forward this code.':'This report is private. Do not forward it to unauthorized people.';
 const ar=kind==='staff'?'دعوة آمنة لتفعيل حسابك في بیزكنترول. افتح الرابط وأنشئ حسابك ثم أكّد بريدك من رسالة التحقق المنفصلة.':
  kind==='customer'?'دعوة بوابة العميل: افتح الرابط وسجّل بنفس البريد الإلكتروني، وأكّد بريدك برسالة منفصلة إذا كان حسابك جديداً.':
  kind==='attendance'?'رمز الدخول أو الخروج لمرة واحدة. افتح بوابة الموظف واستعمل الرمز قبل انتهاء صلاحيته، ولا تشاركه.':
  'تقرير بیزكنترول مرفق بهذه الرسالة. افتح مركز التقارير للحصول على التفاصيل.';
 const fa=kind==='staff'?'دعوت امن بیزکنترول: لینک را باز کنید، حساب بسازید و ایمیل خود را از پیام جداگانه تأیید نمایید.':
  kind==='customer'?'دعوت پورتل مشتری: با همین ایمیل وارد شوید. اگر حساب تازه است، اول ایمیل را از پیام جداگانه تأیید کنید و دوباره دعوت را فعال نمایید.':
  kind==='attendance'?'کد یک‌بارمصرف ورود یا خروج کارمند است. پیش از انقضا در داشبورد کارمند استفاده کنید و با کسی شریک نسازید.':
  'گزارش بیزکنترول به این ایمیل ضمیمه شده است. جزئیات بیشتر در مرکز گزارش‌ها است.';
 const tag=kind==='staff'?role.toUpperCase()+' ACCESS':kind==='customer'?'CUSTOMER ACCESS':
  kind==='attendance'?'EMPLOYEE VERIFICATION':'ERP REPORT';
 const safeLink=escapeHtml(link),safeBusiness=escapeHtml(business),safeType=escapeHtml(businessType);
 const businessRow='<strong>Business:</strong> '+safeBusiness+' · '+safeType+
  (branch?'<br><strong>Branch:</strong> '+escapeHtml(branch):'');
 const text=[
 'BizCTRL — '+headline,'','Hello '+name+',',message,
 'Business: '+business+' · '+businessType,...(branch?['Branch: '+branch]:[]),
 ...(kind==='staff'?['Role: '+role]:[]),
 ...(isCode?['Your six-digit code: '+input.code]:[]),
 '',action+': '+link,...(expiry?['Expires: '+expiry]:[]),
 safety,
 ...(kind==='customer'?['Sign in or register with the SAME EMAIL. Reopen this invitation after verification.']:[]),
 '', 'العربية: '+ar,'فارسی دری: '+fa,'','Need help? support@mybizctrl.site'
 ].join('\n');
 const html=`<!doctype html>
<html lang="en" dir="ltr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light">
<title>BizCTRL — ${escapeHtml(headline)}</title></head>
<body style="margin:0;padding:0;background:#edf3f5;color:#16283b;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
<div style="display:none;opacity:0;max-height:0;overflow:hidden;">${escapeHtml(headline)} · BizCTRL secure business access</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#edf3f5;">
<tr><td align="center" style="padding:24px 12px 36px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#fff;border:1px solid #dce7eb;border-radius:18px;overflow:hidden;">
<tr><td style="padding:26px 28px;background:#102d3a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="color:#fff;font-size:25px;line-height:31px;font-weight:800;"><span style="color:#62d1c1;">▦</span> BizCTRL</td>
<td align="right" style="color:#c0dce0;font-size:10px;line-height:16px;font-weight:700;letter-spacing:.6px;">${escapeHtml(tag)}</td>
</tr></table></td></tr>
<tr><td style="padding:28px 28px 18px;">
<p style="color:#08776e;font-size:12px;font-weight:800;letter-spacing:.8px;margin:0 0 10px;">SECURE BIZCTRL NOTIFICATION</p>
<h1 style="color:#12263a;font-size:25px;line-height:1.25;margin:0 0 16px;font-weight:800;">${escapeHtml(headline)}</h1>
<p style="color:#25384c;font-size:16px;line-height:1.6;margin:0 0 10px;">Hello <strong>${escapeHtml(name)}</strong>,</p>
<p style="color:#405269;font-size:15px;line-height:1.7;margin:0 0 19px;">${escapeHtml(message)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1faf8;border:1px solid #cbe6e2;border-radius:10px;">
<tr><td style="padding:14px 16px;color:#155d55;font-size:13px;line-height:1.8;">${businessRow}${kind==='staff'?'<br><strong>Role:</strong> '+escapeHtml(role):''}</td></tr></table>
${isCode?'<p style="padding:20px 0 2px;text-align:center;color:#087d72;font-size:36px;font-weight:800;letter-spacing:9px;font-variant-numeric:tabular-nums;">'+escapeHtml(input.code)+'</p>':''}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:24px auto 15px;"><tr>
<td bgcolor="#087d72" style="background:#087d72;border-radius:12px;">
<a href="${safeLink}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:16px 24px;background:#087d72;color:#fff;border-radius:12px;text-decoration:none;font-size:16px;font-weight:800;line-height:22px;">${escapeHtml(action)} &#8594;</a>
</td></tr></table>
${expiry?'<p style="text-align:center;color:#5d6f80;font-size:13px;line-height:1.6;margin:0 0 18px;"><strong>Expires:</strong> '+escapeHtml(expiry)+'</p>':''}
<p style="color:#536678;font-size:13px;line-height:1.7;margin:0 0 6px;">${escapeHtml(safety)}</p>
</td></tr>
<tr><td style="padding:0 28px 20px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;border-radius:10px;"><tr><td style="padding:15px 16px;">
<p lang="ar" dir="rtl" style="color:#294055;text-align:right;font-size:14px;line-height:1.9;margin:0 0 12px;">${escapeHtml(ar)}</p>
<p lang="fa" dir="rtl" style="color:#294055;text-align:right;font-size:14px;line-height:1.9;margin:0;">${escapeHtml(fa)}</p>
</td></tr></table></td></tr>
<tr><td style="padding:0 28px 28px;">
<p style="color:#66798a;font-size:12px;line-height:1.7;margin:0 0 8px;"><strong>Button not working?</strong> Use this <a href="${safeLink}" target="_blank" rel="noopener noreferrer" style="color:#087d72;text-decoration:underline;">secure link</a> or copy the URL:</p>
<p style="margin:0;padding:12px;color:#42566d;background:#f5f7fa;border:1px solid #e1e8eb;border-radius:8px;font-size:11px;line-height:1.7;word-break:break-all;overflow-wrap:anywhere;"><a href="${safeLink}" target="_blank" rel="noopener noreferrer" style="color:#32667a;text-decoration:underline;word-break:break-all;">${safeLink}</a></p>
<p style="margin:14px 0 0;color:#66798a;font-size:12px;line-height:1.7;">${verification?'The invitation button does not replace the separate email verification step.':''}</p>
</td></tr>
<tr><td style="padding:20px 28px;background:#f7fafb;border-top:1px solid #e3eaee;color:#576d81;font-size:12px;line-height:1.8;">
<strong style="color:#223648;">BizCTRL · Business ERP System</strong><br>
Need help? <a href="mailto:support@mybizctrl.site" style="color:#087d72;">support@mybizctrl.site</a><br>
<a href="https://mybizctrl.site" style="color:#087d72;text-decoration:none;">mybizctrl.site</a> · Private business communication
</td></tr></table></td></tr></table></body></html>`;
 return {subject,html,text};
}
