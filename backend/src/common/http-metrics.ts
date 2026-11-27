import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('proyecto2-backend-http', '1.0.0');

/** Histograma de latencia por endpoint (ms) con etiquetas method, route y status_code. */
export const httpDuration = meter.createHistogram('http.server.duration', {
  description: 'Latencia de las peticiones HTTP por endpoint',
  unit: 'ms',
  advice: { explicitBucketBoundaries: [5, 10, 25, 50, 75, 100, 250, 500, 750, 1000, 2500, 5000] },
});

/** Contador de peticiones (RPS = rate de este contador). */
export const httpRequests = meter.createCounter('http.server.requests', {
  description: 'Total de peticiones HTTP por endpoint',
});

/** Contador de errores 4xx/5xx por endpoint. */
export const httpErrors = meter.createCounter('http.server.errors', {
  description: 'Total de respuestas HTTP con error (4xx/5xx) por endpoint',
});
