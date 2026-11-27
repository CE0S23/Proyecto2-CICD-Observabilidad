import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, ReplaceUserDto, UpdateUserDto } from './users.dto';

export const BCRYPT_ROUNDS = 10;

/** Campos publicos: el hash del password nunca sale de la API. */
export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<PublicUser[]> {
    return this.prisma.user.findMany({ select: publicUserSelect, orderBy: { id: 'asc' }, take: 500 });
  }

  async findOne(id: number): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: publicUserSelect });
    if (!user) throw new NotFoundException(`Usuario ${id} no encontrado`);
    return user;
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  }

  async create(dto: CreateUserDto): Promise<PublicUser> {
    const password = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    try {
      return await this.prisma.user.create({
        data: { name: dto.name, email: dto.email, password, role: dto.role ?? 'USER' },
        select: publicUserSelect,
      });
    } catch (e) {
      throw this.mapError(e, dto.email);
    }
  }

  replace(id: number, dto: ReplaceUserDto): Promise<PublicUser> {
    return this.update(id, { name: dto.name, email: dto.email, password: dto.password, role: dto.role ?? 'USER' });
  }

  async update(id: number, dto: UpdateUserDto): Promise<PublicUser> {
    await this.findOne(id);
    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.password) data.password = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    try {
      return await this.prisma.user.update({ where: { id }, data, select: publicUserSelect });
    } catch (e) {
      throw this.mapError(e, dto.email);
    }
  }

  async remove(id: number): Promise<{ deleted: true; id: number }> {
    await this.findOne(id);
    await this.prisma.user.delete({ where: { id } });
    return { deleted: true, id };
  }

  private mapError(e: unknown, email?: string): unknown {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return new ConflictException(`El email ${email ?? ''} ya esta registrado`.trim());
    }
    return e;
  }
}
