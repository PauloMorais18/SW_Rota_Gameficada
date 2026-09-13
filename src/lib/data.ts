import { demoEnabled } from './demo.js';
import { db } from './db.js';
import { currentUser } from './auth.js';
import { visibleStars } from './stars.js';
import { leanFleet } from './lean-fleet.js';
export async function getAppData() {
  const user = await currentUser();
  const admin = user?.role === 'ADMIN';
  const [places, routes, phones, settings, visits, points, users, fleet] = await Promise.all([
    db.place.findMany({ where: admin ? {} : { OR: [{ ativo: true, approval: 'APROVADO' }, ...(user ? [{ ownerId: user.chave }] : [])] }, include: { reviews: { where: { ativo: true }, include: { user: { select: { name: true } } }, orderBy: { datahoracad: 'desc' } } }, orderBy: { datahoracad: 'asc' } }),
    db.route.findMany({ where: admin ? {} : { ativo: true }, include: { stops: { where: { ativo: true }, include: { place: { select: { chave: true, name: true, ativo: true, approval: true } } }, orderBy: { position: 'asc' } }, participants: { where: { userId: user?.chave ?? '00000000-0000-0000-0000-000000000000' } } }, orderBy: { datahoracad: 'asc' } }),
    db.usefulPhone.findMany({ where: admin ? {} : { ativo: true }, orderBy: { name: 'asc' } }),
    db.platformSettings.findUniqueOrThrow({ where: { chave: 'platform' } }),
    user ? db.visit.findMany({ where: admin ? {} : user.role === 'ESTABELECIMENTO' ? { place: { ownerId: user.chave } } : { userId: user.chave }, include: { place: { select: { name: true } }, user: { select: { name: true } }, review: true }, orderBy: { startedAt: 'desc' }, take: 500 }) : [],
    user ? db.pointTransaction.findMany({ where: admin ? {} : { userId: user.chave }, orderBy: { datahoracad: 'desc' } }) : [],
    admin ? db.user.findMany({ select: { chave: true, name: true, email: true, role: true, ativo: true, datahoracad: true }, orderBy: { datahoracad: 'desc' } }) : [],
    leanFleet.status(),
  ]);
  const progressVisits = user ? await db.visit.findMany({ where: { userId: user.chave, status: 'VALIDA' }, select: { placeId: true, startedAt: true } }) : [];
  return { user: user ? { ...user, stars: visibleStars(user.stars, user.starsExpiresAt) } : null, places, routes: routes.map(route => ({ ...route, completedPlaceIds: route.participants.length ? route.stops.filter(stop => progressVisits.some(v => v.placeId === stop.placeId && v.startedAt >= route.participants[0].datahoracad)).map(stop => stop.placeId) : [] })), phones, settings, visits, points, users, fleet, googleEnabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI), demo: demoEnabled() };
}
