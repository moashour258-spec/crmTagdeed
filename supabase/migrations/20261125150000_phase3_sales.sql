-- Phase 3: reservation, price approval, and all-or-nothing selling.

create or replace function private.release_expired_reservations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec record;
  released integer := 0;
begin
  for rec in
    update public.reservations
    set status = 'expired', ended_at = now()
    where status = 'active' and expires_at <= now()
    returning product_id, component_id
  loop
    released := released + 1;
    if rec.component_id is not null then
      update public.product_components component
      set status = 'available'
      where component.id = rec.component_id
        and component.status = 'reserved'
        and not exists (
          select 1 from public.reservations active
          where active.component_id = rec.component_id and active.status = 'active'
        );
    else
      update public.products product
      set status = 'available'
      where product.id = rec.product_id
        and product.status = 'reserved'
        and not exists (
          select 1 from public.reservations active
          where active.product_id = rec.product_id
            and active.component_id is null
            and active.status = 'active'
        );
    end if;
  end loop;
  return released;
end;
$$;

revoke all on function private.release_expired_reservations() from public;

create or replace function private.broadcast_catalog(p_product uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  code text;
begin
  select public_code into code from public.products where id = p_product;
  if code is null then
    return;
  end if;
  perform pg_notify(
    'tajdeed_catalog',
    json_build_object('public_code', code, 'status', p_status)::text
  );
end;
$$;

revoke all on function private.broadcast_catalog(uuid, text) from public;

create or replace function private.setting_number(p_key text, p_fallback numeric)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.json_number(p_key), p_fallback);
$$;

revoke all on function private.setting_number(text, numeric) from public;

create or replace function private.record_audit(p_action text, p_entity text, p_id uuid, p_before jsonb, p_after jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values, visibility)
  values (auth.uid(), p_action, p_entity, p_id, p_before, p_after, 'operational');
$$;

revoke all on function private.record_audit(text, text, uuid, jsonb, jsonb) from public;

create or replace function public.expire_reservations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  released integer;
begin
  released := private.release_expired_reservations();
  insert into public.notifications (user_id, type, title, body, entity_type, entity_id)
  select reservation.user_id, 'reservation_expiring', 'حجزك على وشك الانتهاء', product.name,
         'reservations', reservation.id
  from public.reservations reservation
  join public.products product on product.id = reservation.product_id
  where reservation.status = 'active'
    and reservation.expires_at <= now() + interval '6 hours'
    and not exists (
      select 1 from public.notifications notice
      where notice.entity_id = reservation.id and notice.type = 'reservation_expiring'
    );
  return released;
end;
$$;

create or replace function public.reserve_product(product_id uuid, component_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  product public.products%rowtype;
  component public.product_components%rowtype;
  active_count integer;
  cap integer;
  hours integer;
  reservation_id uuid;
begin
  perform private.assert_sales_or_admin();
  perform private.release_expired_reservations();

  select * into product from public.products where id = reserve_product.product_id for update;
  if product.id is null then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;

  if reserve_product.component_id is not null then
    if product.status not in ('available', 'partially_sold') then
      raise exception 'unit_unavailable' using errcode = '23514';
    end if;
    select * into component
    from public.product_components
    where id = reserve_product.component_id and product_id = product.id
    for update;
    if component.id is null or component.status <> 'available' then
      raise exception 'unit_unavailable' using errcode = '23514';
    end if;
  elsif product.status <> 'available' then
    raise exception 'unit_unavailable' using errcode = '23514';
  elsif exists (
    select 1 from public.product_components piece
    where piece.product_id = product.id and piece.status <> 'available'
  ) then
    raise exception 'unit_unavailable' using errcode = '23514';
  end if;

  select count(*) into active_count
  from public.reservations
  where user_id = actor and status = 'active';
  cap := private.setting_number('max_active_reservations', 5);
  if active_count >= cap then
    raise exception 'reservation_cap' using errcode = '23514';
  end if;

  hours := private.setting_number('reservation_hours', 48);
  begin
    insert into public.reservations (product_id, component_id, user_id, status, reason, expires_at)
    values (
      product.id,
      reserve_product.component_id,
      actor,
      'active',
      'manual',
      now() + make_interval(hours => hours)
    )
    returning id into reservation_id;
  exception
    when unique_violation then
      raise exception 'unit_unavailable' using errcode = '23514';
  end;

  if reserve_product.component_id is not null then
    update public.product_components set status = 'reserved' where id = component.id;
  else
    update public.products set status = 'reserved' where id = product.id;
  end if;

  perform private.broadcast_catalog(product.id, 'reserved');
  perform private.record_audit('reservation_created', 'reservations', reservation_id, null, jsonb_build_object(
    'public_code', product.public_code,
    'status', 'reserved'
  ));
  return reservation_id;
end;
$$;

create or replace function public.reserve_by_code(public_code text, component_suffix text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  product_id uuid;
  component_id uuid;
begin
  perform private.assert_sales_or_admin();
  select id into product_id from public.products where products.public_code = reserve_by_code.public_code;
  if product_id is null then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;
  if component_suffix is not null then
    select id into component_id
    from public.product_components
    where product_id = product_id and suffix = component_suffix;
    if component_id is null then
      raise exception 'product_not_found' using errcode = 'P0002';
    end if;
  end if;
  return public.reserve_product(product_id, component_id);
end;
$$;

create or replace function public.cancel_reservation(id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  reservation public.reservations%rowtype;
begin
  perform private.assert_sales_or_admin();
  select * into reservation from public.reservations where reservations.id = cancel_reservation.id for update;
  if reservation.id is null or reservation.status <> 'active' then
    raise exception 'reservation_not_found' using errcode = 'P0002';
  end if;
  if reservation.user_id <> actor and not private.is_admin() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;
  update public.reservations target
  set status = 'cancelled', ended_at = now()
  where target.id = reservation.id;
  if reservation.component_id is not null then
    update public.product_components piece
    set status = 'available'
    where piece.id = reservation.component_id and piece.status = 'reserved';
  else
    update public.products product
    set status = 'available'
    where product.id = reservation.product_id and product.status = 'reserved';
  end if;
  perform private.broadcast_catalog(reservation.product_id, 'available');
  perform private.record_audit('reservation_cancelled', 'reservations', reservation.id, null, jsonb_build_object('status', 'available'));
end;
$$;

create or replace function public.extend_reservation(id uuid, hours integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation public.reservations%rowtype;
begin
  perform private.assert_admin();
  if extend_reservation.hours is null or extend_reservation.hours < 1 or extend_reservation.hours > 168 then
    raise exception 'invalid_hours' using errcode = '23514';
  end if;
  select * into reservation from public.reservations where reservations.id = extend_reservation.id for update;
  if reservation.id is null or reservation.status <> 'active' then
    raise exception 'reservation_not_found' using errcode = 'P0002';
  end if;
  update public.reservations target
  set expires_at = target.expires_at + make_interval(hours => extend_reservation.hours)
  where target.id = reservation.id;
  perform private.record_audit('reservation_extended', 'reservations', reservation.id, null, jsonb_build_object('hours', extend_reservation.hours));
end;
$$;

create or replace function public.request_price_approval(reservation_id uuid, price numeric, note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  reservation public.reservations%rowtype;
  product_name text;
  request_id uuid;
  admin_id uuid;
begin
  perform private.assert_sales_or_admin();
  if price is null or price <= 0 then
    raise exception 'invalid_price' using errcode = '23514';
  end if;
  select * into reservation from public.reservations where id = request_price_approval.reservation_id for update;
  if reservation.id is null or reservation.status <> 'active' or reservation.user_id <> actor then
    raise exception 'reservation_not_found' using errcode = 'P0002';
  end if;
  update public.reservations set reason = 'price_request' where id = reservation.id;
  insert into public.price_requests (reservation_id, product_id, component_id, requested_by, requested_price, note)
  values (
    reservation.id, reservation.product_id, reservation.component_id, actor, request_price_approval.price, request_price_approval.note
  )
  returning id into request_id;
  select name into product_name from public.products where id = reservation.product_id;
  for admin_id in
    select profile.id
    from public.profiles profile
    join public.user_roles user_role on user_role.user_id = profile.id
    where user_role.role = 'admin' and profile.status = 'active'
  loop
    insert into public.notifications (user_id, type, title, body, entity_type, entity_id)
    values (admin_id, 'price_request', 'طلب موافقة سعر', product_name, 'price_requests', request_id);
  end loop;
  perform private.record_audit('price_requested', 'price_requests', request_id, null, jsonb_build_object('product', product_name));
  return request_id;
end;
$$;

create or replace function public.decide_price_request(id uuid, approve boolean, price numeric, note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request public.price_requests%rowtype;
  product_name text;
begin
  perform private.assert_admin();
  select * into request from public.price_requests where price_requests.id = decide_price_request.id for update;
  if request.id is null or request.status <> 'pending' then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;
  if approve then
    if price is null or price <= 0 then
      raise exception 'invalid_price' using errcode = '23514';
    end if;
    update public.price_requests target
    set status = 'approved', approved_price = decide_price_request.price, decision_note = decide_price_request.note, decided_by = auth.uid(), decided_at = now()
    where target.id = request.id;
  else
    update public.price_requests target
    set status = 'rejected', decision_note = decide_price_request.note, decided_by = auth.uid(), decided_at = now()
    where target.id = request.id;
  end if;
  select product.name into product_name from public.products product where product.id = request.product_id;
  insert into public.notifications (user_id, type, title, body, entity_type, entity_id)
  values (
    request.requested_by,
    'price_decision',
    case when approve then 'تمت الموافقة على السعر' else 'تم رفض طلب السعر' end,
    product_name,
    'price_requests',
    request.id
  );
  perform private.record_audit('price_decided', 'price_requests', request.id, null, jsonb_build_object('approved', approve, 'product', product_name));
end;
$$;

create or replace function private.price_is_allowed(
  p_product uuid,
  p_component uuid,
  p_price numeric,
  p_user uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  floor_price numeric(12, 2);
begin
  if p_component is null then
    select min_price into floor_price from public.products where id = p_product;
  else
    select coalesce(component.min_price, product.min_price) into floor_price
    from public.product_components component
    join public.products product on product.id = component.product_id
    where component.id = p_component;
  end if;
  if floor_price is null or p_price >= floor_price then
    return true;
  end if;
  return exists (
    select 1
    from public.price_requests request
    where request.product_id = p_product
      and request.component_id is not distinct from p_component
      and request.requested_by = p_user
      and request.status = 'approved'
      and request.approved_price = p_price
  );
end;
$$;

revoke all on function private.price_is_allowed(uuid, uuid, numeric, uuid) from public;

create or replace function public.preview_sale_earnings(items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  item jsonb;
  product public.products%rowtype;
  component_id uuid;
  price numeric(12, 2);
  earning private.earning_result;
  rows jsonb := '[]'::jsonb;
  count_items integer := 0;
begin
  perform private.assert_sales_or_admin();
  if items is null or jsonb_typeof(items) <> 'array' then
    raise exception 'invalid_items' using errcode = '23514';
  end if;
  for item in select value from jsonb_array_elements(items)
  loop
    count_items := count_items + 1;
    if count_items > 10 then
      raise exception 'too_many_items' using errcode = '23514';
    end if;
    price := round((item ->> 'price')::numeric, 2);
    select * into product from public.products where public_code = item ->> 'public_code';
    if product.id is null then
      raise exception 'product_not_found' using errcode = 'P0002';
    end if;
    component_id := null;
    if item ? 'suffix' and item ->> 'suffix' is not null then
      select id into component_id
      from public.product_components
      where product_id = product.id and suffix = item ->> 'suffix';
      if component_id is null then
        raise exception 'product_not_found' using errcode = 'P0002';
      end if;
    end if;
    if price is null or price <= 0 then
      raise exception 'invalid_price' using errcode = '23514';
    end if;
    if not private.price_is_allowed(product.id, component_id, price, actor) then
      raise exception 'price_below_minimum:%', product.name using errcode = '23514';
    end if;
    earning := private.calc_earnings(product.id, component_id, price, now());
    rows := rows || jsonb_build_array(jsonb_build_object(
      'public_code', product.public_code,
      'name', product.name,
      'price', price,
      'earning', earning.total
    ));
  end loop;
  if count_items < 1 then
    raise exception 'invalid_items' using errcode = '23514';
  end if;
  return rows;
end;
$$;

create or replace function public.complete_sale(
  items jsonb,
  customer jsonb,
  payment_method text,
  delivery jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  item jsonb;
  product public.products%rowtype;
  component public.product_components%rowtype;
  piece_id uuid;
  price numeric(12, 2);
  count_items integer := 0;
  total numeric(12, 2) := 0;
  list_total numeric(12, 2) := 0;
  created_sale uuid;
  item_id uuid;
  prefix text;
  invoice text;
  earning private.earning_result;
  bonus jsonb;
  ids uuid[];
begin
  perform private.assert_sales_or_admin();
  perform private.release_expired_reservations();
  if items is null or jsonb_typeof(items) <> 'array' then
    raise exception 'invalid_items' using errcode = '23514';
  end if;
  if customer is null or nullif(btrim(customer ->> 'name'), '') is null or nullif(btrim(customer ->> 'phone'), '') is null then
    raise exception 'customer_required' using errcode = '23514';
  end if;
  if payment_method is null or not exists (
    select 1 from public.app_settings setting
    where setting.key = 'payment_methods' and setting.value @> to_jsonb(complete_sale.payment_method)
  ) then
    raise exception 'invalid_payment_method' using errcode = '23514';
  end if;

  select coalesce(array_agg(locked.id order by locked.id), '{}')
  into ids
  from public.products locked
  where locked.public_code in (
    select element ->> 'public_code' from jsonb_array_elements(items) element
  );
  perform 1 from public.products locked where locked.id = any(ids) order by locked.id for update;

  for item in select value from jsonb_array_elements(items)
  loop
    count_items := count_items + 1;
    if count_items > 10 then
      raise exception 'too_many_items' using errcode = '23514';
    end if;
    price := round((item ->> 'price')::numeric, 2);
    if price is null or price <= 0 then
      raise exception 'invalid_price' using errcode = '23514';
    end if;
    select * into product from public.products where public_code = item ->> 'public_code';
    if product.id is null then
      raise exception 'product_not_found' using errcode = 'P0002';
    end if;
    piece_id := null;
    if item ? 'suffix' and nullif(item ->> 'suffix', '') is not null then
      select * into component
      from public.product_components
      where product_id = product.id and suffix = item ->> 'suffix'
      for update;
      if component.id is null then
        raise exception 'product_not_found' using errcode = 'P0002';
      end if;
      if product.status = 'reserved' then
        raise exception 'unit_unavailable' using errcode = '23514';
      end if;
      piece_id := component.id;
      if component.status = 'reserved' then
        if not exists (
          select 1 from public.reservations reservation
          where reservation.component_id = component.id
            and reservation.user_id = actor
            and reservation.status = 'active'
        ) then
          raise exception 'unit_unavailable' using errcode = '23514';
        end if;
      elsif component.status <> 'available' then
        raise exception 'unit_unavailable' using errcode = '23514';
      end if;
    else
      if product.status = 'partially_sold' and product.product_type = 'set' then
        raise exception 'set_partially_sold' using errcode = '23514';
      end if;
      if product.status = 'reserved' then
        if not exists (
          select 1 from public.reservations reservation
          where reservation.product_id = product.id
            and reservation.component_id is null
            and reservation.user_id = actor
            and reservation.status = 'active'
        ) then
          raise exception 'unit_unavailable' using errcode = '23514';
        end if;
      elsif product.status <> 'available' then
        raise exception 'unit_unavailable' using errcode = '23514';
      end if;
    end if;
    if not private.price_is_allowed(product.id, piece_id, price, actor) then
      raise exception 'price_below_minimum:%', product.name using errcode = '23514';
    end if;
    total := total + price;
    list_total := list_total + product.list_price;
  end loop;
  if count_items < 1 then
    raise exception 'invalid_items' using errcode = '23514';
  end if;

  select trim(both '"' from setting.value::text) into prefix
  from public.app_settings setting where setting.key = 'invoice_prefix';
  prefix := coalesce(nullif(prefix, ''), 'INV');
  invoice := prefix || '-' || lpad(nextval('public.invoice_seq')::text, 6, '0');

  insert into public.sales (
    invoice_no, seller_id, customer_name, customer_phone, customer_address, notes,
    payment_method, delivery_status, delivery_date, delivery_address, delivery_notes,
    total_list_price, total_price, status
  ) values (
    invoice,
    actor,
    btrim(customer ->> 'name'),
    btrim(customer ->> 'phone'),
    nullif(btrim(customer ->> 'address'), ''),
    nullif(btrim(customer ->> 'notes'), ''),
    payment_method,
    coalesce(nullif(delivery ->> 'status', ''), 'pending')::public.delivery_status,
    nullif(delivery ->> 'date', '')::date,
    nullif(delivery ->> 'address', ''),
    nullif(delivery ->> 'notes', ''),
    list_total,
    total,
    'completed'
  )
  returning id into created_sale;

  for item in select value from jsonb_array_elements(items)
  loop
    price := round((item ->> 'price')::numeric, 2);
    select * into product from public.products where public_code = item ->> 'public_code';
    piece_id := null;
    if item ? 'suffix' and nullif(item ->> 'suffix', '') is not null then
      select id into piece_id
      from public.product_components
      where product_id = product.id and suffix = item ->> 'suffix';
    end if;
    insert into public.sale_items (
      sale_id, product_id, component_id, store_id, category_id, list_price, sale_price, status, is_live
    ) values (
      created_sale, product.id, piece_id, product.store_id, product.category_id, product.list_price, price, 'active', true
    )
    returning id into item_id;

    earning := private.calc_earnings(product.id, piece_id, price, now());
    insert into public.commissions (
      sale_id, sale_item_id, user_id, kind, status, base_type, base_value, base_amount, bonus_amount, total_amount
    ) values (
      created_sale, item_id, actor, 'earning', 'pending',
      earning.base_type, earning.base_value, earning.base_amount, earning.bonus_amount, earning.total
    );
    for bonus in select value from jsonb_array_elements(coalesce(earning.bonus_lines, '[]'::jsonb))
    loop
      insert into public.commission_bonuses (commission_id, bonus_rule_id, rule_name, bonus_type, bonus_value, amount)
      select commission.id,
             nullif(bonus ->> 'rule_id', '')::uuid,
             coalesce(bonus ->> 'rule_name', 'bonus'),
             (bonus ->> 'bonus_type')::public.bonus_type,
             (bonus ->> 'bonus_value')::numeric,
             (bonus ->> 'amount')::numeric
      from public.commissions commission
      where commission.sale_item_id = item_id;
    end loop;

    if piece_id is not null then
      update public.product_components set status = 'sold' where id = piece_id;
      update public.products target
      set status = case
        when not exists (
          select 1 from public.product_components sibling
          where sibling.product_id = target.id and sibling.status <> 'sold'
        ) then 'sold'::public.product_status
        else 'partially_sold'::public.product_status
      end
      where target.id = product.id;
    else
      update public.products set status = 'sold' where id = product.id;
      update public.product_components set status = 'sold' where product_id = product.id and status in ('available', 'reserved');
    end if;

    update public.reservations reservation
    set status = 'converted', ended_at = now()
    where reservation.product_id = product.id
      and reservation.component_id is not distinct from piece_id
      and reservation.user_id = actor
      and reservation.status = 'active';

    update public.price_requests request
    set status = 'used'
    where request.product_id = product.id
      and request.component_id is not distinct from piece_id
      and request.requested_by = actor
      and request.status = 'approved'
      and request.approved_price = price;

    perform private.broadcast_catalog(product.id, 'sold');
  end loop;

  insert into public.notifications (user_id, type, title, body, entity_type, entity_id)
  values (actor, 'sale_completed', 'تم تسجيل البيع', invoice, 'sales', created_sale);
  perform private.record_audit('sale_completed', 'sales', created_sale, null, jsonb_build_object(
    'invoice', invoice,
    'total', total
  ));
  return created_sale;
end;
$$;

create or replace function public.update_sale_customer(sale_id uuid, data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  sale public.sales%rowtype;
begin
  perform private.assert_sales_or_admin();
  select * into sale from public.sales where id = update_sale_customer.sale_id for update;
  if sale.id is null then
    raise exception 'sale_not_found' using errcode = 'P0002';
  end if;
  if sale.seller_id <> actor and not private.is_admin() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;
  if sale.seller_id = actor and not private.is_admin() and exists (
    select 1 from public.commissions commission
    where commission.sale_id = sale.id and commission.status <> 'pending'
  ) then
    raise exception 'sale_locked' using errcode = '23514';
  end if;
  update public.sales
  set customer_name = coalesce(nullif(btrim(data ->> 'name'), ''), customer_name),
      customer_phone = coalesce(nullif(btrim(data ->> 'phone'), ''), customer_phone),
      customer_address = coalesce(nullif(btrim(data ->> 'address'), ''), customer_address),
      notes = coalesce(data ->> 'notes', notes)
  where id = sale.id;
  perform private.record_audit('sale_customer_updated', 'sales', sale.id, null, jsonb_build_object('invoice', sale.invoice_no));
end;
$$;

create or replace function public.request_sale_correction(sale_id uuid, note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  sale public.sales%rowtype;
  admin_id uuid;
begin
  perform private.assert_sales_or_admin();
  if nullif(btrim(note), '') is null then
    raise exception 'note_required' using errcode = '23514';
  end if;
  select * into sale from public.sales where id = request_sale_correction.sale_id;
  if sale.id is null or (sale.seller_id <> actor and not private.is_admin()) then
    raise exception 'sale_not_found' using errcode = 'P0002';
  end if;
  for admin_id in
    select profile.id
    from public.profiles profile
    join public.user_roles user_role on user_role.user_id = profile.id
    where user_role.role = 'admin' and profile.status = 'active'
  loop
    insert into public.notifications (user_id, type, title, body, entity_type, entity_id)
    values (admin_id, 'sale_correction', 'طلب تصحيح فاتورة', sale.invoice_no, 'sales', sale.id);
  end loop;
  perform private.record_audit('sale_correction_requested', 'sales', sale.id, null, jsonb_build_object('invoice', sale.invoice_no));
end;
$$;

-- The sale total check reads the new rows. It has to run as the owner, because a sales
-- session cannot select the financial tables under RLS.
create or replace function private.assert_sale_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sid uuid;
  expected numeric(12, 2);
  actual numeric(12, 2);
begin
  if tg_table_name = 'sales' then
    sid := coalesce(new.id, old.id);
  else
    sid := coalesce(new.sale_id, old.sale_id);
  end if;
  select coalesce(sum(item.sale_price), 0) into expected
  from public.sale_items item
  where item.sale_id = sid and item.status = 'active';
  select sale.total_price into actual from public.sales sale where sale.id = sid;
  if actual is distinct from expected then
    raise exception 'sale_total_mismatch' using errcode = '23514';
  end if;
  return null;
end;
$$;

revoke all on function private.assert_sale_totals() from public;

revoke all on function public.reserve_by_code(text, text) from public;
grant execute on function public.reserve_by_code(text, text) to authenticated;
grant execute on function private.calc_earnings(uuid, uuid, numeric, timestamptz) to authenticated;

create or replace view public.v_catalog
with (security_invoker = false) as
select
  p.public_code,
  p.name,
  p.description,
  p.category_id,
  c.name_ar as category_name,
  p.list_price,
  p.status,
  pm.storage_path as primary_image_path,
  (p.product_type = 'set') as is_set,
  e.base_amount as est_base_commission,
  e.bonus_amount as est_bonus,
  e.total as est_total,
  exists (
    select 1 from public.reservations r
    where r.product_id = p.id
      and r.component_id is null
      and r.status = 'active'
      and r.user_id = auth.uid()
  ) as reserved_by_me,
  exists (
    select 1 from public.reservations r
    where r.product_id = p.id and r.component_id is null and r.status = 'active'
  ) as is_reserved,
  (
    select r.id
    from public.reservations r
    where r.product_id = p.id
      and r.component_id is null
      and r.status = 'active'
      and r.user_id = auth.uid()
    limit 1
  ) as my_reservation_id
from public.products p
join public.categories c on c.id = p.category_id
left join public.product_media pm on pm.product_id = p.id and pm.is_primary
cross join lateral private.calc_earnings(p.id, null, p.list_price, now()) e
where private.is_sales_or_admin()
  and (
    p.status in ('available', 'partially_sold')
    or (
      p.status = 'reserved'
      and exists (
        select 1 from public.reservations r
        where r.product_id = p.id
          and r.component_id is null
          and r.status = 'active'
          and r.user_id = auth.uid()
      )
    )
  );
