-- Canonical persisted Active Alerts for the ERP dashboard and alert center.
-- These records are distinct from the general notifications inbox so operational
-- messages never inflate the unresolved Active Alerts count.

CREATE TABLE IF NOT EXISTS public.active_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  branch TEXT,
  source_key TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('critical', 'high', 'warning', 'info')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'cleared')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT active_alerts_restaurant_source_key UNIQUE (restaurant_id, source_key)
);

CREATE INDEX IF NOT EXISTS idx_active_alerts_restaurant_status_detected
  ON public.active_alerts (restaurant_id, status, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_active_alerts_branch_status_detected
  ON public.active_alerts (branch_id, status, detected_at DESC)
  WHERE branch_id IS NOT NULL;

ALTER TABLE public.active_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS active_alerts_select_scope ON public.active_alerts;
DROP POLICY IF EXISTS active_alerts_insert_scope ON public.active_alerts;
DROP POLICY IF EXISTS active_alerts_update_scope ON public.active_alerts;
DROP POLICY IF EXISTS active_alerts_delete_scope ON public.active_alerts;

CREATE POLICY active_alerts_select_scope
  ON public.active_alerts FOR SELECT TO authenticated
  USING (public.erp_can_access_scope_text(restaurant_id::text, branch_id::text));

CREATE POLICY active_alerts_insert_scope
  ON public.active_alerts FOR INSERT TO authenticated
  WITH CHECK (public.erp_can_write_scope_text(restaurant_id::text, branch_id::text));

CREATE POLICY active_alerts_update_scope
  ON public.active_alerts FOR UPDATE TO authenticated
  USING (public.erp_can_write_scope_text(restaurant_id::text, branch_id::text))
  WITH CHECK (public.erp_can_write_scope_text(restaurant_id::text, branch_id::text));

CREATE POLICY active_alerts_delete_scope
  ON public.active_alerts FOR DELETE TO authenticated
  USING (public.erp_can_write_scope_text(restaurant_id::text, branch_id::text));

CREATE OR REPLACE FUNCTION public.set_active_alerts_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_active_alerts_updated_at ON public.active_alerts;
CREATE TRIGGER trg_active_alerts_updated_at
  BEFORE UPDATE ON public.active_alerts
  FOR EACH ROW EXECUTE FUNCTION public.set_active_alerts_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.active_alerts TO authenticated;
