#!/usr/bin/env bash
# Demo de criterios de aceptacion (ejecutar minutos antes de presentar). Meta: <= 8 minutos.
#   1) Push con FALLO intencional (GET /api/users -> 500). Espera SOLO a que el job "test" termine en failure
#      y verifica que el job deploy quede "skipped" (sin SSH).
#   2) Inmediatamente, push del revert. Espera a que la corrida termine en success y a que /api/health
#      responda 200 con el commit desplegado.
#   3) Verifica en OpenObserve los eventos test_run/deploy de ambos commits e imprime duracion total y URLs.
# Requisitos: git con push a origin, GitHub CLI (gh) autenticado, curl y python.
# Variables: BRANCH (por defecto la rama actual), APP_URL, O2_URL, O2_USER, O2_PASSWORD.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
CTRL=backend/src/users/users.controller.ts
BRANCH=${BRANCH:-$(git branch --show-current)}
REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
APP_URL=${APP_URL:-http://3.21.72.98}
PY=$(command -v python3 || command -v python)
T0=$(date +%s)

elapsed() { echo "$(( $(date +%s) - T0 ))s"; }
log() { echo "[$(date +%H:%M:%S) +$(elapsed)] $*"; }

# Devuelve el id de la corrida del workflow para un SHA (polling cada 3 s, max 3 min).
run_id_for() {
  local sha="$1" id=""
  for _ in $(seq 1 60); do
    id=$(gh api "repos/$REPO/actions/runs?head_sha=$sha&per_page=5" --jq '.workflow_runs[] | select(.name=="CI-CD") | .id' 2>/dev/null | head -n1 || true)
    [ -n "$id" ] && { echo "$id"; return 0; }
    sleep 3
  done
  return 1
}

# Estado "status:conclusion" de un job por prefijo de nombre.
job_state() {
  gh api "repos/$REPO/actions/runs/$1/jobs" --jq ".jobs[] | select(.name|startswith(\"$2\")) | \"\(.status):\(.conclusion)\"" 2>/dev/null | head -n1 || true
}

grep -q 'DEMO-FAIL-HOOK' "$CTRL" || { echo "No se encontro el marcador DEMO-FAIL-HOOK en $CTRL"; exit 1; }
git diff --quiet "$CTRL" || { echo "$CTRL tiene cambios sin commit; abortando"; exit 1; }

# ---------------- PASO 1: commit con error ----------------
log "PASO 1: push con error intencional en GET /api/users (rama $BRANCH)"
sed -i '/DEMO-FAIL-HOOK/{n;s#.*#    throw new InternalServerErrorException('"'"'DEMO: error intencional en GET /api/users'"'"');#}' "$CTRL"
sed -i 's#^import { Body, Controller,#import { InternalServerErrorException, Body, Controller,#' "$CTRL"
git add "$CTRL"
git commit -q -m "demo: error intencional en GET /api/users (500)"
git push -q origin "$BRANCH"
FAIL_SHA=$(git rev-parse HEAD)
FAIL_RUN=$(run_id_for "$FAIL_SHA")
log "Corrida con error: https://github.com/$REPO/actions/runs/$FAIL_RUN"

while :; do
  st=$(job_state "$FAIL_RUN" "Pruebas")
  case "$st" in
    completed:failure) log "Job test = failure (Jest/Playwright detectaron el error)"; break ;;
    completed:*) log "ERROR: el job test termino como '$st' (se esperaba failure)"; exit 1 ;;
  esac
  sleep 3
done
for _ in $(seq 1 20); do
  dep=$(job_state "$FAIL_RUN" "Desplegar")
  [ "$dep" = "completed:skipped" ] && break
  sleep 3
done
[ "$dep" = "completed:skipped" ] || { log "ERROR: deploy no quedo skipped ($dep)"; exit 1; }
log "Deploy = skipped -> no hubo conexion SSH a la EC2"

# ---------------- PASO 2: revert inmediato ----------------
log "PASO 2: push del revert"
git revert --no-edit HEAD >/dev/null
git push -q origin "$BRANCH"
OK_SHA=$(git rev-parse HEAD)
OK_RUN=$(run_id_for "$OK_SHA")
log "Corrida exitosa: https://github.com/$REPO/actions/runs/$OK_RUN"

while :; do
  read -r status conclusion < <(gh api "repos/$REPO/actions/runs/$OK_RUN" --jq '"\(.status) \(.conclusion)"' 2>/dev/null || echo "x x")
  if [ "$status" = "completed" ]; then
    [ "$conclusion" = "success" ] || { log "ERROR: la corrida termino como '$conclusion'"; exit 1; }
    break
  fi
  sleep 3
done
log "Corrida exitosa completa (test + deploy + reportes)"

for _ in $(seq 1 20); do
  body=$(curl -s -m 5 "$APP_URL/api/health" || true)
  echo "$body" | grep -q "\"commit\":\"$OK_SHA\"" && echo "$body" | grep -q '"status":"ok"' && break
  body=""
  sleep 3
done
[ -n "$body" ] || { log "ERROR: /api/health no respondio 200 con el commit $OK_SHA"; exit 1; }
log "/api/health = 200 con el commit ${OK_SHA:0:7} desplegado"

# ---------------- PASO 3: eventos en OpenObserve ----------------
EVENTS="(no verificado: define O2_URL, O2_USER y O2_PASSWORD)"
if [ -n "${O2_URL:-}" ] && [ -n "${O2_USER:-}" ] && [ -n "${O2_PASSWORD:-}" ]; then
  for _ in $(seq 1 20); do
    end=$(( $(date +%s) * 1000000 )); start=$(( end - 3600 * 1000000 ))
    EVENTS=$(curl -s -u "$O2_USER:$O2_PASSWORD" -H 'Content-Type: application/json' -X POST "$O2_URL/api/default/_search?type=logs" \
      -d "{\"query\":{\"sql\":\"SELECT event, status, commit_sha FROM \\\"cicd_pipeline\\\" WHERE commit_sha IN ('$FAIL_SHA','$OK_SHA')\",\"start_time\":$start,\"end_time\":$end,\"from\":0,\"size\":20}}" \
      | "$PY" -c "
import sys, json
hits = json.load(sys.stdin).get('hits', [])
got = {(h['commit_sha'][:7], h['event'], h['status']) for h in hits}
need = {('${FAIL_SHA:0:7}','test_run','failure'), ('${FAIL_SHA:0:7}','deploy','skipped'),
        ('${OK_SHA:0:7}','test_run','success'), ('${OK_SHA:0:7}','deploy','success')}
print(('OK ' if need <= got else 'FALTAN ') + ', '.join(f'{c} {e}={s}' for c, e, s in sorted(got)))
" 2>/dev/null || echo "FALTAN (error de consulta)")
    [[ "$EVENTS" == OK* ]] && break
    sleep 3
  done
fi

echo
echo "================ RESUMEN DE LA DEMO ================"
echo "Duracion total:     $(elapsed)  ($(( ($(date +%s) - T0) / 60 )) min $(( ($(date +%s) - T0) % 60 )) s)"
echo "Corrida con error:  https://github.com/$REPO/actions/runs/$FAIL_RUN  (commit ${FAIL_SHA:0:7}: test=failure, deploy=skipped)"
echo "Corrida exitosa:    https://github.com/$REPO/actions/runs/$OK_RUN  (commit ${OK_SHA:0:7}: test=success, deploy=success)"
echo "OpenObserve:        $EVENTS"
echo "===================================================="
[[ "$EVENTS" == OK* || "$EVENTS" == "(no verificado"* ]]
