import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { logger } from '../common/logger';
import { PublicUser, UsersService } from '../users/users.service';
import { LoginDto, RegisterDto } from './auth.dto';
import { JwtPayload } from './jwt-auth.guard';

export interface AuthResult {
  access_token: string;
  token_type: 'Bearer';
  user: PublicUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const user = await this.users.create({ name: dto.name, email: dto.email, password: dto.password, role: 'USER' });
    logger.info({ event: 'user_registered', user_id: user.id }, 'Usuario registrado');
    return this.sign(user);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const found = await this.users.findByEmail(dto.email);
    const ok = found ? await bcrypt.compare(dto.password, found.password) : false;
    if (!found || !ok) {
      logger.warn({ event: 'login_failed', email: dto.email }, 'Credenciales invalidas');
      throw new UnauthorizedException('Credenciales invalidas');
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _hash, ...user } = found;
    logger.info({ event: 'login_success', user_id: user.id }, 'Inicio de sesion');
    return this.sign(user);
  }

  private async sign(user: PublicUser): Promise<AuthResult> {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    return { access_token: await this.jwt.signAsync(payload), token_type: 'Bearer', user };
  }
}
