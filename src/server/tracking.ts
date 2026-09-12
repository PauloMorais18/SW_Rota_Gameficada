import { z } from 'zod';
import { db } from '../lib/db.js';
import { requireUser, ApiError } from '../lib/auth.js';
import { distanceMeters, validatePresence, advanceDwell } from '../lib/visits.js';
import { locationInput, TRACK_INTERVAL_MS } from '../lib/tracking.js';

export async function trackLocation(body: unknown) {
  const user = await requireUser(['VISITANTE']);
  const input = z.object({ sessionId: z.string().uuid(), participationId: z.string().uuid().nullable().optional(), location: locationInput }).parse(body);
  return trackForUser(input, user, db);
}

// Separate request authentication from the transactional engine for deterministic tests.
export async function trackForUser(input: { sessionId: string; participationId?: string | null; location: z.infer<typeof locationInput> }, user: { chave: string }, client: typeof db) {
  return client.$transaction(async tx => {
    await tx.$queryRaw`SELECT chave FROM usuarios WHERE chave = ${user.chave}::uuid FOR UPDATE`;
    const now = new Date();
    const latest = await tx.locationSample.findFirst({ where: { userId: user.chave }, orderBy: { datahoracad: 'desc' } });
    if (latest && now.getTime() - latest.datahoracad.getTime() < TRACK_INTERVAL_MS - 1000) return { throttled: true, changed: false, message: 'Aguardando o intervalo entre amostras.' };
    const participation = input.participationId ? await tx.routeParticipation.findFirst({ where: { chave: input.participationId, userId: user.chave, ativo: true, route: { ativo: true } }, include: { route: { include: { stops: { where: { ativo: true } } } } } }) : null;
    if (input.participationId && !participation) throw new ApiError(403, 'Participe desta rota antes de iniciar seu percurso.');
    const settings = await tx.platformSettings.findUniqueOrThrow({ where: { chave: 'platform' } });
    const loc = input.location;
    if (loc.accuracy > settings.maxAccuracyMeters) throw new ApiError(400, 'O sinal do GPS está impreciso. Procure uma área aberta; esse tempo não será validado.');
    let visit = await tx.visit.findFirst({ where: { userId: user.chave, status: 'EM_ANDAMENTO' }, include: { place: true } });
    let changed = false;
    let message = 'Localização salva.';
    let distance = 0;
    if (visit) {
      await tx.$queryRaw`SELECT chave FROM visitas WHERE chave = ${visit.chave}::uuid FOR UPDATE`;
      visit = await tx.visit.findUniqueOrThrow({ where: { chave: visit.chave }, include: { place: true } });
      if (visit.status !== 'EM_ANDAMENTO') visit = null;
    }
    if (visit) {
      distance = distanceMeters(loc.latitude, loc.longitude, visit.place.latitude, visit.place.longitude);
      const presence = validatePresence(distance, loc.accuracy, visit.radiusMeters, visit.maxAccuracyMeters);
      const next = advanceDwell(visit, now, false);
      const reason = !visit.place.ativo || visit.place.approval !== 'APROVADO' ? 'Local indisponível.' : presence ?? next.reason;
      const finished = !reason && next.dwell >= visit.minMinutes * 60;
      await tx.visit.update({ where: { chave: visit.chave }, data: { lastSeenAt: now, dwellSeconds: reason ? visit.dwellSeconds : next.dwell, status: reason ? 'INVALIDA' : finished ? 'VALIDA' : 'EM_ANDAMENTO', endedAt: reason || finished ? now : null, reason } });
      if (finished) await tx.pointTransaction.create({ data: { userId: user.chave, visitId: visit.chave, source: 'VISITA', amount: visit.awardedPoints, description: `Visita a ${visit.place.name}` } });
      changed = true;
      message = reason ?? (finished ? `Visita concluída! +${visit.awardedPoints} pontos.` : `Visita em andamento em ${visit.place.name}.`);
    } else {
      const places = await tx.place.findMany({ where: { ativo: true, approval: 'APROVADO', ...(participation ? { chave: { in: participation.route.stops.map(s => s.placeId) } } : {}) } });
      const inside = places.map(place => ({ place, distance: distanceMeters(loc.latitude, loc.longitude, place.latitude, place.longitude) })).filter(p => !validatePresence(p.distance, loc.accuracy, p.place.radiusMeters, settings.maxAccuracyMeters)).sort((a, b) => a.distance - b.distance);
      for (const candidate of inside) {
        const recent = await tx.visit.findFirst({ where: { userId: user.chave, placeId: candidate.place.chave, status: 'VALIDA', OR: [{ endedAt: { gt: new Date(now.getTime() - settings.cooldownHours * 3600000) } }, { samples: { some: { userId: user.chave, sessionId: input.sessionId } } }] } });
        if (recent) continue;
        const p = candidate.place;
        visit = await tx.visit.create({ data: { userId: user.chave, placeId: p.chave, startedAt: now, lastSeenAt: now, minMinutes: p.minMinutes, maxMinutes: p.maxMinutes, radiusMeters: p.radiusMeters, maxAccuracyMeters: settings.maxAccuracyMeters, maxGapSeconds: settings.maxGapSeconds, awardedPoints: settings.visitPoints }, include: { place: true } });
        distance = candidate.distance; changed = true; message = `Você chegou a ${p.name}. Contagem iniciada!`; break;
      }
    }
    const point = await tx.locationSample.create({ data: { userId: user.chave, sessionId: input.sessionId, participationId: participation?.chave, visitId: visit?.chave, latitude: loc.latitude, longitude: loc.longitude, accuracy: loc.accuracy, distance, capturedAt: new Date(loc.timestamp) }, select: { chave: true, latitude: true, longitude: true, accuracy: true, capturedAt: true, datahoracad: true } });
    return { point, message, changed };
  }, { maxWait: 10000, timeout: 15000 });
}
