#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
db="${DATABASE_URL:-}"
if [[ -z "$db" ]]; then
  psql=(sudo -u postgres psql -d tajdeed -v ON_ERROR_STOP=1)
else
  psql=(psql "$db" -v ON_ERROR_STOP=1)
fi
"${psql[@]}" -f "$root/scripts/reset-harness.sql"
for file in "$root"/supabase/migrations/*.sql; do
  echo "apply $(basename "$file")"
  "${psql[@]}" -f "$file"
done
"${psql[@]}" -f "$root/supabase/tests/phase0.sql"
"${psql[@]}" -f "$root/supabase/tests/phase1.sql"
"${psql[@]}" -f "$root/supabase/tests/phase2.sql"
"${psql[@]}" -f "$root/supabase/tests/phase3.sql"
bash "$root/scripts/phase3-race.sh"
"${psql[@]}" -f "$root/supabase/tests/phase4.sql"
bash "$root/scripts/phase4-race.sh"
"${psql[@]}" -f "$root/supabase/tests/phase4b.sql"
bash "$root/scripts/phase4b-race.sh"
"${psql[@]}" -f "$root/supabase/tests/phase5.sql"
echo "phase 0 through 5 database checks passed"
