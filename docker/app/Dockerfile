# Contenedor 1 "app": NGINX (Angular estatico + proxy /api) + backend NestJS, ambos con supervisord.
# Build multi-stage: (1) frontend Angular, (2) dependencias backend, (3) compilacion NestJS, (4) runtime.
# El orden de capas permite que un commit que solo cambia codigo reutilice dependencias y paquetes del sistema.

# ---------- Etapa 1: build del frontend ----------
FROM node:20-bookworm-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npx ng build --configuration production

# ---------- Etapa 2: dependencias del backend (cacheables: solo cambian con package-lock o schema) ----------
FROM node:20-bookworm-slim AS backend-deps
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /build/backend
COPY backend/package*.json ./
COPY backend/prisma/schema.prisma ./prisma/schema.prisma
RUN npm ci --no-audit --no-fund && npx prisma generate

# Dependencias de produccion (incluye el CLI de prisma para "migrate deploy" y el cliente generado)
FROM backend-deps AS backend-prod-deps
RUN npm prune --omit=dev --no-audit --no-fund

# ---------- Etapa 3: compilacion del backend (lo unico que se repite en cada commit) ----------
FROM backend-deps AS backend
COPY backend/ ./
RUN npm run build

# ---------- Etapa 4: runtime ----------
FROM node:20-bookworm-slim
ENV NODE_ENV=production

# NGINX oficial (nginx.org) + modulo OpenTelemetry para que la traza empiece en el proxy.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg openssl supervisor gettext-base \
 && curl -fsSL https://nginx.org/keys/nginx_signing.key | gpg --dearmor -o /usr/share/keyrings/nginx.gpg \
 && echo "deb [signed-by=/usr/share/keyrings/nginx.gpg] http://nginx.org/packages/debian bookworm nginx" > /etc/apt/sources.list.d/nginx.list \
 && apt-get update && apt-get install -y --no-install-recommends nginx nginx-module-otel \
 && rm -rf /var/lib/apt/lists/* /etc/nginx/conf.d/default.conf

# Capas de menos a mas cambiantes: configuracion -> dependencias -> frontend -> codigo compilado.
COPY docker/app/nginx.conf /etc/nginx/nginx.conf
COPY docker/app/supervisord.conf /etc/supervisor/conf.d/app.conf
COPY --chmod=755 docker/app/start-backend.sh /opt/backend/start-backend.sh
WORKDIR /opt/backend
COPY --from=backend-prod-deps /build/backend/node_modules ./node_modules
COPY --from=frontend /build/frontend/dist/frontend/browser /usr/share/nginx/html
COPY --from=backend /build/backend/package.json ./package.json
COPY --from=backend /build/backend/prisma ./prisma
COPY --from=backend /build/backend/dist ./dist

ARG GIT_COMMIT=local
ENV GIT_COMMIT=${GIT_COMMIT}

EXPOSE 80
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD curl -fsS -H 'x-health-probe: 1' http://127.0.0.1/api/health || exit 1
CMD ["/usr/bin/supervisord", "-n", "-c", "/etc/supervisor/supervisord.conf"]
