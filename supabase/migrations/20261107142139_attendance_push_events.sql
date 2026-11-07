-- Semantic attendance alerts, distinct from generic payroll-row mutations.
CREATE TABLE push_private.attendance_alert_keys (
 employee_id uuid NOT NULL, occurrence text NOT NULL, kind text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(employee_id,occurrence,kind)
);
REVOKE ALL ON push_private.attendance_alert_keys FROM PUBLIC,anon,authenticated;
CREATE TABLE push_private.attendance_alert_rollout (singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), started_at timestamptz NOT NULL DEFAULT clock_timestamp());
INSERT INTO push_private.attendance_alert_rollout DEFAULT VALUES;
REVOKE ALL ON push_private.attendance_alert_rollout FROM PUBLIC,anon,authenticated;

CREATE FUNCTION push_private.enqueue_attendance(p_employee uuid,p_occurrence text,p_kind text,p_at timestamptz,p_shift_start timestamptz DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.employees%ROWTYPE; ev uuid;
BEGIN
 IF p_kind NOT IN ('check_in','check_out','absent','present','missing_check_in') THEN RAISE EXCEPTION 'INVALID_ATTENDANCE_ALERT';END IF;
 SELECT * INTO e FROM public.employees WHERE id=p_employee;
 IF e.id IS NULL THEN RETURN NULL;END IF;
 INSERT INTO push_private.attendance_alert_keys(employee_id,occurrence,kind) VALUES(e.id,p_occurrence,p_kind) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RETURN NULL;END IF;
 INSERT INTO public.owner_record_events(restaurant_id,entity,action,record_id,reference,branch,actor_id,context)
 VALUES(e.restaurant_id,'attendance_alert','insert',p_occurrence,e.full_name,e.branch_id::text,auth.uid(),jsonb_build_object(
 'attendance_kind',p_kind,'employee_id',e.id,'employee_name',e.full_name,'occurred_at',p_at,'shift_start',p_shift_start)) RETURNING id INTO ev;
 INSERT INTO public.owner_push_deliveries(event_id,device_id)
 SELECT ev,d.id FROM public.owner_push_devices d WHERE d.restaurant_id=e.restaurant_id AND d.enabled AND EXISTS(
 SELECT 1 FROM public.erp_memberships m WHERE m.user_id=d.user_id AND m.restaurant_id=e.restaurant_id AND m.role='owner' AND m.status='approved');
 RETURN ev;
END $$;
REVOKE ALL ON FUNCTION push_private.enqueue_attendance(uuid,text,text,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION push_private.capture_attendance_session() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  PERFORM push_private.enqueue_attendance(NEW.employee_id,NEW.id::text,'check_in',NEW.checked_in_at,NEW.shift_start);
 END IF;
 IF NEW.checked_out_at IS NOT NULL AND (TG_OP='INSERT' OR OLD.checked_out_at IS NULL) THEN
  PERFORM push_private.enqueue_attendance(NEW.employee_id,NEW.id::text,'check_out',NEW.checked_out_at,NEW.shift_start);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION push_private.capture_attendance_session() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER attendance_session_push AFTER INSERT OR UPDATE ON public.attendance_shift_sessions FOR EACH ROW EXECUTE FUNCTION push_private.capture_attendance_session();

CREATE FUNCTION push_private.capture_attendance_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW;END IF;
 IF NEW.status='absent' THEN
  PERFORM push_private.enqueue_attendance(NEW.employee_id,NEW.id::text,'absent',clock_timestamp());
 ELSIF TG_OP='UPDATE' AND OLD.status='absent' AND NEW.status IN ('present','late','half_day') THEN
  PERFORM push_private.enqueue_attendance(NEW.employee_id,NEW.id::text,'present',clock_timestamp());
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION push_private.capture_attendance_status() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS owner_record_push ON public.attendance;
CREATE TRIGGER attendance_status_push AFTER INSERT OR UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION push_private.capture_attendance_status();

CREATE FUNCTION public.erp_attendance_missing_checkin_current(p_employee uuid,p_shift_start timestamptz) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE st jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.employee_attendance_schedules s JOIN public.employees e ON e.id=s.employee_id AND e.is_active AND e.restaurant_id=s.restaurant_id AND e.branch_id=s.branch_id WHERE s.employee_id=p_employee AND s.enabled) THEN RETURN false;END IF;
 st:=attendance_private.shift_state(p_employee);
 RETURN coalesce(st->>'phase'='not_checked_in' AND (st->>'shift_start')::timestamptz=p_shift_start,false);
END $$;
REVOKE ALL ON FUNCTION public.erp_attendance_missing_checkin_current(uuid,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_attendance_missing_checkin_current(uuid,timestamptz) TO service_role;

CREATE FUNCTION push_private.prepare_missing_attendance() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e record; st jsonb; starts timestamptz; rollout timestamptz; ev uuid; n integer:=0;
BEGIN
 SELECT started_at INTO rollout FROM push_private.attendance_alert_rollout;
 FOR e IN SELECT emp.id FROM public.employees emp JOIN public.employee_attendance_schedules s ON s.employee_id=emp.id AND s.restaurant_id=emp.restaurant_id AND s.branch_id=emp.branch_id AND s.enabled
 JOIN public.branches b ON b.id=emp.branch_id AND b.restaurant_id=emp.restaurant_id AND b.is_active
 WHERE emp.is_active AND EXISTS(SELECT 1 FROM public.erp_memberships m WHERE m.linked_entity_id=emp.id AND m.role='employee' AND m.status='approved' AND m.restaurant_id=emp.restaurant_id AND m.branch_id=emp.branch_id)
 LOOP
  st:=attendance_private.shift_state(e.id);starts:=(st->>'shift_start')::timestamptz;
  IF st->>'phase'='not_checked_in' AND starts+interval '15 minutes'>=rollout AND clock_timestamp()>=starts+interval '15 minutes'
  AND NOT EXISTS(SELECT 1 FROM public.attendance a WHERE a.employee_id=e.id AND a.date=(st->>'shift_date')::date AND a.status IN ('vacation','absent')) THEN
   ev:=push_private.enqueue_attendance(e.id,starts::text,'missing_check_in',clock_timestamp(),starts);
   IF ev IS NOT NULL THEN n:=n+1;END IF;
  END IF;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION push_private.prepare_missing_attendance() FROM PUBLIC,anon,authenticated;
SELECT cron.schedule('attendance-missing-checkin-alert','* * * * *','select push_private.prepare_missing_attendance()');
SELECT cron.schedule('attendance-alert-dedupe-retention','31 3 * * *','delete from push_private.attendance_alert_keys where created_at<clock_timestamp()-interval ''90 days''');
