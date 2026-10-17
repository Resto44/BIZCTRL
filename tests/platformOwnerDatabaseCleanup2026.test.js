import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const sql=read('supabase/migrations/20261017232000_platform_owner_database_cleanup.sql');
const api=read('src/lib/platformOwnerApi.js');
const ui=read('src/components/platform-owner/PlatformDatabaseCleanup.jsx');
const portal=read('src/pages/PlatformOwnerPortal.jsx');

describe('Platform Owner safe database cleanup (dry-run then explicit action)',()=>{
  it('is platform-owner/MFA-only on both independent RPCs, never anon',()=>{
    expect(sql.match(/PERFORM public.platform_owner_assert\(\);/g)).toHaveLength(2);
    expect(sql.match(/SECURITY DEFINER/g)).toHaveLength(2);
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.platform_owner_cleanup_preview(text) FROM PUBLIC,anon");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.platform_owner_run_cleanup(text,text,text,text) FROM PUBLIC,anon");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.platform_owner_run_cleanup(text,text,text,text) TO authenticated");
    expect(api).toContain("rpc('platform_owner_cleanup_preview'");
    expect(api).toContain("rpc('platform_owner_run_cleanup'");
  });
  it('only considers genuinely expired, never-activated invitations and old inactive push endpoints',()=>{
    expect(sql.match(/status='pending' AND activated_at IS NULL AND revoked_at IS NULL/g).length).toBeGreaterThanOrEqual(3);
    expect(sql.match(/expires_at < now\(\)-interval '30 days'/g).length).toBeGreaterThanOrEqual(3);
    expect(sql.match(/is_active IS FALSE AND created_at < now\(\)-interval '90 days'/g).length).toBeGreaterThanOrEqual(4);
    expect(sql).toContain('ORDER BY id LIMIT 100 FOR UPDATE');
    expect(sql).toContain('p_category NOT IN');
    for(const name of ['restaurants','subscription_payments','sales_invoices','wallet_transactions','expenses','purchases','auth.users']){
      expect(sql).not.toContain('DELETE FROM public.'+name);
      expect(sql).not.toContain('DELETE FROM '+name);
    }
  });
  it('requires both fresh preview hash and typed confirmation, with a real reason',()=>{
    expect(sql).toContain("p_confirmation IS DISTINCT FROM 'CLEANUP'");
    expect(sql).toContain("coalesce(length(btrim(p_reason)),0)<8");
    expect(sql).toContain('p_preview_token');
    expect(sql).toContain('md5(p_category');
    expect(sql).toContain('IF v_token IS DISTINCT FROM p_preview_token THEN');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain("RAISE EXCEPTION 'PLATFORM_CLEANUP_SCAN_CHANGED'");
    expect(sql).toContain("PERFORM public.platform_owner_log('database_cleanup'");
    expect(sql).toContain('v_deleted<>v_inv_n');
    expect(sql).toContain('v_deleted<>v_push_n');
  });
  it('shows a phone-sized trilingual preview with protected data description',()=>{
    expect(portal).toContain("['cleanup', DatabaseZap]");
    expect(portal).toContain("content = <PlatformDatabaseCleanup lang={lang} />");
    expect(portal).toContain("cleanup:'پاک‌سازی دیتابیس'");
    expect(portal).toContain("cleanup:'تنظيف قاعدة البيانات'");
    expect(ui).toContain('min-w-0 max-w-3xl');
    expect(ui).toContain("dir={lang==='en'?'ltr':'rtl'}");
    expect(ui).toContain("nameOf(x.category,t)");
    expect(ui).toContain("phrase==='CLEANUP'");
    expect(ui).toContain("reason.trim().length>=8");
    expect(ui).toContain('disabled={!canRun}');
    expect(ui).toContain('preview?.batch_total>0');
    expect(ui).toContain("onClick={()=>scan.mutate()}");
    expect(ui).toContain("onClick={()=>cleanup.mutate()}");
    expect(ui).not.toContain('localStorage.');
  });
  it('clears stale scan on category switch or error, and never executes cleanup on mount',()=>{
    expect(ui).toContain("setCategory(v);setPreview(null);setPhrase('');setAck(false);setResult(null);");
    expect(ui).toContain("onError:error=>{\n      setPreview(null)");
    expect(ui).not.toContain('useEffect(()=>cleanup.mutate()');
    expect(ui).not.toContain(".from('");
    expect(ui).toContain("client.invalidateQueries({queryKey:['platform-owner','activity']})");
  });
});
