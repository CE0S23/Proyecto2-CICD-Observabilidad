import { LoggerService } from '@nestjs/common';
import { logger } from './logger';

/** Adaptador para que los logs internos de Nest tambien salgan en JSON via pino (y lleguen por OTLP). */
export class PinoNestLogger implements LoggerService {
  log(message: unknown, context?: string) {
    logger.info({ context }, String(message));
  }
  error(message: unknown, trace?: string, context?: string) {
    logger.error({ context, event: 'exception', err: { stack: trace } }, String(message));
  }
  warn(message: unknown, context?: string) {
    logger.warn({ context }, String(message));
  }
  debug(message: unknown, context?: string) {
    logger.debug({ context }, String(message));
  }
  verbose(message: unknown, context?: string) {
    logger.trace({ context }, String(message));
  }
}
