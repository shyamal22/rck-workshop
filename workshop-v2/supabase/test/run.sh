#!/usr/bin/env sh
# Runs every migration, then every test, on the database in $DATABASE_URL.
# Meant for a throwaway local Postgres, never a real project:
#   DATABASE_URL=postgres://postgres@localhost:5432/rckw2_test sh supabase/test/run.sh
set -eu
cd "$(dirname "$0")/.."
: "${DATABASE_URL:?set DATABASE_URL to a throwaway database}"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f test/00_stub_supabase.sql
for m in migrations/*.sql; do
  echo "migration $m"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$m"
done
for t in test/*.test.sql; do
  echo "test $t"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$t"
done
echo "database: all passed"
