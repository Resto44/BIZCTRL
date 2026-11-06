-- ERP attendance: time-limited email OTP plus geofence. A six-digit
-- code is generated and emailed ONLY by the authenticated Edge Function.
-- Neither plaintext codes nor GPS coordinates are stored in attendance history.
CREATE TABLE IF NOT EXISTS public.attendance_email_codes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 restaurant_id uuid NOT NULL,
 branch_id uuid NOT NULL,
 employee_id uuid NOT NULL REFERENCES public.employees(id),
 requester_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('in','out')),
 code_hash text NOT NULL,
 issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 delivered_at timestamptz,
 used_at timestamptz,
 verified_at timestamptz,
 attendance_id uuid,
 tries integer NOT NULL DEFAULT 0 CHECK(tries BETWEEN 0 AND 5)
);
CREATE INDEX IF NOT EXISTS attendance_email_codes_employee_idx
 ON public.attendance_email_codes(employee_id,issued_at DESC);
CREATE INDEX IF NOT EXISTS attendance_email_codes_actor_idx
 ON public.attendance_email_codes(requester_id,issued_at DESC);
ALTER TABLE public.attendance_email_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.attendance_email_codes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.attendance_email_codes TO service_role;

-- Trusted service-role only entrypoint. The Edge Function authenticates JWT
-- via Auth getUser and supplies the trusted actor; this function *also*
-- validates approved role, scoped employee, email and current shift.
CREATE OR REPLACE FUNCTION public.erp_attendance_email_issue_admin(
 p_actor uuid,p_employee uuid,p_action text,p_code text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,extensions,pg_temp AS $$
DECLARE e public.employees%ROWTYPE; b public.branches%ROWTYPE;
 v_email text; v_user_email text; v_confirmed timestamptz;
 v_today date; v_has_open boolean; v_id uuid; v_expires timestamptz;
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
 v_today:=(clock_timestamp() AT TIME ZONE 'Asia/Riyadh')::date;
 SELECT EXISTS(SELECT 1 FROM public.attendance a WHERE a.employee_id=e.id
    AND a.restaurant_id=e.restaurant_id AND a.branch_id=b.id
    AND a.check_in IS NOT NULL AND a.check_out IS NULL) INTO v_has_open;
 IF p_action='in' AND (v_has_open OR EXISTS(SELECT 1 FROM public.attendance a
    WHERE a.employee_id=e.id AND a.restaurant_id=e.restaurant_id AND a.date=v_today)) THEN
   RAISE EXCEPTION 'ATTENDANCE_ALREADY_STARTED' USING ERRCODE='22023';
 END IF;
 IF p_action='out' AND NOT v_has_open THEN
   RAISE EXCEPTION 'NO_OPEN_SHIFT' USING ERRCODE='22023';
 END IF;
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
 RETURN jsonb_build_object('challenge_id',v_id,'recipient',v_email,
    'masked_email',left(v_email,2)||'***@'||split_part(v_email,'@',2),
    'expires_at',v_expires,'action',p_action);
END; $$;
REVOKE ALL ON FUNCTION public.erp_attendance_email_issue_admin(uuid,uuid,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_attendance_email_issue_admin(uuid,uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.erp_attendance_email_delivery_admin(
 p_challenge uuid,p_accepted boolean
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.attendance_email_codes%ROWTYPE;
BEGIN
 SELECT * INTO c FROM public.attendance_email_codes WHERE id=p_challenge FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF p_accepted IS TRUE THEN
   -- A newly accepted code supersedes earlier delivered email codes.
   UPDATE public.attendance_email_codes SET used_at=clock_timestamp()
   WHERE employee_id=c.employee_id AND id<>c.id AND used_at IS NULL;
   UPDATE public.attendance_email_codes SET delivered_at=clock_timestamp()
     WHERE id=c.id AND used_at IS NULL;
 ELSE
   UPDATE public.attendance_email_codes SET used_at=clock_timestamp()
     WHERE id=c.id AND used_at IS NULL;
 END IF;
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.erp_attendance_email_delivery_admin(uuid,boolean)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_attendance_email_delivery_admin(uuid,boolean) TO service_role;

-- The only write operation for employee email OTP check-in/out.
-- Employee identity is never accepted from an unverified login. Owner/manager
-- kiosk is restricted by approved organization and branch membership.
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
    AND requester_id=auth.uid() AND delivered_at IS NOT NULL
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
 UPDATE public.attendance_email_codes SET used_at=v_t,verified_at=v_t,attendance_id=a.id WHERE id=c.id;
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

-- The legacy PIN and static QR routines are left untouched for migration
-- compatibility; they must be retired only after live OTP email delivery is
-- proven working across employee and manager workflows.


-- Read-only, tenant-scoped owner / assigned-manager dashboard counts. No
-- secrets, raw GPS or recipient emails are surfaced.
CREATE OR REPLACE FUNCTION public.erp_attendance_email_owner_summary(
 p_restaurant uuid,p_branch uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $$
DECLARE v_today date;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.erp_memberships m
 WHERE m.user_id=auth.uid() AND m.status='approved' AND m.restaurant_id=p_restaurant
 AND (
  m.role='owner' OR (m.role='manager' AND p_branch IS NOT NULL AND m.branch_id=p_branch)
 )) THEN RAISE EXCEPTION 'ATTENDANCE_SUMMARY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 v_today:=(clock_timestamp() AT TIME ZONE 'Asia/Riyadh')::date;
 RETURN (SELECT jsonb_build_object(
 'provider_accepted',count(*) FILTER (WHERE c.delivered_at IS NOT NULL),
 'verified_in',count(*) FILTER (WHERE c.verified_at IS NOT NULL AND c.action='in'),
 'verified_out',count(*) FILTER (WHERE c.verified_at IS NOT NULL AND c.action='out'),
 'expired_unused',count(*) FILTER (WHERE c.expires_at<clock_timestamp()
      AND c.verified_at IS NULL AND c.delivered_at IS NOT NULL),
 'locked_invalid',count(*) FILTER (WHERE c.tries>=5),
 'local_date',v_today)
 FROM public.attendance_email_codes c
 WHERE c.restaurant_id=p_restaurant AND (p_branch IS NULL OR c.branch_id=p_branch)
 AND (c.issued_at AT TIME ZONE 'Asia/Riyadh')::date=v_today);
END; $$;
REVOKE ALL ON FUNCTION public.erp_attendance_email_owner_summary(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_attendance_email_owner_summary(uuid,uuid) TO authenticated;
