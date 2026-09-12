import { nodeHandler } from '../src/server/http.js';
import { requireUser, ApiError } from '../src/lib/auth.js';
import { db } from '../src/lib/db.js';
import { z } from 'zod';
export default nodeHandler('GET', async request => {
  try {
    const user = await requireUser(['VISITANTE']);
    const sessionId = z.string().uuid().parse(new URL(request.url).searchParams.get('sessionId'));
    const points = await db.locationSample.findMany({ where: { userId: user.chave, sessionId }, select: { chave: true, latitude: true, longitude: true, accuracy: true, capturedAt: true, datahoracad: true }, orderBy: { datahoracad: 'desc' }, take: 2000 });
    return Response.json({ points: points.reverse() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return Response.json({ error: 'Não foi possível carregar o percurso.' }, { status: error instanceof ApiError ? error.status : 400 }); }
});
