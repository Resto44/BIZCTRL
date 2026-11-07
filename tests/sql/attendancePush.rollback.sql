BEGIN;
DO $$
DECLARE e public.employees%ROWTYPE; actor uuid; owner_id uuid; local_now timestamp:=clock_timestamp() AT TIME ZONE 'Asia/Riyadh';
 sid uuid; aid uuid; starts timestamptz; c integer; expected integer; ev uuid;
BEGIN
 SELECT emp.* INTO e FROM public.employees emp JOIN public.erp_memberships m ON m.linked_entity_id=emp.id AND m.role='employee' AND m.status='approved'
 WHERE emp.is_active AND emp.branch_id IS NOT NULL LIMIT 1;
 SELECT user_id INTO owner_id FROM public.erp_memberships WHERE restaurant_id=e.restaurant_id AND role='owner' AND status='approved' LIMIT 1;
 SELECT user_id INTO actor FROM public.erp_memberships WHERE linked_entity_id=e.id AND role='employee' AND status='approved' LIMIT 1;
 IF actor IS NULL OR owner_id IS NULL THEN RAISE EXCEPTION 'No fixture';END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 INSERT INTO public.employees(restaurant_id,branch_id,branch,full_name,email,is_active)
 VALUES(e.restaurant_id,e.branch_id,e.branch,'ROLLBACK PUSH TEST',e.email,true) RETURNING * INTO e;
 UPDATE public.erp_memberships SET linked_entity_id=e.id WHERE user_id=actor AND role='employee' AND restaurant_id=e.restaurant_id;
 PERFORM public.erp_attendance_save_schedule(e.id,(local_now-interval '20 minutes')::time,(local_now+interval '4 hours')::time,ARRAY[0,1,2,3,4,5,6],true);
 UPDATE push_private.attendance_alert_rollout SET started_at=clock_timestamp()-interval '1 day';
 INSERT INTO public.attendance(restaurant_id,branch_id,employee_id,employee_name,date,status) VALUES(e.restaurant_id,e.branch_id,e.id,e.full_name,local_now::date,'vacation') RETURNING id INTO aid;
 PERFORM push_private.prepare_missing_attendance();
 IF EXISTS(SELECT 1 FROM public.owner_record_events WHERE context->>'employee_id'=e.id::text AND context->>'attendance_kind'='missing_check_in') THEN RAISE EXCEPTION 'Vacation incorrectly alerted';END IF;
 DELETE FROM public.attendance WHERE id=aid;
 PERFORM push_private.prepare_missing_attendance();PERFORM push_private.prepare_missing_attendance();
 SELECT count(*) INTO c FROM public.owner_record_events WHERE context->>'employee_id'=e.id::text AND context->>'attendance_kind'='missing_check_in';
 IF c<>1 THEN RAISE EXCEPTION 'Missing alert not idempotent: %',c;END IF;
 starts:=(attendance_private.shift_state(e.id)->>'shift_start')::timestamptz;
 IF NOT public.erp_attendance_missing_checkin_current(e.id,starts) THEN RAISE EXCEPTION 'Missing checkin current failed';END IF;
 INSERT INTO public.attendance_shift_sessions(employee_id,restaurant_id,branch_id,shift_start,shift_end,shift_date,checked_in_at,actor_id)
 VALUES(e.id,e.restaurant_id,e.branch_id,starts,starts+interval '4 hours',local_now::date,clock_timestamp(),actor) RETURNING id INTO sid;
 IF public.erp_attendance_missing_checkin_current(e.id,starts) THEN RAISE EXCEPTION 'Stale absence alert not suppressed';END IF;
 UPDATE public.attendance_shift_sessions SET checked_out_at=clock_timestamp() WHERE id=sid;
 UPDATE public.attendance_shift_sessions SET prior_daily_snapshot='{}'::jsonb WHERE id=sid;
 SELECT count(*) INTO c FROM public.owner_record_events WHERE record_id=sid::text AND entity='attendance_alert';
 IF c<>2 THEN RAISE EXCEPTION 'Entry/exit duplicated or missing: %',c;END IF;
 SELECT id INTO ev FROM public.owner_record_events WHERE record_id=sid::text AND context->>'attendance_kind'='check_in';
 SELECT count(*) INTO expected FROM public.owner_push_devices d WHERE d.restaurant_id=e.restaurant_id AND d.enabled AND EXISTS(SELECT 1 FROM public.erp_memberships m WHERE m.user_id=d.user_id AND m.restaurant_id=e.restaurant_id AND m.status='approved' AND m.role='owner');
 IF (SELECT count(*) FROM public.owner_push_deliveries WHERE event_id=ev)<>expected THEN RAISE EXCEPTION 'Device fanout mismatch';END IF;
 INSERT INTO public.attendance(restaurant_id,branch_id,employee_id,employee_name,date,status) VALUES(e.restaurant_id,e.branch_id,e.id,e.full_name,local_now::date,'absent') RETURNING id INTO aid;
 UPDATE public.attendance SET hours_worked=0 WHERE id=aid;
 UPDATE public.attendance SET status='present' WHERE id=aid;
 SELECT count(*) INTO c FROM public.owner_record_events WHERE record_id=aid::text AND entity='attendance_alert';
 IF c<>2 THEN RAISE EXCEPTION 'Absence/correction alerts incorrect';END IF;
 IF has_function_privilege('authenticated','push_private.prepare_missing_attendance()','EXECUTE') OR has_function_privilege('anon','public.erp_attendance_missing_checkin_current(uuid,timestamptz)','EXECUTE') THEN RAISE EXCEPTION 'Alert service exposed';END IF;
END $$;
ROLLBACK;
SELECT 'PASS: vacation exclusion, one missing-entry alert, stale alert suppression after entry, exactly one entry/exit alert, approved-owner device fanout, absence/correction events, service authorization. No fixtures or notifications persisted.' AS result;
