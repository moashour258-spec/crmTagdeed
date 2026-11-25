-- Phase 4A checks. Runs after the phase 3 race in the same database.
\set ON_ERROR_STOP on

do $$
declare
  category_id uuid;
  store_id uuid;
  label text;
begin
  select id into category_id from public.categories where slug = 'karasi';
  select id into store_id from public.stores where store_code = 'ALT';
  foreach label in array array['دفع أ', 'دفع ب', 'أقساط', 'حد', 'صالح', 'تداخل 1', 'تداخل 2', 'إيصال']
  loop
    insert into public.products (name, category_id, store_id, list_price, min_price, commission_type, commission_value)
    values (
      label,
      category_id,
      store_id,
      case label when 'حد' then 4000 when 'أقساط' then 3000 when 'إيصال' then 5000 when 'دفع أ' then 2000 when 'صالح' then 1500 else 1000 end,
      case when label = 'حد' then 3000 else null end,
      'fixed',
      10
    );
    insert into public.product_media (product_id, kind, storage_path, mime_type, size_bytes, is_primary)
    select product.id, 'image', 'products/p4-' || product.name || '.jpg', 'image/jpeg', 1000, true
    from public.products product where product.name = label;
    update public.products product set status = 'available' where product.name = label;
  end loop;
end $$;

set role app_tester;
select set_config('request.jwt.claims', '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}', false);

select public.complete_sale(
  jsonb_build_array(
    jsonb_build_object('public_code', (select public_code from public.v_catalog where name = 'دفع أ'), 'price', 2000),
    jsonb_build_object('public_code', (select public_code from public.v_catalog where name = 'دفع ب'), 'price', 1000)
  ),
  '{"name":"عميل الإلغاء","phone":"01012121212"}'::jsonb,
  'كاش',
  null
);

select public.complete_sale(
  jsonb_build_array(jsonb_build_object('public_code', (select public_code from public.v_catalog where name = 'أقساط'), 'price', 3000)),
  '{"name":"عميل الأقساط","phone":"01013131313"}'::jsonb,
  'تقسيط',
  null
);

select public.complete_sale(
  jsonb_build_array(jsonb_build_object('public_code', (select public_code from public.v_catalog where name = 'إيصال'), 'price', 5000)),
  '{"name":"عميل الإيصال","phone":"01014141414"}'::jsonb,
  'كاش',
  null
);

-- 20. Sales cannot cancel or change delivery, and a low price names the item only.
do $$
begin
  perform public.set_delivery(
    (select id from public.v_my_sales where customer_name = 'عميل الإلغاء'),
    'scheduled', current_date, null, null
  );
  raise exception 'sales changed a delivery';
exception
  when insufficient_privilege then
    null;
end $$;

do $$
begin
  perform public.cancel_sale_item(gen_random_uuid(), 'سبب', 'available', null);
  raise exception 'sales cancelled an item';
exception
  when insufficient_privilege then
    null;
end $$;

do $$
begin
  perform public.complete_sale(
    jsonb_build_array(
      jsonb_build_object('public_code', (select public_code from public.v_catalog where name = 'صالح'), 'price', 1500),
      jsonb_build_object('public_code', (select public_code from public.v_catalog where name = 'حد'), 'price', 10)
    ),
    '{"name":"عميل مرفوض","phone":"01015151515"}'::jsonb,
    'كاش',
    null
  );
  raise exception 'a basket with one low price was stored';
exception
  when check_violation then
    if sqlerrm like '%3000%' or sqlerrm like '%4000%' then
      raise exception 'basket error leaked the floor: %', sqlerrm;
    end if;
    if sqlerrm not like '%حد%' then
      raise exception 'basket error did not name the item: %', sqlerrm;
    end if;
end $$;

do $$
begin
  if (select count(*) from public.v_my_sales where customer_name = 'عميل مرفوض') <> 0
    or (select count(*) from public.sale_payments) <> 0
    or exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name in ('v_my_sales', 'v_my_sale_items', 'sale_payment_summary', 'installment_status')
        and column_name in ('store_id', 'code', 'min_price')
    ) then
    raise exception 'sales can see a payment table or a private column';
  end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}', false);

-- 14. Range, future date, append-only.
do $$
declare
  sale_id uuid;
begin
  select id into sale_id from public.sales where customer_name = 'عميل الأقساط';
  begin
    perform public.record_sale_payment(sale_id, 'payment', 1, ((timezone('Africa/Cairo', now()))::date + 1), 'كاش', null, null);
    raise exception 'a future payment was accepted';
  exception
    when check_violation then
      if sqlerrm not like '%future_payment_date%' then
        raise;
      end if;
  end;
  perform public.record_sale_payment(sale_id, 'payment', 3000, (timezone('Africa/Cairo', now()))::date, 'كاش', null, null);
  begin
    perform public.record_sale_payment(sale_id, 'payment', 1, (timezone('Africa/Cairo', now()))::date, 'كاش', null, null);
    raise exception 'a payment above the total was accepted';
  exception
    when check_violation then
      if sqlerrm not like '%payment_out_of_range%' then
        raise;
      end if;
  end;
  begin
    perform public.record_sale_payment(sale_id, 'refund', 3001, (timezone('Africa/Cairo', now()))::date, 'كاش', null, 'زيادة');
    raise exception 'a refund below zero was accepted';
  exception
    when check_violation then
      if sqlerrm not like '%payment_out_of_range%' then
        raise;
      end if;
  end;
end $$;

reset role;
do $$
begin
  update public.sale_payments set note = 'tamper' where kind = 'payment';
  raise exception 'a payment row was updated';
exception
  when insufficient_privilege then
    null;
end $$;

do $$
begin
  delete from public.sale_payments where kind = 'payment';
  raise exception 'a payment row was deleted';
exception
  when insufficient_privilege then
    null;
end $$;

-- Put the installment sale back to a partial payment for the FIFO checks.
set role app_tester;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}', false);
select public.record_sale_payment(
  (select id from public.sales where customer_name = 'عميل الأقساط'),
  'refund', 1500, (timezone('Africa/Cairo', now()))::date, 'كاش', null, 'تجهيز الاختبار'
);

select public.set_installment_plan(
  (select id from public.sales where customer_name = 'عميل الأقساط'),
  jsonb_build_array(
    jsonb_build_object('seq', 0, 'due_date', (timezone('Africa/Cairo', now()))::date - 1, 'amount', 1000),
    jsonb_build_object('seq', 1, 'due_date', (timezone('Africa/Cairo', now()))::date + 10, 'amount', 2000)
  )
);

do $$
declare
  sid uuid;
begin
  select id into sid from public.sales where customer_name = 'عميل الأقساط';
  if (select status from public.installment_status where installment_status.sale_id = sid and seq = 0) <> 'paid' then
    raise exception 'the down payment was not covered';
  end if;
  if (select status from public.installment_status where installment_status.sale_id = sid and seq = 1) <> 'partial' then
    raise exception 'the later installment was not partial';
  end if;
  perform public.record_sale_payment(sid, 'payment', 1500, (timezone('Africa/Cairo', now()))::date, 'تحويل', null, null);
  if (select count(*) from public.installment_status where installment_status.sale_id = sid and status = 'paid') <> 2 then
    raise exception 'full payment did not settle both installments';
  end if;
  perform public.record_sale_payment(sid, 'refund', 2000, (timezone('Africa/Cairo', now()))::date, 'كاش', null, 'رجوع');
  if (select status from public.installment_status where installment_status.sale_id = sid and seq = 0) <> 'paid'
    or (select status from public.installment_status where installment_status.sale_id = sid and seq = 1) <> 'upcoming' then
    raise exception 'the refund did not rewind the installment status';
  end if;
end $$;

-- 19. Refund is required when the customer paid more than the new total, and it commits with the cancellation.
do $$
declare
  sid uuid;
  small_id uuid;
  large_id uuid;
begin
  select id into sid from public.sales where customer_name = 'عميل الإلغاء';
  perform public.record_sale_payment(sid, 'payment', 3000, (timezone('Africa/Cairo', now()))::date, 'كاش', null, null);
  select line.id into small_id
  from public.sale_items line
  join public.products product on product.id = line.product_id
  where line.sale_id = sid and product.name = 'دفع ب';
  select line.id into large_id
  from public.sale_items line
  join public.products product on product.id = line.product_id
  where line.sale_id = sid and product.name = 'دفع أ';
  begin
    perform public.cancel_sale_item(small_id, 'غير مطلوب', 'available', null);
    raise exception 'cancel without the required refund was accepted';
  exception
    when check_violation then
      if sqlerrm not like '%refund_required%' then
        raise;
      end if;
  end;
  if (select status from public.sale_items where id = small_id) <> 'active' then
    raise exception 'a refused cancel still changed the item';
  end if;
  perform public.cancel_sale_item(
    small_id, 'مرتجع', 'available',
    jsonb_build_object('amount', 1000, 'method', 'كاش', 'reason', 'زيادة عن الإجمالي')
  );
  if (select is_live from public.sale_items where id = small_id)
    or (select status from public.products where name = 'دفع ب') <> 'available'
    or (select total_price from public.sales where id = sid) <> 2000
    or (select net_paid from public.sale_payment_summary where sale_payment_summary.sale_id = sid) <> 2000
    or (select installments_need_review from public.sales where id = sid) is not true
    or (select status from public.sales where id = sid) <> 'completed' then
    raise exception 'the refund and the cancellation did not commit together';
  end if;
  perform public.set_delivery(sid, 'scheduled', (timezone('Africa/Cairo', now()))::date - 1, 'عنوان', null);
  perform public.cancel_sale_item(
    large_id, 'آخر قطعة', 'available',
    jsonb_build_object('amount', 2000, 'method', 'كاش', 'reason', 'إلغاء البيع')
  );
  if (select status from public.sales where id = sid) <> 'cancelled'
    or (select is_live from public.sale_items where id = large_id) then
    raise exception 'cancelling the last item did not cancel the sale';
  end if;
end $$;

select public.reschedule_installments(
  (select id from public.sales where customer_name = 'عميل الأقساط'),
  jsonb_build_array(
    jsonb_build_object('seq', 0, 'due_date', (timezone('Africa/Cairo', now()))::date - 1, 'amount', 1000),
    jsonb_build_object('seq', 1, 'due_date', (timezone('Africa/Cairo', now()))::date - 1, 'amount', 2000)
  ),
  'تأخير للاختبار'
);

select public.set_delivery(
  (select id from public.sales where customer_name = 'عميل الأقساط'),
  'scheduled',
  (timezone('Africa/Cairo', now()))::date - 1,
  'عنوان',
  null
);

select set_config('request.jwt.claims', '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}', false);
do $$
begin
  if (select delivery_status from public.v_my_sales where customer_name = 'عميل الإلغاء') is not null then
    raise exception 'a cancelled sale still shows delivery data';
  end if;
end $$;

select set_config('request.jwt.claims', '', false);
reset role;
do $$
begin
  if public.delivery_digest() < 1 then
    raise exception 'the late delivery was not reported';
  end if;
  if public.overdue_installments_digest() < 1 then
    raise exception 'the overdue installment was not reported';
  end if;
end $$;

do $$
begin
  if exists (select 1 from public.products where name in ('تداخل 1', 'تداخل 2') and status <> 'available')
    or (select count(*) from public.sales where customer_name = 'عميل الإيصال') <> 1 then
    raise exception 'the race fixtures were consumed';
  end if;
end $$;
