#!/usr/bin/env bash
# Aplica shim + migrações numa base temporária e executa os testes SQL.
# Requer PostgreSQL local (psql) e um utilizador com permissão para criar bases.
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${TEST_DB:-jovem_test}
PSQL="psql -v ON_ERROR_STOP=1 -q -X"
export PGOPTIONS="--client-min-messages=notice"
if [ -n "${PGHOST:-}" ] || [ "$(id -u)" != "0" ]; then RUN="$PSQL"; else RUN="su postgres -c"; fi
as_pg() { if [ "$(id -u)" = "0" ]; then su postgres -c "$*"; else bash -c "$*"; fi; }
as_pg "psql -q -X -c 'drop database if exists $DB' -c 'create database $DB'" >/dev/null
as_pg "$PSQL -d $DB -f $PWD/tests/shim.sql"
for f in migrations/*.sql; do echo "-- migração $f"; as_pg "$PSQL -d $DB -f $PWD/$f"; done
node "$PWD/../scripts/gen-calc-sql.mjs" > tests/sql/02_calc_parity.sql
node "$PWD/../scripts/gen-inspection-sql.mjs" > tests/sql/05_inspection_parity.sql
for t in tests/sql/*.sql; do echo "-- teste $t"; as_pg "$PSQL -d $DB -f $PWD/$t"; done
echo "TODOS OS TESTES SQL PASSARAM"
