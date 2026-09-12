import type { OsmKey } from './overpassService';
type TagRow = { key?: string; value?: string; count?: number; count_all?: number };
type Result<T> = { data: T; total: number };
const cache = new Map<string, { until: number; promise: Promise<Result<unknown>> }>();
async function request<T>(path: string, params: Record<string, string>): Promise<Result<T>> {
  const url = `https://taginfo.openstreetmap.org/api/4${path}?${new URLSearchParams(params)}`;
  const existing = cache.get(url);
  if (existing && existing.until > Date.now()) return existing.promise as Promise<Result<T>>;
  const promise = (async () => {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('As categorias OSM estão indisponíveis. Os locais continuam disponíveis.');
    const json = await response.json();
    if (!json || !('data' in json)) throw new Error('Resposta inválida de categorias OSM.');
    return json as Result<T>;
  })();
  if (cache.size >= 30) cache.delete(cache.keys().next().value!);
  cache.set(url, { until: Date.now() + 3600000, promise });
  try { return await promise; } catch (error) { cache.delete(url); throw error; }
}
export const taginfoService = {
  searchByKeyword: (query: string) => request<TagRow[]>('/search/by_keyword', { query, page: '1', rp: '20' }),
  searchByKeyAndValue: (key: string, value: string) => request<TagRow[]>('/search/by_key_and_value', { query: `${key}=${value}`, page: '1', rp: '20' }),
  keyValues: (key: OsmKey) => request<TagRow[]>('/key/values', { key, page: '1', rp: '20', sortname: 'count', sortorder: 'desc' }),
  keyOverview: (key: OsmKey) => request<Record<string, unknown>>('/key/overview', { key }),
};
