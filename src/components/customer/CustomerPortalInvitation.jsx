import React, { useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { customerPortalRpc, customerPortalText } from '@/lib/customerPortal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
export default function CustomerPortalInvitation({ customer }) {
 const { lang } = useLanguage(), t = customerPortalText[lang] || customerPortalText.en;
 const [email,setEmail] = useState(customer.email || ''), [link,setLink] = useState(''), [busy,setBusy] = useState(false), [message,setMessage] = useState('');
 async function run(revoke) {
  setBusy(true);setMessage('');setLink('');
  try {
   const data = await customerPortalRpc('erp_customer_portal_invite',{p_customer_id:customer.id,p_email:email,p_revoke:revoke});
   if(revoke)setMessage(t.saved);else setLink(`${window.location.origin}/customer-portal#invite=${encodeURIComponent(data.token)}`);
  }catch {setMessage(t.failed);}finally{setBusy(false);}
 }
 return <section className="my-4 space-y-3 rounded-xl border bg-white p-4">
  <h3 className="font-bold">{t.title}</h3>
  <form onSubmit={e=>{e.preventDefault();run(false);}} className="flex flex-wrap gap-2">
   <Input aria-label={t.email} type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder={t.email} className="min-w-0 flex-1"/>
   <Button disabled={busy}>{t.invite}</Button>
   <Button type="button" variant="outline" disabled={busy} onClick={()=>run(true)}>{t.revoke}</Button>
  </form>
  {link&&<><p className="text-sm">{t.inviteHelp}</p><Input aria-label={t.invite} readOnly value={link} dir="ltr" onFocus={e=>e.target.select()}/><Button variant="outline" onClick={async()=>{try{await navigator.clipboard.writeText(link);setMessage(t.copied);}catch{setMessage(t.failed);}}}>{t.copy}</Button></>}
  {message&&<p role="status">{message}</p>}
 </section>;
}
