#!/usr/bin/env bash
# Demo de criterios de aceptacion (ejecutar minutos antes de presentar).
#   1) Push con FALLO intencional: GET /api/users responde 500 -> Playwright/Jest fallan,
#      el evento test_run llega a OpenObserve como failure y el job deploy queda "skipped" (sin SSH).
#   2) Push EXITOSO: se revierte el error -> pruebas pasan -> deploy a EC2 -> evento deploy success.
#   3) Consulta en OpenObserve los eventos del pipeline.
# Requisitos: git con acceso push a origin/main, GitHub CLI (gh) autenticado, curl y jq.
# Variables opcionales para el paso 3: O2_URL, O2_USER, O2_PASSWORD.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
CTRL=backend/src/users/users.controller.ts
BRANCH=main

wait_run() {
  local sha="$1" id=""
  echo ">> Esperando la ejecucion de GitHub Actions para $sha ..."
  for _ in $(seq 1 60); do
    id=$(gh run list --branch "$BRANCH" --workflow ci-cd.yml --json databaseId,headSha \
      --jq ".[] | select(.headSha==\"$sha\") | .databaseId" | head -n1)
    [ -n "$id" ] && break
    sleep 5
  done
  [ -z "$id" ] && { echo "No se encontro la ejecucion"; return 1; }
  gh run watch "$id" --exit-status || true
  gh run view "$id" --json conclusion,jobs --jq '"conclusion=\(.conclusion)", (.jobs[] | "  \(.name): \(.conclusion)")'
}

echo "=== PASO 1: push con error intencional ==="
grep -q 'DEMO-FAIL-HOOK' "$CTRL" || { echo "No se encontro el marcador DEMO-FAIL-HOOK en $CTRL"; exit 1; }
# Reemplaza la linea siguiente al marcador por un error 500 intencional
sed -i '/DEMO-FAIL-HOOK/{n;s#.*#    throw new InternalServerErrorException('"'"'DEMO: error intencional en GET /api/users'"'"');#}' "$CTRL"
sed -i 's#^import { Body, Controller,#import { InternalServerErrorException, Body, Controller,#' "$CTRL"
git add "$CTRL"
git commit -m "demo: error intencional en GET /api/users (500)"
git push origin "$BRANCH"
FAIL_SHA=$(git rev-parse HEAD)
wait_run "$FAIL_SHA"

echo
echo "=== PASO 2: push exitoso (revert del error) ==="
git revert --no-edit HEAD
git push origin "$BRANCH"
OK_SHA=$(git rev-parse HEAD)
wait_run "$OK_SHA"

echo
echo "=== PASO 3: eventos en OpenObserve (stream cicd_pipeline) ==="
if [ -n "${O2_URL:-}" ] && [ -n "${O2_USER:-}" ] && [ -n "${O2_PASSWORD:-}" ]; then
  end=$(( $(date +%s) * 1000000 )); start=$(( end - 3600 * 1000000 ))
  curl -fsS -u "$O2_USER:$O2_PASSWORD" -H 'Content-Type: application/json' \
    -X POST "$O2_URL/api/default/_search?type=logs" \
    -d "{\"query\":{\"sql\":\"SELECT _timestamp, event, status, commit_sha, branch, actor FROM \\\"cicd_pipeline\\\" WHERE commit_sha IN ('$FAIL_SHA','$OK_SHA') ORDER BY _timestamp\",\"start_time\":$start,\"end_time\":$end,\"from\":0,\"size\":50}}" \
    | python3 -c "import sys,json; [print(json.dumps(h, ensure_ascii=False)) for h in json.load(sys.stdin)['hits']]" 2>/dev/null \
    || python -c "import sys,json; [print(json.dumps(h, ensure_ascii=False)) for h in json.load(sys.stdin)['hits']]"
else
  echo "Define O2_URL, O2_USER y O2_PASSWORD para consultar los eventos."
fi
echo "Commit con fallo: $FAIL_SHA"
echo "Commit exitoso:   $OK_SHA"
