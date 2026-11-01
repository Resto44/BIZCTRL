-- One-use Paddle statement descriptor update, isolated from customer payments.
-- Token never leaves Supabase infrastructure; no public/anon/authenticated RLS policy.
CREATE TABLE IF NOT EXISTS public.paddle_descriptor_change_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL,
 descriptor_name text NOT NULL CHECK (descriptor_name='BIZCTRL'),
 status text NOT NULL DEFAULT 'pending'
   CHECK (status IN ('pending','running','complete','failed')),
 result jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz
);
ALTER TABLE public.paddle_descriptor_change_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.paddle_descriptor_change_jobs FROM PUBLIC,anon,authenticated;
GRANT SELECT,UPDATE,INSERT ON public.paddle_descriptor_change_jobs TO service_role;

CREATE OR REPLACE FUNCTION public.paddle_claim_descriptor_change(p_token text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE job uuid;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'PADDLE_SERVICE_ONLY'; END IF;
 IF length(coalesce(p_token,''))<60 OR length(p_token)>120 THEN RETURN NULL; END IF;
 UPDATE public.paddle_descriptor_change_jobs
 SET status='running'
 WHERE status='pending' AND expires_at>now()
  AND descriptor_name='BIZCTRL'
  AND token_hash=encode(extensions.digest(convert_to(p_token,'UTF8'),'sha256'),'hex')
 RETURNING id INTO job;
 RETURN job;
END;
$fn$;
REVOKE ALL ON FUNCTION public.paddle_claim_descriptor_change(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.paddle_claim_descriptor_change(text) TO service_role;
