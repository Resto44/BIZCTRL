-- ============================================================
-- Role Control Center Migration
-- Date: 2026-08-01
-- Adds:
--   1. permission_audit_log — records every role/permission change
--   2. user_data_scope — per-user data scope (all/assigned/selected)
--   3. user_selected_branches — selected branches for "selected" scope
--   4. erp_memberships: add last_login_at, data_scope columns
-- ============================================================

-- ── 1. Permission Audit Log ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.permission_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
  target_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_email    TEXT,
  target_name     TEXT,
  owner_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  owner_email     TEXT,
  action          TEXT NOT NULL,          -- 'role_change','permission_change','status_change','transfer','duplicate','reset_password'
  old_role        TEXT,
  new_role        TEXT,
  permission_key  TEXT,                   -- which module permission changed
  old_value       BOOLEAN,
  new_value       BOOLEAN,
  old_permissions JSONB,
  new_permissions JSONB,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pal_restaurant ON public.permission_audit_log(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_pal_target     ON public.permission_audit_log(target_user_id);
CREATE INDEX IF NOT EXISTS idx_pal_owner      ON public.permission_audit_log(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_pal_created    ON public.permission_audit_log(created_at DESC);

-- ── 2. Add data_scope + last_login_at to erp_memberships if missing ───────────
ALTER TABLE public.erp_memberships
  ADD COLUMN IF NOT EXISTS data_scope TEXT DEFAULT 'assigned_branch'
    CHECK (data_scope IN ('all_branches','assigned_branch','selected_branches')),
  ADD COLUMN IF NOT EXISTS selected_branch_ids UUID[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- ── 3. RLS for permission_audit_log ──────────────────────────────────────────
ALTER TABLE public.permission_audit_log ENABLE ROW LEVEL SECURITY;

-- Owner can read all logs for their restaurant
CREATE POLICY "pal_owner_read" ON public.permission_audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.erp_memberships m
      WHERE m.user_id = auth.uid()
        AND m.role = 'owner'
        AND m.status = 'approved'
        AND m.restaurant_id = permission_audit_log.restaurant_id
    )
  );

-- Owner can insert logs
CREATE POLICY "pal_owner_insert" ON public.permission_audit_log
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.erp_memberships m
      WHERE m.user_id = auth.uid()
        AND m.role = 'owner'
        AND m.status = 'approved'
        AND m.restaurant_id = permission_audit_log.restaurant_id
    )
  );

-- ── 4. RPC: update_user_role_and_permissions ─────────────────────────────────
-- Called by the Role Control Center to atomically update role + permissions
-- and write an audit log entry.
CREATE OR REPLACE FUNCTION public.update_user_role_and_permissions(
  p_membership_id  UUID,
  p_new_role       TEXT DEFAULT NULL,
  p_permissions    JSONB DEFAULT NULL,
  p_data_scope     TEXT DEFAULT NULL,
  p_selected_branches UUID[] DEFAULT NULL,
  p_action         TEXT DEFAULT 'permission_change',
  p_notes          TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  actor_mem  public.erp_memberships;
  target_mem public.erp_memberships;
  upd_role   TEXT;
  upd_perms  JSONB;
  upd_scope  TEXT;
  upd_branches UUID[];
BEGIN
  -- Verify caller is an approved owner
  SELECT * INTO actor_mem
  FROM public.erp_memberships
  WHERE user_id = auth.uid() AND role = 'owner' AND status = 'approved'
  LIMIT 1;

  IF actor_mem.id IS NULL THEN
    RAISE EXCEPTION 'Only an approved owner can modify roles and permissions';
  END IF;

  -- Fetch target (must be same restaurant)
  SELECT * INTO target_mem
  FROM public.erp_memberships
  WHERE id = p_membership_id AND restaurant_id = actor_mem.restaurant_id
  FOR UPDATE;

  IF target_mem.id IS NULL THEN
    RAISE EXCEPTION 'Membership not found';
  END IF;

  -- Prevent non-owner from assigning owner role unless explicitly allowed
  IF p_new_role = 'owner' AND target_mem.role <> 'owner' THEN
    -- Only owner can promote to owner — already verified above
    NULL;
  END IF;

  upd_role     := COALESCE(p_new_role, target_mem.role);
  upd_perms    := COALESCE(p_permissions, target_mem.permissions);
  upd_scope    := COALESCE(p_data_scope, target_mem.data_scope, 'assigned_branch');
  upd_branches := COALESCE(p_selected_branches, target_mem.selected_branch_ids, '{}');

  -- Update erp_memberships
  UPDATE public.erp_memberships
  SET
    role                = upd_role,
    permissions         = upd_perms,
    data_scope          = upd_scope,
    selected_branch_ids = upd_branches,
    updated_at          = NOW()
  WHERE id = p_membership_id;

  -- Sync profiles table
  UPDATE public.profiles
  SET
    role        = upd_role,
    permissions = upd_perms,
    updated_date = NOW()
  WHERE id = target_mem.user_id;

  -- Write audit log
  INSERT INTO public.permission_audit_log (
    restaurant_id, target_user_id, target_email, target_name,
    owner_user_id, owner_email,
    action, old_role, new_role,
    old_permissions, new_permissions, notes
  ) VALUES (
    actor_mem.restaurant_id,
    target_mem.user_id, target_mem.email, target_mem.full_name,
    actor_mem.user_id, actor_mem.email,
    p_action,
    target_mem.role, upd_role,
    target_mem.permissions, upd_perms,
    p_notes
  );

  RETURN jsonb_build_object(
    'success', true,
    'membership_id', p_membership_id,
    'new_role', upd_role
  );
END;
$$;

-- ── 5. RPC: toggle_user_status ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.toggle_user_status(
  p_membership_id UUID,
  p_status        TEXT,  -- 'approved' | 'suspended'
  p_notes         TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  actor_mem  public.erp_memberships;
  target_mem public.erp_memberships;
BEGIN
  SELECT * INTO actor_mem
  FROM public.erp_memberships
  WHERE user_id = auth.uid() AND role = 'owner' AND status = 'approved'
  LIMIT 1;

  IF actor_mem.id IS NULL THEN
    RAISE EXCEPTION 'Only an approved owner can change user status';
  END IF;

  SELECT * INTO target_mem
  FROM public.erp_memberships
  WHERE id = p_membership_id AND restaurant_id = actor_mem.restaurant_id
  FOR UPDATE;

  IF target_mem.id IS NULL THEN
    RAISE EXCEPTION 'Membership not found';
  END IF;

  IF p_status NOT IN ('approved','suspended') THEN
    RAISE EXCEPTION 'Status must be approved or suspended';
  END IF;

  UPDATE public.erp_memberships
  SET status = p_status, updated_at = NOW()
  WHERE id = p_membership_id;

  UPDATE public.profiles
  SET approval_status = p_status, updated_date = NOW()
  WHERE id = target_mem.user_id;

  INSERT INTO public.permission_audit_log (
    restaurant_id, target_user_id, target_email, target_name,
    owner_user_id, owner_email,
    action, notes
  ) VALUES (
    actor_mem.restaurant_id,
    target_mem.user_id, target_mem.email, target_mem.full_name,
    actor_mem.user_id, actor_mem.email,
    'status_change', COALESCE(p_notes, 'Status changed to ' || p_status)
  );

  RETURN jsonb_build_object('success', true, 'new_status', p_status);
END;
$$;

-- ── 6. RPC: transfer_user_branch ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.transfer_user_branch(
  p_membership_id UUID,
  p_new_branch_id UUID,
  p_notes         TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  actor_mem  public.erp_memberships;
  target_mem public.erp_memberships;
BEGIN
  SELECT * INTO actor_mem
  FROM public.erp_memberships
  WHERE user_id = auth.uid() AND role = 'owner' AND status = 'approved'
  LIMIT 1;

  IF actor_mem.id IS NULL THEN
    RAISE EXCEPTION 'Only an approved owner can transfer users';
  END IF;

  SELECT * INTO target_mem
  FROM public.erp_memberships
  WHERE id = p_membership_id AND restaurant_id = actor_mem.restaurant_id
  FOR UPDATE;

  IF target_mem.id IS NULL THEN
    RAISE EXCEPTION 'Membership not found';
  END IF;

  -- Validate new branch
  IF NOT EXISTS (
    SELECT 1 FROM public.branches b
    WHERE b.id = p_new_branch_id AND b.restaurant_id = actor_mem.restaurant_id
  ) THEN
    RAISE EXCEPTION 'Branch not found or does not belong to this restaurant';
  END IF;

  UPDATE public.erp_memberships
  SET branch_id = p_new_branch_id, updated_at = NOW()
  WHERE id = p_membership_id;

  UPDATE public.profiles
  SET branch_id = p_new_branch_id, updated_date = NOW()
  WHERE id = target_mem.user_id;

  -- Update branch_assignments
  UPDATE public.branch_assignments
  SET branch_id = p_new_branch_id, updated_at = NOW()
  WHERE user_id = target_mem.user_id AND organization_id = actor_mem.restaurant_id;

  INSERT INTO public.permission_audit_log (
    restaurant_id, target_user_id, target_email, target_name,
    owner_user_id, owner_email,
    action, notes
  ) VALUES (
    actor_mem.restaurant_id,
    target_mem.user_id, target_mem.email, target_mem.full_name,
    actor_mem.user_id, actor_mem.email,
    'transfer', COALESCE(p_notes, 'Transferred to new branch')
  );

  RETURN jsonb_build_object('success', true, 'new_branch_id', p_new_branch_id);
END;
$$;

-- ── 7. RPC: remove_user_from_org ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.remove_user_from_org(
  p_membership_id UUID,
  p_notes         TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  actor_mem  public.erp_memberships;
  target_mem public.erp_memberships;
BEGIN
  SELECT * INTO actor_mem
  FROM public.erp_memberships
  WHERE user_id = auth.uid() AND role = 'owner' AND status = 'approved'
  LIMIT 1;

  IF actor_mem.id IS NULL THEN
    RAISE EXCEPTION 'Only an approved owner can remove users';
  END IF;

  SELECT * INTO target_mem
  FROM public.erp_memberships
  WHERE id = p_membership_id AND restaurant_id = actor_mem.restaurant_id;

  IF target_mem.id IS NULL THEN
    RAISE EXCEPTION 'Membership not found';
  END IF;

  IF target_mem.role = 'owner' THEN
    RAISE EXCEPTION 'Cannot remove an owner account';
  END IF;

  -- Write audit log before deletion
  INSERT INTO public.permission_audit_log (
    restaurant_id, target_user_id, target_email, target_name,
    owner_user_id, owner_email,
    action, notes
  ) VALUES (
    actor_mem.restaurant_id,
    target_mem.user_id, target_mem.email, target_mem.full_name,
    actor_mem.user_id, actor_mem.email,
    'remove_user', COALESCE(p_notes, 'User removed from organization')
  );

  DELETE FROM public.erp_memberships WHERE id = p_membership_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── 8. Grant execute on RPCs ──────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.update_user_role_and_permissions TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_user_status TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_user_branch TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_user_from_org TO authenticated;
GRANT SELECT, INSERT ON public.permission_audit_log TO authenticated;
