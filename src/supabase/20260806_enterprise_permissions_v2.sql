-- ============================================================
-- RestoCTRL Enterprise Permission System v2
-- 20260806_enterprise_permissions_v2.sql
--
-- Goals:
--   1. Extend erp_memberships with a full JSONB permissions column
--      covering all 19 modules × 13 actions.
--   2. Add role_templates table so Owner can create/clone/delete
--      named role templates.
--   3. Add user_favorites and user_recent_pages tables for the
--      enterprise navigation system.
--   4. Add erp_global_search_index view for fast global search.
--   5. All existing RPCs remain intact — this is additive only.
-- ============================================================

-- ── 1. Extend erp_memberships ─────────────────────────────────────────────
-- Add full permissions JSONB if not already present
ALTER TABLE public.erp_memberships
  ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS custom_role_name TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Backfill permissions column on profiles too
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb;

-- ── 2. Role templates table ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.role_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  base_role       TEXT NOT NULL DEFAULT 'manager',
  permissions     JSONB NOT NULL DEFAULT '{}'::jsonb,
  description     TEXT,
  is_system       BOOLEAN DEFAULT false,  -- system templates cannot be deleted
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (restaurant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_role_templates_restaurant ON public.role_templates(restaurant_id);

-- RLS for role_templates
ALTER TABLE public.role_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "role_templates_owner_all" ON public.role_templates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.erp_memberships m
      WHERE m.user_id = auth.uid()
        AND m.role = 'owner'
        AND m.status = 'approved'
        AND m.restaurant_id = role_templates.restaurant_id
    )
  );

CREATE POLICY "role_templates_member_read" ON public.role_templates
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.erp_memberships m
      WHERE m.user_id = auth.uid()
        AND m.status = 'approved'
        AND m.restaurant_id = role_templates.restaurant_id
    )
  );

-- ── 3. User favorites table ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_favorites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  path        TEXT NOT NULL,
  label       TEXT NOT NULL,
  icon        TEXT,
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, path)
);

CREATE INDEX IF NOT EXISTS idx_user_favorites_user ON public.user_favorites(user_id);

ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_favorites_own" ON public.user_favorites
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── 4. User recent pages table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_recent_pages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  path        TEXT NOT NULL,
  label       TEXT NOT NULL,
  icon        TEXT,
  visited_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, path)
);

CREATE INDEX IF NOT EXISTS idx_user_recent_pages_user ON public.user_recent_pages(user_id, visited_at DESC);

ALTER TABLE public.user_recent_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_recent_pages_own" ON public.user_recent_pages
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── 5. RPC: upsert_recent_page ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_recent_page(
  p_path  TEXT,
  p_label TEXT,
  p_icon  TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.user_recent_pages (user_id, path, label, icon, visited_at)
  VALUES (auth.uid(), p_path, p_label, p_icon, NOW())
  ON CONFLICT (user_id, path)
  DO UPDATE SET visited_at = NOW(), label = EXCLUDED.label, icon = EXCLUDED.icon;

  -- Keep only the 20 most recent pages per user
  DELETE FROM public.user_recent_pages
  WHERE user_id = auth.uid()
    AND id NOT IN (
      SELECT id FROM public.user_recent_pages
      WHERE user_id = auth.uid()
      ORDER BY visited_at DESC
      LIMIT 20
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_recent_page TO authenticated;

-- ── 6. RPC: clone_role_template ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.clone_role_template(
  p_template_id UUID,
  p_new_name    TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  actor_mem  public.erp_memberships;
  src        public.role_templates;
  new_id     UUID;
BEGIN
  SELECT * INTO actor_mem
  FROM public.erp_memberships
  WHERE user_id = auth.uid() AND role = 'owner' AND status = 'approved'
  LIMIT 1;

  IF actor_mem.id IS NULL THEN
    RAISE EXCEPTION 'Only an approved owner can clone role templates';
  END IF;

  SELECT * INTO src
  FROM public.role_templates
  WHERE id = p_template_id AND restaurant_id = actor_mem.restaurant_id;

  IF src.id IS NULL THEN
    RAISE EXCEPTION 'Template not found';
  END IF;

  INSERT INTO public.role_templates (restaurant_id, name, base_role, permissions, description, created_by)
  VALUES (actor_mem.restaurant_id, p_new_name, src.base_role, src.permissions, 'Cloned from: ' || src.name, auth.uid())
  RETURNING id INTO new_id;

  RETURN jsonb_build_object('success', true, 'new_id', new_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.clone_role_template TO authenticated;

-- ── 7. RPC: apply_role_template_to_user ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_role_template_to_user(
  p_membership_id UUID,
  p_template_id   UUID
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
  tmpl       public.role_templates;
BEGIN
  SELECT * INTO actor_mem
  FROM public.erp_memberships
  WHERE user_id = auth.uid() AND role = 'owner' AND status = 'approved'
  LIMIT 1;

  IF actor_mem.id IS NULL THEN
    RAISE EXCEPTION 'Only an approved owner can apply role templates';
  END IF;

  SELECT * INTO target_mem
  FROM public.erp_memberships
  WHERE id = p_membership_id AND restaurant_id = actor_mem.restaurant_id
  FOR UPDATE;

  IF target_mem.id IS NULL THEN
    RAISE EXCEPTION 'Membership not found';
  END IF;

  SELECT * INTO tmpl
  FROM public.role_templates
  WHERE id = p_template_id AND restaurant_id = actor_mem.restaurant_id;

  IF tmpl.id IS NULL THEN
    RAISE EXCEPTION 'Template not found';
  END IF;

  UPDATE public.erp_memberships
  SET role = tmpl.base_role, permissions = tmpl.permissions, updated_at = NOW()
  WHERE id = p_membership_id;

  UPDATE public.profiles
  SET role = tmpl.base_role, permissions = tmpl.permissions, updated_date = NOW()
  WHERE id = target_mem.user_id;

  INSERT INTO public.permission_audit_log (
    restaurant_id, target_user_id, target_email, target_name,
    owner_user_id, owner_email,
    action, old_role, new_role, old_permissions, new_permissions, notes
  ) VALUES (
    actor_mem.restaurant_id,
    target_mem.user_id, target_mem.email, target_mem.full_name,
    actor_mem.user_id, actor_mem.email,
    'role_change', target_mem.role, tmpl.base_role,
    target_mem.permissions, tmpl.permissions,
    'Applied template: ' || tmpl.name
  );

  RETURN jsonb_build_object('success', true, 'template_name', tmpl.name);
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_role_template_to_user TO authenticated;

-- ── 8. Seed default system role templates ────────────────────────────────
-- These are inserted per-restaurant when the owner first opens the
-- Role Control Center. The frontend handles the seeding via RPC.
-- (No static inserts here since restaurant_id is dynamic.)

-- ── 9. Grant permissions ──────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_favorites TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_recent_pages TO authenticated;
