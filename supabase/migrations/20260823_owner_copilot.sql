-- Tenant-isolated persistence for the Owner Dashboard Copilot.
-- The Edge Function always uses the caller JWT; RLS is therefore the final data boundary.

CREATE TABLE IF NOT EXISTS public.copilot_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New conversation',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.copilot_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.copilot_conversations(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL CHECK (char_length(content) <= 12000),
  language text NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'ar', 'fa')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.copilot_action_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type text NOT NULL CHECK (action_type IN ('create_expense')),
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'failed', 'expired')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.copilot_tool_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool_name text NOT NULL,
  success boolean NOT NULL,
  latency_ms integer NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS copilot_conversations_tenant_user_recent_idx
  ON public.copilot_conversations (restaurant_id, user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS copilot_messages_conversation_recent_idx
  ON public.copilot_messages (conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS copilot_action_requests_pending_idx
  ON public.copilot_action_requests (restaurant_id, user_id, status, expires_at DESC);
CREATE INDEX IF NOT EXISTS copilot_tool_events_tenant_recent_idx
  ON public.copilot_tool_events (restaurant_id, user_id, created_at DESC);

ALTER TABLE public.copilot_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copilot_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copilot_action_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copilot_tool_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS copilot_conversations_tenant_user ON public.copilot_conversations;
CREATE POLICY copilot_conversations_tenant_user ON public.copilot_conversations
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.erp_memberships m
      WHERE m.user_id = auth.uid()
        AND m.restaurant_id = copilot_conversations.restaurant_id
        AND m.status = 'approved'
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.erp_memberships m
      WHERE m.user_id = auth.uid()
        AND m.restaurant_id = copilot_conversations.restaurant_id
        AND m.status = 'approved'
    )
  );

DROP POLICY IF EXISTS copilot_messages_tenant_user ON public.copilot_messages;
CREATE POLICY copilot_messages_tenant_user ON public.copilot_messages
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.copilot_conversations c
      WHERE c.id = copilot_messages.conversation_id
        AND c.user_id = auth.uid()
        AND c.restaurant_id = copilot_messages.restaurant_id
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.copilot_conversations c
      WHERE c.id = copilot_messages.conversation_id
        AND c.user_id = auth.uid()
        AND c.restaurant_id = copilot_messages.restaurant_id
    )
  );

DROP POLICY IF EXISTS copilot_action_requests_tenant_user ON public.copilot_action_requests;
CREATE POLICY copilot_action_requests_tenant_user ON public.copilot_action_requests
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.erp_memberships m
      WHERE m.user_id = auth.uid()
        AND m.restaurant_id = copilot_action_requests.restaurant_id
        AND m.status = 'approved'
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.erp_memberships m
      WHERE m.user_id = auth.uid()
        AND m.restaurant_id = copilot_action_requests.restaurant_id
        AND m.status = 'approved'
    )
  );

DROP POLICY IF EXISTS copilot_tool_events_tenant_user ON public.copilot_tool_events;
CREATE POLICY copilot_tool_events_tenant_user ON public.copilot_tool_events
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.erp_memberships m
      WHERE m.user_id = auth.uid()
        AND m.restaurant_id = copilot_tool_events.restaurant_id
        AND m.status = 'approved'
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.copilot_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.copilot_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.copilot_action_requests TO authenticated;
GRANT INSERT ON public.copilot_tool_events TO authenticated;
