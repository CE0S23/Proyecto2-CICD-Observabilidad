import pino from 'pino';

/**
 * Logger estructurado JSON. La instrumentacion OTel de pino inyecta trace_id/span_id
 * en cada registro y ademas lo envia al Logs SDK (OTLP) -> Collector -> OpenObserve.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { service: process.env.OTEL_SERVICE_NAME || 'proyecto2-backend' },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: { level: (label) => ({ level: label }) },
});
