-- Explicit employee consent, current shift only, latest point only. No route history.
CREATE TABLE attendance_private.live_presence (
 session_id uuid PRIMARY KEY REFERENCES public.attendance_shift_sessions(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL, token uuid NOT NULL, consent_at timestamptz NOT NULL,
 consent_version text NOT NULL DEFAULT 'shift-location-v1',
 latitude double precision, longitude double precision, accuracy_m double precision,
 received_at timestamptz
);
ALTER TABLE attendance_private.live_presence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON attendance_private.live_presence FROM PUBLIC,anon,authenticated;

CREATE FUNCTION attendance_private.authorize_presence(p_session uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 -- Same row lock as checkout: a late sample cannot resurrect a closed shift.
 PERFORM 1 FROM public.attendance_shift_sessions s
 JOIN public.employees e ON e.id=s.employee_id AND e.is_active AND e.branch_id=s.branch_id AND e.restaurant_id=s.restaurant_id
 JOIN public.branches b ON b.id=s.branch_id AND b.restaurant_id=s.restaurant_id AND b.is_active
 JOIN public.erp_memberships m ON m.linked_entity_id=e.id AND m.user_id=auth.uid()
  AND m.role='employee' AND m.status='approved' AND m.restaurant_id=s.restaurant_id AND m.branch_id=s.branch_id
 JOIN auth.users u ON u.id=m.user_id AND u.email_confirmed_at IS NOT NULL AND lower(btrim(u.email))=lower(btrim(e.email))
 WHERE s.id=p_session AND s.actor_id=auth.uid() AND s.checked_out_at IS NULL
 AND clock_timestamp()<least(s.shift_end,s.checked_in_at+interval '16 hours')
 FOR UPDATE OF s;
 IF NOT FOUND THEN RAISE EXCEPTION 'ACTIVE_OWN_SHIFT_REQUIRED' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION attendance_private.authorize_presence(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.erp_attendance_location_start(p_session uuid,p_consent_version text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_token uuid:=gen_random_uuid();
BEGIN
 PERFORM attendance_private.authorize_presence(p_session);
 IF p_consent_version IS DISTINCT FROM 'shift-location-v1' THEN RAISE EXCEPTION 'EXPLICIT_CONSENT_REQUIRED'; END IF;
 INSERT INTO attendance_private.live_presence(session_id,actor_id,token,consent_at)
 VALUES(p_session,auth.uid(),v_token,clock_timestamp())
 ON CONFLICT(session_id) DO UPDATE SET token=v_token,actor_id=auth.uid(),consent_at=clock_timestamp(),
 latitude=NULL,longitude=NULL,accuracy_m=NULL,received_at=NULL;
 RETURN v_token;
END $$;
CREATE FUNCTION public.erp_attendance_location_stop(p_session uuid,p_token uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM 1 FROM public.attendance_shift_sessions WHERE id=p_session AND actor_id=auth.uid() FOR UPDATE;
 DELETE FROM attendance_private.live_presence WHERE session_id=p_session AND actor_id=auth.uid() AND token=p_token;
END $$;
CREATE FUNCTION public.erp_attendance_location_update(p_session uuid,p_token uuid,p_latitude double precision,p_longitude double precision,p_accuracy_m double precision) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM attendance_private.authorize_presence(p_session);
 IF p_latitude IS NULL OR p_longitude IS NULL OR p_accuracy_m IS NULL
 OR NOT(p_latitude BETWEEN -90 AND 90) OR NOT(p_longitude BETWEEN -180 AND 180)
 OR NOT(p_accuracy_m>0 AND p_accuracy_m<=100000) THEN RAISE EXCEPTION 'INVALID_LOCATION'; END IF;
 UPDATE attendance_private.live_presence SET latitude=p_latitude,longitude=p_longitude,accuracy_m=p_accuracy_m,received_at=clock_timestamp()
 WHERE session_id=p_session AND actor_id=auth.uid() AND token=p_token
 AND coalesce(received_at,consent_at)>clock_timestamp()-interval '3 minutes';
 IF NOT FOUND THEN RAISE EXCEPTION 'LOCATION_CONSENT_EXPIRED' USING ERRCODE='42501'; END IF;
END $$;

CREATE FUNCTION public.erp_attendance_owner_locations(p_restaurant uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.erp_memberships WHERE user_id=auth.uid() AND restaurant_id=p_restaurant AND role='owner' AND status='approved') THEN
 RAISE EXCEPTION 'OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('session_id',q.id,'employee_name',q.full_name,'branch_name',q.branch_name,
 'received_at',q.received_at,'status',CASE WHEN NOT q.fresh THEN 'unknown' WHEN q.radius_m IS NULL OR q.accuracy_m>80 THEN 'uncertain'
 WHEN q.distance_m+q.accuracy_m<=q.radius_m THEN 'inside' WHEN q.distance_m-q.accuracy_m>q.radius_m THEN 'outside' ELSE 'uncertain' END,
 'latitude',CASE WHEN q.fresh THEN q.latitude END,'longitude',CASE WHEN q.fresh THEN q.longitude END,
 'accuracy_m',CASE WHEN q.fresh THEN q.accuracy_m END,'distance_m',CASE WHEN q.fresh THEN round(q.distance_m::numeric) END,
 'branch_latitude',q.branch_latitude,'branch_longitude',q.branch_longitude,'radius_m',q.radius_m
 ) ORDER BY q.full_name),'[]'::jsonb) INTO result FROM (
 SELECT s.id,e.full_name,b.name AS branch_name,p.received_at,p.latitude,p.longitude,p.accuracy_m,g.latitude branch_latitude,g.longitude branch_longitude,g.radius_m,
 coalesce(p.received_at>clock_timestamp()-interval '2 minutes' AND p.latitude IS NOT NULL
 AND clock_timestamp()<least(s.shift_end,s.checked_in_at+interval '16 hours') AND EXISTS(
 SELECT 1 FROM public.erp_memberships m WHERE m.user_id=p.actor_id AND m.role='employee' AND m.status='approved'
 AND m.linked_entity_id=e.id AND m.restaurant_id=s.restaurant_id AND m.branch_id=s.branch_id),false) AS fresh,
 2*6371000*asin(sqrt(least(1.0,greatest(0.0,power(sin(radians(p.latitude-g.latitude)/2),2)+cos(radians(g.latitude))*cos(radians(p.latitude))*power(sin(radians(p.longitude-g.longitude)/2),2))))) distance_m
 FROM public.attendance_shift_sessions s JOIN public.employees e ON e.id=s.employee_id AND e.is_active AND e.restaurant_id=s.restaurant_id AND e.branch_id=s.branch_id
 JOIN public.branches b ON b.id=s.branch_id AND b.restaurant_id=s.restaurant_id
 LEFT JOIN attendance_private.live_presence p ON p.session_id=s.id
 LEFT JOIN public.attendance_branch_geofences g ON g.branch_id=s.branch_id AND g.restaurant_id=s.restaurant_id
 WHERE s.restaurant_id=p_restaurant AND s.checked_out_at IS NULL
 ) q;
 RETURN jsonb_build_object('server_now',clock_timestamp(),'employees',result);
END $$;

CREATE FUNCTION attendance_private.clear_closed_presence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.checked_out_at IS NOT NULL THEN DELETE FROM attendance_private.live_presence WHERE session_id=NEW.id; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION attendance_private.clear_closed_presence() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER attendance_clear_live_location AFTER UPDATE OF checked_out_at ON public.attendance_shift_sessions
FOR EACH ROW EXECUTE FUNCTION attendance_private.clear_closed_presence();
-- No raw-point history. Clear stale points within the next cron minute; owner RPC hides them immediately at 120 seconds.
SELECT cron.schedule('attendance-live-location-cleanup','* * * * *',$job$
 UPDATE attendance_private.live_presence SET latitude=NULL,longitude=NULL,accuracy_m=NULL
 WHERE received_at<clock_timestamp()-interval '2 minutes' AND latitude IS NOT NULL;
 DELETE FROM attendance_private.live_presence p USING public.attendance_shift_sessions s
 WHERE s.id=p.session_id AND (s.checked_out_at IS NOT NULL OR clock_timestamp()>=least(s.shift_end,s.checked_in_at+interval '16 hours'));
$job$);
REVOKE ALL ON FUNCTION public.erp_attendance_location_start(uuid,text),public.erp_attendance_location_stop(uuid,uuid),public.erp_attendance_location_update(uuid,uuid,double precision,double precision,double precision),public.erp_attendance_owner_locations(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_attendance_location_start(uuid,text),public.erp_attendance_location_stop(uuid,uuid),public.erp_attendance_location_update(uuid,uuid,double precision,double precision,double precision),public.erp_attendance_owner_locations(uuid) TO authenticated;
