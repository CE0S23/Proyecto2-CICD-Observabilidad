/**
 * Pruebas de API (supertest) contra la app Nest real y PostgreSQL real (DATABASE_URL).
 * Cubren register, login, CRUD con y sin token y los codigos 401/404/400/409.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'api-test-secret';

describe('API /api (supertest)', () => {
  let app: INestApplication;
  let http: any;
  let token: string;
  const stamp = Date.now();
  const email = `api.${stamp}@test.com`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication());
    await app.init();
    http = app.getHttpServer();
    await app.get(PrismaService).user.deleteMany({ where: { email: { startsWith: 'api.' } } });
  });

  afterAll(async () => {
    await app.get(PrismaService).user.deleteMany({ where: { email: { startsWith: 'api.' } } });
    await app.close();
  });

  it('GET /api/health -> 200 con la BD arriba', async () => {
    const res = await request(http).get('/api/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
  });

  describe('auth', () => {
    it('POST /api/auth/register -> 201 y JWT', async () => {
      const res = await request(http)
        .post('/api/auth/register')
        .send({ name: 'Api Tester', email, password: 'Password123' })
        .expect(201);
      expect(res.body.access_token).toEqual(expect.any(String));
      expect(res.body.user).toMatchObject({ email, role: 'USER' });
      expect(res.body.user.password).toBeUndefined();
    });

    it('POST /api/auth/register con email duplicado -> 409', async () => {
      await request(http).post('/api/auth/register').send({ name: 'Api Tester', email, password: 'Password123' }).expect(409);
    });

    it('POST /api/auth/register con datos invalidos -> 400', async () => {
      const res = await request(http)
        .post('/api/auth/register')
        .send({ name: '', email: 'no-es-email', password: '123' })
        .expect(400);
      expect(Array.isArray(res.body.message)).toBe(true);
    });

    it('POST /api/auth/login correcto -> 200 y token', async () => {
      const res = await request(http).post('/api/auth/login').send({ email, password: 'Password123' }).expect(200);
      token = res.body.access_token;
      expect(token).toEqual(expect.any(String));
    });

    it('POST /api/auth/login con password incorrecto -> 401', async () => {
      await request(http).post('/api/auth/login').send({ email, password: 'Incorrecta1' }).expect(401);
    });

    it('GET /api/auth/me con token -> 200', async () => {
      const res = await request(http).get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
      expect(res.body.email).toBe(email);
    });
  });

  describe('CRUD /api/users', () => {
    let id: number;
    const auth = () => ({ Authorization: `Bearer ${token}` });

    it('GET /api/users sin token -> 401', async () => {
      await request(http).get('/api/users').expect(401);
    });

    it('GET /api/users con token invalido -> 401', async () => {
      await request(http).get('/api/users').set('Authorization', 'Bearer abc.def.ghi').expect(401);
    });

    it('POST /api/users sin token -> 401', async () => {
      await request(http).post('/api/users').send({ name: 'X', email: 'api.x@test.com', password: 'Password123' }).expect(401);
    });

    it('POST /api/users -> 201', async () => {
      const res = await request(http)
        .post('/api/users')
        .set(auth())
        .send({ name: 'Api Crud', email: `api.crud.${stamp}@test.com`, password: 'Password123' })
        .expect(201);
      id = res.body.id;
      expect(res.body).toMatchObject({ name: 'Api Crud', role: 'USER' });
    });

    it('POST /api/users con campos invalidos -> 400', async () => {
      await request(http).post('/api/users').set(auth()).send({ name: 'A', email: 'mal', password: 'x' }).expect(400);
    });

    it('POST /api/users con campo no permitido -> 400', async () => {
      await request(http)
        .post('/api/users')
        .set(auth())
        .send({ name: 'Api Hack', email: `api.hack.${stamp}@test.com`, password: 'Password123', id: 1 })
        .expect(400);
    });

    it('GET /api/users -> 200 lista sin passwords', async () => {
      const res = await request(http).get('/api/users').set(auth()).expect(200);
      expect(res.body.some((u: any) => u.id === id)).toBe(true);
      expect(res.body.every((u: any) => u.password === undefined)).toBe(true);
    });

    it('GET /api/users/:id -> 200', async () => {
      const res = await request(http).get(`/api/users/${id}`).set(auth()).expect(200);
      expect(res.body.id).toBe(id);
    });

    it('GET /api/users/abc -> 400 (id no numerico)', async () => {
      await request(http).get('/api/users/abc').set(auth()).expect(400);
    });

    it('PUT /api/users/:id -> 200 reemplazo completo', async () => {
      const res = await request(http)
        .put(`/api/users/${id}`)
        .set(auth())
        .send({ name: 'Api Put', email: `api.put.${stamp}@test.com` })
        .expect(200);
      expect(res.body).toMatchObject({ name: 'Api Put', email: `api.put.${stamp}@test.com` });
    });

    it('PATCH /api/users/:id -> 200 parcial', async () => {
      const res = await request(http).patch(`/api/users/${id}`).set(auth()).send({ name: 'Api Patch' }).expect(200);
      expect(res.body.name).toBe('Api Patch');
    });

    it('DELETE /api/users/:id -> 200', async () => {
      await request(http).delete(`/api/users/${id}`).set(auth()).expect(200, { deleted: true, id });
    });

    it('GET /api/users/:id eliminado -> 404', async () => {
      await request(http).get(`/api/users/${id}`).set(auth()).expect(404);
    });

    it('PATCH /api/users/999999 -> 404', async () => {
      await request(http).patch('/api/users/999999').set(auth()).send({ name: 'Nadie' }).expect(404);
    });
  });
});
