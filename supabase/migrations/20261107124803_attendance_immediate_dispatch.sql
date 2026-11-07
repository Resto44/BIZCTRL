-- Dispatch newly queued codes in the same cron tick.
CREATE OR REPLACE FUNCTION attendance_private.dispatch() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE secret text;
BEGIN
 PERFORM attendance_private.prepare_due();
 UPDATE public.attendance_email_codes SET code_cipher=NULL WHERE code_cipher IS NOT NULL AND (used_at IS NOT NULL OR expires_at<=now());
 IF NOT EXISTS(SELECT 1 FROM public.attendance_email_codes WHERE code_cipher IS NOT NULL AND used_at IS NULL AND expires_at>now()+interval '1 minute' AND mail_state IN ('pending','retry','sending') AND mail_attempts<5 AND mail_retry_at<=clock_timestamp()) THEN RETURN; END IF;
 SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name='attendance_dispatch';
 PERFORM net.http_post(url:='https://mqubwgbppncldyiicbtu.supabase.co/functions/v1/attendance-scheduled-mail',
 headers:=jsonb_build_object('Content-Type','application/json','x-dispatch-secret',secret),body:='{}'::jsonb,timeout_milliseconds:=55000);
END; $$;
REVOKE ALL ON FUNCTION attendance_private.dispatch() FROM PUBLIC,anon,authenticated;
