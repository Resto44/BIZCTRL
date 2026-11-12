import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { invitationCandidates, loadInvitationDirectory } from '@/lib/invitationDirectory';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/LanguageContext';

export default function InvitationDirectory({ restaurantId, branchId, role, branches = [], busy, onSelect }) {
  const [search, setSearch] = useState('');
  const { translateLiteral: t } = useLanguage();
  const query = useQuery({
    queryKey: ['invitation-directory', restaurantId], enabled: !!restaurantId,
    queryFn: () => loadInvitationDirectory(supabase, restaurantId),
    refetchOnMount: 'always', refetchOnWindowFocus: true,
  });
  const candidates = invitationCandidates(query.data || {}, role, branchId);
  const isManager = role === 'manager';
  const needle = search.trim().toLowerCase();
  const branchName = id => branches.find(b => String(b.id) === String(id))?.name
    || branches.find(b => String(b.id) === String(id))?.label || t('Organization-wide');
  const visible = candidates.filter(r =>
    `${r.full_name} ${r.email || ''} ${r.phone || ''} ${branchName(r.branch_id)}`.toLowerCase().includes(needle));
  const statusLabel = person => {
    if (person.source === 'invitation') return t('Invitation already exists — use Invitation activity to renew.');
    if (person.source === 'membership' && person.status === 'approved') return t('Active account — access is already assigned.');
    if (person.source === 'membership' && person.status === 'suspended') return t('Suspended account — manage access in Role & Permission Center.');
    if (person.source === 'membership') return t('Existing account — manage access instead of re-inviting.');
    return person.email || person.phone ? t('Available for a new invitation') : t('Add an email or phone below');
  };
  const showDirectory = !query.isPending && !query.isError;
  return <section data-testid="owner-role-directory" className="space-y-3 rounded-2xl border border-slate-200 bg-white/90 p-3 dark:border-slate-800 dark:bg-slate-950/80" aria-label={t(isManager ? 'Managers in this business' : 'Select an existing user')}>
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <h3 className="min-w-0 text-sm font-bold text-slate-900 dark:text-white">
        {t(isManager ? 'Managers in this business' : 'Select an existing user')} · {showDirectory ? candidates.length : '…'}
      </h3>
      {isManager && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">{t('All branches')}</span>}
    </div>
    <p className="text-xs leading-5 text-slate-600 dark:text-slate-400">
      {t(isManager ? 'All existing managers of this store, across its branches. Existing accounts are not invited again.' : 'Select a person to create their invitation link.')}
    </p>
    <Input aria-label={t('Search users')} placeholder={t('Search users')} value={search} onChange={e => setSearch(e.target.value)} />
    {query.isPending
      ? <p role="status" className="py-3 text-sm text-slate-600">{t('Loading...')}</p>
      : query.isError
        ? <div role="alert" className="space-y-2">
            <p className="text-xs text-red-700 dark:text-red-300">{t('Unable to load users. Retry')}</p>
            <Button type="button" variant="outline" onClick={() => query.refetch()}>{t('Retry')}</Button>
          </div>
        : <div className="max-h-80 space-y-2 overflow-y-auto" data-testid="role-directory-results">
            {visible.length === 0 && <p role="status" className="rounded-xl border border-dashed border-slate-200 p-3 text-xs leading-5 text-slate-600 dark:border-slate-700 dark:text-slate-300">
              {isManager && !needle
                ? t('No managers registered or invited for this store yet. Create the first manager below.')
                : needle ? t('No matching users.') : t('No matching users. Enter new user details below.')}
            </p>}
            {visible.map(person => {
              const selectable = person.canCreateInvitation && !!branchId && !busy;
              const details = <>
                <span className="block min-w-0 break-words text-sm font-semibold text-slate-900 dark:text-white">{person.full_name}</span>
                <span className="block break-all text-xs text-slate-600 dark:text-slate-400">{person.email || person.phone || t('Add an email or phone below')}</span>
                {isManager && <span className="mt-1 block text-xs text-blue-700 dark:text-blue-300">{t('Branch')}: {branchName(person.branch_id)}</span>}
                <span className="mt-1 block text-[11px] leading-5 text-slate-500 dark:text-slate-400">{statusLabel(person)}</span>
              </>;
              return selectable
                ? <button key={person.key} type="button" onClick={() => onSelect(person)}
                    className="block min-h-14 w-full min-w-0 rounded-xl border border-slate-200 p-3 text-start hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:hover:bg-slate-900">
                    {details}
                  </button>
                : <div key={person.key} data-testid="existing-role-member" className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                    {details}
                  </div>;
            })}
          </div>}
  </section>;
}
