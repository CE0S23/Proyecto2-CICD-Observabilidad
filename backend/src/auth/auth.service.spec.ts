import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

/** Pruebas unitarias de AuthService: registro, login correcto/incorrecto y firma del JWT. */
describe('AuthService (unit)', () => {
  const jwt = new JwtService({ secret: 'unit-test-secret', signOptions: { expiresIn: '1h' } });
  let users: any;
  let service: AuthService;

  beforeEach(async () => {
    const hash = await bcrypt.hash('Correcta123', 4);
    users = {
      create: jest.fn().mockImplementation((dto) =>
        Promise.resolve({ id: 7, name: dto.name, email: dto.email, role: 'USER', createdAt: new Date(), updatedAt: new Date() }),
      ),
      findByEmail: jest.fn().mockResolvedValue({
        id: 7,
        name: 'Ana',
        email: 'ana@test.com',
        role: 'USER',
        password: hash,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    };
    service = new AuthService(users, jwt);
  });

  it('register crea el usuario con rol USER y devuelve un JWT valido', async () => {
    const res = await service.register({ name: 'Ana', email: 'ana@test.com', password: 'Correcta123' });
    expect(users.create).toHaveBeenCalledWith(expect.objectContaining({ role: 'USER' }));
    expect(res.token_type).toBe('Bearer');
    const payload = await jwt.verifyAsync(res.access_token);
    expect(payload).toMatchObject({ sub: 7, email: 'ana@test.com', role: 'USER' });
  });

  it('login con credenciales correctas devuelve token y usuario sin password', async () => {
    const res = await service.login({ email: 'ana@test.com', password: 'Correcta123' });
    expect(res.access_token).toEqual(expect.any(String));
    expect((res.user as any).password).toBeUndefined();
  });

  it('login con password incorrecto lanza 401', async () => {
    await expect(service.login({ email: 'ana@test.com', password: 'mala' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('login con email inexistente lanza 401', async () => {
    users.findByEmail.mockResolvedValueOnce(null);
    await expect(service.login({ email: 'nadie@test.com', password: 'x' })).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
