-- Restaurant customer-screen pairing durations. All existing legacy links
-- remain 8-hour tokens and keep the previous shift-close behavior.
-- No existing orders, shifts, payments, users or customer records are touched.
ALTER TABLE restaurant_pos_private.displays
  ADD COLUMN IF NOT EXISTS link_duration text NOT NULL DEFAULT '8h';
ALTER TABLE restaurant_pos_private.displays
  DROP CONSTRAINT IF EXISTS restaurant_display_duration_check;
ALTER TABLE restaurant_pos_private.displays
  ADD CONSTRAINT restaurant_display_duration_check
  CHECK (link_duration IN ('8h','24h','7d','1m','1y','permanent'));

-- Preserve ALL existing cashier financial/idempotency code. Patch only the
-- two exact, existing pairing/shift-close statements. A changed upstream
-- definition fails closed and rolls back this whole migration.
DO $migration$
DECLARE
  def text;
  old_shift_gate text := $oldgate$elsif s.id is null then raise exception 'Open a shift first.' using errcode='23514';$oldgate$;
  new_shift_gate text := $newgate$elsif s.id is null and p_command NOT IN ('unpair_display','pair_display') then raise exception 'Open a shift first.' using errcode='23514';$newgate$;
  old_pair text := $oldpair$elsif p_command='pair_display' then
  tok:=encode(extensions.gen_random_bytes(32),'hex');
  insert into restaurant_pos_private.displays(device_id,token_hash,expires_at,order_id) values(d.id,encode(extensions.digest(tok,'sha256'),'hex'),now()+interval '8 hours',(select id from restaurant_pos_private.orders where device_id=d.id and status='open'))
  on conflict(device_id) do update set token_hash=excluded.token_hash,topic=gen_random_uuid(),expires_at=excluded.expires_at,order_id=excluded.order_id;
  result:=jsonb_build_object('token',tok);$oldpair$;
  new_pair text := $newpair$elsif p_command='pair_display' then
  -- Managers/Owners may pair a fixed TV outside cashier shift hours.
  if s.id is null then
    perform restaurant_pos_private.guard(d.restaurant_id,d.branch_id,'viewOrders',true);
  end if;
  if coalesce(p_payload->>'display_duration','8h') NOT IN ('8h','24h','7d','1m','1y','permanent') then
    raise exception 'INVALID_CUSTOMER_DISPLAY_DURATION' using errcode='22023';
  end if;
  -- Yearly and never-expiring public kiosk bearer links are deliberately
  -- reserved to approved Owners and Managers of this specific branch.
  if coalesce(p_payload->>'display_duration','8h') in ('1y','permanent') then
    perform restaurant_pos_private.guard(d.restaurant_id,d.branch_id,'viewOrders',true);
  end if;
  tok:=encode(extensions.gen_random_bytes(32),'hex');
  insert into restaurant_pos_private.displays(device_id,token_hash,expires_at,order_id,link_duration)
  values(
    d.id,encode(extensions.digest(tok,'sha256'),'hex'),
    case coalesce(p_payload->>'display_duration','8h')
      when '8h' then now()+interval '8 hours'
      when '24h' then now()+interval '24 hours'
      when '7d' then now()+interval '7 days'
      when '1m' then now()+interval '1 month'
      when '1y' then now()+interval '1 year'
      when 'permanent' then 'infinity'::timestamptz
    end,
    (select id from restaurant_pos_private.orders where device_id=d.id and status='open'),
    coalesce(p_payload->>'display_duration','8h')
  )
  on conflict(device_id) do update set
    token_hash=excluded.token_hash,topic=gen_random_uuid(),expires_at=excluded.expires_at,
    order_id=excluded.order_id,link_duration=excluded.link_duration;
  result:=jsonb_build_object('token',tok,
    'duration',coalesce(p_payload->>'display_duration','8h'),
    'expires_at',case when coalesce(p_payload->>'display_duration','8h')='permanent'
      then null else (select expires_at from restaurant_pos_private.displays where device_id=d.id) end);$newpair$;
  old_close text := $oldclose$delete from restaurant_pos_private.displays where device_id=d.id;
 elsif p_command='new_sale' then$oldclose$;
  new_close text := $newclose$delete from restaurant_pos_private.displays where device_id=d.id AND link_duration='8h';
 elsif p_command='new_sale' then$newclose$;
BEGIN
  SELECT pg_get_functiondef('restaurant_pos_private.command(uuid,text,jsonb,uuid)'::regprocedure) INTO def;
  IF def IS NULL OR position(old_pair IN def)=0 OR position(old_close IN def)=0 OR position(old_shift_gate IN def)=0
     OR position(new_pair IN def)>0 THEN
    RAISE EXCEPTION 'CUSTOMER_DISPLAY_PAIR_SOURCE_CHANGED_ABORT';
  END IF;
  def:=replace(def,old_shift_gate,new_shift_gate);
  def:=replace(def,old_pair,new_pair);
  def:=replace(def,old_close,new_close);
  EXECUTE def;
END $migration$;

-- A surviving pairing must also remain readable when the cashier shift
-- closes. Legacy 8-hour links still require an active shift. On durable
-- links, a closed shift produces a neutral WAITING screen (no old orders).
DO $display$
DECLARE
 def text;
 old_gate text := $oldgate$if ds.device_id is null or not exists(
    select 1 from restaurant_pos_private.shifts s
    where s.device_id=ds.device_id and s.closed_at is null
  ) then
    raise exception 'Display expired or disconnected.' using errcode='42501';
  end if;$oldgate$;
 new_gate text := $newgate$if ds.device_id is null then
    raise exception 'Display expired or disconnected.' using errcode='42501';
  end if;
  if ds.link_duration='8h' and not exists(
    select 1 from restaurant_pos_private.shifts s
    where s.device_id=ds.device_id and s.closed_at is null
  ) then
    raise exception 'Display expired or disconnected.' using errcode='42501';
  end if;$newgate$;
 old_pin text := $oldpin$where x.id=ds.pinned_order_id and x.device_id=d.id
        and x.status in ('open','held','paid');$oldpin$;
 new_pin text := $newpin$where x.id=ds.pinned_order_id and x.device_id=d.id
        and x.status in ('open','held','paid')
        and exists(select 1 from restaurant_pos_private.shifts s
          where s.id=x.shift_id and s.device_id=d.id and s.closed_at is null);$newpin$;
 old_cart text := $oldcart$where x.id=ds.order_id and x.device_id=d.id
        and x.status in ('open','held','paid');$oldcart$;
 new_cart text := $newcart$where x.id=ds.order_id and x.device_id=d.id
        and x.status in ('open','held','paid')
        and exists(select 1 from restaurant_pos_private.shifts s
          where s.id=x.shift_id and s.device_id=d.id and s.closed_at is null);$newcart$;
BEGIN
 SELECT pg_get_functiondef('restaurant_pos_private.display(text)'::regprocedure) INTO def;
 IF def IS NULL OR position(old_gate IN def)=0 OR position(old_pin IN def)=0
  OR position(old_cart IN def)=0 THEN
  RAISE EXCEPTION 'CUSTOMER_DISPLAY_READER_SOURCE_CHANGED_ABORT';
 END IF;
 def:=replace(def,old_gate,new_gate);
 def:=replace(def,old_pin,new_pin);
 def:=replace(def,old_cart,new_cart);
 EXECUTE def;
END $display$;

COMMENT ON COLUMN restaurant_pos_private.displays.link_duration IS
 'Restaurant POS customer TV pairing policy. 8h is legacy; perpetual links use infinity, can be revoked/unpaired or rotated, and survive shift closure.';
NOTIFY pgrst,'reload schema';
