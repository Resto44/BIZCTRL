import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const sql=readFileSync('supabase/migrations/20261020104500_erp_bank_wallet_approval_commit_security.sql','utf8');
const ui=readFileSync('src/components/wallet-banking/WalletBankingCenter.jsx','utf8');
const original=readFileSync('supabase/migrations/20261019202000_erp_bank_wallet_v1.sql','utf8');

describe('Wallet owner approval commit-time permission regression',()=>{
 it('executes deferred two-sided invariant as function owner, NOT with client table grants',()=>{
  expect(original).toContain('DEFERRABLE INITIALLY DEFERRED');
  expect(original).toContain('EXECUTE FUNCTION public.erp_bank_wallet_verify_balanced()');
  expect(original).toContain('REVOKE ALL ON public.erp_bank_wallet_accounts');
  expect(sql).toContain('ALTER FUNCTION public.erp_bank_wallet_verify_balanced() SECURITY DEFINER');
  expect(sql).toContain('SET search_path = public, pg_temp');
  expect(sql).toContain('FROM PUBLIC, anon, authenticated');
  expect(sql).not.toMatch(/GRANT\s+(SELECT|INSERT|UPDATE|DELETE)\s+ON/i);
  expect(sql).not.toMatch(/\b(INSERT INTO|UPDATE public\.erp_bank_wallet|DELETE FROM)\b/i);
 });
 it('keeps server-enforced atomic posting, owner approval and finance safeguards',()=>{
  expect(original).toContain("r.created_by=auth.uid()");
  expect(original).toContain('treasury_account_is_owner(r.restaurant_id)');
  expect(original).toContain('WALLET_TREASURY_INSUFFICIENT_FUNDS');
  expect(original).toContain("IF v_balance<r.amount");
  expect(original).toContain('INSERT INTO public.erp_bank_wallet_postings');
  expect(original).toContain('v_count<>2 OR v_sum<>0');
  expect(original).toContain("status='posted'");
 });
 it('shows a visible actionable error in mobile review rather than only far above the form',()=>{
  expect(ui).toContain("[reviewError,setReviewError]=useState('')");
  expect(ui).toContain("onError:e=>{setReviewError(e?.message||t.error);setMessage('');}");
  expect(ui).toContain('role="alert" aria-live="assertive"');
  expect(ui).toContain('{reviewError}</p>');
  expect(ui).toContain('aria-busy={review.isPending}');
  expect(ui).toContain("{review.isPending?t.processing:t.approve}");
  expect(ui).toContain("onClick={()=>{setReviewError('');review.mutate(true);}}");
  expect(ui).toContain("client.invalidateQueries({queryKey:['erp-bank-wallet-treasury',person?.restaurant_id]})");
 });
});
