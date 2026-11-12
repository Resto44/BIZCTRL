/**
 * ERP Branch Manager display uses the authorized, canonical branch UUID and
 * approved membership status. Legacy branch.manager_name/email are contact notes,
 * never evidence of role assignment.
 */
export function branchManagerState({
  branch, dbBranches = [], memberships = [], loading = false, error = false,
} = {}) {
  if(error)return {kind:'error',members:[]};
  if(loading)return {kind:'loading',members:[]};
  if(!branch)return {kind:'unresolved',members:[]};
  const canonical=(Array.isArray(dbBranches)?dbBranches:[]).find(row=>
    Boolean(row?.id) && (
      (branch.id && String(row.id)===String(branch.id))
      || (row.branch_key && [branch.key,branch.branch_key].some(key=>key && String(row.branch_key)===String(key)))
    ));
  if(!canonical)return {kind:'unresolved',members:[]};
  const matches=(Array.isArray(memberships)?memberships:[])
    .filter(row=>row?.role==='manager' && row.branch_id &&
      String(row.branch_id)===String(canonical.id));
  const approved=matches.filter(row=>row.status==='approved');
  if(approved.length)return {kind:'approved',members:approved,branchId:canonical.id};
  const suspended=matches.filter(row=>row.status==='suspended');
  if(suspended.length)return {kind:'suspended',members:suspended,branchId:canonical.id};
  if(branch.manager_name||branch.manager_email)
    return {kind:'legacy',members:[],branchId:canonical.id};
  return {kind:'empty',members:[],branchId:canonical.id};
}
