# Contenedor 1 "app": NGINX (Angular estatico + proxy /api) + backend NestJS, ambos con supervisord.
# Build multi-stage: (1) frontend Angular, (2) backend NestJS + Prisma, (3) imagen final de runtime.

# ---------- Etapa 1: build del frontend ----------
FROM node:20-bookworm-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npx ng build --configuration production

# ---------- Etapa 2: build del backend ----------
FROM node:20-bookworm-slim AS backend
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /build/backend
COPY backend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY backend/ ./
RUN npx prisma generate && npm run build && npm prune --omit=dev && npx prisma generate

# ---------- Etapa 3: runtime ----------
FROM node:20-bookworm-slim
ARG GIT_COMMIT=local
ENV NODE_ENV=production GIT_COMMIT=${GIT_COMMIT}

# NGINX oficial (nginx.org) + modulo OpenTelemetry para que la traza empiece en el proxy.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg openssl supervisor gettext-base \
 && curl -fsSL https://nginx.org/keys/nginx_signing.key | gpg --dearmor -o /usr/share/keyrings/nginx.gpg \
 && echo "deb [signed-by=/usr/share/keyrings/nginx.gpg] http://nginx.org/packages/debian bookworm nginx" > /etc/apt/sources.list.d/nginx.list \
 && apt-get update && apt-get install -y --no-install-recommends nginx nginx-module-otel \
 && rm -rf /var/lib/apt/lists/* /etc/nginx/conf.d/default.conf

WORKDIR /opt/backend
COPY --from=backend /build/backend/node_modules ./node_modules
COPY --from=backend /build/backend/dist ./dist
COPY --from=backend /build/backend/prisma ./prisma
COPY --from=backend /build/backend/package.json ./package.json
COPY --from=frontend /build/frontend/dist/frontend/browser /usr/share/nginx/html

COPY docker/app/nginx.conf /etc/nginx/nginx.conf
COPY docker/app/supervisord.conf /etc/supervisor/conf.d/app.conf
COPY docker/app/start-backend.sh /opt/backend/start-backend.sh
RUN chmod +x /opt/backend/start-backend.sh

EXPOSE 80
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD curl -fsS -H 'x-health-probe: 1' http://127.0.0.1/api/health || exit 1
CMD ["/usr/bin/supervisord", "-n", "-c", "/etc/supervisor/supervisord.conf"]
