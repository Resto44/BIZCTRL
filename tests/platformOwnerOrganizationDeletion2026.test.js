import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const migration=readFileSync('supabase/migrations/20261017224000_platform_owner_guarded_org_delete.sql','utf8');
const api=readFileSync('src/lib/platformOwnerApi.js','utf8');
const page=readFileSync('src/pages/PlatformOwnerPortal.jsx','utf8');
const dialog=readFileSync('src/components/platform-owner/OrganizationDeleteDialog.jsx','utf8');

describe('Platform Owner guarded Organization deletion',()=>{
  it('is available only to the platform owner including existing MFA enforcement',()=>{
    expect(migration.match(/PERFORM public.platform_owner_assert\(\);/g)).toHaveLength(2);
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('SET row_security = off');
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.platform_owner_delete_organization(uuid,text,text,text) FROM PUBLIC,anon;");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.platform_owner_delete_organization(uuid,text,text,text) TO authenticated;");
    expect(api).toContain("rpc('platform_owner_delete_organization'");
  });
  it('requires exact organization name plus delete phrase and a row lock',()=>{
    expect(migration).toContain("p_confirm_phrase,'')<>'DELETE ORGANIZATION'");
    expect(migration).toContain('IF p_confirm_name IS DISTINCT FROM v_org.name THEN');
    expect(migration).toContain('FOR UPDATE;');
    expect(dialog).toContain("name===item?.name");
    expect(dialog).toContain("ack&&!deletion.isPending");
    expect(dialog).toContain("disabled={!ready}");
  });
  it('rechecks full financial, inventory, and legacy tenant or branch data before deletion',()=>{
    expect(migration).toContain("public.subscriptions s");
    expect(migration).toContain("'ACTIVE','PAST_DUE','PENDING_PAYMENT'");
    expect(migration).toContain("p_restaurant_id::text");
    expect(migration).toContain('restaurant_id = $3');
    expect(migration).toContain('organization_id = $1');
    expect(migration).toContain('branch_id = ANY($4)');
    expect(migration).toContain('v_blockers:=array_append(v_blockers');
    expect(migration).toContain("RETURN jsonb_build_object('deleted',false,'reason','has_protected_records'");
    expect(migration).toContain('v_check:=public.platform_owner_organization_deletion_check(p_restaurant_id);');
    expect(migration).not.toContain('DELETE FROM public.subscription_payments');
    expect(migration).not.toContain('DELETE FROM auth.users');
    expect(migration).not.toContain('CASCADE;');
  });
  it('uses one authorized SQL transaction instead of browser .delete(), preserves audit and no partial deletion',()=>{
    expect(migration).toContain('DELETE FROM public.restaurants WHERE id=p_restaurant_id;');
    expect(migration).toContain("public.platform_owner_log('organization_deleted'");
    expect(migration).toContain('p_restaurant_id::text,NULL,');
    expect(migration).not.toContain("DELETE FROM public.restaurants WHERE id=p_restaurant_id OR");
    expect(api).not.toMatch(/supabase\.from\(['"]restaurants['"]\)\.delete/);
  });
  it('adds an accessible mobile Delete action inside Manage (not immediately on the list)',()=>{
    expect(page).toContain('onDeleteRequest={(organization)');
    expect(page).toContain('<OrganizationDeleteDialog item={deleteOrganizationTarget} lang={lang}');
    expect(page).toContain('onDeleted={() => { setDeleteOrganizationTarget(null); setPage(0); invalidate(); }}');
    expect(page).toContain("variant=\"destructive\"");
    expect(dialog).toContain('!w-[calc(100vw-1.5rem)]');
    expect(dialog).toContain('max-h-[88dvh]');
    expect(dialog).toContain("dir={lang==='en'?'ltr':'rtl'}");
    expect(dialog).toContain('preview.data?.eligible===true');
    expect(dialog).toContain('blockers.slice(0,15)');
    expect(dialog).toContain('onDeleted?.(result)');
    expect(dialog).toContain("platformOwnerApi.organizationDeletionCheck(id)");
    expect(dialog).toContain('platformOwnerApi.deleteOrganization(id,name,reason)');
  });
  it('has no automatic deletes on render or when deletion check is blocked',()=>{
    expect(dialog).toContain('onClick={()=>deletion.mutate()}');
    expect(dialog).not.toContain('useEffect(()=>deletion.mutate()');
    expect(dialog).toContain('if(result?.deleted===true)');
    expect(dialog).toContain("setErr(t.failed)");
    expect(migration).toContain("'eligible',coalesce(array_length(v_blockers,1),0)=0");
  });
});