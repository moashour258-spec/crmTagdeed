-- Phase 4B checks. Runs after the phase 4A race, in the same database.
\set ON_ERROR_STOP on

reset role;
select set_config('request.jwt.claims', '', false);

do $$
declare
  category_id uuid;
  store_id uuid;
  label text;
  price numeric;
  kind public.commission_type;
  value numeric;
begin
  select id into category_id from public.categories where slug = 'karasi';
  select id into store_id from public.stores where store_code = 'ALT';
  foreach label in array array[
    'نسبة تاريخية', 'ثابت مباشر', 'شريحة داخل', 'شريحة خارج', 'شريحة تُغيّر',
    'غير مدفوع', 'بيع ملغى', 'صرف أ', 'صرف ب', 'سباق الصرف'
  ]
  loop
    price := case label
      when 'شريحة خارج' then 20000
      when 'شريحة تُغيّر' then 8000
      when 'غير مدفوع' then 1000
      when 'بيع ملغى' then 1000
      when 'صرف أ' then 2000
      when 'صرف ب' then 2000
      when 'سباق الصرف' then 1500
      else 10000
    end;
    kind := case label
      when 'نسبة تاريخية' then 'percentage'::public.commission_type
      else 'fixed'::public.commission_type
    end;
    value := case label
      when 'نسبة تاريخية' then 5
      when 'ثابت مباشر' then 300
      when 'صرف أ' then 100
      when 'صرف ب' then 300
      when 'سباق الصرف' then 50
      else 10
    end;
    insert into public.products (name, category_id, store_id, list_price, commission_type, commission_value)
    values (label, category_id, store_id, price, kind, value);
    insert into public.product_media (product_id, kind, storage_path, mime_type, size_bytes, is_primary)
    select product.id, 'image', 'products/p4b-' || product.id::text || '.jpg', 'image/jpeg', 1000, true
    from public.products product
    where product.name = label;
    update public.products product set status = 'available' where product.name = label;
  end loop;
end $$;

-- (a) 10,000 at 5% is 500. (b) a fixed 300 stays 300, and cannot exceed the price.
do $$
declare
  result private.earning_result;
begin
  result := private.calc_earnings((select id from public.products where name = 'نسبة تاريخية'), null, 10000, now());
  if result.base_amount <> 500 or result.bonus_amount <> 0 or result.total <> 500 then
    raise exception 'percentage example was %', result.base_amount;
  end if;
  result := private.calc_earnings((select id from public.products where name = 'ثابت مباشر'), null, 10000, now());
  if result.base_amount <> 300 or result.total <> 300 then
    raise exception 'fixed example was %', result.base_amount;
  end if;
  result := private.calc_earnings((select id from public.products where name = 'ثابت مباشر'), null, 100, now());
  if result.base_amount <> 100 then
    raise exception 'fixed commission exceeded the price';
  end if;
end $$;

-- (c) a price-range bonus adds 200. (d) stacked bonuses stop at the stricter cap.
insert into public.bonus_rules (name, bonus_type, bonus_value, price_min, price_max)
values ('نطاق السعر', 'fixed', 200, 8000, 20000);

do $$
declare
  result private.earning_result;
  line_sum numeric;
begin
  result := private.calc_earnings((select id from public.products where name = 'نسبة تاريخية'), null, 10000, now());
  if result.bonus_amount <> 200 or result.base_amount <> 500 or result.total <> 700 then
    raise exception 'price-range bonus was %', result.bonus_amount;
  end if;
  result := private.calc_earnings((select id from public.products where name = 'نسبة تاريخية'), null, 7000, now());
  if result.bonus_amount <> 0 then
    raise exception 'a price outside the range earned a bonus';
  end if;

  insert into public.bonus_rules (name, bonus_type, bonus_value, price_min, price_max)
  values ('سقف البونص', 'fixed', 300, 8000, 20000);
  update public.app_settings set value = '400' where key = 'bonus_cap_amount';
  result := private.calc_earnings((select id from public.products where name = 'نسبة تاريخية'), null, 10000, now());
  select coalesce(sum((line ->> 'amount')::numeric), 0) into line_sum
  from jsonb_array_elements(result.bonus_lines) line;
  if result.bonus_amount <> 400 or line_sum <> 400 then
    raise exception 'stacked cap was % / %', result.bonus_amount, line_sum;
  end if;
  update public.app_settings set value = 'null' where key = 'bonus_cap_amount';
end $$;

update public.bonus_rules set is_active = false where name = 'سقف البونص';

set role app_tester;
select set_config('request.jwt.claims', '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}', false);

select public.complete_sale(
  jsonb_build_array(jsonb_build_object(
    'public_code', (select public_code from public.v_catalog where name = 'نسبة تاريخية'),
    'price', 10000
  )),
  '{"name":"عميل النسبة","phone":"01018181818"}'::jsonb,
  'كاش',
  null
);

select public.complete_sale(
  jsonb_build_array(jsonb_build_object(
    'public_code', (select public_code from public.v_catalog where name = 'غير مدفوع'),
    'price', 1000
  )),
  '{"name":"عميل غير مدفوع","phone":"01019191919"}'::jsonb,
  'كاش',
  null
);

select public.complete_sale(
  jsonb_build_array(jsonb_build_object(
    'public_code', (select public_code from public.v_catalog where name = 'بيع ملغى'),
    'price', 1000
  )),
  '{"name":"عميل ملغى","phone":"01020202020"}'::jsonb,
  'كاش',
  null
);

select public.complete_sale(
  jsonb_build_array(jsonb_build_object(
    'public_code', (select public_code from public.v_catalog where name = 'صرف أ'),
    'price', 2000
  )),
  '{"name":"عميل صرف أ","phone":"01021212121"}'::jsonb,
  'كاش',
  null
);

select public.complete_sale(
  jsonb_build_array(jsonb_build_object(
    'public_code', (select public_code from public.v_catalog where name = 'صرف ب'),
    'price', 2000
  )),
  '{"name":"عميل صرف ب","phone":"01022222222"}'::jsonb,
  'كاش',
  null
);

select public.complete_sale(
  jsonb_build_array(jsonb_build_object(
    'public_code', (select public_code from public.v_catalog where name = 'سباق الصرف'),
    'price', 1500
  )),
  '{"name":"عميل سباق","phone":"01023232323"}'::jsonb,
  'كاش',
  null
);

-- 11. Sales cannot approve, and an unpaid sale needs a reason.
do $$
begin
  perform public.approve_commissions(
    array[(
      select c.id from public.v_my_commissions c
      join public.v_my_sales s on s.id = c.sale_id
      where s.customer_name = 'عميل غير مدفوع' and c.kind = 'earning'
    )],
    null
  );
  raise exception 'sales approved a commission';
exception
  when insufficient_privilege then
    null;
end $$;

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}', false);

do $$
declare
  earning_id uuid;
begin
  select c.id into earning_id
  from public.commissions c
  join public.sales s on s.id = c.sale_id
  where s.customer_name = 'عميل غير مدفوع' and c.kind = 'earning';
  begin
    perform public.approve_commissions(array[earning_id], null);
    raise exception 'an unpaid commission was approved';
  exception
    when check_violation then
      if sqlerrm not like '%override_required%' then
        raise;
      end if;
  end;
  if (select status from public.commissions where id = earning_id) <> 'pending' then
    raise exception 'a refused approval changed the commission';
  end if;
end $$;

-- (e) The sold commission keeps its snapshot after the rule and the product change.
do $$
declare
  earning_id uuid;
begin
  select c.id into earning_id
  from public.commissions c
  join public.sales s on s.id = c.sale_id
  where s.customer_name = 'عميل النسبة' and c.kind = 'earning';
  if (select base_amount from public.commissions where id = earning_id) <> 500
    or (select bonus_amount from public.commissions where id = earning_id) <> 200
    or (select b.amount from public.commission_bonuses b where b.commission_id = earning_id) <> 200 then
    raise exception 'the sale did not snapshot the 500 plus 200 bonus';
  end if;

  update public.bonus_rules set bonus_value = 50 where name = 'نطاق السعر';
  perform public.bulk_update_commission(
    '{}'::jsonb,
    array[(select id from public.products where name = 'نسبة تاريخية')],
    'fixed',
    77,
    'تعديل بعد البيع'
  );
  if (select base_type from public.commissions where id = earning_id) <> 'percentage'
    or (select base_value from public.commissions where id = earning_id) <> 5
    or (select base_amount from public.commissions where id = earning_id) <> 500
    or (select bonus_amount from public.commissions where id = earning_id) <> 200
    or (select b.amount from public.commission_bonuses b where b.commission_id = earning_id) <> 200 then
    raise exception 'a later rule or product edit changed a historical commission';
  end if;
end $$;

-- (f) Bulk 5% on the 5,000–15,000 slice, then undo only the rows still holding that value.
do $$
declare
  rule uuid;
begin
  begin
    perform public.bulk_update_commission('{"search":"لا قطعة بهذا الاسم"}'::jsonb, '{}'::uuid[], 'percentage', 5, null);
    raise exception 'an empty bulk match was stored';
  exception
    when check_violation then
      if sqlerrm not like '%no_matches%' then
        raise;
      end if;
  end;

  rule := public.bulk_update_commission(
    jsonb_build_object('search', 'شريحة', 'price_min', 5000, 'price_max', 15000),
    '{}'::uuid[],
    'percentage',
    5,
    'شريحة السعر'
  );
  if (select commission_type from public.products where name = 'شريحة داخل') <> 'percentage'
    or (select commission_value from public.products where name = 'شريحة داخل') <> 5
    or (select commission_type from public.products where name = 'شريحة تُغيّر') <> 'percentage'
    or (select commission_value from public.products where name = 'شريحة خارج') <> 10
    or (select affected_count from public.commission_rules where id = rule) <> 2 then
    raise exception 'the price slice did not update exactly the two matching products';
  end if;

  update public.products
  set commission_type = 'fixed', commission_value = 1
  where name = 'شريحة داخل';
  perform public.undo_bulk_commission(rule);
  if (select commission_type from public.products where name = 'شريحة داخل') <> 'fixed'
    or (select commission_value from public.products where name = 'شريحة داخل') <> 1
    or (select commission_type from public.products where name = 'شريحة تُغيّر') <> 'fixed'
    or (select commission_value from public.products where name = 'شريحة تُغيّر') <> 10
    or (select undone_at from public.commission_rules where id = rule) is null then
    raise exception 'undo did not keep the edited row and restore the other';
  end if;
  begin
    perform public.undo_bulk_commission(rule);
    raise exception 'a batch was undone twice';
  exception
    when check_violation then
      if sqlerrm not like '%already_undone%' then
        raise;
      end if;
  end;
end $$;

-- Cancelled sale cannot be approved, even if the commission is put back to pending.
select public.cancel_sale(
  (select id from public.sales where customer_name = 'عميل ملغى'),
  'إلغاء قبل الاعتماد',
  'available',
  null
);

do $$
begin
  if (
    select c.status from public.commissions c
    join public.sales s on s.id = c.sale_id
    where s.customer_name = 'عميل ملغى' and c.kind = 'earning'
  ) <> 'cancelled' then
    raise exception 'cancelling the sale left the commission pending';
  end if;
end $$;

reset role;
update public.commissions c
set status = 'pending'
from public.sales s
where s.id = c.sale_id and s.customer_name = 'عميل ملغى' and c.kind = 'earning';

set role app_tester;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}', false);

do $$
declare
  earning_id uuid;
begin
  select c.id into earning_id
  from public.commissions c
  join public.sales s on s.id = c.sale_id
  where s.customer_name = 'عميل ملغى' and c.kind = 'earning';
  begin
    perform public.approve_commissions(array[earning_id], 'سبب لا يكفي');
    raise exception 'a cancelled sale was approved';
  exception
    when check_violation then
      if sqlerrm not like '%sale_cancelled%' then
        raise;
      end if;
  end;
end $$;

reset role;
update public.commissions c
set status = 'cancelled'
from public.sales s
where s.id = c.sale_id and s.customer_name = 'عميل ملغى' and c.kind = 'earning';

set role app_tester;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}', false);

-- 12. Pay the approved commission, then a clawback waits for a later payout that can cover it.
select public.record_sale_payment(
  (select id from public.sales where customer_name = 'عميل صرف أ'),
  'payment',
  2000,
  (timezone('Africa/Cairo', now()))::date,
  'كاش',
  null,
  null
);

do $$
declare
  earning_id uuid;
  payment uuid;
begin
  select c.id into earning_id
  from public.commissions c
  join public.sales s on s.id = c.sale_id
  where s.customer_name = 'عميل صرف أ' and c.kind = 'earning';
  perform public.approve_commissions(array[earning_id], null);
  payment := public.record_commission_payout(
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    (timezone('Africa/Cairo', now()))::date,
    'كاش',
    null
  );
  if (select total_amount from public.commission_payments where id = payment) <> 100
    or (select status from public.commissions where id = earning_id) <> 'paid'
    or (select payment_id from public.commissions where id = earning_id) <> payment then
    raise exception 'the first payout did not pay the 100 commission';
  end if;
end $$;

select public.cancel_sale(
  (select id from public.sales where customer_name = 'عميل صرف أ'),
  'إلغاء بعد الصرف',
  'available',
  jsonb_build_object(
    'amount', 2000,
    'method', 'كاش',
    'reason', 'إلغاء بعد الصرف',
    'paid_at', (timezone('Africa/Cairo', now()))::date
  )
);

do $$
declare
  original uuid;
begin
  select c.id into original
  from public.commissions c
  join public.sales s on s.id = c.sale_id
  where s.customer_name = 'عميل صرف أ' and c.kind = 'earning';
  if (select count(*) from public.commissions where original_commission_id = original and kind = 'clawback') <> 1
    or (select status from public.commissions where id = original) <> 'paid'
    or (select total_amount from public.commissions where id = original) <> 100 then
    raise exception 'the paid commission was rewritten instead of one clawback';
  end if;
  begin
    perform public.record_commission_payout(
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      (timezone('Africa/Cairo', now()))::date,
      'كاش',
      null
    );
    raise exception 'a negative payout was stored';
  exception
    when check_violation then
      if sqlerrm not like '%negative_payout%' then
        raise;
      end if;
  end;
  if (select status from public.commissions where original_commission_id = original) <> 'approved' then
    raise exception 'the refused payout consumed the clawback';
  end if;
end $$;

select public.record_sale_payment(
  (select id from public.sales where customer_name = 'عميل صرف ب'),
  'payment',
  2000,
  (timezone('Africa/Cairo', now()))::date,
  'كاش',
  null,
  null
);

do $$
declare
  earning uuid;
  original uuid;
  payment uuid;
begin
  select c.id into earning
  from public.commissions c
  join public.sales s on s.id = c.sale_id
  where s.customer_name = 'عميل صرف ب' and c.kind = 'earning';
  select c.id into original
  from public.commissions c
  join public.sales s on s.id = c.sale_id
  where s.customer_name = 'عميل صرف أ' and c.kind = 'earning';
  perform public.approve_commissions(array[earning], null);
  payment := public.record_commission_payout(
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    (timezone('Africa/Cairo', now()))::date,
    'كاش',
    null
  );
  if (select total_amount from public.commission_payments where id = payment) <> 200
    or (select payment_id from public.commissions where id = earning) <> payment
    or (select payment_id from public.commissions where original_commission_id = original) <> payment
    or (select payment_id from public.commissions where id = original) = payment
    or (select total_amount from public.commissions where id = original) <> 100 then
    raise exception 'the clawback was not deducted from the next payout';
  end if;
end $$;

-- Leave exactly one approved commission for the two-session payout race.
select public.record_sale_payment(
  (select id from public.sales where customer_name = 'عميل سباق'),
  'payment',
  1500,
  (timezone('Africa/Cairo', now()))::date,
  'كاش',
  null,
  null
);

select public.approve_commissions(
  array[(
    select c.id from public.commissions c
    join public.sales s on s.id = c.sale_id
    where s.customer_name = 'عميل سباق' and c.kind = 'earning'
  )],
  null
);

do $$
begin
  if (
    select count(*) from public.commissions
    where user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' and status = 'approved'
  ) <> 1 then
    raise exception 'the payout race does not have exactly one approved commission';
  end if;
  begin
    perform public.save_bonus_rule(null, 'بدون نطاق', 'fixed', 10, null, null, null, null, null, null, null);
    raise exception 'a bonus without a scope was stored';
  exception
    when check_violation then
      if sqlerrm not like '%bonus_scope_required%' then
        raise;
      end if;
  end;
  perform public.set_bonus_active(
    public.save_bonus_rule(null, 'بونص مؤقت', 'fixed', 25, 1000, 2000, null, null, null, null, null),
    false
  );
  if (select total_amount from public.commissions c join public.sales s on s.id = c.sale_id
      where s.customer_name = 'عميل سباق' and c.kind = 'earning') <> 50 then
    raise exception 'a bonus saved after the sale changed its commission';
  end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}', false);
do $$
begin
  perform public.record_commission_payout(
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    (timezone('Africa/Cairo', now()))::date,
    'كاش',
    null
  );
  raise exception 'sales recorded a payout';
exception
  when insufficient_privilege then
    null;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'v_my_commissions'
      and column_name in ('store_id', 'code', 'min_price')
  ) then
    raise exception 'earnings expose a private column';
  end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"}', false);
do $$
begin
  perform public.update_setting('default_commission_value', '9');
  raise exception 'a regular admin changed the default commission';
exception
  when insufficient_privilege then
    null;
end $$;

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}', false);
select public.update_setting('default_commission_value', '1');
select public.update_setting('default_commission_value', '0');

reset role;
select set_config('request.jwt.claims', '', false);
