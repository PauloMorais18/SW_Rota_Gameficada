import { useEffect, useRef, useState } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { categoryLabels, osmKeys, overpassService, type OsmKey, type OsmPoi } from '../services/overpassService';
import { taginfoService } from '../services/taginfoService';
import { distanceMeters } from '../lib/visits';
import type { Position } from '../lib/tracking';
import type { Place } from '../lib/types';

export function useNearby(position: Position | null, enabled: boolean) {
  const [radius, setRadius] = useState(1000);
  const [pois, setPois] = useState<OsmPoi[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const latest = useRef(position); latest.current = position;
  useEffect(() => {
    if (!enabled) return;
    let disposed = false, busy = false, lastAt = 0;
    let lastPosition: Position | null = null;
    setPois([]); setError(''); setLoading(false);
    const search = async () => {
      const current = latest.current;
      if (!current || busy || Date.now() - lastAt < 30000) return;
      if (lastPosition && distanceMeters(current.latitude, current.longitude, lastPosition.latitude, lastPosition.longitude) < 250) return;
      busy = true; lastAt = Date.now(); setLoading(true);
      try {
        const data = await overpassService.nearby(current.latitude, current.longitude, radius);
        if (!disposed) { setPois(data); setError(''); lastPosition = current; }
      } catch (e) { if (!disposed) setError(e instanceof Error ? e.message : 'Não foi possível buscar locais. Verifique sua conexão.'); }
      finally { busy = false; if (!disposed) setLoading(false); }
    };
    const debounce = setTimeout(search, 800);
    const timer = setInterval(search, 30000);
    return () => { disposed = true; clearTimeout(debounce); clearInterval(timer); };
  }, [enabled, radius, retry, Boolean(position)]);
  return { pois, radius, setRadius, loading, error, retry: () => setRetry(value => value + 1) };
}

export function OsmControls({ nearby, position, enabled, onEnabled, category, onCategory }: { nearby: ReturnType<typeof useNearby>; position: Position | null; enabled: boolean; onEnabled: (value: boolean) => void; category: OsmKey | ''; onCategory: (value: OsmKey | '') => void }) {
  const [values, setValues] = useState<string[]>([]);
  const [tagError, setTagError] = useState('');
  useEffect(() => {
    let disposed = false; setValues([]); setTagError('');
    if (category && enabled) taginfoService.keyValues(category).then(result => { if (!disposed) setValues(result.data.map(row => row.value).filter((value): value is string => Boolean(value))); }).catch(() => { if (!disposed) setTagError('Categorias adicionais indisponíveis; a busca de locais continua funcionando.'); });
    return () => { disposed = true; };
  }, [category, enabled]);
  return <div className="osm-controls">
    <div className="map-toolbar"><label><input type="checkbox" checked={enabled} onChange={e => onEnabled(e.target.checked)} /> Locais reais próximos (OSM)</label>
      {enabled && <><label>Raio de busca<select value={nearby.radius} onChange={e => nearby.setRadius(Number(e.target.value))}>{[500, 1000, 2000, 3000].map(n => <option key={n} value={n}>{n} m</option>)}</select></label>
      <label>Categoria<select value={category} onChange={e => onCategory(e.target.value as OsmKey | '')}><option value="">Todas</option>{osmKeys.map(key => <option key={key} value={key}>{categoryLabels[key]}</option>)}</select></label></>}
    </div>
    {enabled && <><p className="map-notice" role="status">{!position ? 'Ative o GPS para encontrar locais reais perto de você.' : nearby.loading ? 'Buscando locais no OpenStreetMap…' : `${nearby.pois.length} pontos encontrados na última busca.`}</p>
    {nearby.error && <p className="map-notice" role="alert">{nearby.error} <button className="secondary small" disabled={nearby.loading} onClick={nearby.retry}>Tentar novamente</button></p>}
    {values.length > 0 && <details className="map-notice"><summary>Categorias OSM disponíveis — Taginfo</summary>{values.join(' · ')}</details>}
    {tagError && <p className="map-notice">{tagError}</p>}
    <p className="map-notice">Dados © colaboradores do OpenStreetMap. A busca envia sua posição à Overpass. Pontos OSM são informativos; visitas e recompensas valem para locais cadastrados na plataforma.</p></>}
  </div>;
}
const osmIcon = L.divIcon({ className: 'travel-marker', html: '<span style="background:#1765e5"></span>', iconSize: [30, 30], iconAnchor: [15, 30] });
export function safeWebsite(value: string) { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; } }
export function OsmMarkers({ pois, places, category }: { pois: OsmPoi[]; places: Place[]; category: OsmKey | '' }) {
  // Prefer a registered venue when name and position match; never bind rewards by inference.
  return pois.filter(p => (!category || category === p.category) && !places.some(place => p.name && p.name.toLocaleLowerCase().trim() === place.name.toLocaleLowerCase().trim() && distanceMeters(p.latitude, p.longitude, place.latitude, place.longitude) < 40)).map(p => <Marker key={p.id} position={[p.latitude, p.longitude]} icon={osmIcon}><Popup><div className="map-popup">
    <strong>{p.name || 'Nome não informado no OSM'}</strong><p>{categoryLabels[p.category]} · {p.subcategory}</p>
    {p.address && <p>{p.address}</p>}{p.phone && <p>Telefone: {p.phone}</p>}{p.openingHours && <p>Horários: {p.openingHours}</p>}
    {safeWebsite(p.website) && <p><a href={safeWebsite(p.website)!} target="_blank" rel="noopener noreferrer">Visitar site</a></p>}
    <p>Local OSM — sem visita registrada na plataforma.</p><a href={`https://www.openstreetmap.org/${p.id}`} target="_blank" rel="noopener noreferrer">Ver no OpenStreetMap</a>
  </div></Popup></Marker>);
}
