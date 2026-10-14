-- Secure employee attendance kiosk: PINs never leave the database as plaintext;
-- server controls time, tenant/branch scope, rate limits and check-in/out atomicity.
CREATE TABLE IF NOT EXISTS public.attendance_kiosk_pins (
  employee_id uuid PRIMARY KEY REFERENCES public.employees(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL,
  pin_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.attendance_kiosk_pins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.attendance_kiosk_pins FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.attendance_kiosk_attempts (
  actor_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz,
  PRIMARY KEY (actor_id, branch_id)
);
ALTER TABLE public.attendance_kiosk_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.attendance_kiosk_attempts FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.attendance_kiosk_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid NOT NULL,
  restaurant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  attendance_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('in', 'out')),
  credential_type text NOT NULL CHECK (credential_type IN ('pin', 'qr')),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.attendance_kiosk_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.attendance_kiosk_audit FROM PUBLIC, anon, authenticated;
CREATE INDEX IF NOT EXISTS idx_attendance_kiosk_audit_scope ON public.attendance_kiosk_audit(restaurant_id, branch_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.erp_attendance_set_kiosk_pin(
  p_restaurant_id uuid, p_employee_id uuid, p_pin text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $$
DECLARE v_employee public.employees%ROWTYPE; v_branch_id uuid;
BEGIN
  IF auth.uid() IS NULL OR p_pin !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'Enter a six-digit numeric PIN' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_employee FROM public.employees
   WHERE id = p_employee_id AND restaurant_id = p_restaurant_id AND is_active IS TRUE;
  SELECT id INTO v_branch_id FROM public.branches
    WHERE restaurant_id=p_restaurant_id AND is_active IS TRUE
      AND (id=v_employee.branch_id OR (v_employee.branch_id IS NULL AND branch_key=v_employee.branch))
    LIMIT 1;
  IF v_branch_id IS NULL OR NOT public.erp_can_write_module_scope_text(
    p_restaurant_id::text, v_branch_id::text, 'manageEmployees'
  ) THEN
    RAISE EXCEPTION 'Employee or permission unavailable' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.erp_memberships m WHERE m.user_id = auth.uid()
    AND m.restaurant_id = p_restaurant_id AND m.status = 'approved'
    AND m.role IN ('owner','manager')) THEN
    RAISE EXCEPTION 'Only authorized managers can set kiosk PINs' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.attendance_kiosk_pins(employee_id, restaurant_id, pin_hash)
    VALUES (v_employee.id, p_restaurant_id, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)))
  ON CONFLICT(employee_id) DO UPDATE SET pin_hash = EXCLUDED.pin_hash,
    restaurant_id = EXCLUDED.restaurant_id, updated_at = now();
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.erp_attendance_set_kiosk_pin(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_attendance_set_kiosk_pin(uuid,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.erp_attendance_issue_kiosk_qr(
  p_restaurant_id uuid, p_employee_id uuid, p_rotate boolean DEFAULT false
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $$
DECLARE v_employee public.employees%ROWTYPE; v_code text; v_branch_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_employee FROM public.employees
   WHERE id = p_employee_id AND restaurant_id = p_restaurant_id AND is_active IS TRUE;
  SELECT id INTO v_branch_id FROM public.branches
    WHERE restaurant_id=p_restaurant_id AND is_active IS TRUE
      AND (id=v_employee.branch_id OR (v_employee.branch_id IS NULL AND branch_key=v_employee.branch))
    LIMIT 1;
  IF v_branch_id IS NULL OR NOT public.erp_can_write_module_scope_text(
    p_restaurant_id::text, v_branch_id::text, 'manageEmployees'
  ) OR NOT EXISTS (SELECT 1 FROM public.erp_memberships m
    WHERE m.user_id = auth.uid() AND m.restaurant_id = p_restaurant_id
      AND m.status = 'approved' AND m.role IN ('owner','manager')) THEN
    RAISE EXCEPTION 'Employee or permission unavailable' USING ERRCODE = '42501';
  END IF;
  IF v_employee.qr_code IS NOT NULL AND v_employee.qr_code <> '' AND NOT p_rotate THEN
    RETURN v_employee.qr_code;
  END IF;
  v_code := 'KIOSK-' || encode(extensions.gen_random_bytes(24),'hex');
  UPDATE public.employees SET qr_code = v_code, updated_date = now()
    WHERE id = p_employee_id AND restaurant_id = p_restaurant_id;
  RETURN v_code;
END;
$$;
REVOKE ALL ON FUNCTION public.erp_attendance_issue_kiosk_qr(uuid,uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_attendance_issue_kiosk_qr(uuid,uuid,boolean) TO authenticated;

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
      AND employee_id=p_employee_id AND date IN (v_today,v_today-1)
      AND check_in IS NOT NULL AND check_out IS NULL
    ORDER BY date DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    v_minutes := extract(epoch FROM (v_at - (v_record.date::timestamp+v_record.check_in::time)))/60;
    IF v_minutes <= 0 OR v_minutes > 960 THEN
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
