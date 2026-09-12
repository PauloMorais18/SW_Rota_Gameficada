export const osmKeys = ['shop', 'amenity', 'tourism', 'leisure', 'historic', 'craft'] as const;
export type OsmKey = typeof osmKeys[number];
export type OsmPoi = { id: string; osmType: 'node' | 'way' | 'relation'; name: string; latitude: number; longitude: number; category: OsmKey; subcategory: string; address: string; phone: string; website: string; openingHours: string; tags: Record<string, string> };
export const categoryLabels: Record<OsmKey, string> = { shop: 'Comércio', amenity: 'Serviços e gastronomia', tourism: 'Turismo', leisure: 'Lazer', historic: 'Patrimônio histórico', craft: 'Artesanato e ofícios' };
export function validCoordinates(lat: unknown, lon: unknown): boolean {
  return typeof lat === 'number' && Number.isFinite(lat) && Math.abs(lat) <= 90 && typeof lon === 'number' && Number.isFinite(lon) && Math.abs(lon) <= 180;
}
export function normalizePois(payload: unknown): OsmPoi[] {
  if (!payload || typeof payload !== 'object' || !('elements' in payload) || !Array.isArray(payload.elements)) throw new Error('Resposta inválida do OpenStreetMap.');
  if ('remark' in payload) throw new Error('A busca de locais não foi concluída. Tente um raio menor.');
  const result = new Map<string, OsmPoi>();
  for (const el of payload.elements) {
    if (!el || !['node', 'way', 'relation'].includes(el.type) || !Number.isSafeInteger(el.id) || el.id <= 0) continue;
    const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
    if (!validCoordinates(lat, lon)) continue;
    const tags: Record<string, string> = Object.fromEntries(Object.entries(el.tags ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    const category = osmKeys.find(key => tags[key]);
    if (!category) continue;
    const id = `${el.type}/${el.id}`;
    result.set(id, { id, osmType: el.type, name: tags['name:pt'] || tags.name || '', latitude: lat, longitude: lon, category, subcategory: tags[category], address: tags['addr:full'] || [tags['addr:street'], tags['addr:housenumber'], tags['addr:suburb'], tags['addr:city'], tags['addr:postcode']].filter(Boolean).join(', '), phone: tags.phone || tags['contact:phone'] || '', website: tags.website || tags['contact:website'] || '', openingHours: tags.opening_hours || '', tags });
  }
  return [...result.values()];
}
export function buildOverpassQuery(latitude: number, longitude: number, radius: number) {
  if (!validCoordinates(latitude, longitude) || !Number.isFinite(radius) || radius < 100 || radius > 3000) throw new Error('Use coordenadas válidas e um raio entre 100 e 3000 metros.');
  return `[out:json][timeout:20];(${osmKeys.map(key => `nwr(around:${Math.round(radius)},${latitude},${longitude})["${key}"];`).join('')});out center tags;`;
}
const cache = new Map<string, { until: number; value: OsmPoi[] }>();
let active: Promise<OsmPoi[]> | null = null;
let activeKey = '';
let nextRequest = 0;
export const overpassService = {
  async nearby(latitude: number, longitude: number, radius = 1000): Promise<OsmPoi[]> {
    const query = buildOverpassQuery(latitude, longitude, radius);
    const cached = cache.get(query);
    if (cached && cached.until > Date.now()) return cached.value;
    if (active && activeKey === query) return active;
    if (active || Date.now() < nextRequest) throw new Error('Aguarde alguns segundos antes de buscar locais novamente.');
    nextRequest = Date.now() + 30000;
    activeKey = query;
    active = (async () => {
      try {
        const response = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { Accept: 'application/json' }, body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(25000) });
        if (!response.ok) throw new Error(response.status === 429 ? 'OpenStreetMap ocupado. Aguarde um minuto e tente novamente.' : 'A busca de locais está indisponível no momento.');
        const value = normalizePois(await response.json());
        if (cache.size >= 12) cache.delete(cache.keys().next().value!);
        cache.set(query, { until: Date.now() + 300000, value });
        return value;
      } catch (error) {
        if (error instanceof Error && error.name === 'TimeoutError') throw new Error('A busca demorou demais. Tente um raio menor.');
        throw error;
      } finally { active = null; }
    })();
    return active;
  },
};
