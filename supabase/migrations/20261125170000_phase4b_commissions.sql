-- Phase 4B: bonus rules, commission approval, payouts, and bulk commission edits.

update public.app_settings
set super_admin_only = true
where key in ('default_commission_type', 'default_commission_value');

create or replace view public.v_my_commissions
with (security_invoker = false) as
select
  c.id,
  c.sale_id,
  c.sale_item_id,
  c.kind,
  c.status,
  c.base_type,
  c.base_value,
  c.base_amount,
  c.bonus_amount,
  c.total_amount,
  c.created_at,
  coalesce(
    (
      select jsonb_agg(jsonb_build_object(
        'rule_name', b.rule_name,
        'bonus_type', b.bonus_type,
        'bonus_value', b.bonus_value,
        'amount', b.amount
      ) order by b.rule_name)
      from public.commission_bonuses b
      where b.commission_id = c.id
    ),
    '[]'::jsonb
  ) as bonus_lines,
  c.user_id
from public.commissions c
where private.is_active_user()
  and (private.is_admin() or c.user_id = auth.uid());

create or replace function public.approve_commissions(ids uuid[], override_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  row public.commissions%rowtype;
  sale public.sales%rowtype;
  net numeric(12, 2);
  seen int := 0;
  expected int;
begin
  perform private.assert_admin();
  select count(distinct requested) into expected
  from unnest(coalesce(approve_commissions.ids, '{}'::uuid[])) requested;
  if expected = 0 then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  for row in
    select commission.*
    from public.commissions commission
    where commission.id = any(approve_commissions.ids)
    order by commission.id
    for update
  loop
    seen := seen + 1;
    if row.kind <> 'earning' or row.status <> 'pending' then
      raise exception 'commission_not_pending' using errcode = '23514';
    end if;

    select * into sale from public.sales target where target.id = row.sale_id for update;
    if sale.status = 'cancelled' then
      raise exception 'sale_cancelled' using errcode = '23514';
    end if;

    select coalesce(sum(case when payment.kind = 'payment' then payment.amount else -payment.amount end), 0)
    into net
    from public.sale_payments payment
    where payment.sale_id = sale.id;

    if not (net > 0 and net >= sale.total_price)
      and nullif(btrim(coalesce(approve_commissions.override_reason, '')), '') is null then
      raise exception 'override_required' using errcode = '23514';
    end if;

    update public.commissions commission
    set status = 'approved',
        approved_by = auth.uid(),
        approved_at = now(),
        approval_override_reason = case
          when net > 0 and net >= sale.total_price then null
          else btrim(approve_commissions.override_reason)
        end
    where commission.id = row.id;

    insert into public.notifications (user_id, type, title, body, entity_type, entity_id)
    values (row.user_id, 'commission_approved', 'تم اعتماد عمولتك', sale.invoice_no, 'commissions', row.id);
  end loop;

  if seen <> expected then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.record_audit(
    'commissions.approved',
    'commissions',
    null,
    null,
    jsonb_build_object('ids', approve_commissions.ids, 'count', seen)
  );
end;
$$;

create or replace function public.record_commission_payout(
  user_id uuid,
  paid_at date,
  method text,
  note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid[];
  net numeric(12, 2);
  payment uuid;
  updated int;
begin
  perform private.assert_admin();
  if record_commission_payout.user_id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if record_commission_payout.paid_at > (timezone('Africa/Cairo', now()))::date then
    raise exception 'future_payment_date' using errcode = '23514';
  end if;
  if nullif(btrim(coalesce(record_commission_payout.method, '')), '') is null then
    raise exception 'invalid_payment_method' using errcode = '23514';
  end if;

  perform 1
  from public.commissions commission
  where commission.user_id = record_commission_payout.user_id
    and commission.status = 'approved'
  order by commission.id
  for update;

  select coalesce(array_agg(commission.id order by commission.id), '{}'::uuid[]),
         coalesce(sum(commission.total_amount), 0)
  into target, net
  from public.commissions commission
  where commission.user_id = record_commission_payout.user_id
    and commission.status = 'approved';

  if cardinality(target) = 0 then
    raise exception 'nothing_to_pay' using errcode = '23514';
  end if;
  if net < 0 then
    raise exception 'negative_payout' using errcode = '23514';
  end if;

  insert into public.commission_payments (user_id, total_amount, paid_at, method, note, created_by)
  values (
    record_commission_payout.user_id,
    net,
    record_commission_payout.paid_at,
    btrim(record_commission_payout.method),
    nullif(btrim(coalesce(record_commission_payout.note, '')), ''),
    auth.uid()
  )
  returning id into payment;

  update public.commissions commission
  set status = 'paid',
      payment_id = payment
  where commission.id = any(target)
    and commission.status = 'approved';
  get diagnostics updated = row_count;
  if updated <> cardinality(target) then
    raise exception 'payout_conflict' using errcode = '23514';
  end if;

  insert into public.notifications (user_id, type, title, body, entity_type, entity_id)
  values (
    record_commission_payout.user_id,
    'commission_paid',
    'تم صرف عمولتك',
    net::text,
    'commission_payments',
    payment
  );
  perform private.record_audit(
    'commission_payout.recorded',
    'commission_payments',
    payment,
    null,
    jsonb_build_object('user_id', record_commission_payout.user_id, 'total', net, 'count', updated)
  );
  return payment;
end;
$$;

create or replace function public.bulk_update_commission(
  filters jsonb,
  ids uuid[],
  new_type public.commission_type,
  new_value numeric,
  note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  filt jsonb;
  price_min numeric;
  price_max numeric;
  store uuid;
  category uuid;
  wanted_status text;
  search text;
  selected uuid[];
  rule uuid;
  affected int := 0;
  product record;
  piece record;
begin
  perform private.assert_admin();
  if bulk_update_commission.new_value is null
    or bulk_update_commission.new_value < 0
    or (bulk_update_commission.new_type = 'percentage' and bulk_update_commission.new_value > 100) then
    raise exception 'invalid_commission' using errcode = '23514';
  end if;

  filt := coalesce(bulk_update_commission.filters, '{}'::jsonb);
  price_min := nullif(filt ->> 'price_min', '')::numeric;
  price_max := nullif(filt ->> 'price_max', '')::numeric;
  store := nullif(filt ->> 'store_id', '')::uuid;
  category := nullif(filt ->> 'category_id', '')::uuid;
  wanted_status := nullif(filt ->> 'status', '');
  search := nullif(btrim(coalesce(filt ->> 'search', '')), '');
  selected := coalesce(bulk_update_commission.ids, '{}'::uuid[]);

  if cardinality(selected) = 0
    and price_min is null
    and price_max is null
    and store is null
    and category is null
    and wanted_status is null
    and search is null then
    raise exception 'filters_required' using errcode = '23514';
  end if;

  insert into public.commission_rules (created_by, filters, new_type, new_value, affected_count)
  values (
    auth.uid(),
    case
      when nullif(btrim(coalesce(bulk_update_commission.note, '')), '') is null then filt
      else filt || jsonb_build_object('note', btrim(bulk_update_commission.note))
    end,
    bulk_update_commission.new_type,
    bulk_update_commission.new_value,
    0
  )
  returning id into rule;

  for product in
    select p.id, p.commission_type, p.commission_value
    from public.products p
    join public.categories c on c.id = p.category_id
    where (cardinality(selected) = 0 or p.id = any(selected))
      and (store is null or p.store_id = store)
      and (
        category is null
        or p.category_id = category
        or c.parent_id = category
      )
      and (wanted_status is null or p.status::text = wanted_status)
      and (search is null or position(lower(search) in lower(p.name)) > 0)
      and (price_min is null or p.list_price >= price_min)
      and (price_max is null or p.list_price <= price_max)
    order by p.id
    for update of p
  loop
    insert into public.commission_rule_items (rule_id, product_id, old_type, old_value)
    values (rule, product.id, product.commission_type, product.commission_value);
    update public.products p
    set commission_type = bulk_update_commission.new_type,
        commission_value = bulk_update_commission.new_value
    where p.id = product.id;
    affected := affected + 1;
  end loop;

  if cardinality(selected) = 0 then
    for piece in
      select comp.id, comp.product_id, comp.commission_type, comp.commission_value
      from public.product_components comp
      join public.products p on p.id = comp.product_id
      join public.categories c on c.id = p.category_id
      where (store is null or p.store_id = store)
        and (
          category is null
          or p.category_id = category
          or c.parent_id = category
        )
        and (wanted_status is null or p.status::text = wanted_status)
        and (
          search is null
          or position(lower(search) in lower(p.name)) > 0
          or position(lower(search) in lower(comp.name)) > 0
        )
        and (price_min is null or comp.list_price >= price_min)
        and (price_max is null or comp.list_price <= price_max)
      order by comp.id
      for update of comp
    loop
      insert into public.commission_rule_items (rule_id, product_id, component_id, old_type, old_value)
      values (rule, piece.product_id, piece.id, piece.commission_type, piece.commission_value);
      update public.product_components comp
      set commission_type = bulk_update_commission.new_type,
          commission_value = bulk_update_commission.new_value
      where comp.id = piece.id;
      affected := affected + 1;
    end loop;
  end if;

  if affected = 0 then
    raise exception 'no_matches' using errcode = '23514';
  end if;

  update public.commission_rules batch
  set affected_count = affected
  where batch.id = rule;
  perform private.record_audit(
    'commission_bulk.applied',
    'commission_rules',
    rule,
    null,
    jsonb_build_object('affected', affected, 'new_type', bulk_update_commission.new_type, 'new_value', bulk_update_commission.new_value)
  );
  return rule;
end;
$$;

create or replace function public.undo_bulk_commission(rule_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  batch public.commission_rules%rowtype;
  item public.commission_rule_items%rowtype;
  restored int := 0;
  skipped int := 0;
begin
  perform private.assert_admin();
  select * into batch
  from public.commission_rules rules
  where rules.id = undo_bulk_commission.rule_id
  for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if batch.undone_at is not null then
    raise exception 'already_undone' using errcode = '23514';
  end if;

  for item in
    select * from public.commission_rule_items line
    where line.rule_id = batch.id
    order by line.id
  loop
    if item.component_id is null then
      if exists (
        select 1 from public.products p
        where p.id = item.product_id
          and p.commission_type = batch.new_type
          and p.commission_value = batch.new_value
      ) then
        update public.products p
        set commission_type = item.old_type,
            commission_value = item.old_value
        where p.id = item.product_id;
        restored := restored + 1;
      else
        skipped := skipped + 1;
      end if;
    elsif exists (
      select 1 from public.product_components comp
      where comp.id = item.component_id
        and comp.commission_type = batch.new_type
        and comp.commission_value = batch.new_value
    ) then
      update public.product_components comp
      set commission_type = item.old_type,
          commission_value = item.old_value
      where comp.id = item.component_id;
      restored := restored + 1;
    else
      skipped := skipped + 1;
    end if;
  end loop;

  update public.commission_rules rules
  set undone_at = now(),
      undone_by = auth.uid()
  where rules.id = batch.id;
  perform private.record_audit(
    'commission_bulk.undone',
    'commission_rules',
    batch.id,
    null,
    jsonb_build_object('restored', restored, 'skipped', skipped)
  );
end;
$$;

create or replace function public.save_bonus_rule(
  rule_id uuid,
  rule_name text,
  bonus_type public.bonus_type,
  bonus_value numeric,
  price_min numeric,
  price_max numeric,
  starts_at timestamptz,
  ends_at timestamptz,
  product_ids uuid[],
  category_ids uuid[],
  store_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved uuid;
  products uuid[] := coalesce(save_bonus_rule.product_ids, '{}'::uuid[]);
  categories uuid[] := coalesce(save_bonus_rule.category_ids, '{}'::uuid[]);
  stores uuid[] := coalesce(save_bonus_rule.store_ids, '{}'::uuid[]);
begin
  perform private.assert_admin();
  if nullif(btrim(coalesce(save_bonus_rule.rule_name, '')), '') is null
    or save_bonus_rule.bonus_value is null
    or save_bonus_rule.bonus_value <= 0
    or (save_bonus_rule.bonus_type = 'percentage' and save_bonus_rule.bonus_value > 100)
    or (
      save_bonus_rule.price_min is not null
      and save_bonus_rule.price_max is not null
      and save_bonus_rule.price_max < save_bonus_rule.price_min
    )
    or (
      save_bonus_rule.starts_at is not null
      and save_bonus_rule.ends_at is not null
      and save_bonus_rule.ends_at <= save_bonus_rule.starts_at
    ) then
    raise exception 'invalid_bonus' using errcode = '23514';
  end if;
  if save_bonus_rule.price_min is null
    and save_bonus_rule.price_max is null
    and cardinality(products) = 0
    and cardinality(categories) = 0
    and cardinality(stores) = 0 then
    raise exception 'bonus_scope_required' using errcode = '23514';
  end if;

  if save_bonus_rule.rule_id is null then
    insert into public.bonus_rules (
      name, bonus_type, bonus_value, price_min, price_max, starts_at, ends_at, created_by
    ) values (
      btrim(save_bonus_rule.rule_name),
      save_bonus_rule.bonus_type,
      save_bonus_rule.bonus_value,
      save_bonus_rule.price_min,
      save_bonus_rule.price_max,
      save_bonus_rule.starts_at,
      save_bonus_rule.ends_at,
      auth.uid()
    )
    returning id into saved;
  else
    update public.bonus_rules rules
    set name = btrim(save_bonus_rule.rule_name),
        bonus_type = save_bonus_rule.bonus_type,
        bonus_value = save_bonus_rule.bonus_value,
        price_min = save_bonus_rule.price_min,
        price_max = save_bonus_rule.price_max,
        starts_at = save_bonus_rule.starts_at,
        ends_at = save_bonus_rule.ends_at
    where rules.id = save_bonus_rule.rule_id
    returning rules.id into saved;
    if saved is null then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    delete from public.bonus_rule_products where rule_id = saved;
    delete from public.bonus_rule_categories where rule_id = saved;
    delete from public.bonus_rule_stores where rule_id = saved;
  end if;

  insert into public.bonus_rule_products (rule_id, product_id)
  select saved, picked.product_id from unnest(products) as picked(product_id);
  insert into public.bonus_rule_categories (rule_id, category_id)
  select saved, picked.category_id from unnest(categories) as picked(category_id);
  insert into public.bonus_rule_stores (rule_id, store_id)
  select saved, picked.store_id from unnest(stores) as picked(store_id);

  perform private.record_audit(
    'bonus_rule.saved',
    'bonus_rules',
    saved,
    null,
    jsonb_build_object('name', btrim(save_bonus_rule.rule_name), 'value', save_bonus_rule.bonus_value)
  );
  return saved;
end;
$$;

create or replace function public.set_bonus_active(rule_id uuid, active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin();
  update public.bonus_rules rules
  set is_active = set_bonus_active.active
  where rules.id = set_bonus_active.rule_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.record_audit(
    'bonus_rule.toggled',
    'bonus_rules',
    set_bonus_active.rule_id,
    null,
    jsonb_build_object('active', set_bonus_active.active)
  );
end;
$$;

revoke all on function public.save_bonus_rule(uuid, text, public.bonus_type, numeric, numeric, numeric, timestamptz, timestamptz, uuid[], uuid[], uuid[]) from public, anon;
revoke all on function public.set_bonus_active(uuid, boolean) from public, anon;
grant execute on function public.save_bonus_rule(uuid, text, public.bonus_type, numeric, numeric, numeric, timestamptz, timestamptz, uuid[], uuid[], uuid[]) to authenticated;
grant execute on function public.set_bonus_active(uuid, boolean) to authenticated;
