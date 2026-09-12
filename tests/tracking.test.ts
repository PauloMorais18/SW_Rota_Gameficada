import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trackForUser } from '../src/server/tracking';
import { markerStatus, locationInput } from '../src/lib/tracking';
import type { db } from '../src/lib/db';

function fixture() {
  const place = { chave: 'place', name: 'Café', ativo: true, approval: 'APROVADO', latitude: -27.59, longitude: -48.54, radiusMeters: 150, minMinutes: 5, maxMinutes: 120 };
  const state: { visit: Record<string, unknown> | null; latest: { datahoracad: Date } | null; awarded: number; writes: number; completed: boolean } = { visit: null, latest: null, awarded: 0, writes: 0, completed: false };
  const tx = {
    $queryRaw: async () => [],
    locationSample: { findFirst: async () => state.latest, create: async ({ data }: { data: Record<string, unknown> }) => { state.writes++; state.latest = { datahoracad: new Date() }; return { ...data, chave: 'sample', datahoracad: new Date() }; } },
    routeParticipation: { findFirst: async () => null },
    platformSettings: { findUniqueOrThrow: async () => ({ maxAccuracyMeters: 100, maxGapSeconds: 120, cooldownHours: 24, visitPoints: 100 }) },
    place: { findMany: async () => [place] },
    visit: {
      findFirst: async ({ where }: { where: { status: string } }) => where.status === 'VALIDA' ? (state.completed ? { chave: 'done' } : null) : (state.visit?.status === 'EM_ANDAMENTO' ? state.visit : null),
      findUniqueOrThrow: async () => state.visit,
      create: async ({ data }: { data: Record<string, unknown> }) => (state.visit = { ...data, chave: 'visit', dwellSeconds: 0, status: 'EM_ANDAMENTO', place }),
      update: async ({ data }: { data: Record<string, unknown> }) => { state.visit = { ...state.visit, ...data }; state.completed = data.status === 'VALIDA'; return state.visit; },
    },
    pointTransaction: { create: async () => { if (state.awarded) throw new Error('Duplicate ledger'); state.awarded++; } },
  };
  const client = { $transaction: async (fn: (arg: typeof tx) => unknown) => fn(tx) } as unknown as typeof db;
  const input = () => ({ sessionId: 'session', location: { latitude: -27.59, longitude: -48.54, accuracy: 10, timestamp: Date.now() } });
  return { state, client, input };
}
test('tracking starts on entry, throttles writes and completes only one reward', async () => {
  const { state, client, input } = fixture();
  await trackForUser(input(), { chave: 'user' }, client);
  assert.equal(state.visit?.status, 'EM_ANDAMENTO'); assert.equal(state.awarded, 0);
  const throttled = await trackForUser(input(), { chave: 'user' }, client);
  assert.equal('throttled' in throttled && throttled.throttled, true); assert.equal(state.writes, 1);
  state.latest = null;
  state.visit = { ...state.visit, startedAt: new Date(Date.now() - 300001), lastSeenAt: new Date(Date.now() - 60001), dwellSeconds: 240 };
  await trackForUser(input(), { chave: 'user' }, client);
  assert.equal(state.visit?.status, 'VALIDA'); assert.equal(state.awarded, 1);
  state.latest = null;
  await trackForUser(input(), { chave: 'user' }, client);
  assert.equal(state.awarded, 1); assert.equal(state.visit?.status, 'VALIDA');
});
test('leaving radius invalidates visit and never grants points', async () => {
  const { state, client, input } = fixture();
  await trackForUser(input(), { chave: 'user' }, client); state.latest = null;
  const outside = input(); outside.location.latitude += 0.01;
  await trackForUser(outside, { chave: 'user' }, client);
  assert.equal(state.visit?.status, 'INVALIDA'); assert.equal(state.awarded, 0);
});
test('inaccurate GPS and foreign participation do not save data', async () => {
  const { state, client, input } = fixture();
  const bad = input(); bad.location.accuracy = 200;
  await assert.rejects(() => trackForUser(bad, { chave: 'user' }, client));
  await assert.rejects(() => trackForUser({ ...input(), participationId: 'foreign' }, { chave: 'user' }, client));
  assert.equal(state.writes, 0);
});
test('marker priority and freshness validation', () => {
  assert.equal(markerStatus(true, true, true).color, '#229d70');
  assert.equal(markerStatus(false, true, true).color, '#dca51b');
  assert.equal(markerStatus(false, false, true).color, '#8854d0');
  assert.equal(markerStatus(false, false, false).color, '#1765e5');
  assert.equal(locationInput.safeParse({ latitude: 0, longitude: 0, accuracy: 1, timestamp: Date.now() - 60000 }).success, false);
});
