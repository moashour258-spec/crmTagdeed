-- Phase 4A: customer payments, installments, receipts, delivery, and sale cancellation.

create or replace function private.payments_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'sale_payments_append_only' using errcode = '42501';
end;
$$;

drop trigger if exists sale_payments_append_only on public.sale_payments;
create trigger sale_payments_append_only
before update or delete on public.sale_payments
for each row execute function private.payments_append_only();

revoke update, delete on public.sale_payments from public, anon, authenticated, service_role;

create or replace function private.cairo_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (timezone('Africa/Cairo', now()))::date;
$$;

revoke all on function private.cairo_today() from public;

create or replace function private.insert_sale_payment(
  p_sale uuid,
  p_kind public.payment_kind,
  p_amount numeric,
  p_paid date,
  p_method text,
  p_note text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sale public.sales%rowtype;
  net numeric(12, 2);
  next_net numeric(12, 2);
  prefix text;
  receipt text;
  payment_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount' using errcode = '23514';
  end if;
  if p_paid is null or p_paid > private.cairo_today() then
    raise exception 'future_payment_date' using errcode = '23514';
  end if;
  if p_kind = 'refund' and nullif(btrim(p_reason), '') is null then
    raise exception 'reason_required' using errcode = '23514';
  end if;
  if p_method is null or not exists (
    select 1 from public.app_settings setting
    where setting.key = 'payment_methods' and setting.value @> to_jsonb(p_method)
  ) then
    raise exception 'invalid_payment_method' using errcode = '23514';
  end if;

  select * into sale from public.sales where id = p_sale for update;
  if sale.id is null then
    raise exception 'sale_not_found' using errcode = 'P0002';
  end if;
  if sale.status = 'cancelled' and p_kind = 'payment' then
    raise exception 'sale_cancelled' using errcode = '23514';
  end if;

  select coalesce(sum(case when payment.kind = 'payment' then payment.amount else -payment.amount end), 0)
  into net
  from public.sale_payments payment
  where payment.sale_id = sale.id;
  next_net := net + case when p_kind = 'payment' then p_amount else -p_amount end;
  if next_net < 0 or next_net > sale.total_price then
    raise exception 'payment_out_of_range' using errcode = '23514';
  end if;

  select coalesce(nullif(setting.value #>> '{}', ''), 'RC') into prefix
  from public.app_settings setting where setting.key = 'receipt_prefix';
  receipt := coalesce(prefix, 'RC') || '-' || lpad(nextval('public.receipt_seq')::text, 6, '0');

  insert into public.sale_payments (sale_id, kind, amount, paid_at, method, note, reason, receipt_no, recorded_by)
  values (sale.id, p_kind, round(p_amount, 2), p_paid, p_method, nullif(btrim(p_note), ''), nullif(btrim(p_reason), ''), receipt, auth.uid())
  returning id into payment_id;

  perform private.record_audit(
    case when p_kind = 'refund' then 'sale_refunded' else 'sale_payment_recorded' end,
    'sale_payments',
    payment_id,
    null,
    jsonb_build_object('receipt', receipt, 'kind', p_kind)
  );
  insert into public.notifications (user_id, type, title, body, entity_type, entity_id)
  values (sale.seller_id, 'sale_payment', 'حركة على فاتورة', sale.invoice_no, 'sales', sale.id);
  return payment_id;
end;
$$;

revoke all on function private.insert_sale_payment(uuid, public.payment_kind, numeric, date, text, text, text) from public;

create or replace function public.record_sale_payment(
  sale_id uuid,
  kind public.payment_kind,
  amount numeric,
  paid_at date,
  method text,
  note text,
  reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin();
  return private.insert_sale_payment(
    record_sale_payment.sale_id,
    record_sale_payment.kind,
    record_sale_payment.amount,
    record_sale_payment.paid_at,
    record_sale_payment.method,
    record_sale_payment.note,
    record_sale_payment.reason
  );
end;
$$;

create or replace function private.replace_installments(p_sale uuid, p_rows jsonb, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  sale public.sales%rowtype;
  entry jsonb;
  expected numeric(12, 2) := 0;
  seq_no integer;
  due date;
  amt numeric(12, 2);
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) < 1 then
    raise exception 'invalid_plan' using errcode = '23514';
  end if;
  select * into sale from public.sales where id = p_sale for update;
  if sale.id is null or sale.status <> 'completed' then
    raise exception 'sale_not_found' using errcode = 'P0002';
  end if;
  for entry in select value from jsonb_array_elements(p_rows)
  loop
    seq_no := (entry ->> 'seq')::integer;
    due := (entry ->> 'due_date')::date;
    amt := round((entry ->> 'amount')::numeric, 2);
    if seq_no is null or seq_no < 0 or due is null or amt is null or amt <= 0 then
      raise exception 'invalid_plan' using errcode = '23514';
    end if;
    expected := expected + amt;
  end loop;
  if expected <> sale.total_price then
    raise exception 'plan_total_mismatch' using errcode = '23514';
  end if;

  update public.sale_installments installment
  set superseded_at = now()
  where installment.sale_id = sale.id and installment.superseded_at is null;

  for entry in select value from jsonb_array_elements(p_rows)
  loop
    insert into public.sale_installments (sale_id, seq, due_date, amount)
    values (sale.id, (entry ->> 'seq')::integer, (entry ->> 'due_date')::date, round((entry ->> 'amount')::numeric, 2));
  end loop;

  update public.sales target
  set installments_need_review = false
  where target.id = sale.id;
  perform private.record_audit('installments_replaced', 'sales', sale.id, null, jsonb_build_object('reason', p_reason));
end;
$$;

revoke all on function private.replace_installments(uuid, jsonb, text) from public;

create or replace function public.set_installment_plan(sale_id uuid, rows jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin();
  perform private.replace_installments(set_installment_plan.sale_id, set_installment_plan.rows, null);
end;
$$;

create or replace function public.reschedule_installments(sale_id uuid, rows jsonb, reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin();
  if nullif(btrim(reschedule_installments.reason), '') is null then
    raise exception 'reason_required' using errcode = '23514';
  end if;
  perform private.replace_installments(reschedule_installments.sale_id, reschedule_installments.rows, reschedule_installments.reason);
end;
$$;

create or replace function private.restore_unit(p_product uuid, p_component uuid, p_restore public.product_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_restore not in ('available', 'inactive') then
    raise exception 'invalid_restore_status' using errcode = '23514';
  end if;
  if p_component is not null then
    update public.product_components piece
    set status = p_restore
    where piece.id = p_component;
    update public.products product
    set status = case
      when exists (
        select 1 from public.product_components sibling
        where sibling.product_id = product.id and sibling.status = 'sold'
      ) then 'partially_sold'::public.product_status
      when p_restore = 'inactive' then 'inactive'::public.product_status
      else 'available'::public.product_status
    end
    where product.id = p_product;
  else
    update public.products product set status = p_restore where product.id = p_product;
    update public.product_components piece
    set status = p_restore
    where piece.product_id = p_product and piece.status = 'sold';
  end if;
  perform private.broadcast_catalog(p_product, p_restore::text);
end;
$$;

revoke all on function private.restore_unit(uuid, uuid, public.product_status) from public;

create or replace function private.cancel_items(
  p_sale uuid,
  p_items uuid[],
  p_reason text,
  p_restore public.product_status,
  p_refund jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  sale public.sales%rowtype;
  item public.sale_items%rowtype;
  new_total numeric(12, 2);
  net numeric(12, 2);
  excess numeric(12, 2);
  refund_amount numeric(12, 2);
  earning public.commissions%rowtype;
begin
  if nullif(btrim(p_reason), '') is null then
    raise exception 'reason_required' using errcode = '23514';
  end if;
  if p_items is null or cardinality(p_items) < 1 then
    raise exception 'item_not_found' using errcode = 'P0002';
  end if;

  select * into sale from public.sales where id = p_sale for update;
  if sale.id is null or sale.status <> 'completed' then
    raise exception 'sale_not_found' using errcode = 'P0002';
  end if;
  perform 1 from public.products product
  where product.id in (select line.product_id from public.sale_items line where line.id = any(p_items))
  order by product.id
  for update;

  select coalesce(sum(line.sale_price), 0) into new_total
  from public.sale_items line
  where line.sale_id = sale.id and line.status = 'active' and not (line.id = any(p_items));
  select coalesce(sum(case when payment.kind = 'payment' then payment.amount else -payment.amount end), 0)
  into net
  from public.sale_payments payment
  where payment.sale_id = sale.id;
  excess := net - new_total;

  if excess > 0 then
    if p_refund is null or jsonb_typeof(p_refund) <> 'object' then
      raise exception 'refund_required' using errcode = '23514';
    end if;
    refund_amount := round((p_refund ->> 'amount')::numeric, 2);
    if refund_amount is distinct from excess then
      raise exception 'refund_amount_mismatch' using errcode = '23514';
    end if;
  elsif p_refund is not null then
    raise exception 'refund_not_allowed' using errcode = '23514';
  end if;

  for item in
    select * from public.sale_items line
    where line.id = any(p_items) and line.sale_id = sale.id and line.status = 'active'
    order by line.id
    for update
  loop
    update public.sale_items line
    set status = 'cancelled',
        is_live = false,
        cancel_reason = p_reason,
        cancelled_by = auth.uid(),
        cancelled_at = now()
    where line.id = item.id;
    perform private.restore_unit(item.product_id, item.component_id, p_restore);

    for earning in
      select * from public.commissions commission
      where commission.sale_item_id = item.id and commission.kind = 'earning'
      for update
    loop
      if earning.status in ('pending', 'approved') then
        update public.commissions commission
        set status = 'cancelled'
        where commission.id = earning.id;
      elsif earning.status = 'paid' and earning.total_amount > 0 then
        insert into public.commissions (
          sale_id, sale_item_id, user_id, kind, status,
          base_type, base_value, base_amount, bonus_amount, total_amount, original_commission_id
        ) values (
          earning.sale_id, earning.sale_item_id, earning.user_id, 'clawback', 'approved',
          earning.base_type, earning.base_value, -earning.base_amount, -earning.bonus_amount, -earning.total_amount,
          earning.id
        );
      end if;
    end loop;
  end loop;

  if (select count(*) from public.sale_items line where line.id = any(p_items) and line.status = 'cancelled') <> cardinality(p_items) then
    raise exception 'item_not_found' using errcode = 'P0002';
  end if;

  update public.sales target
  set total_price = new_total,
      installments_need_review = true,
      status = case when new_total = 0 then 'cancelled'::public.sale_status else target.status end,
      cancel_reason = case when new_total = 0 then p_reason else target.cancel_reason end,
      cancelled_by = case when new_total = 0 then auth.uid() else target.cancelled_by end,
      cancelled_at = case when new_total = 0 then now() else target.cancelled_at end
  where target.id = sale.id;

  if excess > 0 then
    perform private.insert_sale_payment(
      sale.id,
      'refund',
      refund_amount,
      coalesce((p_refund ->> 'paid_at')::date, private.cairo_today()),
      coalesce(p_refund ->> 'method', sale.payment_method),
      p_refund ->> 'note',
      coalesce(nullif(p_refund ->> 'reason', ''), p_reason)
    );
  end if;

  insert into public.notifications (user_id, type, title, body, entity_type, entity_id)
  values (sale.seller_id, 'sale_cancelled_item', 'تعديل على فاتورة', sale.invoice_no, 'sales', sale.id);
  perform private.record_audit('sale_items_cancelled', 'sales', sale.id, null, jsonb_build_object('items', cardinality(p_items)));
end;
$$;

revoke all on function private.cancel_items(uuid, uuid[], text, public.product_status, jsonb) from public;

create or replace function public.cancel_sale_item(
  sale_item_id uuid,
  reason text,
  restore_status public.product_status,
  refund jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
begin
  perform private.assert_admin();
  select sale_id into owner from public.sale_items where id = cancel_sale_item.sale_item_id;
  if owner is null then
    raise exception 'item_not_found' using errcode = 'P0002';
  end if;
  perform private.cancel_items(
    owner,
    array[cancel_sale_item.sale_item_id],
    cancel_sale_item.reason,
    cancel_sale_item.restore_status,
    cancel_sale_item.refund
  );
end;
$$;

create or replace function public.cancel_sale(
  sale_id uuid,
  reason text,
  restore_status public.product_status,
  refund jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids uuid[];
begin
  perform private.assert_admin();
  select coalesce(array_agg(line.id), '{}') into ids
  from public.sale_items line
  where line.sale_id = cancel_sale.sale_id and line.status = 'active';
  perform private.cancel_items(cancel_sale.sale_id, ids, cancel_sale.reason, cancel_sale.restore_status, cancel_sale.refund);
end;
$$;

create or replace function public.set_delivery(
  sale_id uuid,
  status public.delivery_status,
  delivery_date date,
  address text,
  notes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  sale public.sales%rowtype;
begin
  perform private.assert_admin();
  select * into sale from public.sales where id = set_delivery.sale_id for update;
  if sale.id is null or sale.status <> 'completed' then
    raise exception 'sale_not_found' using errcode = 'P0002';
  end if;
  update public.sales target
  set delivery_status = set_delivery.status,
      delivery_date = set_delivery.delivery_date,
      delivery_address = nullif(btrim(set_delivery.address), ''),
      delivery_notes = nullif(btrim(set_delivery.notes), ''),
      delivered_at = case
        when set_delivery.status = 'delivered' then coalesce(target.delivered_at, now())
        else null
      end
  where target.id = sale.id;
  perform private.record_audit('delivery_updated', 'sales', sale.id, null, jsonb_build_object('status', set_delivery.status));
  insert into public.notifications (user_id, type, title, body, entity_type, entity_id)
  values (sale.seller_id, 'delivery_updated', 'تحديث التسليم', sale.invoice_no, 'sales', sale.id);
end;
$$;

create or replace function public.delivery_digest()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted integer := 0;
  admin_id uuid;
  sale public.sales%rowtype;
begin
  for sale in
    select * from public.sales target
    where target.status = 'completed'
      and target.delivery_status = 'scheduled'
      and target.delivery_date < private.cairo_today()
  loop
    for admin_id in
      select profile.id
      from public.profiles profile
      join public.user_roles user_role on user_role.user_id = profile.id
      where user_role.role = 'admin' and profile.status = 'active'
    loop
      if not exists (
        select 1 from public.notifications notice
        where notice.user_id = admin_id
          and notice.type = 'delivery_late'
          and notice.entity_id = sale.id
          and (timezone('Africa/Cairo', notice.created_at))::date = private.cairo_today()
      ) then
        insert into public.notifications (user_id, type, title, body, entity_type, entity_id)
        values (admin_id, 'delivery_late', 'تسليم متأخر', sale.invoice_no, 'sales', sale.id);
        inserted := inserted + 1;
      end if;
    end loop;
  end loop;
  return inserted;
end;
$$;

create or replace function public.overdue_installments_digest()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted integer := 0;
  admin_id uuid;
  installment public.sale_installments%rowtype;
  invoice text;
begin
  for installment in
    select row.*
    from public.sale_installments row
    join public.sales sale on sale.id = row.sale_id
    where row.superseded_at is null
      and sale.status = 'completed'
      and row.due_date <= private.cairo_today()
  loop
    if (
      select coalesce(sum(case when payment.kind = 'payment' then payment.amount else -payment.amount end), 0)
      from public.sale_payments payment
      where payment.sale_id = installment.sale_id
    ) >= (
      select sum(row.amount)
      from public.sale_installments row
      where row.sale_id = installment.sale_id
        and row.superseded_at is null
        and row.seq <= installment.seq
    ) then
      continue;
    end if;
    select sale.invoice_no into invoice from public.sales sale where sale.id = installment.sale_id;
    for admin_id in
      select profile.id
      from public.profiles profile
      join public.user_roles user_role on user_role.user_id = profile.id
      where user_role.role = 'admin' and profile.status = 'active'
    loop
      if not exists (
        select 1 from public.notifications notice
        where notice.user_id = admin_id and notice.type = 'installment_overdue' and notice.entity_id = installment.id
      ) then
        insert into public.notifications (user_id, type, title, body, entity_type, entity_id)
        values (admin_id, 'installment_overdue', 'قسط متأخر', invoice, 'sale_installments', installment.id);
        inserted := inserted + 1;
      end if;
    end loop;
  end loop;
  return inserted;
end;
$$;

create or replace view public.v_my_sales
with (security_invoker = false) as
select
  s.id,
  s.invoice_no,
  s.customer_name,
  s.customer_phone,
  s.customer_address,
  s.notes,
  s.payment_method,
  case when s.status = 'cancelled' then null else s.delivery_status end as delivery_status,
  case when s.status = 'cancelled' then null else s.delivery_date end as delivery_date,
  case when s.status = 'cancelled' then null else s.delivery_address end as delivery_address,
  case when s.status = 'cancelled' then null else s.delivered_at end as delivered_at,
  s.total_list_price,
  s.total_price,
  s.status,
  s.sold_at
from public.sales s
where private.is_sales_or_admin()
  and (private.is_admin() or s.seller_id = auth.uid());
