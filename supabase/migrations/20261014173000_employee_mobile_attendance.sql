-- Personal-phone attendance for employees; safe rollout: no existing data is modified.
-- Every event requires approved employee login, linked employee UUID, correct branch,
-- employee PIN AND in-branch geolocation. Device clock never controls payroll time.
CREATE TABLE IF NOT EXISTS public.attendance_branch_geofences (
 branch_id uuid PRIMARY KEY REFERENCES public.branches(id) ON DELETE CASCADE,
 restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
 latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
 longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
 radius_m integer NOT NULL DEFAULT 180 CHECK (radius_m BETWEEN 50 AND 500),
 updated_by uuid,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.attendance_branch_geofences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.attendance_branch_geofences FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.attendance_mobile_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_id uuid NOT NULL,
 restaurant_id uuid NOT NULL,
 branch_id uuid NOT NULL,
 employee_id uuid NOT NULL,
 attendance_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('in','out')),
 distance_m numeric(9,2) NOT NULL,
 accuracy_m numeric(9,2) NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.attendance_mobile_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.attendance_mobile_audit FROM PUBLIC, anon, authenticated;
CREATE INDEX IF NOT EXISTS idx_attendance_mobile_audit_employee ON public.attendance_mobile_audit(restaurant_id,employee_id,recorded_at DESC);

CREATE OR REPLACE FUNCTION public.erp_attendance_configure_geofence(
 p_branch_id uuid, p_latitude double precision, p_longitude double precision, p_radius_m integer DEFAULT 180
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $function$
DECLARE v_branch public.branches%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_latitude IS NULL OR p_longitude IS NULL OR p_radius_m IS NULL
   OR p_latitude::text IN ('NaN','Infinity','-Infinity') OR p_longitude::text IN ('NaN','Infinity','-Infinity')
   OR p_latitude NOT BETWEEN -90 AND 90 OR p_longitude NOT BETWEEN -180 AND 180
   OR p_radius_m NOT BETWEEN 50 AND 500 THEN
   RAISE EXCEPTION 'Invalid location or radius' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_branch FROM public.branches WHERE id=p_branch_id AND is_active IS TRUE AND restaurant_id IS NOT NULL;
 IF NOT FOUND OR NOT EXISTS(
   SELECT 1 FROM public.erp_memberships m
   WHERE m.user_id=auth.uid() AND m.status='approved' AND lower(m.role)='owner'
     AND m.restaurant_id=v_branch.restaurant_id
 ) THEN RAISE EXCEPTION 'Owner permission required' USING ERRCODE='42501'; END IF;
 INSERT INTO public.attendance_branch_geofences(branch_id,restaurant_id,latitude,longitude,radius_m,updated_by)
 VALUES(v_branch.id,v_branch.restaurant_id,p_latitude,p_longitude,p_radius_m,auth.uid())
 ON CONFLICT(branch_id) DO UPDATE SET
 restaurant_id=EXCLUDED.restaurant_id, latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude,
 radius_m=EXCLUDED.radius_m,updated_by=EXCLUDED.updated_by,updated_at=clock_timestamp();
 RETURN jsonb_build_object('configured',true,'branch_id',p_branch_id,'radius_m',p_radius_m);
END;
$function$;
REVOKE ALL ON FUNCTION public.erp_attendance_configure_geofence(uuid,double precision,double precision,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_attendance_configure_geofence(uuid,double precision,double precision,integer) TO authenticated;

-- Fail closed when the personal portal has not been linked to a specific employee.
CREATE OR REPLACE FUNCTION public.erp_attendance_mobile_status()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $function$
DECLARE v_mem public.erp_memberships%ROWTYPE; v_emp public.employees%ROWTYPE;
 v_branch public.branches%ROWTYPE; v_geo public.attendance_branch_geofences%ROWTYPE;
 v_att public.attendance%ROWTYPE; v_today date;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to your employee account' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_mem FROM public.erp_memberships m
  WHERE m.user_id=auth.uid() AND m.status='approved' AND lower(m.role)='employee'
    AND m.branch_id IS NOT NULL AND m.linked_entity_id IS NOT NULL
  ORDER BY m.updated_at DESC LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('configured',false,'reason','APPROVED_EMPLOYEE_LINK_REQUIRED'); END IF;
 SELECT * INTO v_branch FROM public.branches b WHERE b.id=v_mem.branch_id
  AND b.restaurant_id=v_mem.restaurant_id AND b.is_active IS TRUE;
 SELECT * INTO v_emp FROM public.employees e WHERE e.id=v_mem.linked_entity_id
  AND e.restaurant_id=v_mem.restaurant_id AND e.is_active IS TRUE
  AND (e.branch_id=v_mem.branch_id OR (e.branch_id IS NULL AND e.branch=v_branch.branch_key));
 IF v_branch.id IS NULL OR v_emp.id IS NULL THEN
  RETURN jsonb_build_object('configured',false,'reason','ASSIGNMENT_INVALID');
 END IF;
 SELECT * INTO v_geo FROM public.attendance_branch_geofences g
 WHERE g.branch_id=v_branch.id AND g.restaurant_id=v_mem.restaurant_id;
 v_today := (clock_timestamp() AT TIME ZONE 'Asia/Riyadh')::date;
 SELECT * INTO v_att FROM public.attendance a
 WHERE a.employee_id=v_emp.id AND a.restaurant_id=v_mem.restaurant_id AND a.branch_id=v_branch.id
 AND (a.date=v_today OR (a.date=v_today-1 AND a.check_in IS NOT NULL AND a.check_out IS NULL))
 ORDER BY a.date DESC LIMIT 1;
 RETURN jsonb_build_object(
  'configured',v_geo.branch_id IS NOT NULL,
  'pin_required',true,'employee_name',v_emp.full_name,'branch_name',v_branch.name,
  'branch_id',v_branch.id,'date',v_today,'check_in',v_att.check_in,'check_out',v_att.check_out,
  'shift_date',v_att.date, 'attendance_id',v_att.id,
  'can_check_out',v_att.id IS NOT NULL AND v_att.check_in IS NOT NULL AND v_att.check_out IS NULL,
  'location_radius_m',v_geo.radius_m,
  'reason',CASE WHEN v_geo.branch_id IS NULL THEN 'BRANCH_GEOFENCE_REQUIRED' ELSE null END);
END;
$function$;
REVOKE ALL ON FUNCTION public.erp_attendance_mobile_status() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_attendance_mobile_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.erp_attendance_mobile_event(
 p_pin text,p_latitude double precision,p_longitude double precision,p_accuracy_m double precision
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp
AS $function$
DECLARE v_mem public.erp_memberships%ROWTYPE; v_emp public.employees%ROWTYPE;
 v_branch public.branches%ROWTYPE; v_geo public.attendance_branch_geofences%ROWTYPE;
 v_attempt public.attendance_kiosk_attempts%ROWTYPE; v_hash text;
 v_att public.attendance%ROWTYPE; v_time timestamptz; v_local timestamp; v_today date;
 v_distance double precision; v_minutes numeric; v_action text; v_t text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to employee portal' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_mem FROM public.erp_memberships m
 WHERE m.user_id=auth.uid() AND m.status='approved' AND lower(m.role)='employee'
  AND m.linked_entity_id IS NOT NULL AND m.branch_id IS NOT NULL
 ORDER BY m.updated_at DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Employee account must be approved and linked to an employee' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_branch FROM public.branches b WHERE b.id=v_mem.branch_id
   AND b.restaurant_id=v_mem.restaurant_id AND b.is_active IS TRUE;
 SELECT * INTO v_emp FROM public.employees e WHERE e.id=v_mem.linked_entity_id
  AND e.restaurant_id=v_mem.restaurant_id AND e.is_active IS TRUE
  AND (e.branch_id=v_mem.branch_id OR (e.branch_id IS NULL AND e.branch=v_branch.branch_key));
 IF v_branch.id IS NULL OR v_emp.id IS NULL THEN RAISE EXCEPTION 'Employee branch assignment invalid' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_geo FROM public.attendance_branch_geofences g
  WHERE g.branch_id=v_branch.id AND g.restaurant_id=v_mem.restaurant_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('type','error','reason','BRANCH_GEOFENCE_REQUIRED'); END IF;
 IF p_latitude IS NULL OR p_longitude IS NULL OR p_accuracy_m IS NULL
  OR p_latitude::text IN ('NaN','Infinity','-Infinity') OR p_longitude::text IN ('NaN','Infinity','-Infinity') OR NOT isfinite(p_accuracy_m)
  OR p_latitude NOT BETWEEN -90 AND 90 OR p_longitude NOT BETWEEN -180 AND 180
  OR p_accuracy_m <= 0 OR p_accuracy_m > 80 THEN
  RETURN jsonb_build_object('type','error','reason','GPS_ACCURACY_REQUIRED');
 END IF;
 v_distance := 2*6371000*asin(sqrt(
  power(sin(radians(p_latitude-v_geo.latitude)/2),2)
   + cos(radians(v_geo.latitude))*cos(radians(p_latitude))
     *power(sin(radians(p_longitude-v_geo.longitude)/2),2)
 ));
 IF v_distance + p_accuracy_m > v_geo.radius_m THEN
  RETURN jsonb_build_object('type','error','reason','OUTSIDE_BRANCH');
 END IF;

 INSERT INTO public.attendance_kiosk_attempts(actor_id,branch_id)
 VALUES(auth.uid(),v_branch.id) ON CONFLICT DO NOTHING;
 SELECT * INTO v_attempt FROM public.attendance_kiosk_attempts
 WHERE actor_id=auth.uid() AND branch_id=v_branch.id FOR UPDATE;
 IF v_attempt.blocked_until IS NOT NULL AND v_attempt.blocked_until>clock_timestamp() THEN
   RETURN jsonb_build_object('type','error','reason','PIN_RATE_LIMITED');
 END IF;
 IF v_attempt.window_start < clock_timestamp()-interval '15 minutes' THEN
   UPDATE public.attendance_kiosk_attempts SET attempts=0,window_start=clock_timestamp(),blocked_until=NULL
    WHERE actor_id=auth.uid() AND branch_id=v_branch.id;
 END IF;
 SELECT pin_hash INTO v_hash FROM public.attendance_kiosk_pins WHERE employee_id=v_emp.id
  AND restaurant_id=v_mem.restaurant_id;
 IF p_pin IS NULL OR p_pin !~ '^[0-9]{6}$' OR v_hash IS NULL
   OR extensions.crypt(p_pin,coalesce(v_hash,extensions.gen_salt('bf'))) IS DISTINCT FROM v_hash THEN
   UPDATE public.attendance_kiosk_attempts
    SET attempts=attempts+1,
        blocked_until=CASE WHEN attempts+1>=5 THEN clock_timestamp()+interval '15 minutes' ELSE null END
    WHERE actor_id=auth.uid() AND branch_id=v_branch.id;
   RETURN jsonb_build_object('type','error','reason','INVALID_PIN');
 END IF;
 UPDATE public.attendance_kiosk_attempts SET attempts=0,blocked_until=NULL,window_start=clock_timestamp()
 WHERE actor_id=auth.uid() AND branch_id=v_branch.id;

 PERFORM pg_advisory_xact_lock(hashtext(v_emp.id::text));
 v_time:=clock_timestamp();
 v_local:=v_time AT TIME ZONE 'Asia/Riyadh';
 v_today:=v_local::date;
 v_t:=to_char(v_local,'HH24:MI');
 SELECT * INTO v_att FROM public.attendance a
 WHERE a.restaurant_id=v_mem.restaurant_id AND a.employee_id=v_emp.id AND a.branch_id=v_branch.id
 AND a.check_in IS NOT NULL AND a.check_out IS NULL
 AND a.date IN(v_today,v_today-1) ORDER BY a.date DESC LIMIT 1 FOR UPDATE;
 IF FOUND THEN
   v_minutes:=extract(epoch FROM (v_local - (v_att.date::timestamp + v_att.check_in::time)))/60;
   IF v_minutes < 2 OR v_minutes > 960 THEN
     RETURN jsonb_build_object('type','error','reason','SHIFT_REVIEW_REQUIRED');
   END IF;
   UPDATE public.attendance SET check_out=v_t,hours_worked=round(v_minutes/60,2),updated_date=v_time
   WHERE id=v_att.id;
   v_action:='out';
 ELSE
   IF EXISTS(SELECT 1 FROM public.attendance a WHERE a.restaurant_id=v_mem.restaurant_id
     AND a.employee_id=v_emp.id AND a.date=v_today) THEN
     RETURN jsonb_build_object('type','error','reason','ALREADY_RECORDED');
   END IF;
   INSERT INTO public.attendance(restaurant_id,branch_id,employee_id,employee_name,branch,
     date,check_in,status,late_minutes,hours_worked,created_by,created_date)
   VALUES(v_mem.restaurant_id,v_branch.id,v_emp.id,v_emp.full_name,v_branch.branch_key,
     v_today,v_t,'present',0,0,auth.uid()::text,v_time) RETURNING * INTO v_att;
   v_action:='in';
 END IF;
 INSERT INTO public.attendance_mobile_audit(actor_id,restaurant_id,branch_id,employee_id,
 attendance_id,action,distance_m,accuracy_m)
 VALUES(auth.uid(),v_mem.restaurant_id,v_branch.id,v_emp.id,v_att.id,v_action,
  round(v_distance::numeric,2),round(p_accuracy_m::numeric,2));
 RETURN jsonb_build_object('type','success','action',v_action,'date',v_today,
  'server_time',v_t,'employee_name',v_emp.full_name);
EXCEPTION WHEN unique_violation THEN
 RETURN jsonb_build_object('type','error','reason','ALREADY_RECORDED');
END;
$function$;
REVOKE ALL ON FUNCTION public.erp_attendance_mobile_event(text,double precision,double precision,double precision) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_attendance_mobile_event(text,double precision,double precision,double precision) TO authenticated;
