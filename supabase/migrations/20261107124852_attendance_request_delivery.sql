-- Start email delivery immediately for owner and employee code requests.
CREATE OR REPLACE FUNCTION attendance_private.enqueue(p_actor uuid,p_employee uuid,p_action text,p_slot text DEFAULT NULL)
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
 -- pg_net starts after commit; a rolled-back test never sends mail.
 SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name='attendance_dispatch';
 PERFORM net.http_post(url:='https://mqubwgbppncldyiicbtu.supabase.co/functions/v1/attendance-scheduled-mail',
  headers:=jsonb_build_object('Content-Type','application/json','x-dispatch-secret',secret),body:='{}'::jsonb,timeout_milliseconds:=55000);
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION attendance_private.enqueue(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;


-- Unscheduled staff have no scheduled lateness.
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
 v_time text; v_action text; v_minutes numeric; st jsonb; ss public.attendance_shift_sessions%ROWTYPE; previous jsonb;
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
 st:=attendance_private.shift_state(e.id);
 SELECT * INTO c FROM public.attendance_email_codes
  WHERE employee_id=e.id AND restaurant_id=e.restaurant_id AND branch_id=b.id
    AND requester_id=auth.uid() AND (delivered_at IS NOT NULL OR code_cipher IS NOT NULL)
    AND used_at IS NULL
 ORDER BY issued_at DESC LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('type','error','reason','OTP_NOT_REQUESTED'); END IF;
 IF c.shift_start IS DISTINCT FROM (st->>'shift_start')::timestamptz OR c.action IS DISTINCT FROM st->>'request_action' THEN
 RETURN jsonb_build_object('type','error','reason','OTP_ACTION_CHANGED'); END IF;
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
 IF c.action='out' THEN
  IF NOT coalesce((st->>'can_check_out')::boolean,false) THEN
   RETURN jsonb_build_object('type','error','reason','SHIFT_REVIEW_REQUIRED'); END IF;
  SELECT * INTO a FROM public.attendance WHERE id=(st->>'attendance_id')::uuid FOR UPDATE;
  IF a.id IS NULL THEN RETURN jsonb_build_object('type','error','reason','MANAGER_REVIEW_REQUIRED'); END IF;
  IF st->>'session_id' IS NOT NULL THEN
   SELECT * INTO ss FROM public.attendance_shift_sessions WHERE id=(st->>'session_id')::uuid FOR UPDATE;
   v_minutes:=extract(epoch FROM (v_t-ss.checked_in_at))/60;
   UPDATE public.attendance_shift_sessions SET checked_out_at=v_t WHERE id=ss.id;
   UPDATE public.attendance SET check_out=v_time,hours_worked=coalesce(hours_worked,0)+round(v_minutes/60,2),updated_date=v_t WHERE id=a.id;
  ELSE
   v_minutes:=extract(epoch FROM (v_local-(a.date::timestamp+a.check_in::time)))/60;
   UPDATE public.attendance SET check_out=v_time,hours_worked=round(v_minutes/60,2),updated_date=v_t WHERE id=a.id;
  END IF;
  v_action:='out';v_date:=a.date;
 ELSE
  IF NOT coalesce((st->>'can_check_in')::boolean,false) THEN
   RETURN jsonb_build_object('type','error','reason',CASE WHEN st->>'phase'='waiting' THEN 'SHIFT_NOT_OPEN' ELSE 'ALREADY_RECORDED' END); END IF;
  v_date:=(st->>'shift_date')::date;
  SELECT * INTO a FROM public.attendance WHERE employee_id=e.id AND restaurant_id=e.restaurant_id AND date=v_date FOR UPDATE;
  IF a.id IS NOT NULL THEN
   IF a.branch_id IS DISTINCT FROM b.id OR a.check_in IS NULL OR a.check_out IS NULL THEN
    RETURN jsonb_build_object('type','error','reason','MANAGER_REVIEW_REQUIRED'); END IF;
   previous:=to_jsonb(a);
   UPDATE public.attendance SET check_out=NULL,updated_date=v_t WHERE id=a.id;
  ELSE
   INSERT INTO public.attendance(restaurant_id,branch_id,employee_id,employee_name,branch,date,check_in,status,late_minutes,hours_worked,created_by,created_date)
   VALUES(e.restaurant_id,b.id,e.id,e.full_name,b.branch_key,v_date,v_time,'present',CASE WHEN EXISTS(SELECT 1 FROM public.employee_attendance_schedules WHERE employee_id=e.id AND branch_id=b.id) THEN greatest(0,floor(extract(epoch FROM(v_t-(st->>'shift_start')::timestamptz))/60))::integer ELSE 0 END,0,auth.uid()::text,v_t) RETURNING * INTO a;
  END IF;
  INSERT INTO public.attendance_shift_sessions(employee_id,restaurant_id,branch_id,attendance_id,shift_start,shift_end,shift_date,checked_in_at,prior_daily_snapshot,actor_id)
  VALUES(e.id,e.restaurant_id,b.id,a.id,(st->>'shift_start')::timestamptz,(st->>'shift_end')::timestamptz,v_date,v_t,previous,auth.uid());
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
