import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOverpassQuery, normalizePois, overpassService } from '../src/services/overpassService';
import { taginfoService } from '../src/services/taginfoService';

test('OSM uses centers, separates type IDs, drops invalid coordinates and duplicate elements', () => {
  const node = { type: 'node', id: 1, lat: 0, lon: 0, tags: { shop: 'bakery', name: 'Padaria' } };
  const result = normalizePois({ elements: [node, node, { type: 'way', id: 1, center: { lat: -27, lon: -48 }, tags: { tourism: 'museum', 'contact:phone': '123' } }, { type: 'relation', id: 2, center: { lat: 2, lon: 3 }, tags: { historic: 'monument' } }, { ...node, id: 3, lat: 91 }, { type: 'way', id: 4, tags: { shop: 'yes' } }] });
  assert.equal(result.length, 3);
  assert.equal(result[1].latitude, -27);
  assert.equal(result[1].phone, '123');
  assert.equal(result[1].name, '');
  assert.throws(() => normalizePois({ elements: [], remark: 'timeout' }));
});

test('Overpass searches all six keys, rejects invalid radius and caches concurrent calls', async () => {
  const query = buildOverpassQuery(0, 0, 500);
  for (const key of ['shop', 'amenity', 'tourism', 'leisure', 'historic', 'craft']) assert.ok(query.includes(`["${key}"]`));
  assert.ok(query.endsWith('out center tags;'));
  assert.throws(() => buildOverpassQuery(NaN, 0, 500));
  assert.throws(() => buildOverpassQuery(0, 0, 10000));
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ elements: [] }); };
  try { await Promise.all([overpassService.nearby(0, 0, 500), overpassService.nearby(0, 0, 500)]); await overpassService.nearby(0, 0, 500); assert.equal(calls, 1); } finally { globalThis.fetch = original; }
});

test('Taginfo key/value search uses documented query parameter and cache', async () => {
  const original = globalThis.fetch; const urls: string[] = [];
  globalThis.fetch = async input => { urls.push(String(input)); return Response.json({ data: [], total: 0 }); };
  try {
    await taginfoService.searchByKeyAndValue('shop', 'bakery');
    await taginfoService.searchByKeyAndValue('shop', 'bakery');
    assert.equal(urls.length, 1);
    assert.equal(new URL(urls[0]).searchParams.get('query'), 'shop=bakery');
  } finally { globalThis.fetch = original; }
});
