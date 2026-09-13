import { loadEnv } from 'vite';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

Object.assign(process.env, loadEnv('development', process.cwd(), ''));
const db = new PrismaClient();
try {
  const passwordHash = await bcrypt.hash('Demo@2026', 12);
  for (const [name, email, role] of [
    ['Marina Costa', 'visitante@rota.demo', 'VISITANTE'],
    ['Lucas • Café da Ilha', 'parceiro@rota.demo', 'ESTABELECIMENTO'],
    ['Administrador', 'admin@rota.demo', 'ADMIN'],
  ] as const) {
    await db.user.upsert({ where: { email }, update: { passwordHash, role, ativo: true }, create: { name, email, passwordHash, role } });
    console.log(`Conta de teste pronta: ${email} (${role})`);
  }
} finally { await db.$disconnect(); }
