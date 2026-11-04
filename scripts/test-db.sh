#!/usr/bin/env bash
# Roda os testes de banco (*.db.test.ts) num Postgres TEMPORÁRIO em Docker.
# Nunca usa o Supabase: as URLs abaixo têm precedência sobre o .env (o dotenv não sobrescreve
# variáveis já definidas) e o container é descartado no fim, mesmo se os testes falharem.
set -euo pipefail

NAME="barberboard-test-db-$$"
PORT="${TEST_DB_PORT:-54330}"
URL="postgresql://postgres:test@localhost:${PORT}/postgres"

docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=test -p "${PORT}:5432" postgres:17-alpine >/dev/null
trap 'docker stop "$NAME" >/dev/null 2>&1 || true' EXIT

# Espera aceitar conexões TCP (durante a inicialização o Postgres só escuta no socket local).
for _ in $(seq 1 60); do
  docker exec "$NAME" psql -U postgres -h 127.0.0.1 -c "select 1" >/dev/null 2>&1 && break
  sleep 0.5
done

DIRECT_URL="$URL" DATABASE_URL="$URL" pnpm exec prisma migrate deploy
TEST_DATABASE_URL="$URL" pnpm exec tsx --test "src/**/*.db.test.ts"
