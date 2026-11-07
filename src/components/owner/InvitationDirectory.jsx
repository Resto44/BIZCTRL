import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { invitationCandidates, loadInvitationDirectory } from '@/lib/invitationDirectory';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/LanguageContext';

export default function InvitationDirectory({ restaurantId, branchId, role, busy, onSelect }) {
  const [search, setSearch] = useState('');
  const { translateLiteral: t } = useLanguage();
  const query = useQuery({ queryKey: ['invitation-directory', restaurantId], enabled: !!restaurantId,
    queryFn: () => loadInvitationDirectory(supabase, restaurantId) });
  const candidates = invitationCandidates(query.data || {}, role, branchId);
  const needle = search.trim().toLowerCase();
  const visible = candidates.filter(r => `${r.full_name} ${r.email || ''} ${r.phone || ''}`.toLowerCase().includes(needle));
  return <section className="space-y-2 rounded-2xl border p-3" aria-label={t('Select an existing user')}>
    <p className="text-sm font-bold">{t('Select an existing user')} · {candidates.length}</p>
    <p className="text-xs text-muted-foreground">{t('Select a person to create their invitation link.')}</p>
    <Input aria-label={t('Search users')} placeholder={t('Search users')} value={search} onChange={e => setSearch(e.target.value)} />
    {query.isPending ? <p role="status">{t('Loading...')}</p> : query.isError ? <Button type="button" variant="outline" onClick={() => query.refetch()}>{t('Unable to load users. Retry')}</Button> : <div className="max-h-64 overflow-y-auto space-y-2">
      {visible.length === 0 && <p className="text-xs text-muted-foreground">{t('No matching users. Enter new user details below.')}</p>}
      {visible.map(person => <button key={person.key} type="button" disabled={busy || !branchId} onClick={() => onSelect(person)} className="block w-full min-w-0 rounded-xl border p-3 text-start hover:bg-blue-50 disabled:opacity-50">
        <span className="block font-semibold break-words">{person.full_name}</span><span className="block text-xs break-all text-muted-foreground">{person.email || person.phone || t('Add an email or phone below')}</span>
      </button>)}
    </div>}
  </section>;
}
