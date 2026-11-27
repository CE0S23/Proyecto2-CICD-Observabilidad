import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** GET /api/health: verifica que la API responde y que la conexion a PostgreSQL funciona. */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    const started = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (e) {
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'down',
        error: e instanceof Error ? e.message : String(e),
      });
    }
    return {
      status: 'ok',
      database: 'up',
      db_latency_ms: Date.now() - started,
      version: process.env.APP_VERSION || '1.0.0',
      commit: process.env.GIT_COMMIT || 'local',
      uptime_s: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
