-- Distinguish shifts from the one-row-per-day payroll summary. Never remove
-- existing punches or count a new shift as a second paid attendance day.
CREATE TABLE public.attendance_shift_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 employee_id uuid NOT NULL REFERENCES public.employees(id), restaurant_id uuid NOT NULL,
 branch_id uuid NOT NULL, attendance_id uuid REFERENCES public.attendance(id),
 shift_start timestamptz NOT NULL, shift_end timestamptz NOT NULL, shift_date date NOT NULL,
 checked_in_at timestamptz NOT NULL, checked_out_at timestamptz,
 prior_daily_snapshot jsonb, actor_id uuid NOT NULL,
 UNIQUE(employee_id,shift_start),CHECK(checked_out_at IS NULL OR checked_out_at>=checked_in_at)
);
CREATE UNIQUE INDEX attendance_one_open_session ON public.attendance_shift_sessions(employee_id) WHERE checked_out_at IS NULL;
ALTER TABLE public.attendance_shift_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.attendance_shift_sessions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.attendance_shift_sessions TO authenticated;
GRANT ALL ON public.attendance_shift_sessions TO service_role;
CREATE POLICY attendance_sessions_read ON public.attendance_shift_sessions FOR SELECT TO authenticated USING (
 EXISTS(SELECT 1 FROM public.erp_memberships m WHERE m.user_id=auth.uid() AND m.status='approved'
 AND m.restaurant_id=attendance_shift_sessions.restaurant_id AND (m.role='owner'
 OR (m.role='manager' AND m.branch_id=attendance_shift_sessions.branch_id)
 OR (m.role='employee' AND m.branch_id=attendance_shift_sessions.branch_id AND m.linked_entity_id=attendance_shift_sessions.employee_id)))
);
ALTER TABLE public.attendance_email_codes ADD COLUMN shift_start timestamptz;

-- Private pure state resolver shared by issue, scheduler, dashboard and event.
-- p_at exists for deterministic boundary tests; clients cannot call this helper.
CREATE FUNCTION attendance_private.shift_state(p_employee uuid,p_at timestamptz DEFAULT clock_timestamp()) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.employees%ROWTYPE; s public.employee_attendance_schedules%ROWTYPE;
 a public.attendance%ROWTYPE; session public.attendance_shift_sessions%ROWTYPE;
 local_day date:=(p_at AT TIME ZONE 'Asia/Riyadh')::date; shift_day date;
 starts timestamptz; ends timestamptz; phase text; ci text; co text; duration interval;
BEGIN
 SELECT * INTO e FROM public.employees WHERE id=p_employee;
 SELECT * INTO session FROM public.attendance_shift_sessions WHERE employee_id=e.id
 AND restaurant_id=e.restaurant_id AND branch_id=e.branch_id AND checked_out_at IS NULL;
 IF session.id IS NOT NULL THEN
  RETURN jsonb_build_object('phase',CASE WHEN p_at-session.checked_in_at>interval '16 hours' THEN 'review_required' ELSE 'checked_in' END,
   'can_check_in',false,'can_check_out',p_at-session.checked_in_at BETWEEN interval '2 minutes' AND interval '16 hours',
   'request_action','out','can_request_code',p_at-session.checked_in_at<=interval '16 hours',
   'check_in',to_char(session.checked_in_at AT TIME ZONE 'Asia/Riyadh','HH24:MI'),'check_out',NULL,
   'shift_date',session.shift_date,'shift_start',session.shift_start,'shift_end',session.shift_end,
   'session_id',session.id,'attendance_id',session.attendance_id,'reason',CASE WHEN p_at-session.checked_in_at>interval '16 hours' THEN 'SHIFT_REVIEW_REQUIRED' ELSE NULL END);
 END IF;
 -- Preserve old open punches; never silently abandon them to begin a new shift.
 SELECT * INTO a FROM public.attendance WHERE employee_id=e.id AND restaurant_id=e.restaurant_id AND branch_id=e.branch_id
 AND check_in IS NOT NULL AND check_out IS NULL ORDER BY date DESC LIMIT 1;
 IF a.id IS NOT NULL THEN
  starts:=(a.date+a.check_in::time) AT TIME ZONE 'Asia/Riyadh';
  RETURN jsonb_build_object('phase',CASE WHEN p_at-starts>interval '16 hours' THEN 'review_required' ELSE 'checked_in' END,
   'can_check_in',false,'can_check_out',p_at-starts BETWEEN interval '2 minutes' AND interval '16 hours',
   'request_action','out','can_request_code',p_at-starts<=interval '16 hours',
   'check_in',a.check_in,'check_out',NULL,'shift_date',a.date,'shift_start',NULL,'attendance_id',a.id,
   'reason',CASE WHEN p_at-starts>interval '16 hours' THEN 'SHIFT_REVIEW_REQUIRED' ELSE NULL END);
 END IF;
 SELECT * INTO s FROM public.employee_attendance_schedules WHERE employee_id=e.id AND restaurant_id=e.restaurant_id AND branch_id=e.branch_id;
 IF s.employee_id IS NOT NULL THEN
  duration:=(s.end_time-s.start_time)+CASE WHEN s.end_time<s.start_time THEN interval '1 day' ELSE interval '0 day' END;
  SELECT d::date,(d::date+s.start_time) AT TIME ZONE 'Asia/Riyadh' INTO shift_day,starts
  FROM generate_series(local_day-1,local_day+7,interval '1 day') d
  WHERE extract(dow FROM d)::integer=ANY(s.work_days)
   AND ((d::date+s.start_time+duration) AT TIME ZONE 'Asia/Riyadh')>p_at
  ORDER BY d LIMIT 1;
  ends:=starts+duration;
 ELSE shift_day:=local_day;starts:=local_day::timestamp AT TIME ZONE 'Asia/Riyadh';ends:=starts+interval '1 day'; END IF;
 SELECT * INTO session FROM public.attendance_shift_sessions WHERE employee_id=e.id AND shift_start=starts;
 SELECT * INTO a FROM public.attendance WHERE employee_id=e.id AND restaurant_id=e.restaurant_id AND date=shift_day;
 IF session.id IS NOT NULL THEN
  phase:='completed';ci:=to_char(session.checked_in_at AT TIME ZONE 'Asia/Riyadh','HH24:MI');co:=to_char(session.checked_out_at AT TIME ZONE 'Asia/Riyadh','HH24:MI');
 ELSIF a.id IS NOT NULL AND a.check_in IS NULL THEN phase:='review_required';
 ELSIF a.id IS NOT NULL AND (s.employee_id IS NULL OR ((a.date+a.check_in::time) AT TIME ZONE 'Asia/Riyadh')>=starts-interval '10 minutes') THEN
  phase:='completed';ci:=a.check_in;co:=a.check_out;
 ELSIF p_at<starts-interval '10 minutes' THEN phase:='waiting';
 ELSE phase:='not_checked_in'; END IF;
 RETURN jsonb_build_object('phase',phase,'can_check_in',phase='not_checked_in','can_check_out',false,
 'request_action','in','can_request_code',phase IN ('waiting','not_checked_in') AND p_at>=starts-interval '30 minutes',
 'check_in',ci,'check_out',co,'shift_date',shift_day,'shift_start',starts,'shift_end',ends,'session_id',session.id,
 'attendance_id',CASE WHEN phase IN ('completed','review_required') THEN a.id ELSE NULL END,
 'opens_at',starts-interval '10 minutes','automatic_code_at',starts-interval '10 minutes',
 'previous_check_in',CASE WHEN ci IS NULL THEN a.check_in ELSE NULL END,'previous_check_out',CASE WHEN ci IS NULL THEN a.check_out ELSE NULL END,
 'reason',CASE WHEN phase='waiting' THEN 'SHIFT_NOT_OPEN' WHEN phase='review_required' THEN 'MANAGER_REVIEW_REQUIRED' ELSE NULL END);
END $$;
REVOKE ALL ON FUNCTION attendance_private.shift_state(uuid,timestamptz) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.erp_attendance_email_issue_admin(
 p_actor uuid,p_employee uuid,p_action text,p_code text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,extensions,pg_temp AS $$
DECLARE e public.employees%ROWTYPE; b public.branches%ROWTYPE;
 v_email text; v_user_email text; v_confirmed timestamptz;
 v_today date; v_has_open boolean; v_id uuid; v_expires timestamptz; st jsonb;
BEGIN
 IF p_actor IS NULL OR p_employee IS NULL OR p_code !~ '^[0-9]{6}$'
    OR p_action NOT IN ('in','out') THEN
   RAISE EXCEPTION 'INVALID_ATTENDANCE_REQUEST' USING ERRCODE='22023';
 END IF;
 SELECT * INTO e FROM public.employees
 WHERE id=p_employee AND is_active IS TRUE AND restaurant_id IS NOT NULL;
 SELECT * INTO b FROM public.branches
 WHERE id=e.branch_id AND restaurant_id=e.restaurant_id AND is_active IS TRUE;
 IF e.id IS NULL OR b.id IS NULL THEN
   RAISE EXCEPTION 'ASSIGNMENT_INVALID' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.erp_memberships m
    WHERE m.user_id=p_actor AND m.restaurant_id=e.restaurant_id
      AND m.status='approved' AND (
        m.role='owner' OR
        (m.role='manager' AND m.branch_id=b.id) OR
        (m.role='employee' AND m.branch_id=b.id AND m.linked_entity_id=e.id)
      )) THEN
   RAISE EXCEPTION 'ATTENDANCE_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.attendance_branch_geofences g
  WHERE g.branch_id=b.id AND g.restaurant_id=e.restaurant_id) THEN
   RAISE EXCEPTION 'BRANCH_GEOFENCE_REQUIRED' USING ERRCODE='22023';
 END IF;
 v_email:=btrim(coalesce(e.email,''));
 IF v_email !~* '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$' THEN
   RAISE EXCEPTION 'EMPLOYEE_EMAIL_REQUIRED' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM public.erp_memberships m
   WHERE m.user_id=p_actor AND m.role='employee' AND m.status='approved'
     AND m.linked_entity_id=e.id AND m.restaurant_id=e.restaurant_id) THEN
   SELECT lower(btrim(u.email)),u.email_confirmed_at INTO v_user_email,v_confirmed
   FROM auth.users u WHERE u.id=p_actor;
   IF v_user_email IS DISTINCT FROM lower(v_email) OR v_confirmed IS NULL THEN
     RAISE EXCEPTION 'EMPLOYEE_VERIFIED_EMAIL_MISMATCH' USING ERRCODE='42501';
   END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtext(e.id::text));
 st:=attendance_private.shift_state(e.id);
 IF st->>'request_action' IS DISTINCT FROM p_action OR NOT coalesce((st->>'can_request_code')::boolean,false) THEN
  RAISE EXCEPTION 'SHIFT_NOT_AVAILABLE' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.attendance_email_codes c
    WHERE c.employee_id=e.id AND c.issued_at > clock_timestamp()-interval '60 seconds') THEN
   RAISE EXCEPTION 'OTP_RATE_LIMITED_60_SECONDS' USING ERRCODE='22023';
 END IF;
 IF (SELECT count(*) FROM public.attendance_email_codes c
      WHERE c.employee_id=e.id AND c.issued_at > clock_timestamp()-interval '1 hour')>=6 THEN
   RAISE EXCEPTION 'OTP_RATE_LIMITED_HOURLY' USING ERRCODE='22023';
 END IF;
 v_expires:=clock_timestamp()+interval '30 minutes';
 INSERT INTO public.attendance_email_codes(restaurant_id,branch_id,employee_id,
   requester_id,action,code_hash,expires_at)
 VALUES(e.restaurant_id,b.id,e.id,p_actor,p_action,
   extensions.crypt(p_code,extensions.gen_salt('bf',10)),v_expires)
 RETURNING id INTO v_id;
 UPDATE public.attendance_email_codes SET shift_start=(st->>'shift_start')::timestamptz WHERE id=v_id;
 RETURN jsonb_build_object('challenge_id',v_id,'recipient',v_email,
    'masked_email',left(v_email,2)||'***@'||split_part(v_email,'@',2),
    'expires_at',v_expires,'action',p_action);
END; $$;
REVOKE ALL ON FUNCTION public.erp_attendance_email_issue_admin(uuid,uuid,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_attendance_email_issue_admin(uuid,uuid,text,text) TO service_role;


CREATE OR REPLACE FUNCTION public.erp_attendance_code_status() RETURNS jsonb
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
 result:=result||attendance_private.shift_state(e.id);
 SELECT to_jsonb(x) INTO s FROM public.employee_attendance_schedules x WHERE employee_id=e.id AND branch_id=e.branch_id;
 SELECT * INTO c FROM public.attendance_email_codes WHERE employee_id=e.id AND requester_id=auth.uid()
 AND branch_id=e.branch_id AND restaurant_id=e.restaurant_id AND used_at IS NULL AND expires_at>clock_timestamp()
 AND tries<5 AND code_cipher IS NOT NULL AND action=result->>'request_action'
 AND shift_start IS NOT DISTINCT FROM (result->>'shift_start')::timestamptz ORDER BY issued_at DESC LIMIT 1;
 SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name='attendance_code_encryption';
 RETURN result||jsonb_build_object('schedule',s,'timezone','Asia/Riyadh','server_now',clock_timestamp(),
 'code',CASE WHEN c.id IS NOT NULL THEN extensions.pgp_sym_decrypt(c.code_cipher,secret) ELSE NULL END,
 'code_action',c.action,'expires_at',c.expires_at,'mail_state',c.mail_state,'code_reason',NULL);
END; $$;
REVOKE ALL ON FUNCTION public.erp_attendance_code_status() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_attendance_code_status() TO authenticated;


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
   VALUES(e.restaurant_id,b.id,e.id,e.full_name,b.branch_key,v_date,v_time,'present',greatest(0,floor(extract(epoch FROM(v_t-(st->>'shift_start')::timestamptz))/60))::integer,0,auth.uid()::text,v_t) RETURNING * INTO a;
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

-- An owner issues FOR the verified employee principal so it appears on that
-- employee's dashboard and is redeemable by the employee (not owner-bound).
CREATE FUNCTION public.erp_attendance_owner_issue_code(p_employee uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.employees%ROWTYPE; actor uuid; st jsonb; challenge uuid;
BEGIN
 SELECT * INTO e FROM public.employees WHERE id=p_employee AND is_active IS TRUE;
 IF e.id IS NULL OR auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.erp_memberships
 WHERE user_id=auth.uid() AND restaurant_id=e.restaurant_id AND status='approved' AND role='owner') THEN
 RAISE EXCEPTION 'OWNER_SCHEDULE_PERMISSION_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT m.user_id INTO actor FROM public.erp_memberships m JOIN auth.users u ON u.id=m.user_id
 AND u.email_confirmed_at IS NOT NULL AND lower(btrim(u.email))=lower(btrim(e.email))
 WHERE m.linked_entity_id=e.id AND m.restaurant_id=e.restaurant_id AND m.branch_id=e.branch_id AND m.role='employee' AND m.status='approved'
 ORDER BY m.updated_at DESC LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'EMPLOYEE_VERIFIED_EMAIL_MISMATCH'; END IF;
 st:=attendance_private.shift_state(e.id);
 challenge:=attendance_private.enqueue(actor,e.id,st->>'request_action',NULL);
 RETURN jsonb_build_object('ok',true,'action',st->>'request_action','expires_at',(SELECT expires_at FROM public.attendance_email_codes WHERE id=challenge));
END $$;
REVOKE ALL ON FUNCTION public.erp_attendance_owner_issue_code(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_attendance_owner_issue_code(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION attendance_private.prepare_due() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r record; st jsonb; due timestamptz; slot text; generated integer:=0;
BEGIN
 FOR r IN SELECT s.*,m.user_id FROM public.employee_attendance_schedules s
 JOIN public.employees e ON e.id=s.employee_id AND e.restaurant_id=s.restaurant_id AND e.branch_id=s.branch_id AND e.is_active IS TRUE
 JOIN public.erp_memberships m ON m.linked_entity_id=e.id AND m.restaurant_id=e.restaurant_id AND m.branch_id=e.branch_id AND m.role='employee' AND m.status='approved'
 JOIN auth.users u ON u.id=m.user_id AND u.email_confirmed_at IS NOT NULL AND lower(btrim(u.email))=lower(btrim(e.email))
 WHERE s.enabled LOOP
  st:=attendance_private.shift_state(r.employee_id);
  IF NOT coalesce((st->>'can_request_code')::boolean,false) THEN CONTINUE; END IF;
  due:=CASE WHEN st->>'request_action'='in' THEN (st->>'shift_start')::timestamptz ELSE coalesce((st->>'shift_end')::timestamptz,
   (((st->>'shift_date')::date+r.end_time+CASE WHEN r.end_time<r.start_time THEN interval '1 day' ELSE interval '0 day' END) AT TIME ZONE 'Asia/Riyadh')) END;
  IF now()<due-interval '10 minutes' OR now()>=due+interval '20 minutes' THEN CONTINUE; END IF;
  slot:=(st->>'shift_date')||':'||(st->>'request_action')||':'||coalesce(st->>'shift_start','legacy')||':'||r.updated_at::text;
  IF EXISTS(SELECT 1 FROM public.attendance_email_codes WHERE employee_id=r.employee_id AND schedule_slot=slot) THEN CONTINUE; END IF;
  IF EXISTS(SELECT 1 FROM public.attendance_email_codes WHERE employee_id=r.employee_id AND action=st->>'request_action' AND shift_start IS NOT DISTINCT FROM (st->>'shift_start')::timestamptz AND used_at IS NULL AND expires_at>now() AND tries<5) THEN CONTINUE; END IF;
  BEGIN
   PERFORM attendance_private.enqueue(r.user_id,r.employee_id,st->>'request_action',slot);generated:=generated+1;
  EXCEPTION WHEN SQLSTATE '22023' OR SQLSTATE '42501' OR unique_violation THEN NULL;
  END;
 END LOOP;
 RETURN generated;
END $$;
REVOKE ALL ON FUNCTION attendance_private.prepare_due() FROM PUBLIC,anon,authenticated;
