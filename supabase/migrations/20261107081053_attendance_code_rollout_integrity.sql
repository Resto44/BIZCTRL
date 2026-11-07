-- Apply after the OTP frontend is ready. Legacy mobile callers cannot bypass expiry with a fixed PIN.
CREATE OR REPLACE FUNCTION attendance_private.prepare_due() RETURNS integer
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
  slot:=r.shift_day::text||':'||r.action||':'||r.updated_at::text;
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


CREATE OR REPLACE FUNCTION public.erp_attendance_mobile_event(p_pin text,p_latitude double precision,p_longitude double precision,p_accuracy_m double precision)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT public.erp_attendance_email_event(NULL,p_pin,p_latitude,p_longitude,p_accuracy_m)
$$;
REVOKE ALL ON FUNCTION public.erp_attendance_mobile_event(text,double precision,double precision,double precision) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_attendance_mobile_event(text,double precision,double precision,double precision) TO authenticated;
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname='attendance-scheduled-codes'),active:=true);
