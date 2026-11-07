-- Distance-only history requires new, explicit v2 employee consent. No retrospective tracking.
CREATE OR REPLACE FUNCTION attendance_private.authorize_presence(p_session uuid) RETURNS void
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
 AND clock_timestamp()<(s.checked_in_at+interval '16 hours')
 FOR UPDATE OF s;
 IF NOT FOUND THEN RAISE EXCEPTION 'ACTIVE_OWN_SHIFT_REQUIRED' USING ERRCODE='42501'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.erp_attendance_location_start(p_session uuid,p_consent_version text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_token uuid:=gen_random_uuid();
BEGIN
 PERFORM attendance_private.authorize_presence(p_session);
 IF p_consent_version IS NULL OR p_consent_version NOT IN ('shift-location-v1','shift-history-v2') THEN RAISE EXCEPTION 'EXPLICIT_CONSENT_REQUIRED'; END IF;
 INSERT INTO attendance_private.live_presence(session_id,actor_id,token,consent_at,consent_version)
 VALUES(p_session,auth.uid(),v_token,clock_timestamp(),p_consent_version)
 ON CONFLICT(session_id) DO UPDATE SET token=v_token,actor_id=auth.uid(),consent_at=clock_timestamp(),consent_version=p_consent_version,
 latitude=NULL,longitude=NULL,accuracy_m=NULL,received_at=NULL;
 RETURN v_token;
END $$;
CREATE OR REPLACE FUNCTION public.erp_attendance_owner_locations(p_restaurant uuid) RETURNS jsonb
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
 AND clock_timestamp()<(s.checked_in_at+interval '16 hours') AND EXISTS(
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
CREATE TABLE attendance_private.location_history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 session_id uuid NOT NULL REFERENCES public.attendance_shift_sessions(id) ON DELETE CASCADE,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 kind text NOT NULL CHECK(kind IN ('started','sample','unknown','stopped','checkout')),
 distance_m numeric, accuracy_m numeric, radius_m integer,
 presence text CHECK(presence IN ('inside','outside','uncertain')),
 UNIQUE(session_id,recorded_at,kind)
);
CREATE INDEX attendance_location_history_session ON attendance_private.location_history(session_id,recorded_at DESC);
CREATE INDEX attendance_location_history_retention ON attendance_private.location_history(recorded_at);
ALTER TABLE attendance_private.location_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY location_history_no_direct_access ON attendance_private.location_history FOR ALL TO authenticated USING(false) WITH CHECK(false);
REVOKE ALL ON attendance_private.location_history FROM PUBLIC,anon,authenticated;

CREATE FUNCTION attendance_private.record_location_history() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE g public.attendance_branch_geofences%ROWTYPE; s public.attendance_shift_sessions%ROWTYPE;
 d double precision; last_sample timestamptz; previous_presence text; next_presence text;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.consent_version='shift-history-v2' THEN
   SELECT * INTO s FROM public.attendance_shift_sessions WHERE id=OLD.session_id;
   INSERT INTO attendance_private.location_history(session_id,kind)
   VALUES(OLD.session_id,CASE WHEN s.checked_out_at IS NOT NULL THEN 'checkout' ELSE 'stopped' END);
  END IF;
  RETURN OLD;
 END IF;
 IF NEW.consent_version<>'shift-history-v2' THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' OR NEW.token IS DISTINCT FROM OLD.token THEN
  INSERT INTO attendance_private.location_history(session_id,kind) VALUES(NEW.session_id,'started');
 END IF;
 IF NEW.latitude IS NULL OR NEW.received_at IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.received_at IS NOT DISTINCT FROM OLD.received_at THEN RETURN NEW; END IF;
 SELECT recorded_at,presence INTO last_sample,previous_presence FROM attendance_private.location_history WHERE session_id=NEW.session_id AND kind='sample' ORDER BY recorded_at DESC LIMIT 1;
 -- One historical sample per minute, plus every inside/outside/uncertain transition.
 SELECT * INTO s FROM public.attendance_shift_sessions WHERE id=NEW.session_id;
 SELECT * INTO g FROM public.attendance_branch_geofences WHERE branch_id=s.branch_id AND restaurant_id=s.restaurant_id;
 IF g.branch_id IS NULL THEN RETURN NEW; END IF;
 d:=2*6371000*asin(sqrt(least(1.0,greatest(0.0,power(sin(radians(NEW.latitude-g.latitude)/2),2)+cos(radians(g.latitude))*cos(radians(NEW.latitude))*power(sin(radians(NEW.longitude-g.longitude)/2),2)))));
 next_presence:=CASE WHEN NEW.accuracy_m>80 THEN 'uncertain' WHEN d+NEW.accuracy_m<=g.radius_m THEN 'inside' WHEN d-NEW.accuracy_m>g.radius_m THEN 'outside' ELSE 'uncertain' END;
 IF last_sample>NEW.received_at-interval '60 seconds' AND previous_presence=next_presence THEN RETURN NEW; END IF;
 INSERT INTO attendance_private.location_history(session_id,recorded_at,kind,distance_m,accuracy_m,radius_m,presence)
 VALUES(NEW.session_id,NEW.received_at,'sample',round(d::numeric,2),round(NEW.accuracy_m::numeric,2),g.radius_m,
 next_presence);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION attendance_private.record_location_history() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER attendance_location_history AFTER INSERT OR UPDATE OR DELETE ON attendance_private.live_presence
FOR EACH ROW EXECUTE FUNCTION attendance_private.record_location_history();

CREATE FUNCTION public.erp_attendance_location_history(p_restaurant uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_restaurant IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.erp_memberships WHERE user_id=auth.uid() AND restaurant_id=p_restaurant AND role='owner' AND status='approved') THEN
 RAISE EXCEPTION 'OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('session_id',s.id,'employee_name',e.full_name,'shift_date',s.shift_date,
 'checked_in_at',s.checked_in_at,'checked_out_at',s.checked_out_at,'branch_name',b.name,
 'samples',stats.samples,'inside_samples',stats.inside_samples,'outside_samples',stats.outside_samples,'uncertain_samples',stats.uncertain_samples,
 'maximum_distance_m',stats.maximum_distance_m,'last_sample_at',stats.last_sample_at,
 'events',(SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.recorded_at DESC),'[]'::jsonb) FROM (
 SELECT recorded_at,kind,distance_m,accuracy_m,radius_m,presence FROM attendance_private.location_history h WHERE h.session_id=s.id ORDER BY recorded_at DESC LIMIT 30) v)
 ) ORDER BY s.checked_in_at DESC),'[]'::jsonb) INTO result
 FROM (SELECT ss.* FROM public.attendance_shift_sessions ss WHERE ss.checked_in_at>clock_timestamp()-interval '90 days' AND
 ((p_restaurant IS NOT NULL AND ss.restaurant_id=p_restaurant) OR (p_restaurant IS NULL AND EXISTS(
 SELECT 1 FROM public.erp_memberships m WHERE m.user_id=auth.uid() AND m.status='approved' AND m.role='employee'
 AND m.linked_entity_id=ss.employee_id AND m.restaurant_id=ss.restaurant_id AND m.branch_id=ss.branch_id)))
 ORDER BY ss.checked_in_at DESC LIMIT 20) s
 JOIN public.employees e ON e.id=s.employee_id JOIN public.branches b ON b.id=s.branch_id
 CROSS JOIN LATERAL (SELECT count(*) FILTER(WHERE kind='sample') samples,count(*) FILTER(WHERE presence='inside') inside_samples,
 count(*) FILTER(WHERE presence='outside') outside_samples,count(*) FILTER(WHERE presence='uncertain') uncertain_samples,
 max(distance_m) maximum_distance_m,max(recorded_at) FILTER(WHERE kind='sample') last_sample_at
 FROM attendance_private.location_history h WHERE h.session_id=s.id) stats;
 RETURN jsonb_build_object('sessions',result,'retention_days',90,'server_now',clock_timestamp());
END $$;
REVOKE ALL ON FUNCTION public.erp_attendance_location_history(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_attendance_location_history(uuid) TO authenticated;
SELECT cron.schedule('attendance-live-location-cleanup','* * * * *',$job$
 INSERT INTO attendance_private.location_history(session_id,recorded_at,kind)
 SELECT p.session_id,p.received_at+interval '2 minutes','unknown' FROM attendance_private.live_presence p
 JOIN public.attendance_shift_sessions s ON s.id=p.session_id
 WHERE p.consent_version='shift-history-v2' AND p.received_at<clock_timestamp()-interval '2 minutes'
 AND s.checked_out_at IS NULL ON CONFLICT DO NOTHING;
 UPDATE attendance_private.live_presence SET latitude=NULL,longitude=NULL,accuracy_m=NULL
 WHERE received_at<clock_timestamp()-interval '2 minutes' AND latitude IS NOT NULL;
 DELETE FROM attendance_private.live_presence p USING public.attendance_shift_sessions s
 WHERE s.id=p.session_id AND (s.checked_out_at IS NOT NULL OR clock_timestamp()>=s.checked_in_at+interval '16 hours');
 DELETE FROM attendance_private.location_history WHERE recorded_at<clock_timestamp()-interval '90 days';
$job$);
