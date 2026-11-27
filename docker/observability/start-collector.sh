#!/bin/sh
# Calcula el header Basic Auth para OpenObserve, espera a que este arriba y arranca el Collector.
set -e
O2_BASIC_AUTH=$(printf '%s:%s' "$ZO_ROOT_USER_EMAIL" "$ZO_ROOT_USER_PASSWORD" | base64 | tr -d '\n')
export O2_BASIC_AUTH
i=0
until curl -fsS http://127.0.0.1:5080/healthz >/dev/null 2>&1; do
  i=$((i + 1)); [ "$i" -ge 60 ] && break
  sleep 1
done
exec /usr/local/bin/otelcol-contrib --config /etc/otelcol/config.yaml
