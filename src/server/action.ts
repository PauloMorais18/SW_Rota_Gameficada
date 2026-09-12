import { isSameOriginRequest } from '../lib/request-origin.js';
import { trackLocation } from './tracking.js';
import { couponAction } from './coupons.js';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { cookies } from './http.js';
import { Prisma } from '@prisma/client';
import { db } from '../lib/db.js';
import { ApiError, requireUser, setSession } from '../lib/auth.js';
import { advanceDwell, distanceMeters, validatePresence } from '../lib/visits.js';
const uuid = z.string().uuid();
const text = z.string().trim().min(1).max(300);
const coordinate = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), accuracy: z.number().nonnegative().max(100000), timestamp: z.number().refine(v => Math.abs(Date.now() - v) < 30000, 'Localização desatualizada. Tente novamente.') });
const placeSchema = z.object({ chave: uuid.optional(), name: text, description: z.string().trim().min(10).max(3000), category: text, type: z.enum(['ESTABELECIMENTO', 'PONTO_TURISTICO']), address: text, latitude: z.coerce.number().min(-90).max(90), longitude: z.coerce.number().min(-180).max(180), radiusMeters: z.coerce.number().int().min(10).max(1000).default(150), specialReward: z.string().trim().max(300).optional(), minMinutes: z.coerce.number().int().min(1).max(1440), maxMinutes: z.coerce.number().int().min(1).max(1440), photos: z.array(z.string().url().refine(v => v.startsWith('https://'))).min(1).max(8), phone: z.string().max(50), website: z.string().max(300).refine(v => !v || /^https:\/\//.test(v)), hours: z.string().max(500) }).refine(v => v.minMinutes <= v.maxMinutes, 'Tempo máximo deve ser maior ou igual ao mínimo.');
const attempts = new Map<string, { count: number; until: number }>();
function throttle(key: string) {
  const now = Date.now();
  if (attempts.size > 5000) for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
  const item = attempts.get(key);
  if (item && item.until > now && item.count >= 15) throw new ApiError(429, 'Muitas tentativas. Aguarde 15 minutos.');
  attempts.set(key, !item || item.until < now ? { count: 1, until: now + 900000 } : { ...item, count: item.count + 1 });
}
export async function POST(request: Request) {
  try {
    if (!isSameOriginRequest(request)) throw new ApiError(403, 'Origem da requisição não permitida.');
    const raw = await request.text();
    if (raw.length > 64000) throw new ApiError(413, 'Requisição muito grande.');
    const body = JSON.parse(raw);
    const action = z.string().parse(body.action);
    if (['couponList', 'couponCreate', 'couponDisable', 'couponPreview', 'couponRedeem'].includes(action)) return Response.json(await couponAction(action, body));
    if (action === 'trackLocation') return Response.json(await trackLocation(body));
    if (action === 'login' || action === 'register' || action === 'demo') {
      const input = z.object({ email: z.string().email().max(254).transform(v => v.toLowerCase()), password: z.string().min(8).max(72), name: text.optional(), role: z.enum(['VISITANTE', 'ESTABELECIMENTO']).optional() });
      if (action === 'demo') {
        if (process.env.ALLOW_DEMO_LOGIN !== 'true') throw new ApiError(403, 'Demonstração desabilitada.');
        const role = z.enum(['VISITANTE', 'ESTABELECIMENTO', 'ADMIN']).parse(body.role);
        const email = { VISITANTE: 'visitante@rota.demo', ESTABELECIMENTO: 'parceiro@rota.demo', ADMIN: 'admin@rota.demo' }[role];
        const user = await db.user.findFirst({ where: { email, ativo: true, role } });
        if (!user) throw new ApiError(404, 'Execute o seed para criar as contas de demonstração.');
        await setSession(user.chave);
      } else {
        const data = input.parse(body);
        throttle(data.email);
        if (action === 'register') {
          if (!data.name) throw new ApiError(400, 'Informe seu nome.');
          const user = await db.user.create({ data: { name: data.name, email: data.email, passwordHash: await bcrypt.hash(data.password, 12), role: data.role ?? 'VISITANTE' } });
          await setSession(user.chave);
        } else {
          const user = await db.user.findUnique({ where: { email: data.email } });
          if (!user || !user.ativo || !(await bcrypt.compare(data.password, user.passwordHash))) throw new ApiError(401, 'E-mail ou senha inválidos.');
          await setSession(user.chave);
        }
      }
      return Response.json({ message: 'Bem-vindo à sua próxima descoberta!' });
    }
    if (action === 'logout') { (await cookies()).delete('rota_session'); return Response.json({ message: 'Você saiu da conta.' }); }
    const user = await requireUser();
    if (action === 'profile') {
      const data = z.object({ name: text, city: text }).parse(body);
      await db.user.update({ where: { chave: user.chave }, data });
    } else if (action === 'startVisit') {
      await requireUser(['VISITANTE']);
      const placeId = uuid.parse(body.placeId);
      const location = coordinate.parse(body.location);
      await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT chave FROM usuarios WHERE chave = ${user.chave}::uuid FOR UPDATE`;
        const place = await tx.place.findFirst({ where: { chave: placeId, ativo: true, approval: 'APROVADO' } });
        if (!place) throw new ApiError(404, 'Local indisponível.');
        const settings = await tx.platformSettings.findUniqueOrThrow({ where: { chave: 'platform' } });
        const distance = distanceMeters(location.latitude, location.longitude, place.latitude, place.longitude);
        const reason = validatePresence(distance, location.accuracy, place.radiusMeters, settings.maxAccuracyMeters);
        if (reason) throw new ApiError(400, reason);
        if (await tx.visit.findFirst({ where: { userId: user.chave, status: 'EM_ANDAMENTO' } })) throw new ApiError(409, 'Você já tem uma visita em andamento. Finalize ou cancele antes.');
        if (await tx.visit.findFirst({ where: { userId: user.chave, placeId, status: 'VALIDA', endedAt: { gt: new Date(Date.now() - settings.cooldownHours * 3600000) } } })) throw new ApiError(409, 'Este local já concedeu pontos recentemente. Aguarde o intervalo configurado.');
        const { timestamp: _, ...sample } = location;
        await tx.visit.create({ data: { userId: user.chave, placeId, minMinutes: place.minMinutes, maxMinutes: place.maxMinutes, radiusMeters: place.radiusMeters, maxAccuracyMeters: settings.maxAccuracyMeters, maxGapSeconds: settings.maxGapSeconds, awardedPoints: settings.visitPoints, samples: { create: { ...sample, distance } } } });
      });
    } else if (['heartbeat', 'finishVisit', 'cancelVisit'].includes(action)) {
      await requireUser(['VISITANTE']);
      const id = uuid.parse(body.visitId);
      const result = await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT chave FROM visitas WHERE chave = ${id}::uuid FOR UPDATE`;
        const visit = await tx.visit.findFirst({ where: { chave: id, userId: user.chave }, include: { place: true } });
        if (!visit || visit.status !== 'EM_ANDAMENTO') throw new ApiError(409, 'Esta visita não está em andamento.');
        const now = new Date();
        if (action === 'heartbeat' && now.getTime() - visit.lastSeenAt.getTime() < 24000) return null;
        if (action === 'cancelVisit') { await tx.visit.update({ where: { chave: id }, data: { status: 'CANCELADA', endedAt: now, reason: 'Cancelada pelo visitante.' } }); return null; }
        const location = coordinate.parse(body.location);
        const distance = distanceMeters(location.latitude, location.longitude, visit.place.latitude, visit.place.longitude);
        const presence = validatePresence(distance, location.accuracy, visit.radiusMeters, visit.maxAccuracyMeters);
        const next = advanceDwell(visit, now, action === 'finishVisit');
        const reason = !visit.place.ativo || visit.place.approval !== 'APROVADO' ? 'Local indisponível.' : presence ?? next.reason;
        if (reason && !presence && next.retry && visit.place.ativo && visit.place.approval === 'APROVADO') throw new ApiError(400, reason);
        const { timestamp: _, ...sample } = location;
        await tx.locationSample.create({ data: { visitId: id, ...sample, distance } });
        await tx.visit.update({ where: { chave: id }, data: { lastSeenAt: now, dwellSeconds: reason ? visit.dwellSeconds : next.dwell, status: reason ? 'INVALIDA' : action === 'finishVisit' ? 'VALIDA' : 'EM_ANDAMENTO', endedAt: reason || action === 'finishVisit' ? now : null, reason } });
        if (!reason && action === 'finishVisit') await tx.pointTransaction.create({ data: { userId: user.chave, source: 'VISITA', amount: visit.awardedPoints, visitId: id, description: `Visita a ${visit.place.name}` } });
        return reason;
      });
      if (result) return Response.json({ error: result }, { status: 400 });
    } else if (action === 'review') {
      await requireUser(['VISITANTE']);
      const data = z.object({ visitId: uuid, rating: z.number().int().min(1).max(5), comment: z.string().trim().min(3).max(1500) }).parse(body);
      await db.$transaction(async tx => {
        const visit = await tx.visit.findFirst({ where: { chave: data.visitId, userId: user.chave, status: 'VALIDA' }, include: { place: true } });
        if (!visit) throw new ApiError(403, 'Avaliações exigem uma visita válida.');
        const settings = await tx.platformSettings.findUniqueOrThrow({ where: { chave: 'platform' } });
        const review = await tx.review.create({ data: { ...data, userId: user.chave, placeId: visit.placeId } });
        await tx.pointTransaction.create({ data: { userId: user.chave, reviewId: review.chave, amount: settings.reviewPoints, source: 'AVALIACAO', description: `Avaliação de ${visit.place.name}` } });
      });
    } else if (action === 'joinRoute') {
      await requireUser(['VISITANTE']);
      const routeId = uuid.parse(body.routeId);
      const route = await db.route.findFirst({ where: { chave: routeId, ativo: true }, include: { stops: { include: { place: true } } } });
      if (!route || route.stops.length < 2 || route.stops.some(s => !s.place.ativo || s.place.approval !== 'APROVADO')) throw new ApiError(400, 'Esta rota está indisponível.');
      await db.routeParticipation.upsert({ where: { userId_routeId: { userId: user.chave, routeId } }, create: { userId: user.chave, routeId }, update: {} });
    } else if (action === 'savePlace') {
      await requireUser(['ESTABELECIMENTO', 'ADMIN']);
      const { chave, ...data } = placeSchema.parse(body);
      if (user.role !== 'ADMIN') delete data.specialReward;
      if (user.role === 'ESTABELECIMENTO' && data.type !== 'ESTABELECIMENTO') throw new ApiError(403, 'Somente administradores cadastram pontos turísticos.');
      if (chave) {
        const existing = await db.place.findUnique({ where: { chave } });
        if (!existing || (user.role !== 'ADMIN' && existing.ownerId !== user.chave)) throw new ApiError(403, 'Este local não pertence à sua conta.');
        await db.place.update({ where: { chave }, data: { ...data, ...(user.role !== 'ADMIN' ? { approval: 'PENDENTE' as const } : {}) } });
      } else await db.place.create({ data: { ...data, ownerId: user.role === 'ESTABELECIMENTO' ? user.chave : null, approval: user.role === 'ADMIN' ? 'APROVADO' : 'PENDENTE' } });
    } else {
      await requireUser(['ADMIN']);
      if (action === 'approvePlace') {
        await db.place.update({ where: { chave: uuid.parse(body.chave) }, data: { approval: z.enum(['APROVADO', 'REJEITADO']).parse(body.approval) } });
      } else if (action === 'toggleUser') {
        const id = uuid.parse(body.chave);
        if (id === user.chave) throw new ApiError(400, 'Você não pode desativar sua própria conta.');
        await db.user.update({ where: { chave: id }, data: { ativo: z.boolean().parse(body.ativo) } });
      } else if (action === 'togglePlace') {
        await db.place.update({ where: { chave: uuid.parse(body.chave) }, data: { ativo: z.boolean().parse(body.ativo) } });
      } else if (action === 'saveSettings') {
        const data = z.object({ visitPoints: z.coerce.number().int().min(0).max(10000), reviewPoints: z.coerce.number().int().min(0).max(10000), cooldownHours: z.coerce.number().int().min(1).max(720), maxAccuracyMeters: z.coerce.number().int().min(5).max(100), maxGapSeconds: z.coerce.number().int().min(60).max(300), starExpirationDays: z.coerce.number().int().min(1).max(3650) }).parse(body);
        await db.platformSettings.update({ where: { chave: 'platform' }, data });
      } else if (action === 'savePhone') {
        const { chave, ...data } = z.object({ chave: uuid.optional(), name: text, number: z.string().regex(/^[+\d ()-]{3,30}$/), category: text, description: z.string().max(300), ativo: z.boolean().default(true) }).parse(body);
        if (chave) await db.usefulPhone.update({ where: { chave }, data }); else await db.usefulPhone.create({ data });
      } else if (action === 'saveRoute') {
        const { chave, placeIds, ...data } = z.object({ chave: uuid.optional(), name: text, description: z.string().min(10).max(3000), image: z.string().url().refine(v => v.startsWith('https://')), category: text, duration: text, ativo: z.boolean().default(true), placeIds: z.array(uuid).min(2).max(30).refine(a => new Set(a).size === a.length) }).parse(body);
        await db.$transaction(async tx => {
          const count = await tx.place.count({ where: { chave: { in: placeIds }, ativo: true, approval: 'APROVADO' } });
          if (count !== placeIds.length) throw new ApiError(400, 'Selecione apenas locais ativos e aprovados.');
          if (chave) {
            await tx.routeStop.deleteMany({ where: { routeId: chave } });
            await tx.route.update({ where: { chave }, data: { ...data, stops: { create: placeIds.map((placeId, position) => ({ placeId, position })) } } });
          } else await tx.route.create({ data: { ...data, stops: { create: placeIds.map((placeId, position) => ({ placeId, position })) } } });
        });
      } else throw new ApiError(400, 'Ação desconhecida.');
    }
    return Response.json({ message: action === 'savePlace' && user.role === 'ESTABELECIMENTO' ? 'Dados enviados para aprovação do administrador.' : 'Tudo certo! Alterações salvas.' });
  } catch (error) {
    if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError) return Response.json({ error: error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(' • ') }, { status: 400 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return Response.json({ error: 'Este registro já existe. E-mail, avaliação ou pontuação duplicada.' }, { status: 409 });
    if (error instanceof SyntaxError) return Response.json({ error: 'Dados inválidos.' }, { status: 400 });
    console.error(error);
    return Response.json({ error: 'Não foi possível concluir a operação. Tente novamente.' }, { status: 500 });
  }
}
