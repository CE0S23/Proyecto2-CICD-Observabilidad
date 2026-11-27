/**
 * Bootstrap de OpenTelemetry. Se carga ANTES que la app con `node -r ./dist/src/tracing.js`
 * para que las auto-instrumentaciones (http, express, pg, pino) y Prisma parcheen los modulos.
 * Exporta trazas, metricas y logs via OTLP/HTTP al OpenTelemetry Collector, que los reenvia a OpenObserve.
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { PeriodicExportingMetricReader, AggregationTemporality } from '@opentelemetry/sdk-metrics';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { PrismaInstrumentation } from '@prisma/instrumentation';

const disabled = process.env.OTEL_SDK_DISABLED === 'true';
const endpoint = (process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://127.0.0.1:4318').replace(/\/$/, '');

if (!disabled) {
  const sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'proyecto2-backend',
      [ATTR_SERVICE_VERSION]: process.env.APP_VERSION || '1.0.0',
      'deployment.environment': process.env.APP_ENV || 'production',
    }),
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: `${endpoint}/v1/metrics`,
        temporalityPreference: AggregationTemporality.CUMULATIVE,
      }),
      exportIntervalMillis: Number(process.env.OTEL_METRIC_EXPORT_INTERVAL || 15000),
    }),
    logRecordProcessors: [new BatchLogRecordProcessor(new OTLPLogExporter({ url: `${endpoint}/v1/logs` }))],
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
        '@opentelemetry/instrumentation-http': {
          // Las sondas internas de salud (supervisor/compose) no generan trazas para no ensuciar.
          ignoreIncomingRequestHook: (req) => req.headers['x-health-probe'] === '1',
        },
      }),
      new PrismaInstrumentation(),
    ],
  });
  sdk.start();
  const shutdown = () => {
    sdk.shutdown().finally(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
