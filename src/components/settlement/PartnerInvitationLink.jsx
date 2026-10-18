import React, {useRef, useState} from 'react';
import {Copy, Share2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';

export default function PartnerInvitationLink({invitation, t}) {
  const input = useRef(null);
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw Error('CLIPBOARD_UNAVAILABLE');
      await navigator.clipboard.writeText(invitation);
      setMessage(t.copied);
    } catch {
      input.current?.focus();
      input.current?.select();
      input.current?.setSelectionRange(0, invitation.length);
      let copied = false;
      try { copied = document.execCommand?.('copy') === true; } catch { /* Keep the full link selected. */ }
      setMessage(copied ? t.copied : t.copyManually);
    }
  };
  const perform = async (share) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setMessage('');
    try {
      if (share && typeof navigator.share === 'function') {
        try {
          // Call immediately from the click to retain iOS user activation.
          await navigator.share({title: t.portal, url: invitation});
        } catch (error) {
          if (error?.name !== 'AbortError') await copy();
        }
      } else await copy();
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };

  return <div className="min-w-0 space-y-3 rounded-xl border border-green-300 p-3">
    <p className="text-sm">{t.inviteHelp}</p>
    <Input ref={input} aria-label={t.invite} dir="ltr" readOnly value={invitation} className="min-w-0 w-full" onFocus={event=>event.target.select()}/>
    <div className="grid grid-cols-2 gap-2">
      <Button type="button" variant="outline" className="min-h-11 gap-2" disabled={busy} onClick={()=>perform(false)}><Copy className="h-4 w-4"/>{t.copyLink}</Button>
      <Button type="button" className="min-h-11 gap-2" disabled={busy} onClick={()=>perform(true)}><Share2 className="h-4 w-4"/>{t.shareLink}</Button>
    </div>
    <p role="status" aria-live="polite" className="text-sm">{message}</p>
  </div>;
}
