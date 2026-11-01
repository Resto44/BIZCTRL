-- One-time, privilege-checked Paddle catalog price provisioning job.
-- No payment intents, subscriptions or invoices are created by this operation.
CREATE TABLE IF NOT EXISTS public.paddle_annual_catalog_provision_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','complete','partial','failed')),
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
ALTER TABLE public.paddle_annual_catalog_provision_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.paddle_annual_catalog_provision_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE, INSERT ON public.paddle_annual_catalog_provision_jobs TO service_role;

CREATE OR REPLACE FUNCTION public.paddle_claim_annual_catalog_job(p_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_id uuid;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
   RAISE EXCEPTION 'PADDLE_CATALOG_SERVER_ONLY';
 END IF;
 IF length(coalesce(p_token,'')) < 30 OR length(p_token)>120 THEN
   RETURN NULL;
 END IF;
 UPDATE public.paddle_annual_catalog_provision_jobs
 SET status='running'
 WHERE status='pending' AND expires_at>now()
   AND token_hash=encode(extensions.digest(convert_to(p_token,'UTF8'),'sha256'),'hex')
 RETURNING id INTO v_id;
 RETURN v_id;
END;
$fn$;
REVOKE ALL ON FUNCTION public.paddle_claim_annual_catalog_job(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.paddle_claim_annual_catalog_job(text) TO service_role;
