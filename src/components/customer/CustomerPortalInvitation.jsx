import React, { useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { customerPortalRpc, customerPortalText } from '@/lib/customerPortal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function CustomerPortalInvitation({ customer }) {
 const { lang } = useLanguage(), t = customerPortalText[lang] || customerPortalText.en;
 const [email,setEmail] = useState(customer.email || '');
 const [link,setLink] = useState(''), [token,setToken] = useState('');
 const [busy,setBusy] = useState(false), [sending,setSending] = useState(false);
 const [message,setMessage] = useState(''), [emailState,setEmailState] = useState('');

 async function deliver(invitationToken) {
  setSending(true);setEmailState('');
  try {
   const { data, error } = await supabase.functions.invoke('customer-portal-invitation-email', {
    body: { customer_id: customer.id, token: invitationToken }
   });
   if (error || !data?.provider_accepted) throw error || Error(data?.error || 'EMAIL_UNAVAILABLE');
   setEmailState('accepted');
  } catch {
   // Keep the still-valid invitation link available for manual sharing or retry.
   setEmailState('failed');
  } finally { setSending(false); }
 }

 async function run(revoke) {
  if (busy || sending) return;
  setBusy(true);setMessage('');setLink('');setToken('');setEmailState('');
  try {
   const data = await customerPortalRpc('erp_customer_portal_invite', {
    p_customer_id: customer.id, p_email: email.trim(), p_revoke: revoke
   });
   if (revoke) {
    setMessage(t.saved);
   } else if (data?.token) {
    const url = `${window.location.origin}/customer-portal#invite=${encodeURIComponent(data.token)}`;
    setLink(url);setToken(data.token);
    await deliver(data.token);
   } else throw Error('INVITATION_NOT_CREATED');
  } catch { setMessage(t.failed); } finally { setBusy(false); }
 }

 return <section data-i18n-skip="true" className="my-4 space-y-3 rounded-xl border bg-white p-4">
  <h3 className="font-bold">{t.title}</h3>
  <form onSubmit={e=>{e.preventDefault();run(false);}} className="flex flex-wrap gap-2">
   <Input aria-label={t.email} type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder={t.email} className="min-w-0 flex-1"/>
   <Button disabled={busy||sending}>{t.invite}</Button>
   <Button type="button" variant="outline" disabled={busy||sending} onClick={()=>run(true)}>{t.revoke}</Button>
  </form>
  {link&&<>
   <p className="text-sm">{t.inviteHelp}</p>
   <Input aria-label={t.invite} readOnly value={link} dir="ltr" onFocus={e=>e.target.select()}/>
   <div className="flex flex-wrap gap-2">
    <Button type="button" variant="outline" onClick={async()=>{try{await navigator.clipboard.writeText(link);setMessage(t.copied);}catch{setMessage(t.failed);}}}>{t.copy}</Button>
    {emailState==='failed'&&<Button type="button" variant="outline" disabled={sending||busy} onClick={()=>deliver(token)}>{t.retryEmail}</Button>}
   </div>
   {sending&&<p role="status" className="text-sm">{t.emailSending}</p>}
   {emailState==='accepted'&&<p role="status" className="text-sm text-teal-800">{t.emailAccepted}</p>}
   {emailState==='failed'&&<p role="alert" className="text-sm text-rose-800">{t.emailFailed}</p>}
  </>}
  {message&&<p role="status">{message}</p>}
 </section>;
}
