import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RequestLoggerMiddleware } from './common/request-logger.middleware';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.service';
import { UsersController } from './users/users.controller';
import { UsersService } from './users/users.service';

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      global: true,
      useFactory: () => {
        const secret = process.env.JWT_SECRET;
        if (!secret) throw new Error('JWT_SECRET no esta definido');
        return { secret, signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || '2h' } };
      },
    }),
  ],
  controllers: [HealthController, AuthController, UsersController],
  providers: [UsersService, AuthService, JwtAuthGuard],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
