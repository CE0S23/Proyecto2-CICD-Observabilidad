# Proyecto Parcial 2 — CI/CD + Pruebas Automatizadas + Observabilidad (OpenObserve)

**Alumno:** César Osvaldo Ramírez Pérez · **Matrícula:** 2023371167 · **Grupo:** IDGS16
**Materia:** Gestión del Proceso de Desarrollo · **Profesor:** M.C.C. Emmanuel Martínez Hernández
**Universidad Tecnológica de Querétaro (UTQ)**

| Recurso | URL |
|---|---|
| Aplicación (NGINX) | http://3.21.72.98 |
| Health check | http://3.21.72.98/api/health |
| OpenObserve (UI) | http://3.21.72.98:5080 |
| Repositorio | https://github.com/CE0S23/Proyecto2-CICD-Observabilidad |

Sistema con **Login, Register y CRUD de Users** (NestJS + PostgreSQL + Prisma + JWT/bcrypt, frontend Angular),
probado con **Jest** y **Playwright**, desplegado automáticamente en **AWS EC2** con **GitHub Actions** solo si las
pruebas pasan, e instrumentado con **OpenTelemetry** hacia **OpenObserve** (logs, métricas, trazas, métricas del host,
dashboards y alertas).

---

## 1. Arquitectura (solo 3 contenedores)

```
                      Internet (Elastic IP 3.21.72.98)
                 :80 │                          │ :5080
┌────────────────────▼─────────────┐   ┌────────▼──────────────────────────────┐
│ 1) app  (supervisord)            │   │ 3) observability (supervisord, red host)│
│  ┌────────────┐   /api  ┌──────┐ │   │  ┌─────────────┐  OTLP  ┌───────────┐ │
│  │ NGINX :80  │────────▶│ Nest │ │   │  │ OTel        │───────▶│OpenObserve│ │
│  │ Angular    │  proxy  │ :3000│ │   │  │ Collector   │        │  :5080 UI │ │
│  │ + otel mod │         │ OTel │─┼──▶│  │ :4317/:4318 │        └───────────┘ │
│  └────────────┘         └──┬───┘ │   │  │ hostmetrics │◀── /proc /sys (ro)   │
└────────────────────────────┼─────┘   │  └─────────────┘   sonda temperatura  │
                             │ red     └───────────────────────────────────────┘
                   ┌─────────▼────────┐
                   │ 2) db PostgreSQL │  (solo red interna, volumen pgdata)
                   └──────────────────┘
```

| # | Contenedor | Contenido | Puertos |
|---|---|---|---|
| 1 | `app` | NGINX (build estático de Angular + proxy inverso `/api` → `127.0.0.1:3000`) + backend NestJS, ambos con `supervisord`. Build multi-stage. | 80 público |
| 2 | `db` | PostgreSQL 16, volumen persistente `pgdata` | solo red interna |
| 3 | `observability` | OpenObserve + OpenTelemetry Collector (`otlp` + `hostmetrics` con `/proc` y `/sys` del host en solo lectura) + sonda de temperatura, con `supervisord` | 5080 público |

- Sin túneles (ni ngrok ni cloudflared): todo se accede por la Elastic IP.
- Todos los servicios escuchan en `0.0.0.0`; NGINX es la única puerta a la app.
- El contenedor `observability` usa `network_mode: host` para que `hostmetrics` mida la red real de la EC2;
  la app le envía OTLP vía `host.docker.internal` (host-gateway). Los puertos 4317/4318 no están abiertos en el Security Group.

### Flujo CI/CD

```
push a main ─▶ test (lint → Jest → build → docker compose → Playwright → artifacts)
                 ├──▶ report-tests (siempre) ── POST /api/default/cicd_pipeline/_json  (event=test_run)
                 └──▶ deploy (solo si test=success) ── SSH EC2: git pull → compose build → up -d → /api/health 200
                          └──▶ report-deploy (siempre) ── POST cicd_pipeline (event=deploy, status success/failure/skipped)
```
Si las pruebas fallan, `deploy` queda **skipped** y **no hay conexión SSH**.
Jest y Playwright se ejecutan **ambos** en cada corrida (`continue-on-error` + paso "Veredicto de pruebas"),
de modo que un error intencional en un endpoint es detectado por Jest **y** por Playwright antes de bloquear el deploy.

## 2. Estructura

```
backend/            NestJS + Prisma (auth JWT, CRUD users, health, OpenTelemetry, pino)
  src/tracing.ts    SDK OTel (trazas, métricas, logs OTLP) + Prisma/pg/http/express
  test/             Pruebas de API con supertest
frontend/           Angular 19 (login, registro, tabla y formulario de usuarios, guard + interceptor)
e2e/                Playwright: flujo en navegador + pruebas de API (request)
docker/app/         Dockerfile multi-stage, nginx.conf, supervisord.conf
docker/observability/ Dockerfile, otel-collector.yaml, supervisord.conf, thermal_probe.py
observability/      dashboards/*.json y alerts/*.json exportados de OpenObserve
scripts/demo.sh     Demo: push con fallo + push exitoso
.github/workflows/ci-cd.yml
```

## 3. API

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/health` | — | Estado de la API y de la conexión a PostgreSQL (`SELECT 1`) |
| POST | `/api/auth/register` | — | Registro (nombre, email, password ≥ 8; password con bcrypt) → JWT |
| POST | `/api/auth/login` | — | Login → `{ access_token, user }` |
| GET | `/api/auth/me` | JWT | Usuario actual |
| GET | `/api/users` | JWT | Listar |
| GET | `/api/users/:id` | JWT | Ver |
| POST | `/api/users` | JWT | Crear |
| PUT | `/api/users/:id` | JWT | Reemplazar |
| PATCH | `/api/users/:id` | JWT | Actualizar parcial |
| DELETE | `/api/users/:id` | JWT | Eliminar |

Errores: 400 (validación), 401 (sin token / token inválido / credenciales), 404 (no existe), 409 (email duplicado).

**Usuario admin de prueba (seed):** `admin@proyecto2.com` / `Admin12345!`

## 4. Correr en local

Requisitos: Docker + Docker Compose, Node 20.

```bash
cp .env.example .env            # editar contraseñas
docker compose up -d --build    # app (http://localhost), db y observability (http://localhost:5080)
curl http://localhost/api/health
```

> En Docker Desktop (Windows/macOS) `network_mode: host` y el montaje de `/` pueden no estar disponibles;
> en ese caso levanta solo `docker compose up -d --build app db` con `OTEL_SDK_DISABLED=true`.

Desarrollo sin contenedores:

```bash
cd backend && npm ci && npx prisma migrate deploy && npm run seed:dev && npm run start:dev   # :3000
cd frontend && npm ci && npx ng serve                                                         # :4200 (proxy /api)
```

### Pruebas

```bash
cd backend && npm test                 # unitarias (auth y users)
cd backend && npm run test:api         # supertest contra PostgreSQL (requiere DATABASE_URL)
cd e2e && npm ci && npx playwright install chromium
BASE_URL=http://localhost npx playwright test     # E2E navegador + API
npx playwright show-report reports/html
```

Reportes: `backend/reports/jest-junit.xml`, `e2e/reports/playwright-junit.xml`, `e2e/reports/html/`.
En CI se suben como artifacts `junit-reports` y `playwright-html-report`.

## 5. CI/CD (GitHub Actions)

Archivo `.github/workflows/ci-cd.yml` (push a `main` y `workflow_dispatch`).

| Secret | Uso |
|---|---|
| `EC2_HOST` | Elastic IP de la instancia |
| `EC2_USER` | `ubuntu` |
| `EC2_SSH_KEY` | Contenido de la llave privada `.pem` |
| `O2_URL` | `http://3.21.72.98:5080` |
| `O2_USER` / `O2_PASSWORD` | Credenciales Basic Auth de OpenObserve |
| `JWT_SECRET` | Secreto JWT para las pruebas en CI |
| `DATABASE_URL` | Referencia de la BD de pruebas del runner |

Eventos enviados a OpenObserve (stream `cicd_pipeline`):

```json
{ "event": "test_run", "status": "success|failure", "commit_sha": "...", "branch": "main", "actor": "...",
  "run_id": "...", "run_url": "...", "workflow": "CI-CD", "tests_total": 0, "tests_passed": 0, "tests_failed": 0,
  "timestamp": "2026-11-27T00:00:00Z" }
{ "event": "deploy", "status": "success|failure|skipped", "ssh_executed": "true|false", "commit_sha": "...",
  "branch": "main", "actor": "...", "timestamp": "..." }
```

## 6. Variables de entorno (`.env`)

| Variable | Descripción |
|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Credenciales de PostgreSQL (el backend arma `DATABASE_URL`) |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Firma y expiración del JWT |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Usuario admin creado por el seed |
| `O2_USER`, `O2_PASSWORD` | Usuario root de OpenObserve (también Basic Auth de ingesta) |
| `HOST_LABEL` | Etiqueta `host.name` de las métricas del host |
| `OTEL_SDK_DISABLED` | `true` para desactivar la telemetría (CI) |
| `GIT_COMMIT` | Commit desplegado (lo escribe el pipeline) |

## 7. Observabilidad (OpenObserve)

| Stream | Tipo | Contenido |
|---|---|---|
| `app_logs` | logs | Logs JSON (pino → OTLP): método, ruta, statusCode, latency_ms, timestamp, trace_id, excepciones con stack |
| `default` | traces | Trazas NGINX → NestJS (http/express) → Prisma → PostgreSQL (`pg`) |
| `http_server_duration`, `http_server_requests`, `http_server_errors` | metrics | Histograma de latencia, RPS y errores 4xx/5xx con `method`, `route`, `status_code` |
| `system_*` | metrics | hostmetrics: CPU, memoria, red (bytes in/out), disco, filesystem, load |
| `host_temperature` | logs | Sonda de temperatura (N/D en EC2, ver limitación) |
| `cicd_pipeline` | logs | Eventos `test_run` y `deploy` del pipeline |

Dashboards (exportados en `observability/dashboards/`): **Aplicación**, **Infraestructura EC2**, **CI/CD**.
Alertas (`observability/alerts/`): 5xx > 5 %, latencia p95 > 1 s, CPU > 80 %, pipeline con status failure.

### Limitación: temperatura

Las instancias EC2 son VMs sobre el hipervisor Nitro y **no exponen sensores térmicos** al sistema operativo invitado:

```
$ ls /sys/class/thermal
cooling_device0  cooling_device1        # no hay thermal_zone*
$ ls /sys/class/hwmon/hwmon0
...                                     # sin temp*_input
```

La sonda `thermal_probe.py` lee esas rutas reales cada 30 s y publica `available=false`, `temperature_c=null`,
`status="N/D"` en el stream `host_temperature`; el panel de temperatura muestra **N/D** sin inventar datos.

## 8. Demo de criterios de aceptación

```bash
O2_URL=http://3.21.72.98:5080 O2_USER=... O2_PASSWORD=... bash scripts/demo.sh
```

1. Commit con error intencional (`GET /api/users` → 500): fallan Jest y Playwright, evento `test_run` = failure, `deploy` = skipped (sin SSH).
2. Revert: todo pasa, se actualizan los contenedores en EC2, evento `deploy` = success.
3. En OpenObserve se ven a la vez logs del pipeline, trazas HTTP y gráficas de CPU, ancho de banda, temperatura y RAM.
