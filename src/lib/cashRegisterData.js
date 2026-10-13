import { supabase } from '@/api/supabaseClient';
import { readAllPortalRows } from '@/lib/portalReliability';
const tables = { DailyCashSettlement: 'daily_cash_settlements', CashShortage: 'cash_shortages', OwnerCashInjection: 'owner_cash_injections', CashMovement: 'cash_movements' };
export function readCashRows(entity, filters = {}) {
  if (!filters.restaurant_id) throw new Error('Choose a business before loading the cash register.');
  const table = tables[entity];
  if (!table) throw new Error('Unknown cash register collection');
  return readAllPortalRows(() => {
    let query = supabase.from(table).select('*');
    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined || value === null) continue;
      if (key === 'date_from') query = query.gte('date', value);
      else if (key === 'date_to') query = query.lte('date', value);
      else if (key === 'is_reversed' && value === false) query = query.or('is_reversed.is.null,is_reversed.eq.false');
      else query = query.eq(key, value);
    }
    return query.order('date', { ascending: false }).order('id', { ascending: true });
  });
}
export function cashBranchLabel(branches, key) {
  const found = (branches || []).find(b => [b.key, b.branch_key, b.id].includes(key));
  return found?.label || found?.name || key || '—';
}
export function cashRegisterIssues(injections, movements) {
  const counts = new Map();
  for (const movement of movements) {
    if (movement.source_module !== 'OwnerCashInjection' || movement.is_reversed) continue;
    counts.set(movement.source_record_id, (counts.get(movement.source_record_id) || 0) + 1);
  }
  return injections.filter(row => !row.wallet_transaction_id || counts.get(row.id) !== 1);
}
export function validCashAmount(value, allowZero = false) {
  const number = Number(value);
  return String(value).trim() !== '' && Number.isFinite(number) && (allowZero ? number >= 0 : number > 0) && Math.abs(number * 100 - Math.round(number * 100)) < 0.000001;
}
