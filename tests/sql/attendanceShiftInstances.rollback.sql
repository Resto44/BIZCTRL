BEGIN;
DO $$
DECLARE e public.employees%ROWTYPE; actor uuid; owner_id uuid; geo public.attendance_branch_geofences%ROWTYPE;
 st jsonb; result jsonb; code text; baseline numeric; session_id uuid; local_now timestamp:=clock_timestamp() AT TIME ZONE 'Asia/Riyadh';
BEGIN
 -- Synthetic employee exists only inside this rolled-back transaction. The verified account link is restored by rollback.
 SELECT emp.* INTO e FROM public.employees emp JOIN public.erp_memberships member ON member.linked_entity_id=emp.id AND member.role='employee' AND member.status='approved'
 WHERE emp.is_active AND EXISTS(SELECT 1 FROM public.attendance_branch_geofences g WHERE g.branch_id=emp.branch_id) LIMIT 1;
 IF e.id IS NULL THEN RAISE EXCEPTION 'No branch fixture available'; END IF;
 SELECT user_id INTO owner_id FROM public.erp_memberships WHERE restaurant_id=e.restaurant_id AND role='owner' AND status='approved' LIMIT 1;
 SELECT * INTO geo FROM public.attendance_branch_geofences WHERE branch_id=e.branch_id;
 SELECT user_id INTO actor FROM public.erp_memberships WHERE linked_entity_id=e.id AND role='employee' AND status='approved' LIMIT 1;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 INSERT INTO public.employees(restaurant_id,branch_id,branch,full_name,email,is_active)
 VALUES(e.restaurant_id,e.branch_id,e.branch,'ROLLBACK ATTENDANCE TEST',e.email,true) RETURNING * INTO e;
 UPDATE public.erp_memberships SET linked_entity_id=e.id WHERE user_id=actor AND role='employee' AND restaurant_id=e.restaurant_id;
 INSERT INTO public.attendance(restaurant_id,branch_id,employee_id,employee_name,date,check_in,check_out,status,hours_worked)
 VALUES(e.restaurant_id,e.branch_id,e.id,e.full_name,local_now::date,'00:40','00:52','present',0.20);
 baseline:=0.20;
 -- Only rollback-scoped fixture adjustments. No worker can see uncommitted codes.
 UPDATE public.attendance_email_codes SET issued_at=now()-interval '2 hours' WHERE employee_id=e.id;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 PERFORM public.erp_attendance_save_schedule(e.id,(local_now+interval '5 minutes')::time,(local_now+interval '8 hours')::time,ARRAY[0,1,2,3,4,5,6],true);
 st:=attendance_private.shift_state(e.id,now()-interval '15 minutes');
 IF st->>'phase'<>'waiting' OR (st->>'can_check_in')::boolean OR NOT (st->>'can_request_code')::boolean THEN RAISE EXCEPTION 'Pre-shift window wrong: %',st; END IF;
 st:=attendance_private.shift_state(e.id);
 IF st->>'phase'<>'not_checked_in' OR st->>'previous_check_in' IS NULL THEN RAISE EXCEPTION 'Earlier closed attendance still blocks new shift'; END IF;
 result:=public.erp_attendance_owner_issue_code(e.id);
 IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'Owner issuance failed'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 st:=public.erp_attendance_code_status(); code:=st->>'code';
 IF code IS NULL OR st->>'code_action'<>'in' THEN RAISE EXCEPTION 'Owner code not on employee dashboard'; END IF;
 BEGIN
 PERFORM public.erp_attendance_owner_issue_code(e.id);RAISE EXCEPTION 'Employee unexpectedly used owner issuance';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 result:=public.erp_attendance_email_event(NULL,code,0,0,5);
 IF result->>'reason'<>'OUTSIDE_BRANCH' THEN RAISE EXCEPTION 'Outside branch allowed'; END IF;
 result:=public.erp_attendance_email_event(NULL,code,geo.latitude,geo.longitude,5);
 IF result->>'action'<>'in' OR result->>'type'<>'success' THEN RAISE EXCEPTION 'New shift entry blocked: %',result; END IF;
 SELECT id INTO session_id FROM public.attendance_shift_sessions WHERE employee_id=e.id AND checked_out_at IS NULL;
 IF session_id IS NULL THEN RAISE EXCEPTION 'Shift session missing'; END IF;
 IF (SELECT prior_daily_snapshot->>'check_out' FROM public.attendance_shift_sessions WHERE id=session_id) IS NULL THEN RAISE EXCEPTION 'Prior history lost'; END IF;
 IF (SELECT count(*) FROM public.attendance WHERE employee_id=e.id AND date=local_now::date)<>1 THEN RAISE EXCEPTION 'Duplicate payroll day'; END IF;
 IF (SELECT hours_worked FROM public.attendance WHERE employee_id=e.id AND date=local_now::date)<>baseline THEN RAISE EXCEPTION 'Earlier worked hours lost'; END IF;
 UPDATE public.attendance_shift_sessions SET checked_in_at=now()-interval '3 minutes' WHERE id=session_id;
 UPDATE public.attendance_email_codes SET issued_at=now()-interval '2 hours' WHERE employee_id=e.id;
 PERFORM public.erp_attendance_request_code('out');
 st:=public.erp_attendance_code_status();code:=st->>'code';
 IF code IS NULL OR st->>'code_action'<>'out' THEN RAISE EXCEPTION 'Exit code missing'; END IF;
 result:=public.erp_attendance_email_event(NULL,code,geo.latitude,geo.longitude,5);
 IF result->>'action'<>'out' THEN RAISE EXCEPTION 'Exit failed: %',result; END IF;
 IF (SELECT hours_worked FROM public.attendance WHERE employee_id=e.id AND date=local_now::date)<baseline+0.05 THEN RAISE EXCEPTION 'Hours not accumulated'; END IF;
 st:=public.erp_attendance_code_status();
 IF st->>'phase'<>'completed' OR st->>'code' IS NOT NULL THEN RAISE EXCEPTION 'Current completed state wrong'; END IF;
 result:=public.erp_attendance_email_event(NULL,code,geo.latitude,geo.longitude,5);
 IF result->>'type'='success' THEN RAISE EXCEPTION 'Replay accepted'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: prior completed punch preserved; new shift opens; pre-shift request window; owner-to-employee code; owner authorization; GPS rejection; new entry and exit; one payroll day; accumulated hours; replay blocked. No fixture changes persisted.' AS result;
