import { loadEnv } from 'vite';
import { PrismaClient } from '@prisma/client';
Object.assign(process.env, loadEnv('development', process.cwd(), ''));
const db = new PrismaClient();
try {
 const owner = await db.user.findUniqueOrThrow({ where: { email: 'parceiro@rota.demo' } });
 const place = await db.place.upsert({ where: { chave: '10000000-0000-4000-8000-000000000010' }, update: { ownerId: owner.chave, ativo: true, approval: 'APROVADO' }, create: { chave: '10000000-0000-4000-8000-000000000010', name: 'Café da Ilha — demonstração', description: 'Estabelecimento fictício para testar descontos e validação de cupons.', category: 'Gastronomia', address: 'Rua das Flores, 128 — endereço fictício', latitude: -27.5969, longitude: -48.5495, ownerId: owner.chave, approval: 'APROVADO', photos: ['/icon.svg'] } });
 await db.$executeRaw`INSERT INTO cupons (chave,"placeId",titulo,percentual,limite,"expiresAt") VALUES ('10000000-0000-4000-8000-000000000090'::uuid,${place.chave}::uuid,'Café da tarde — cupom fictício',15,100,CURRENT_TIMESTAMP + INTERVAL '30 days') ON CONFLICT (chave) DO NOTHING`;
 console.log('Loja de demonstração vinculada ao parceiro e cupom de 15% disponível.');
} finally { await db.$disconnect(); }
