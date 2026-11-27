import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import type { Request, Response } from 'express';
import { logger } from './logger';

/** Filtro global: responde JSON uniforme y registra las excepciones (con stack) en logs y en la traza. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = isHttp ? exception.getResponse() : { statusCode: status, message: 'Internal server error' };

    if (status >= 500) {
      const err = exception instanceof Error ? exception : new Error(String(exception));
      const span = trace.getActiveSpan();
      span?.recordException(err);
      span?.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      logger.error(
        {
          event: 'exception',
          method: req.method,
          path: req.originalUrl,
          statusCode: status,
          err: { type: err.name, message: err.message, stack: err.stack },
        },
        `Excepcion no controlada: ${err.message}`,
      );
    }
    res.status(status).json(typeof body === 'string' ? { statusCode: status, message: body } : body);
  }
}
