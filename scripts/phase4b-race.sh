#!/usr/bin/env bash
# Two payouts of the same approved commission. Only one may succeed.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
db="${DATABASE_URL:-}"
if [[ -z "$db" ]]; then
  psql=(sudo -u postgres psql -d tajdeed -v ON_ERROR_STOP=1 -q)
else
  psql=(psql "$db" -v ON_ERROR_STOP=1 -q)
fi

seller="cccccccc-cccc-cccc-cccc-cccccccccccc"
before="$("${psql[@]}" -Atc "select count(*) from public.commission_payments where user_id = '${seller}'")"
payout="select set_config('request.jwt.claims', '{\"sub\":\"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\"}', false); set role app_tester; select public.record_commission_payout('${seller}'::uuid, (timezone('Africa/Cairo', now()))::date, 'كاش', null);"

log_a="$(mktemp)"
log_b="$(mktemp)"
"${psql[@]}" -c "$payout" >"$log_a" 2>&1 &
pid_a=$!
"${psql[@]}" -c "$payout" >"$log_b" 2>&1 &
pid_b=$!
ok=0
wait "$pid_a" && ok=$((ok + 1)) || true
wait "$pid_b" && ok=$((ok + 1)) || true
if [[ "$ok" -ne 1 ]]; then
  echo "expected one parallel payout to win, got $ok" >&2
  cat "$log_a" "$log_b" >&2
  exit 1
fi
rm -f "$log_a" "$log_b"

after="$("${psql[@]}" -Atc "select count(*) from public.commission_payments where user_id = '${seller}'")"
linked="$("${psql[@]}" -Atc "select count(distinct payment_id) from public.commissions c join public.sales s on s.id = c.sale_id where s.customer_name = 'عميل سباق' and c.kind = 'earning' and c.status = 'paid'")"
if [[ "$after" -ne $((before + 1)) || "$linked" -ne 1 ]]; then
  echo "the race commission was paid $linked times, payments $before -> $after" >&2
  exit 1
fi
echo "phase 4B race checks passed (10)"
