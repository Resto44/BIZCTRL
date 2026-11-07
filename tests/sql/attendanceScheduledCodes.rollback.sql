BEGIN;
DO $$
DECLARE e public.employees%ROWTYPE; actor uuid; owner_id uuid; g public.attendance_branch_geofences%ROWTYPE;
 c uuid; res jsonb; code text; first_count integer; shift_start time; shift_end time; local_now timestamp:=clock_timestamp() at time zone 'Asia/Riyadh';
BEGIN
 SELECT e1.* INTO e FROM public.employees e1 JOIN public.erp_memberships m ON m.linked_entity_id=e1.id AND m.role='employee' AND m.status='approved'
 JOIN auth.users u ON u.id=m.user_id AND u.email_confirmed_at IS NOT NULL AND lower(u.email)=lower(e1.email)
 WHERE e1.is_active AND EXISTS(SELECT 1 FROM public.attendance_branch_geofences geo WHERE geo.branch_id=e1.branch_id) LIMIT 1;
 IF e.id IS NULL THEN RAISE EXCEPTION 'No verified fixture available'; END IF;
 SELECT user_id INTO actor FROM public.erp_memberships WHERE linked_entity_id=e.id AND role='employee' AND status='approved' LIMIT 1;
 SELECT user_id INTO owner_id FROM public.erp_memberships WHERE restaurant_id=e.restaurant_id AND role='owner' AND status='approved' LIMIT 1;
 SELECT * INTO g FROM public.attendance_branch_geofences WHERE branch_id=e.branch_id;
 -- Transaction-only fixture: all records and changes roll back below.
 UPDATE public.attendance SET check_in=to_char(local_now-interval '10 minutes','HH24:MI'),check_out=NULL
 WHERE employee_id=e.id AND date=local_now::date;
 IF NOT FOUND THEN RAISE EXCEPTION 'Expected existing daily test fixture'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 BEGIN
 PERFORM public.erp_attendance_save_schedule(e.id,'08:00','16:00',ARRAY[0,1,2,3,4,5,6],true);
 RAISE EXCEPTION 'Employee unexpectedly edited schedule';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 shift_start:=(local_now-interval '10 minutes')::time;shift_end:=(local_now+interval '5 minutes')::time;
 PERFORM public.erp_attendance_save_schedule(e.id,shift_start,shift_end,ARRAY[0,1,2,3,4,5,6],true);
 PERFORM attendance_private.prepare_due();
 SELECT count(*) INTO first_count FROM public.attendance_email_codes WHERE employee_id=e.id AND used_at IS NULL AND code_cipher IS NOT NULL;
 IF first_count<>1 THEN RAISE EXCEPTION 'Expected one queued code, got %',first_count; END IF;
 PERFORM attendance_private.prepare_due();
 IF (SELECT count(*) FROM public.attendance_email_codes WHERE employee_id=e.id AND used_at IS NULL AND code_cipher IS NOT NULL)<>1 THEN RAISE EXCEPTION 'Duplicate scheduler issue'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 res:=public.erp_attendance_code_status();code:=res->>'code';
 IF code IS NULL OR code !~ '^[0-9]{6}$' OR res->>'code_action'<>'out' THEN RAISE EXCEPTION 'Dashboard code missing'; END IF;
 SELECT id INTO c FROM public.attendance_email_codes WHERE employee_id=e.id AND used_at IS NULL AND code_cipher IS NOT NULL;
 IF (SELECT expires_at-issued_at FROM public.attendance_email_codes WHERE id=c) NOT BETWEEN interval '29 minutes 59 seconds' AND interval '30 minutes 1 second' THEN RAISE EXCEPTION 'Invalid TTL'; END IF;
 res:=public.erp_attendance_email_event(NULL,code,g.latitude,g.longitude,81);
 IF res->>'reason'<>'GPS_ACCURACY_REQUIRED' THEN RAISE EXCEPTION 'Accuracy not blocked'; END IF;
 res:=public.erp_attendance_email_event(NULL,code,0,0,5);
 IF res->>'reason'<>'OUTSIDE_BRANCH' THEN RAISE EXCEPTION 'Outside location not blocked'; END IF;
 res:=public.erp_attendance_email_event(NULL,'bad',g.latitude,g.longitude,5);
 IF res->>'reason'<>'OTP_INVALID' THEN RAISE EXCEPTION 'Wrong code not blocked'; END IF;
 UPDATE public.attendance_email_codes SET expires_at=now()-interval '1 second' WHERE id=c;
 res:=public.erp_attendance_email_event(NULL,code,g.latitude,g.longitude,5);
 IF res->>'reason'<>'OTP_EXPIRED' THEN RAISE EXCEPTION 'Expired code not blocked'; END IF;
 UPDATE public.attendance_email_codes SET expires_at=now()+interval '5 minutes' WHERE id=c;
 res:=public.erp_attendance_email_event(NULL,code,g.latitude,g.longitude,5);
 IF res->>'type'<>'success' OR res->>'action'<>'out' THEN RAISE EXCEPTION 'Valid checkout failed: %',res; END IF;
 res:=public.erp_attendance_code_status();
 IF res->>'code' IS NOT NULL OR res->>'phase'<>'completed' THEN RAISE EXCEPTION 'Consumed code visible'; END IF;
 res:=public.erp_attendance_email_event(NULL,code,g.latitude,g.longitude,5);
 IF res->>'reason'<>'OTP_NOT_REQUESTED' THEN RAISE EXCEPTION 'Replay not blocked'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 IF public.erp_attendance_code_status()->>'code' IS NOT NULL THEN RAISE EXCEPTION 'Owner leaked employee code'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: owner-only schedules; scheduled checkout; duplicate prevention; dashboard code; 30-minute TTL; inaccurate/outside GPS; invalid/expired OTP; valid checkout; replay rejection; no owner code disclosure. All fixture changes rolled back.' AS result;
