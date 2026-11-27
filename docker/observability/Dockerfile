# Contenedor 3 "observability": OpenObserve + OpenTelemetry Collector (contrib) bajo supervisord.
FROM openobserve/openobserve:v0.15.3 AS o2
FROM otel/opentelemetry-collector-contrib:0.120.0 AS otel

FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl supervisor python3 \
 && rm -rf /var/lib/apt/lists/*

COPY --from=o2 /openobserve /usr/local/bin/openobserve
COPY --from=otel /otelcol-contrib /usr/local/bin/otelcol-contrib
COPY docker/observability/otel-collector.yaml /etc/otelcol/config.yaml
COPY docker/observability/supervisord.conf /etc/supervisor/conf.d/observability.conf
COPY docker/observability/start-collector.sh /usr/local/bin/start-collector.sh
COPY docker/observability/thermal_probe.py /usr/local/bin/thermal_probe.py
RUN chmod +x /usr/local/bin/start-collector.sh

ENV ZO_DATA_DIR=/data \
    ZO_HTTP_ADDR=0.0.0.0 \
    ZO_HTTP_PORT=5080 \
    ZO_GRPC_PORT=5081 \
    ZO_TELEMETRY=false \
    ZO_MEMORY_CACHE_MAX_SIZE=256 \
    ZO_MEMORY_CACHE_DATAFUSION_MAX_SIZE=256

VOLUME ["/data"]
EXPOSE 5080 4317 4318
HEALTHCHECK --interval=20s --timeout=5s --start-period=30s --retries=5 \
  CMD curl -fsS http://127.0.0.1:5080/healthz || exit 1
CMD ["/usr/bin/supervisord", "-n", "-c", "/etc/supervisor/supervisord.conf"]
