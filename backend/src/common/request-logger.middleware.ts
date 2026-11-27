import { Injectable, NestMiddleware } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import type { NextFunction, Request, Response } from 'express';
import { logger } from './logger';
import { httpDuration, httpErrors, httpRequests } from './http-metrics';

/**
 * Registra cada request (metodo, ruta, statusCode, latencia, timestamp, trace_id)
 * y alimenta las metricas por endpoint.
 */
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const start = process.hrtime.bigint();
    const spanCtx = trace.getActiveSpan()?.spanContext();

    res.on('finish', () => {
      const latencyMs = Number(process.hrtime.bigint() - start) / 1e6;
      const route = req.route?.path ? `${req.baseUrl || ''}${req.route.path}` : req.originalUrl.split('?')[0];
      const statusCode = res.statusCode;
      const attrs = { method: req.method, route, status_code: String(statusCode) };

      httpDuration.record(latencyMs, attrs);
      httpRequests.add(1, attrs);
      if (statusCode >= 400) {
        httpErrors.add(1, { ...attrs, error_class: statusCode >= 500 ? '5xx' : '4xx' });
      }

      const entry = {
        event: 'http_request',
        method: req.method,
        route,
        path: req.originalUrl,
        statusCode,
        latency_ms: Math.round(latencyMs * 100) / 100,
        timestamp: new Date().toISOString(),
        trace_id: spanCtx?.traceId,
        span_id: spanCtx?.spanId,
        user_agent: req.headers['user-agent'],
        client_ip: (req.headers['x-real-ip'] as string) || req.ip,
      };
      const msg = `${req.method} ${route} ${statusCode}`;
      if (statusCode >= 500) logger.error(entry, msg);
      else if (statusCode >= 400) logger.warn(entry, msg);
      else logger.info(entry, msg);
    });
    next();
  }
}
