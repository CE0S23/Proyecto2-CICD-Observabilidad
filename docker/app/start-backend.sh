#!/bin/sh
# Aplica migraciones, ejecuta el seed del admin y arranca la API con OpenTelemetry precargado.
set -e
cd /opt/backend

echo "[start-backend] Esperando a PostgreSQL y aplicando migraciones..."
i=0
until npx prisma migrate deploy; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then echo "[start-backend] La BD no respondio"; exit 1; fi
  sleep 2
done

node dist/prisma/seed.js

export HOST=127.0.0.1
export PORT=3000
exec node -r ./dist/src/tracing.js dist/src/main.js
