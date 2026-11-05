-- Repair only network accounts whose legacy branch label resolves to exactly
-- one canonical branch in the same restaurant. No cross-tenant or guesswork.
-- Idempotent: existing branch_id is never overwritten.
with candidates as (
  select a.id as account_id, b.id as canonical_branch_id
  from public.network_accounts a
  join public.branches b on b.restaurant_id::text = a.restaurant_id
  where a.branch_id is null
    and (
      nullif(lower(btrim(a.branch)), '') in
        (lower(btrim(b.branch_key)), lower(btrim(b.name)), lower(b.id::text))
      or nullif(lower(btrim(a.branch_key)), '') in
        (lower(btrim(b.branch_key)), lower(btrim(b.name)), lower(b.id::text))
    )
), unique_matches as (
  select account_id, min(canonical_branch_id::text)::uuid as canonical_branch_id
  from candidates group by account_id having count(distinct canonical_branch_id) = 1
)
update public.network_accounts a
  set branch_id = c.canonical_branch_id
from unique_matches c
where a.id = c.account_id and a.branch_id is null;
-- Unmapped accounts must be reviewed and assigned explicitly by an owner.
-- Existing RLS keeps them invisible to branch managers until corrected.
