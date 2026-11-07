-- Owner-defined daily shifts. One shift per business date matches the existing
-- attendance unique index. Overnight exits belong to the starting day.
CREATE SCHEMA IF NOT EXISTS attendance_private;
REVOKE ALL ON SCHEMA attendance_private FROM PUBLIC,anon,authenticated;
CREATE TABLE public.employee_attendance_schedules (
 employee_id uuid PRIMARY KEY REFERENCES public.employees(id),
 restaurant_id uuid NOT NULL, branch_id uuid NOT NULL,
 start_time time NOT NULL,end_time time NOT NULL,
 work_days integer[] NOT NULL DEFAULT ARRAY[0,1,2,3,4,5,6],
 enabled boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now(),updated_by uuid NOT NULL,
 CHECK(start_time<>end_time),
 CHECK(cardinality(work_days) BETWEEN 1 AND 7 AND work_days <@ ARRAY[0,1,2,3,4,5,6]),
 CHECK(mod(extract(epoch FROM (end_time-start_time))+86400,86400) BETWEEN 120 AND 57600)
);
ALTER TABLE public.employee_attendance_schedules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.employee_attendance_schedules FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.employee_attendance_schedules TO authenticated;
GRANT ALL ON public.employee_attendance_schedules TO service_role;
CREATE POLICY attendance_schedule_read ON public.employee_attendance_schedules FOR SELECT TO authenticated USING (
 EXISTS(SELECT 1 FROM public.erp_memberships m WHERE m.user_id=auth.uid()
  AND m.status='approved' AND m.restaurant_id=employee_attendance_schedules.restaurant_id
  AND (m.role='owner' OR (m.role='manager' AND m.branch_id=employee_attendance_schedules.branch_id)
   OR (m.role='employee' AND m.branch_id=employee_attendance_schedules.branch_id
    AND m.linked_entity_id=employee_attendance_schedules.employee_id)))
);
CREATE FUNCTION public.erp_attendance_save_schedule(p_employee uuid,p_start time,p_end time,p_days integer[],p_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.employees%ROWTYPE;
BEGIN
 SELECT * INTO e FROM public.employees WHERE id=p_employee AND is_active IS TRUE;
 IF e.id IS NULL OR e.branch_id IS NULL OR auth.uid() IS NULL OR NOT EXISTS(
 SELECT 1 FROM public.erp_memberships m WHERE m.user_id=auth.uid() AND m.role='owner'
 AND m.status='approved' AND m.restaurant_id=e.restaurant_id) THEN
 RAISE EXCEPTION 'OWNER_SCHEDULE_PERMISSION_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_start IS NULL OR p_end IS NULL OR p_days IS NULL OR p_enabled IS NULL THEN
 RAISE EXCEPTION 'SHIFT_FIELDS_REQUIRED'; END IF;
 INSERT INTO public.employee_attendance_schedules(employee_id,restaurant_id,branch_id,start_time,end_time,work_days,enabled,updated_by)
 VALUES(e.id,e.restaurant_id,e.branch_id,p_start,p_end,p_days,p_enabled,auth.uid())
 ON CONFLICT(employee_id) DO UPDATE SET restaurant_id=excluded.restaurant_id,branch_id=excluded.branch_id,
 start_time=excluded.start_time,end_time=excluded.end_time,work_days=excluded.work_days,
 enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=clock_timestamp();
 -- Schedule edits revoke outstanding codes; a moved employee cannot reuse them.
 UPDATE public.attendance_email_codes SET used_at=clock_timestamp() WHERE employee_id=e.id AND used_at IS NULL;
END; $$;
REVOKE ALL ON FUNCTION public.erp_attendance_save_schedule(uuid,time,time,integer[],boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_attendance_save_schedule(uuid,time,time,integer[],boolean) TO authenticated;

SELECT vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'attendance_code_encryption');
SELECT vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'attendance_dispatch');
ALTER TABLE public.attendance_email_codes ADD COLUMN code_cipher bytea;
ALTER TABLE public.attendance_email_codes ADD COLUMN mail_state text NOT NULL DEFAULT 'legacy';
ALTER TABLE public.attendance_email_codes ADD COLUMN mail_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.attendance_email_codes ADD COLUMN mail_retry_at timestamptz;
ALTER TABLE public.attendance_email_codes ADD COLUMN mail_lease uuid;
ALTER TABLE public.attendance_email_codes ADD COLUMN schedule_slot text;
CREATE UNIQUE INDEX attendance_schedule_slot_unique ON public.attendance_email_codes(employee_id,schedule_slot) WHERE schedule_slot IS NOT NULL;

CREATE FUNCTION attendance_private.enqueue(p_actor uuid,p_employee uuid,p_action text,p_slot text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE code text; secret text; issued jsonb; result uuid;
BEGIN
 -- pgcrypto supplies entropy; rejection sampling prevents modulo bias.
 LOOP
  code:=encode(extensions.gen_random_bytes(4),'hex');
  EXIT WHEN ('x'||code)::bit(32)::bigint<4294000000;
 END LOOP;
 code:=lpad((('x'||code)::bit(32)::bigint%1000000)::text,6,'0');
 issued:=public.erp_attendance_email_issue_admin(p_actor,p_employee,p_action,code);
 result:=(issued->>'challenge_id')::uuid;
 SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name='attendance_code_encryption';
 IF secret IS NULL THEN RAISE EXCEPTION 'ENCRYPTION_NOT_CONFIGURED'; END IF;
 UPDATE public.attendance_email_codes SET code_cipher=extensions.pgp_sym_encrypt(code,secret),
 mail_state='pending',mail_retry_at=clock_timestamp(),schedule_slot=p_slot WHERE id=result;
 UPDATE public.attendance_email_codes SET used_at=clock_timestamp()
 WHERE employee_id=p_employee AND id<>result AND used_at IS NULL;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION attendance_private.enqueue(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;

-- A missed/expired scheduled code can be renewed deliberately, with the same
-- database rate limits and verified employee identity. No mount-triggered email.
CREATE FUNCTION public.erp_attendance_request_code(p_action text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e uuid;
BEGIN
 SELECT linked_entity_id INTO e FROM public.erp_memberships WHERE user_id=auth.uid()
 AND role='employee' AND status='approved' AND linked_entity_id IS NOT NULL
 ORDER BY updated_at DESC LIMIT 1;
 IF e IS NULL THEN RAISE EXCEPTION 'APPROVED_EMPLOYEE_LINK_REQUIRED'; END IF;
 RETURN attendance_private.enqueue(auth.uid(),e,p_action,NULL);
END; $$;
REVOKE ALL ON FUNCTION public.erp_attendance_request_code(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_attendance_request_code(text) TO authenticated;

CREATE FUNCTION public.erp_attendance_code_status() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE e public.employees%ROWTYPE; c public.attendance_email_codes%ROWTYPE;
 secret text; s jsonb; result jsonb;
BEGIN
 result:=public.erp_attendance_mobile_status();
 SELECT e1.* INTO e FROM public.employees e1 JOIN public.erp_memberships m ON m.linked_entity_id=e1.id
 AND m.restaurant_id=e1.restaurant_id AND m.branch_id=e1.branch_id
 JOIN auth.users u ON u.id=m.user_id AND u.email_confirmed_at IS NOT NULL AND lower(btrim(u.email))=lower(btrim(e1.email))
 WHERE m.user_id=auth.uid() AND m.role='employee' AND m.status='approved' AND e1.is_active IS TRUE
 ORDER BY m.updated_at DESC LIMIT 1;
 IF e.id IS NULL THEN RETURN result||jsonb_build_object('code',NULL,'code_reason','EMPLOYEE_VERIFIED_EMAIL_MISMATCH'); END IF;
 SELECT to_jsonb(x) INTO s FROM public.employee_attendance_schedules x WHERE employee_id=e.id AND branch_id=e.branch_id;
 SELECT * INTO c FROM public.attendance_email_codes WHERE employee_id=e.id AND requester_id=auth.uid()
 AND branch_id=e.branch_id AND restaurant_id=e.restaurant_id AND used_at IS NULL AND expires_at>clock_timestamp()
 AND tries<5 AND code_cipher IS NOT NULL ORDER BY issued_at DESC LIMIT 1;
 SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name='attendance_code_encryption';
 RETURN result||jsonb_build_object('schedule',s,'timezone','Asia/Riyadh','server_now',clock_timestamp(),
 'code',CASE WHEN c.id IS NOT NULL THEN extensions.pgp_sym_decrypt(c.code_cipher,secret) ELSE NULL END,
 'code_action',c.action,'expires_at',c.expires_at,'mail_state',c.mail_state,'code_reason',NULL);
END; $$;
REVOKE ALL ON FUNCTION public.erp_attendance_code_status() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_attendance_code_status() TO authenticated;

CREATE FUNCTION public.erp_attendance_dispatch_secret() RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='attendance_dispatch'
$$;
REVOKE ALL ON FUNCTION public.erp_attendance_dispatch_secret() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_attendance_dispatch_secret() TO service_role;

CREATE FUNCTION attendance_private.prepare_due() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r record; generated integer:=0; slot text;
BEGIN
 FOR r IN
 SELECT s.*,m.user_id,d.day::date AS shift_day,phase.action,
 (d.day::date+CASE WHEN phase.action='in' THEN s.start_time ELSE s.end_time END
 +CASE WHEN phase.action='out' AND s.end_time<s.start_time THEN interval '1 day' ELSE interval '0 day' END) AT TIME ZONE 'Asia/Riyadh' AS due
 FROM public.employee_attendance_schedules s
 JOIN public.employees e ON e.id=s.employee_id AND e.branch_id=s.branch_id AND e.restaurant_id=s.restaurant_id AND e.is_active IS TRUE
 JOIN public.erp_memberships m ON m.linked_entity_id=e.id AND m.branch_id=e.branch_id AND m.restaurant_id=e.restaurant_id AND m.role='employee' AND m.status='approved'
 JOIN auth.users u ON u.id=m.user_id AND u.email_confirmed_at IS NOT NULL AND lower(btrim(u.email))=lower(btrim(e.email))
 CROSS JOIN generate_series((now() AT TIME ZONE 'Asia/Riyadh')::date-1,(now() AT TIME ZONE 'Asia/Riyadh')::date,interval '1 day') d(day)
 CROSS JOIN (VALUES('in'),('out')) phase(action)
 WHERE s.enabled AND extract(dow FROM d.day)::integer=ANY(s.work_days)
 LOOP
  IF now()<r.due-interval '10 minutes' OR now()>=r.due+interval '20 minutes' THEN CONTINUE; END IF;
  slot:=r.shift_day::text||':'||r.action;
  IF EXISTS(SELECT 1 FROM public.attendance_email_codes WHERE employee_id=r.employee_id AND schedule_slot=slot) THEN CONTINUE; END IF;
  -- Do not replace a currently usable manual code or issue an exit for a
  -- different day's open shift.
  IF EXISTS(SELECT 1 FROM public.attendance_email_codes WHERE employee_id=r.employee_id AND action=r.action
   AND used_at IS NULL AND expires_at>now() AND tries<5) THEN CONTINUE; END IF;
  IF r.action='out' AND NOT EXISTS(SELECT 1 FROM public.attendance WHERE employee_id=r.employee_id AND date=r.shift_day AND check_in IS NOT NULL AND check_out IS NULL) THEN CONTINUE; END IF;
  BEGIN
   PERFORM attendance_private.enqueue(r.user_id,r.employee_id,r.action,slot);
   generated:=generated+1;
  EXCEPTION WHEN SQLSTATE '22023' OR SQLSTATE '42501' OR unique_violation THEN
   -- Expected missed shift, missing geofence or rate limit. Retry next tick.
   NULL;
  END;
 END LOOP;
 RETURN generated;
END; $$;
REVOKE ALL ON FUNCTION attendance_private.prepare_due() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.erp_attendance_claim_mail() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE c public.attendance_email_codes%ROWTYPE; recipient text; secret text;
BEGIN
 SELECT x.* INTO c FROM public.attendance_email_codes x
 JOIN public.employees e ON e.id=x.employee_id AND e.is_active IS TRUE AND e.branch_id=x.branch_id AND e.restaurant_id=x.restaurant_id
 JOIN public.erp_memberships m ON m.user_id=x.requester_id AND m.linked_entity_id=e.id AND m.role='employee' AND m.status='approved' AND m.restaurant_id=e.restaurant_id AND m.branch_id=e.branch_id
 JOIN auth.users u ON u.id=m.user_id AND u.email_confirmed_at IS NOT NULL AND lower(btrim(u.email))=lower(btrim(e.email))
 WHERE x.code_cipher IS NOT NULL AND x.used_at IS NULL AND x.expires_at>now()+interval '1 minute'
 AND x.mail_state IN ('pending','retry','sending') AND x.mail_retry_at<=now() AND x.mail_attempts<5
 ORDER BY x.issued_at FOR UPDATE OF x SKIP LOCKED LIMIT 1;
 IF c.id IS NULL THEN RETURN NULL; END IF;
 SELECT email INTO recipient FROM public.employees WHERE id=c.employee_id;
 SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name='attendance_code_encryption';
 UPDATE public.attendance_email_codes SET mail_state='sending',mail_attempts=mail_attempts+1,
 mail_retry_at=now()+interval '1 minute',mail_lease=gen_random_uuid() WHERE id=c.id RETURNING * INTO c;
 RETURN jsonb_build_object('id',c.id,'lease',c.mail_lease,'recipient',recipient,'action',c.action,
 'code',extensions.pgp_sym_decrypt(c.code_cipher,secret),'expires_at',c.expires_at);
END; $$;
REVOKE ALL ON FUNCTION public.erp_attendance_claim_mail() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_attendance_claim_mail() TO service_role;
CREATE FUNCTION public.erp_attendance_finish_mail(p_id uuid,p_lease uuid,p_accepted boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 UPDATE public.attendance_email_codes SET mail_state=CASE WHEN p_accepted THEN 'accepted' WHEN mail_attempts>=5 THEN 'failed' ELSE 'retry' END,
 delivered_at=CASE WHEN p_accepted THEN clock_timestamp() ELSE delivered_at END,
 mail_retry_at=now()+interval '1 minute',mail_lease=NULL WHERE id=p_id AND mail_lease=p_lease;
 RETURN FOUND;
END; $$;
REVOKE ALL ON FUNCTION public.erp_attendance_finish_mail(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_attendance_finish_mail(uuid,uuid,boolean) TO service_role;

CREATE FUNCTION attendance_private.dispatch() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE secret text;
BEGIN
 PERFORM attendance_private.prepare_due();
 UPDATE public.attendance_email_codes SET code_cipher=NULL WHERE code_cipher IS NOT NULL AND (used_at IS NOT NULL OR expires_at<=now());
 IF NOT EXISTS(SELECT 1 FROM public.attendance_email_codes WHERE code_cipher IS NOT NULL AND used_at IS NULL AND expires_at>now()+interval '1 minute' AND mail_state IN ('pending','retry','sending') AND mail_attempts<5 AND mail_retry_at<=now()) THEN RETURN; END IF;
 SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name='attendance_dispatch';
 PERFORM net.http_post(url:='https://mqubwgbppncldyiicbtu.supabase.co/functions/v1/attendance-scheduled-mail',
 headers:=jsonb_build_object('Content-Type','application/json','x-dispatch-secret',secret),body:='{}'::jsonb,timeout_milliseconds:=55000);
END; $$;
REVOKE ALL ON FUNCTION attendance_private.dispatch() FROM PUBLIC,anon,authenticated;
SELECT cron.schedule('attendance-scheduled-codes','* * * * *','select attendance_private.dispatch()');
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname='attendance-scheduled-codes'),active:=false);

CREATE OR REPLACE FUNCTION public.erp_attendance_email_event(
 p_employee_id uuid,p_code text,p_latitude double precision,
 p_longitude double precision,p_accuracy_m double precision
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,extensions,pg_temp AS $$
DECLARE e public.employees%ROWTYPE; b public.branches%ROWTYPE;
 g public.attendance_branch_geofences%ROWTYPE;
 c public.attendance_email_codes%ROWTYPE;
 a public.attendance%ROWTYPE;
 v_distance double precision; v_t timestamptz; v_local timestamp; v_date date;
 v_time text; v_action text; v_minutes numeric;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO e FROM public.employees WHERE id=coalesce(p_employee_id,(
   SELECT m.linked_entity_id FROM public.erp_memberships m
   WHERE m.user_id=auth.uid() AND m.status='approved' AND m.role='employee'
     AND m.linked_entity_id IS NOT NULL ORDER BY m.updated_at DESC LIMIT 1
 )) AND restaurant_id IS NOT NULL AND is_active IS TRUE;
 SELECT * INTO b FROM public.branches WHERE id=e.branch_id
   AND restaurant_id=e.restaurant_id AND is_active IS TRUE;
 IF e.id IS NULL OR b.id IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.erp_memberships m
  WHERE m.user_id=auth.uid() AND m.status='approved'
   AND m.restaurant_id=e.restaurant_id AND (
     m.role='owner' OR
     (m.role='manager' AND m.branch_id=b.id) OR
     (m.role='employee' AND m.branch_id=b.id AND m.linked_entity_id=e.id)
   )
 ) THEN RAISE EXCEPTION 'ATTENDANCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.erp_memberships m WHERE m.user_id=auth.uid() AND m.role='employee' AND m.linked_entity_id=e.id)
 AND NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=auth.uid() AND u.email_confirmed_at IS NOT NULL
 AND lower(btrim(u.email))=lower(btrim(e.email))) THEN
 RAISE EXCEPTION 'EMPLOYEE_VERIFIED_EMAIL_MISMATCH' USING ERRCODE='42501'; END IF;
 SELECT * INTO g FROM public.attendance_branch_geofences
 WHERE branch_id=b.id AND restaurant_id=e.restaurant_id;
 IF g.branch_id IS NULL THEN RETURN jsonb_build_object('type','error','reason','BRANCH_GEOFENCE_REQUIRED'); END IF;
 IF p_latitude IS NULL OR p_longitude IS NULL OR p_accuracy_m IS NULL
 OR p_latitude::text IN ('NaN','Infinity','-Infinity')
 OR p_longitude::text IN ('NaN','Infinity','-Infinity')
 OR p_accuracy_m::text IN ('NaN','Infinity','-Infinity')
 OR p_latitude NOT BETWEEN -90 AND 90
 OR p_longitude NOT BETWEEN -180 AND 180
 OR p_accuracy_m <= 0 OR p_accuracy_m>80 THEN
   RETURN jsonb_build_object('type','error','reason','GPS_ACCURACY_REQUIRED');
 END IF;
 v_distance:=2*6371000*asin(sqrt(
  power(sin(radians(p_latitude-g.latitude)/2),2)
 +cos(radians(g.latitude))*cos(radians(p_latitude))
  *power(sin(radians(p_longitude-g.longitude)/2),2)));
 IF v_distance+p_accuracy_m>g.radius_m THEN
  RETURN jsonb_build_object('type','error','reason','OUTSIDE_BRANCH');
 END IF;
 PERFORM pg_advisory_xact_lock(hashtext(e.id::text));
 SELECT * INTO c FROM public.attendance_email_codes
  WHERE employee_id=e.id AND restaurant_id=e.restaurant_id AND branch_id=b.id
    AND requester_id=auth.uid() AND (delivered_at IS NOT NULL OR code_cipher IS NOT NULL)
    AND used_at IS NULL
 ORDER BY issued_at DESC LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('type','error','reason','OTP_NOT_REQUESTED'); END IF;
 IF c.expires_at <= clock_timestamp() THEN
  RETURN jsonb_build_object('type','error','reason','OTP_EXPIRED');
 END IF;
 IF c.tries>=5 THEN
  RETURN jsonb_build_object('type','error','reason','OTP_LOCKED');
 END IF;
 IF p_code IS NULL OR p_code !~ '^[0-9]{6}$' OR
    extensions.crypt(p_code,c.code_hash) IS DISTINCT FROM c.code_hash THEN
  UPDATE public.attendance_email_codes SET tries=LEAST(5,tries+1)
     WHERE id=c.id;
  RETURN jsonb_build_object('type','error','reason','OTP_INVALID');
 END IF;
 v_t:=clock_timestamp();
 v_local:=v_t AT TIME ZONE 'Asia/Riyadh';
 v_date:=v_local::date;
 v_time:=to_char(v_local,'HH24:MI');
 SELECT * INTO a FROM public.attendance x
 WHERE x.employee_id=e.id AND x.restaurant_id=e.restaurant_id
  AND x.branch_id=b.id AND x.check_in IS NOT NULL AND x.check_out IS NULL
 ORDER BY x.date DESC LIMIT 1 FOR UPDATE;
 IF FOUND THEN
  IF c.action<>'out' THEN RETURN jsonb_build_object('type','error','reason','OTP_ACTION_CHANGED'); END IF;
  v_minutes:=extract(epoch FROM (v_local-(a.date::timestamp+a.check_in::time)))/60;
  IF v_minutes<2 OR v_minutes>960 THEN
   RETURN jsonb_build_object('type','error','reason','SHIFT_REVIEW_REQUIRED');
  END IF;
  UPDATE public.attendance SET check_out=v_time,
     hours_worked=round(v_minutes/60,2),updated_date=v_t WHERE id=a.id;
  v_action:='out';
 ELSE
  IF c.action<>'in' THEN RETURN jsonb_build_object('type','error','reason','OTP_ACTION_CHANGED'); END IF;
  IF EXISTS(SELECT 1 FROM public.attendance x WHERE x.restaurant_id=e.restaurant_id
     AND x.employee_id=e.id AND x.date=v_date) THEN
     RETURN jsonb_build_object('type','error','reason','ALREADY_RECORDED');
  END IF;
  INSERT INTO public.attendance(restaurant_id,branch_id,employee_id,employee_name,
   branch,date,check_in,status,late_minutes,hours_worked,created_by,created_date)
  VALUES(e.restaurant_id,b.id,e.id,e.full_name,b.branch_key,v_date,v_time,
   'present',0,0,auth.uid()::text,v_t) RETURNING * INTO a;
  v_action:='in';
 END IF;
 UPDATE public.attendance_email_codes SET used_at=v_t,verified_at=v_t,attendance_id=a.id,code_cipher=NULL WHERE id=c.id;
 INSERT INTO public.attendance_mobile_audit(actor_id,restaurant_id,branch_id,
    employee_id,attendance_id,action,distance_m,accuracy_m)
 VALUES(auth.uid(),e.restaurant_id,b.id,e.id,a.id,v_action,
    round(v_distance::numeric,2),round(p_accuracy_m::numeric,2));
 RETURN jsonb_build_object('type','success','action',v_action,
   'date',v_date,'server_time',v_time,'employee_name',e.full_name,
   'presence_method','email_otp_plus_branch_gps');
EXCEPTION WHEN unique_violation THEN
 RETURN jsonb_build_object('type','error','reason','ALREADY_RECORDED');
END; $$;
REVOKE ALL ON FUNCTION public.erp_attendance_email_event(uuid,text,double precision,double precision,double precision)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_attendance_email_event(uuid,text,double precision,double precision,double precision)
 TO authenticated;

