import { z } from 'zod';
import { db } from '../lib/db.js';
import { requireUser, ApiError } from '../lib/auth.js';
import { couponAvailability } from '../lib/coupons.js';
type Coupon = { chave: string; placeId: string; titulo: string; percentual: number; expiresAt: Date; limite: number; ativo: boolean; token: string; usados: number; local: string };
export async function couponAction(action: string, body: unknown) {
 const user = await requireUser();
 const input = body as Record<string, unknown>;
 if (action === 'couponList') {
  if (user.role === 'VISITANTE') {
   const rows = await db.$queryRaw`SELECT u.chave, u.datahoracad, c.titulo, c.percentual, l.name AS local FROM usos_cupons u JOIN cupons c ON c.chave=u."couponId" JOIN locais l ON l.chave=c."placeId" WHERE u."userId"=${user.chave}::uuid ORDER BY u.datahoracad DESC`;
   return { rows };
  }
  const rows = await db.$queryRaw<Coupon[]>`SELECT c.*, l.name AS local, (SELECT COUNT(*)::int FROM usos_cupons u WHERE u."couponId"=c.chave) AS usados FROM cupons c JOIN locais l ON l.chave=c."placeId" WHERE (${user.role === 'ADMIN'} OR l."ownerId"=${user.chave}::uuid) ORDER BY c.datahoracad DESC`;
  return { rows };
 }
 if (action === 'couponCreate') {
  await requireUser(['ESTABELECIMENTO', 'ADMIN']);
  const data = z.object({ placeId: z.string().uuid(), titulo: z.string().trim().min(3).max(120), percentual: z.coerce.number().int().min(1).max(100), limite: z.coerce.number().int().min(1).max(100000), expiresAt: z.coerce.date().refine(d => d.getTime() > Date.now(), 'Informe uma validade futura.') }).parse(body);
  const place = await db.place.findFirst({ where: { chave: data.placeId, ativo: true, approval: 'APROVADO', ...(user.role === 'ADMIN' ? {} : { ownerId: user.chave }) } });
  if (!place) throw new ApiError(403, 'Escolha um estabelecimento seu e aprovado.');
  await db.$executeRaw`INSERT INTO cupons ("placeId",titulo,percentual,limite,"expiresAt") VALUES (${data.placeId}::uuid,${data.titulo},${data.percentual},${data.limite},${data.expiresAt})`;
  return { message: 'Cupom criado.' };
 }
 if (action === 'couponDisable') {
  await requireUser(['ESTABELECIMENTO', 'ADMIN']);
  const id = z.string().uuid().parse(input.chave);
  const count = await db.$executeRaw`UPDATE cupons c SET ativo=false FROM locais l WHERE c.chave=${id}::uuid AND l.chave=c."placeId" AND (${user.role === 'ADMIN'} OR l."ownerId"=${user.chave}::uuid)`;
  if (!count) throw new ApiError(404, 'Cupom não encontrado.');
  return { message: 'Cupom desativado.' };
 }
 await requireUser(['VISITANTE']);
 const token = z.string().uuid().parse(input.token);
 return db.$transaction(async tx => {
  const rows = await tx.$queryRaw<Coupon[]>`SELECT c.*, l.name AS local, (SELECT COUNT(*)::int FROM usos_cupons u WHERE u."couponId"=c.chave) AS usados FROM cupons c JOIN locais l ON l.chave=c."placeId" WHERE c.token=${token}::uuid AND l.ativo=true AND l.approval='APROVADO' FOR UPDATE OF c`;
  const c = rows[0];
  if (!c || !c.ativo || c.expiresAt.getTime() <= Date.now()) throw new ApiError(400, 'Cupom inválido, desativado ou expirado.');
  // Count after acquiring the lock, so concurrent uses cannot exceed the limit.
  const [count] = await tx.$queryRaw<{ total: number }[]>`SELECT COUNT(*)::int AS total FROM usos_cupons WHERE "couponId"=${c.chave}::uuid`;
  if (action === 'couponPreview') return { coupon: { titulo: c.titulo, percentual: c.percentual, local: c.local, expiresAt: c.expiresAt, disponivel: count.total < c.limite } };
  const used = await tx.$queryRaw<{ chave: string }[]>`SELECT chave FROM usos_cupons WHERE "couponId"=${c.chave}::uuid AND "userId"=${user.chave}::uuid`;
  const reason = couponAvailability(c, count.total, used.length > 0);
  if (reason) throw new ApiError(409, reason);
  await tx.$executeRaw`INSERT INTO usos_cupons ("couponId","userId") VALUES (${c.chave}::uuid,${user.chave}::uuid)`;
  return { message: `Cupom utilizado: ${c.percentual}% de desconto em ${c.local}. Apresente esta confirmação à loja.` };
 });
}
