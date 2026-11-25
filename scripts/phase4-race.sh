#!/usr/bin/env bash
# Overlapping baskets in opposite order, and two receipts on one sale.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
db="${DATABASE_URL:-}"
if [[ -z "$db" ]]; then
  psql=(sudo -u postgres psql -d tajdeed -v ON_ERROR_STOP=1 -q)
else
  psql=(psql "$db" -v ON_ERROR_STOP=1 -q)
fi

first="$("${psql[@]}" -Atc "select public_code from public.products where name = 'تداخل 1'")"
second="$("${psql[@]}" -Atc "select public_code from public.products where name = 'تداخل 2'")"
sale="$("${psql[@]}" -Atc "select id from public.sales where customer_name = 'عميل الإيصال'")"

basket() {
  local user="$1"
  local one="$2"
  local two="$3"
  local price_one="$4"
  local price_two="$5"
  local phone="$6"
  echo "select set_config('request.jwt.claims', '{\"sub\":\"${user}\"}', false); set role app_tester; select public.complete_sale(jsonb_build_array(jsonb_build_object('public_code', '${one}', 'price', ${price_one}), jsonb_build_object('public_code', '${two}', 'price', ${price_two})), '{\"name\":\"تداخل\",\"phone\":\"${phone}\"}'::jsonb, 'كاش', null);"
}

log_a="$(mktemp)"
log_b="$(mktemp)"
"${psql[@]}" -c "$(basket cccccccc-cccc-cccc-cccc-cccccccccccc "$first" "$second" 800 900 01016161616)" >"$log_a" 2>&1 &
pid_a=$!
"${psql[@]}" -c "$(basket bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb "$second" "$first" 900 800 01017171717)" >"$log_b" 2>&1 &
pid_b=$!
ok=0
wait "$pid_a" && ok=$((ok + 1)) || true
wait "$pid_b" && ok=$((ok + 1)) || true
if [[ "$ok" -ne 1 ]]; then
  echo "expected one overlapping basket to win, got $ok" >&2
  cat "$log_a" "$log_b" >&2
  exit 1
fi
rm -f "$log_a" "$log_b"
leftover="$("${psql[@]}" -Atc "select count(*) from public.sale_items where sale_id in (select id from public.sales where customer_name = 'تداخل') and is_live")"
if [[ "$leftover" -ne 2 ]]; then
  echo "the winning basket did not keep both lines" >&2
  exit 1
fi

pay() {
  echo "select set_config('request.jwt.claims', '{\"sub\":\"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\"}', false); set role app_tester; select public.record_sale_payment('${sale}'::uuid, 'payment', 100, (timezone('Africa/Cairo', now()))::date, 'كاش', null, null);"
}
log_a="$(mktemp)"
log_b="$(mktemp)"
"${psql[@]}" -c "$(pay)" >"$log_a" 2>&1 &
pid_a=$!
"${psql[@]}" -c "$(pay)" >"$log_b" 2>&1 &
pid_b=$!
ok=0
wait "$pid_a" && ok=$((ok + 1)) || true
wait "$pid_b" && ok=$((ok + 1)) || true
if [[ "$ok" -ne 2 ]]; then
  echo "expected both receipts to be recorded, got $ok" >&2
  cat "$log_a" "$log_b" >&2
  exit 1
fi
rm -f "$log_a" "$log_b"
numbers="$("${psql[@]}" -Atc "select string_agg(substring(receipt_no from 4)::int::text, ',' order by receipt_no) from public.sale_payments where sale_id = '${sale}'")"
echo "phase 4A race checks passed ($numbers)"
