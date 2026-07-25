#!/bin/bash
# Creates one local Postgres database per Tally service and applies that
# service's own schema to it. Runs once, on first container startup, via
# Postgres's own /docker-entrypoint-initdb.d convention (only fires against
# an empty data directory — safe to re-run docker-compose up any time after).
#
# Mirrors production: 4 separate Neon projects, one per service, no shared
# database. This is the local-dev equivalent — 4 databases in the one local
# Postgres container rather than 4 separate containers (see docker-compose.yml
# for why: no isolation benefit locally, real startup/resource overhead).
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    CREATE DATABASE tally_auth;
    CREATE DATABASE tally_expense;
    CREATE DATABASE tally_budget;
    CREATE DATABASE tally_group;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" -d tally_auth    -f /schemas/auth-schema.sql
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" -d tally_expense -f /schemas/expense-schema.sql
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" -d tally_budget  -f /schemas/budget-schema.sql
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" -d tally_group   -f /schemas/group-schema.sql
