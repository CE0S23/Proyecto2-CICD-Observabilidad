/**
 * Seed idempotente: crea (o actualiza) el usuario administrador de prueba.
 * Credenciales por defecto (solo para este proyecto): admin@proyecto2.com / Admin12345!
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = (process.env.SEED_ADMIN_EMAIL || 'admin@proyecto2.com').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || 'Admin12345!';
  const hash = await bcrypt.hash(password, 10);
  const admin = await prisma.user.upsert({
    where: { email },
    update: { password: hash, role: 'ADMIN' },
    create: { name: 'Administrador', email, password: hash, role: 'ADMIN' },
  });
  console.log(JSON.stringify({ event: 'seed', admin_id: admin.id, email }));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
