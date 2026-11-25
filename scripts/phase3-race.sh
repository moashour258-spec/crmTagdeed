#!/usr/bin/env bash
# Two sessions compete. Exactly one reservation and exactly one sale must win.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
db="${DATABASE_URL:-}"
if [[ -z "$db" ]]; then
  psql=(sudo -u postgres psql -d tajdeed -v ON_ERROR_STOP=1 -q)
else
  psql=(psql "$db" -v ON_ERROR_STOP=1 -q)
fi

code="$("${psql[@]}" -Atc "select public_code from public.products where name = 'سباق'")"
reserve_sql="select set_config('request.jwt.claims', '{\"sub\":\"cccccccc-cccc-cccc-cccc-cccccccccccc\"}', false); set role app_tester; select public.reserve_by_code('${code}', null);"

log_a="$(mktemp)"
log_b="$(mktemp)"
"${psql[@]}" -c "$reserve_sql" >"$log_a" 2>&1 &
pid_a=$!
"${psql[@]}" -c "$reserve_sql" >"$log_b" 2>&1 &
pid_b=$!
ok=0
wait "$pid_a" && ok=$((ok + 1)) || true
wait "$pid_b" && ok=$((ok + 1)) || true
if [[ "$ok" -ne 1 ]]; then
  echo "expected one reservation to win, got $ok" >&2
  cat "$log_a" "$log_b" >&2
  exit 1
fi
rm -f "$log_a" "$log_b"

"${psql[@]}" -c "update public.reservations set status = 'cancelled', ended_at = now() where status = 'active' and product_id = (select id from public.products where name = 'سباق'); update public.products set status = 'available' where name = 'سباق';"

sale_sql="select set_config('request.jwt.claims', '{\"sub\":\"cccccccc-cccc-cccc-cccc-cccccccccccc\"}', false); set role app_tester; select public.complete_sale(jsonb_build_array(jsonb_build_object('public_code', '${code}', 'price', 2200)), '{\"name\":\"سباق\",\"phone\":\"01077777777\"}'::jsonb, 'كاش', null);"
log_a="$(mktemp)"
log_b="$(mktemp)"
"${psql[@]}" -c "$sale_sql" >"$log_a" 2>&1 &
pid_a=$!
"${psql[@]}" -c "$sale_sql" >"$log_b" 2>&1 &
pid_b=$!
ok=0
wait "$pid_a" && ok=$((ok + 1)) || true
wait "$pid_b" && ok=$((ok + 1)) || true
if [[ "$ok" -ne 1 ]]; then
  echo "expected one sale to win, got $ok" >&2
  cat "$log_a" "$log_b" >&2
  exit 1
fi
rm -f "$log_a" "$log_b"

set_code="$("${psql[@]}" -Atc "select public_code from public.products where name = 'طقم سباق'")"
whole_sql="select set_config('request.jwt.claims', '{\"sub\":\"cccccccc-cccc-cccc-cccc-cccccccccccc\"}', false); set role app_tester; select public.complete_sale(jsonb_build_array(jsonb_build_object('public_code', '${set_code}', 'price', 4000)), '{\"name\":\"طقم\",\"phone\":\"01088888888\"}'::jsonb, 'كاش', null);"
piece_sql="select set_config('request.jwt.claims', '{\"sub\":\"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"}', false); set role app_tester; select public.complete_sale(jsonb_build_array(jsonb_build_object('public_code', '${set_code}', 'suffix', 'A', 'price', 2000)), '{\"name\":\"قطعة\",\"phone\":\"01099999999\"}'::jsonb, 'كاش', null);"
log_a="$(mktemp)"
log_b="$(mktemp)"
"${psql[@]}" -c "$whole_sql" >"$log_a" 2>&1 &
pid_a=$!
"${psql[@]}" -c "$piece_sql" >"$log_b" 2>&1 &
pid_b=$!
ok=0
wait "$pid_a" && ok=$((ok + 1)) || true
wait "$pid_b" && ok=$((ok + 1)) || true
if [[ "$ok" -ne 1 ]]; then
  echo "expected one of the set or the piece to win, got $ok" >&2
  cat "$log_a" "$log_b" >&2
  exit 1
fi
rm -f "$log_a" "$log_b"
echo "phase 3 race checks passed"
