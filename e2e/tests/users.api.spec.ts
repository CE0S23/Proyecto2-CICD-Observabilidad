import { APIRequestContext, expect, test } from '@playwright/test';

/** Pruebas de API con el `request` de Playwright, pasando por NGINX (proxy inverso /api). */
test.describe.configure({ mode: 'serial' });

test.describe('API REST via NGINX', () => {
  const stamp = Date.now();
  const email = `pw.api.${stamp}@test.com`;
  let token = '';
  let id = 0;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  test('GET /api/health responde 200 y la BD esta arriba', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok', database: 'up' });
  });

  test('POST /api/auth/register crea la cuenta', async ({ request }) => {
    const res = await request.post('/api/auth/register', { data: { name: 'PW Api', email, password: 'Password123' } });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.user.email).toBe(email);
    expect(body.user.password).toBeUndefined();
  });

  test('POST /api/auth/register invalido -> 400 y duplicado -> 409', async ({ request }) => {
    expect((await request.post('/api/auth/register', { data: { name: '', email: 'x', password: '1' } })).status()).toBe(400);
    expect((await request.post('/api/auth/register', { data: { name: 'PW Api', email, password: 'Password123' } })).status()).toBe(409);
  });

  test('POST /api/auth/login devuelve JWT; credenciales malas -> 401', async ({ request }) => {
    expect((await request.post('/api/auth/login', { data: { email, password: 'Mala12345' } })).status()).toBe(401);
    const res = await request.post('/api/auth/login', { data: { email, password: 'Password123' } });
    expect(res.status()).toBe(200);
    token = (await res.json()).access_token;
    expect(token.split('.')).toHaveLength(3);
  });

  test('GET /api/users sin token -> 401', async ({ request }) => {
    expect((await request.get('/api/users')).status()).toBe(401);
  });

  test('CRUD completo con token', async ({ request }) => {
    await crud(request);
  });

  async function crud(request: APIRequestContext) {
    const created = await request.post('/api/users', {
      headers: auth(),
      data: { name: 'PW Crud', email: `pw.crud.${stamp}@test.com`, password: 'Password123', role: 'USER' },
    });
    expect(created.status()).toBe(201);
    id = (await created.json()).id;

    const list = await request.get('/api/users', { headers: auth() });
    expect(list.status()).toBe(200);
    const users = await list.json();
    expect(Array.isArray(users)).toBe(true);
    expect(users.find((u: { id: number }) => u.id === id)).toBeTruthy();

    const one = await request.get(`/api/users/${id}`, { headers: auth() });
    expect(one.status()).toBe(200);

    const put = await request.put(`/api/users/${id}`, {
      headers: auth(),
      data: { name: 'PW Put', email: `pw.put.${stamp}@test.com`, role: 'ADMIN' },
    });
    expect(put.status()).toBe(200);
    expect((await put.json()).role).toBe('ADMIN');

    const patch = await request.patch(`/api/users/${id}`, { headers: auth(), data: { name: 'PW Patch' } });
    expect(patch.status()).toBe(200);
    expect((await patch.json()).name).toBe('PW Patch');

    expect((await request.post('/api/users', { headers: auth(), data: { name: 'A', email: 'mal' } })).status()).toBe(400);

    const del = await request.delete(`/api/users/${id}`, { headers: auth() });
    expect(del.status()).toBe(200);
    expect((await request.get(`/api/users/${id}`, { headers: auth() })).status()).toBe(404);
  }

  test.afterAll(async ({ request }) => {
    // Limpieza: elimina la cuenta de prueba creada por el registro.
    if (!token) return;
    const me = await request.get('/api/auth/me', { headers: auth() });
    if (me.ok()) await request.delete(`/api/users/${(await me.json()).id}`, { headers: auth() });
  });
});
