-- ERP check-in/check-out transition correctness.
-- A stale open shift must NEVER silently allow a new check-in, even after a day.
-- Both mobile and kiosk use the same employee advisory lock and unique day index.
-- Dashboard phase reflects open shifts spanning midnight and manual absence records.
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
 AND (a.date=v_today OR (a.check_in IS NOT NULL AND a.check_out IS NULL))
 ORDER BY CASE WHEN a.check_in IS NOT NULL AND a.check_out IS NULL THEN 0 ELSE 1 END, a.date DESC LIMIT 1;
 RETURN jsonb_build_object(
  'configured',v_geo.branch_id IS NOT NULL,
  'pin_required',true,'employee_name',v_emp.full_name,'branch_name',v_branch.name,
  'branch_id',v_branch.id,'date',v_today,'check_in',v_att.check_in,'check_out',v_att.check_out,
  'shift_date',v_att.date, 'attendance_id',v_att.id,
  'can_check_out',v_att.id IS NOT NULL AND v_att.check_in IS NOT NULL
    AND v_att.check_out IS NULL AND v_att.date>=v_today-1,
  'can_check_in',v_att.id IS NULL AND v_geo.branch_id IS NOT NULL,
  'phase',CASE WHEN v_att.id IS NULL THEN 'not_checked_in'
     WHEN v_att.check_in IS NOT NULL AND v_att.check_out IS NULL AND v_att.date<v_today-1 THEN 'review_required'
     WHEN v_att.check_in IS NOT NULL AND v_att.check_out IS NULL THEN 'checked_in'
     WHEN v_att.date=v_today AND v_att.check_in IS NOT NULL AND v_att.check_out IS NOT NULL THEN 'completed'
     ELSE 'review_required' END,
  'location_radius_m',v_geo.radius_m,
  'reason',CASE WHEN v_geo.branch_id IS NULL THEN 'BRANCH_GEOFENCE_REQUIRED'
     WHEN v_att.id IS NOT NULL AND v_att.check_in IS NOT NULL AND v_att.check_out IS NULL
       AND v_att.date<v_today-1 THEN 'SHIFT_REVIEW_REQUIRED'
     WHEN v_att.id IS NOT NULL AND (v_att.check_in IS NULL OR v_att.check_out IS NULL AND v_att.date=v_today AND v_att.check_in IS NULL)
       THEN 'MANAGER_REVIEW_REQUIRED'
     ELSE null END);
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
  OR p_latitude::text IN ('NaN','Infinity','-Infinity') OR p_longitude::text IN ('NaN','Infinity','-Infinity') OR p_accuracy_m::text IN ('NaN','Infinity','-Infinity')
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
 ORDER BY a.date DESC LIMIT 1 FOR UPDATE;
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


CREATE OR REPLACE FUNCTION public.erp_attendance_kiosk_event(
  p_restaurant_id uuid, p_branch_id uuid, p_employee_id uuid,
  p_method text, p_credential text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_employee public.employees%ROWTYPE;
  v_branch public.branches%ROWTYPE;
  v_pin_hash text;
  v_attempt public.attendance_kiosk_attempts%ROWTYPE;
  v_valid boolean := false;
  v_record public.attendance%ROWTYPE;
  v_at timestamp without time zone;
  v_clock timestamptz;
  v_today date;
  v_time text;
  v_minutes numeric;
  v_action text;
BEGIN
  IF auth.uid() IS NULL OR p_method NOT IN ('pin','qr') OR
     p_restaurant_id IS NULL OR p_branch_id IS NULL OR p_employee_id IS NULL THEN
    RAISE EXCEPTION 'Invalid kiosk request' USING ERRCODE = '22023';
  END IF;
  IF NOT public.erp_can_write_module_scope_text(
       p_restaurant_id::text,p_branch_id::text,'recordAttendance'
     ) OR NOT EXISTS (
       SELECT 1 FROM public.erp_memberships m
        WHERE m.user_id=auth.uid() AND m.restaurant_id=p_restaurant_id
          AND m.status='approved' AND m.role IN ('owner','manager')
     ) THEN
    RAISE EXCEPTION 'Access denied for attendance kiosk' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_branch FROM public.branches
    WHERE id=p_branch_id AND restaurant_id=p_restaurant_id AND is_active IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Branch unavailable' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_employee FROM public.employees
    WHERE id=p_employee_id AND restaurant_id=p_restaurant_id AND is_active IS TRUE
      AND (branch_id=p_branch_id OR (branch_id IS NULL AND branch=v_branch.branch_key));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee is not assigned to this branch' USING ERRCODE = '42501';
  END IF;

  -- Failed attempts are counted per signed-in kiosk session and branch.
  -- The row lock serializes concurrent guesses; repeated failures lock for 15 minutes.
  INSERT INTO public.attendance_kiosk_attempts(actor_id,branch_id)
    VALUES(auth.uid(),p_branch_id) ON CONFLICT DO NOTHING;
  SELECT * INTO v_attempt FROM public.attendance_kiosk_attempts
    WHERE actor_id=auth.uid() AND branch_id=p_branch_id FOR UPDATE;
  IF v_attempt.blocked_until IS NOT NULL AND v_attempt.blocked_until > clock_timestamp() THEN
    RAISE EXCEPTION 'Too many attempts; retry in 15 minutes' USING ERRCODE = 'P0001';
  END IF;
  IF v_attempt.window_start < clock_timestamp()-interval '15 minutes' THEN
    UPDATE public.attendance_kiosk_attempts SET attempts=0,window_start=clock_timestamp(),
      blocked_until=NULL WHERE actor_id=auth.uid() AND branch_id=p_branch_id;
    v_attempt.attempts:=0;
  END IF;
  IF p_method = 'pin' THEN
    IF p_credential ~ '^[0-9]{6}$' THEN
      SELECT pin_hash INTO v_pin_hash FROM public.attendance_kiosk_pins
        WHERE employee_id=p_employee_id AND restaurant_id=p_restaurant_id;
      v_valid := v_pin_hash IS NOT NULL AND
        extensions.crypt(p_credential,COALESCE(v_pin_hash,extensions.gen_salt('bf'))) = v_pin_hash;
    END IF;
  ELSE
    v_valid := length(coalesce(p_credential,'')) BETWEEN 20 AND 120
      AND v_employee.qr_code IS NOT NULL AND v_employee.qr_code = p_credential;
  END IF;
  IF NOT v_valid THEN
    UPDATE public.attendance_kiosk_attempts
      SET attempts=attempts+1,blocked_until=CASE
        WHEN attempts+1 >= 5 THEN clock_timestamp()+interval '15 minutes'
        ELSE NULL END WHERE actor_id=auth.uid() AND branch_id=p_branch_id;
    -- Return an error payload instead of throwing: attempted failure must commit.
    RETURN jsonb_build_object('type','error','title','Credential rejected',
      'message','Invalid credential or PIN not configured');
  END IF;
  UPDATE public.attendance_kiosk_attempts SET attempts=0,blocked_until=NULL,
    window_start=clock_timestamp() WHERE actor_id=auth.uid() AND branch_id=p_branch_id;

  -- Server clock is authoritative. A night shift may finish on the next date.
  v_clock := clock_timestamp();
  v_at := v_clock AT TIME ZONE 'Asia/Riyadh';
  v_today := v_at::date;
  v_time := to_char(v_at, 'HH24:MI');
  PERFORM pg_advisory_xact_lock(hashtext(p_employee_id::text));
  SELECT * INTO v_record FROM public.attendance
    WHERE restaurant_id=p_restaurant_id AND branch_id=p_branch_id
      AND employee_id=p_employee_id
      AND check_in IS NOT NULL AND check_out IS NULL
    ORDER BY date DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    v_minutes := extract(epoch FROM (v_at - (v_record.date::timestamp+v_record.check_in::time)))/60;
    IF v_minutes < 2 OR v_minutes > 960 THEN
      RETURN jsonb_build_object('type','error','title','Manager review required',
        'message','Open shift exceeds 16 hours; review attendance before retrying');
    END IF;
    UPDATE public.attendance SET check_out=v_time,
       hours_worked=round(v_minutes/60,2), updated_date=v_clock
     WHERE id=v_record.id;
    v_action:='out';
  ELSE
    IF EXISTS (SELECT 1 FROM public.attendance a
      WHERE a.restaurant_id=p_restaurant_id AND a.employee_id=p_employee_id
        AND a.date=v_today) THEN
      RETURN jsonb_build_object('type','error','title','Already recorded',
        'message','Attendance already recorded for today; manager review required');
    END IF;
    INSERT INTO public.attendance(
      restaurant_id,branch_id,employee_id,employee_name,branch,date,check_in,
      status,late_minutes,hours_worked,created_by,created_date
    ) VALUES (
      p_restaurant_id,p_branch_id,p_employee_id,v_employee.full_name,v_branch.branch_key,
      v_today,v_time,'present',0,0,auth.uid()::text,v_clock
    ) RETURNING * INTO v_record;
    v_action:='in';
  END IF;
  INSERT INTO public.attendance_kiosk_audit(
    actor_id,restaurant_id,branch_id,employee_id,attendance_id,event_type,credential_type
  ) VALUES(auth.uid(),p_restaurant_id,p_branch_id,p_employee_id,v_record.id,v_action,p_method);
  RETURN jsonb_build_object('type','success',
    'title',CASE WHEN v_action='in' THEN 'Checked In' ELSE 'Checked Out' END,
    'message',v_employee.full_name,'time',v_time,'action',v_action);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('type','error','title','Already recorded',
    'message','Attendance already recorded; refresh before retrying');
END;
$$;
REVOKE ALL ON FUNCTION public.erp_attendance_kiosk_event(uuid,uuid,uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_attendance_kiosk_event(uuid,uuid,uuid,text,text) TO authenticated;
