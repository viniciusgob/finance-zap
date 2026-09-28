#!/usr/bin/env sh
# Postgres local no macOS via Homebrew (alternativa ao Docker).
# Cria o usuário/banco esperados pelo DATABASE_URL padrão do .env.example.
set -e

PG_FORMULA="postgresql@16"

if ! command -v brew >/dev/null 2>&1; then
  echo "[setup-postgres-mac] Homebrew não encontrado. Instale em https://brew.sh" >&2
  exit 1
fi

if ! brew list "$PG_FORMULA" >/dev/null 2>&1; then
  echo "[setup-postgres-mac] Instalando $PG_FORMULA…"
  brew install "$PG_FORMULA"
fi

PG_BIN="$(brew --prefix "$PG_FORMULA")/bin"

brew services start "$PG_FORMULA" >/dev/null
node scripts/wait-for-postgres.mjs

"$PG_BIN/psql" -d postgres -v ON_ERROR_STOP=1 -q -c "
DO \$\$BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'finance') THEN
    CREATE ROLE finance LOGIN PASSWORD 'finance' CREATEDB;
  END IF;
END\$\$;"

if ! "$PG_BIN/psql" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'finance_zap'" | grep -q 1; then
  "$PG_BIN/createdb" -O finance finance_zap
fi

echo "[setup-postgres-mac] Postgres pronto (finance/finance@localhost:5432/finance_zap)."
