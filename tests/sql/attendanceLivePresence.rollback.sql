BEGIN;
DO $$
DECLARE e public.employees%ROWTYPE; actor uuid; owner_id uuid; geo public.attendance_branch_geofences%ROWTYPE;
 sid uuid; token uuid; result jsonb;
BEGIN
 SELECT emp.* INTO e FROM public.employees emp JOIN public.erp_memberships m ON m.linked_entity_id=emp.id AND m.role='employee' AND m.status='approved'
 WHERE emp.is_active AND EXISTS(SELECT 1 FROM public.attendance_branch_geofences g WHERE g.branch_id=emp.branch_id) LIMIT 1;
 SELECT user_id INTO owner_id FROM public.erp_memberships WHERE restaurant_id=e.restaurant_id AND role='owner' AND status='approved' LIMIT 1;
 SELECT * INTO geo FROM public.attendance_branch_geofences WHERE branch_id=e.branch_id;
 SELECT user_id INTO actor FROM public.erp_memberships WHERE linked_entity_id=e.id AND role='employee' AND status='approved' LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'No verified fixture'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 INSERT INTO public.employees(restaurant_id,branch_id,branch,full_name,email,is_active)
 VALUES(e.restaurant_id,e.branch_id,e.branch,'ROLLBACK LOCATION TEST',e.email,true) RETURNING * INTO e;
 UPDATE public.erp_memberships SET linked_entity_id=e.id WHERE user_id=actor AND role='employee' AND restaurant_id=e.restaurant_id;
 INSERT INTO public.attendance_shift_sessions(employee_id,restaurant_id,branch_id,shift_start,shift_end,shift_date,checked_in_at,actor_id)
 VALUES(e.id,e.restaurant_id,e.branch_id,now()-interval '5 minutes',now()+interval '1 hour',current_date,now()-interval '5 minutes',actor) RETURNING id INTO sid;
 BEGIN PERFORM public.erp_attendance_location_start(sid,'shift-location-v1');RAISE EXCEPTION 'Owner remotely started sharing';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 BEGIN PERFORM public.erp_attendance_owner_locations(e.restaurant_id);RAISE EXCEPTION 'Employee read owner locations';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.erp_attendance_location_update(sid,gen_random_uuid(),geo.latitude,geo.longitude,5);RAISE EXCEPTION 'Location before consent';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 token:=public.erp_attendance_location_start(sid,'shift-location-v1');
 PERFORM public.erp_attendance_location_update(sid,token,geo.latitude,geo.longitude,5);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 SELECT x INTO result FROM jsonb_array_elements(public.erp_attendance_owner_locations(e.restaurant_id)->'employees') x WHERE x->>'session_id'=sid::text;
 IF result->>'status'<>'inside' OR result->>'latitude' IS NULL THEN RAISE EXCEPTION 'Fresh inside point missing: %',result;END IF;
 BEGIN PERFORM public.erp_attendance_owner_locations(gen_random_uuid());RAISE EXCEPTION 'Owner read other tenant';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 UPDATE attendance_private.live_presence SET received_at=now()-interval '121 seconds' WHERE session_id=sid;
 SELECT x INTO result FROM jsonb_array_elements(public.erp_attendance_owner_locations(e.restaurant_id)->'employees') x WHERE x->>'session_id'=sid::text;
 IF result->>'status'<>'unknown' OR result->>'latitude' IS NOT NULL THEN RAISE EXCEPTION 'Stale point exposed';END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 PERFORM public.erp_attendance_location_update(sid,token,geo.latitude+0.01,geo.longitude,5);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 SELECT x INTO result FROM jsonb_array_elements(public.erp_attendance_owner_locations(e.restaurant_id)->'employees') x WHERE x->>'session_id'=sid::text;
 IF result->>'status'<>'outside' THEN RAISE EXCEPTION 'Outside point missing'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 PERFORM public.erp_attendance_location_stop(sid,token);
 BEGIN PERFORM public.erp_attendance_location_update(sid,token,geo.latitude,geo.longitude,5);RAISE EXCEPTION 'Stopped sharing accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 token:=public.erp_attendance_location_start(sid,'shift-location-v1');
 PERFORM public.erp_attendance_location_update(sid,token,geo.latitude,geo.longitude,5);
 UPDATE public.attendance_shift_sessions SET checked_out_at=clock_timestamp() WHERE id=sid;
 IF EXISTS(SELECT 1 FROM attendance_private.live_presence WHERE session_id=sid) THEN RAISE EXCEPTION 'Checkout retained coordinates';END IF;
 BEGIN PERFORM public.erp_attendance_location_update(sid,token,geo.latitude,geo.longitude,5);RAISE EXCEPTION 'Offshift update accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 IF has_table_privilege('authenticated','attendance_private.live_presence','SELECT') OR has_function_privilege('anon','public.erp_attendance_owner_locations(uuid)','EXECUTE') THEN RAISE EXCEPTION 'Direct or anonymous access allowed'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: explicit employee-only consent, fresh/inside/outside/stale states, owner tenant isolation, no direct access, stop revocation, checkout purge, offshift rejection. No fixture data persisted.' AS result;
