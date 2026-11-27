import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { UsersService } from './users.service';

/** Pruebas unitarias de UsersService con PrismaService simulado (sin base de datos). */
describe('UsersService (unit)', () => {
  const sample = {
    id: 1,
    name: 'Ana',
    email: 'ana@test.com',
    role: 'USER',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  let prisma: any;
  let service: UsersService;

  beforeEach(() => {
    prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([sample]),
        findUnique: jest.fn().mockResolvedValue(sample),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...sample, ...data, password: undefined })),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...sample, ...data, password: undefined })),
        delete: jest.fn().mockResolvedValue(sample),
      },
    };
    service = new UsersService(prisma);
  });

  it('findAll devuelve usuarios sin el campo password', async () => {
    const users = await service.findAll();
    expect(users).toHaveLength(1);
    const args = prisma.user.findMany.mock.calls[0][0];
    expect(args.select.password).toBeUndefined();
    expect(args.orderBy).toEqual({ id: 'asc' });
  });

  it('findOne lanza NotFoundException si no existe', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(service.findOne(99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create hashea el password con bcrypt antes de guardarlo', async () => {
    await service.create({ name: 'Luis', email: 'luis@test.com', password: 'Secreta123' });
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.password).not.toBe('Secreta123');
    expect(await bcrypt.compare('Secreta123', data.password)).toBe(true);
    expect(data.role).toBe('USER');
  });

  it('create traduce email duplicado (P2002) a ConflictException', async () => {
    prisma.user.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint', { code: 'P2002', clientVersion: 'test' }),
    );
    await expect(service.create({ name: 'Ana', email: 'ana@test.com', password: 'Secreta123' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('update (PATCH) solo modifica los campos enviados', async () => {
    await service.update(1, { name: 'Ana Maria' });
    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data).toEqual({ name: 'Ana Maria' });
  });

  it('update rehashea el password cuando se envia', async () => {
    await service.update(1, { password: 'NuevaClave1' });
    const data = prisma.user.update.mock.calls[0][0].data;
    expect(await bcrypt.compare('NuevaClave1', data.password)).toBe(true);
  });

  it('replace (PUT) envia nombre, email y rol', async () => {
    await service.replace(1, { name: 'Ana', email: 'ana2@test.com' });
    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data).toEqual({ name: 'Ana', email: 'ana2@test.com', role: 'USER' });
  });

  it('remove elimina y confirma; 404 si no existe', async () => {
    await expect(service.remove(1)).resolves.toEqual({ deleted: true, id: 1 });
    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(service.remove(2)).rejects.toBeInstanceOf(NotFoundException);
  });
});
