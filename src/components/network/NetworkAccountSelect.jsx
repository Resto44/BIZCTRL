/**
 * Branch-scoped network account picker for manager settlement workflows.
 * Uses the same canonical branch UUID and RLS as Sales Closing.
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Wifi } from 'lucide-react';
import { useTenant } from '@/lib/TenantContext';
import { resolveCanonicalNetworkBranch } from '@/lib/networkAccountBranch';

export default function NetworkAccountSelect({
  branch,
  value,
  onChange,
  placeholder = 'Select network account...',
  disabled = false,
}) {
  const { activeRestaurant, branches } = useTenant();
  const selected = resolveCanonicalNetworkBranch(branches, branch);

  const { data: accounts = [], isError, refetch } = useQuery({
    queryKey: ['network_accounts_select', activeRestaurant?.id, selected?.id],
    queryFn: async () => {
      if (!activeRestaurant?.id || !selected?.id) return [];
      const { data, error } = await supabase.from('network_accounts')
        .select('id,restaurant_id,branch_id,branch,branch_key,account_name,network_name,account_number,network_provider,status,is_active')
        .eq('restaurant_id', activeRestaurant.id)
        .eq('branch_id', selected.id)
        .order('id')
        .limit(500);
      if (error) throw error;
      return (data || []).filter(account =>
        (account.status ? String(account.status).toLowerCase() === 'active' : account.is_active === true)
      );
    },
    staleTime: 30000,
    enabled: !!activeRestaurant?.id && !!selected?.id,
  });

  return (
    <Select value={value || ''} onValueChange={onChange} disabled={disabled || !selected?.id}>
      <SelectTrigger>
        <SelectValue placeholder={!branch ? 'Select branch first' : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {!selected && (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            {!branch ? 'Select a branch first' : 'Choose a valid assigned branch'}
          </div>
        )}
        {selected && isError && (
          <div className="px-3 py-2 text-xs text-red-700" role="alert">
            Network accounts could not load.
            <button type="button" className="ms-2 underline" onClick={() => refetch()}>Retry</button>
          </div>
        )}
        {selected && !isError && accounts.length === 0 && (
          <div className="px-3 py-2 text-xs text-muted-foreground">No active accounts for this branch</div>
        )}
        {accounts.map(account => (
          <SelectItem key={account.id} value={account.id}>
            <div className="flex items-center gap-2">
              <Wifi className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
              <span>{account.account_name || account.network_name}</span>
              {account.account_number && <span className="text-xs text-muted-foreground">#{account.account_number}</span>}
              {account.network_provider && <span className="text-xs text-muted-foreground">({account.network_provider})</span>}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
