import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { setupApp } from './app.setup';
import { logger } from './common/logger';
import { PinoNestLogger } from './common/nest-logger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: new PinoNestLogger() });
  app.getHttpAdapter().getInstance().set('trust proxy', true);
  setupApp(app);
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';
  await app.listen(port, host);
  logger.info({ event: 'startup', host, port }, `API escuchando en http://${host}:${port}/api`);
}

process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logger.error({ event: 'exception', kind: 'unhandledRejection', err: { message: err.message, stack: err.stack } }, err.message);
});

bootstrap().catch((err: Error) => {
  logger.fatal({ event: 'exception', kind: 'bootstrap', err: { message: err.message, stack: err.stack } }, 'Fallo al iniciar');
  process.exit(1);
});
