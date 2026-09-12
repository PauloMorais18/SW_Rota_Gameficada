import { useCallback, useEffect, useRef, useState } from 'react';
import { distanceMeters } from '../lib/visits';
import type { Place } from '../lib/types';
import { TRACK_INTERVAL_MS, type Position, type SavedPoint, type TrackResponse } from '@/lib/tracking';
export function useTracking(userId: string | undefined, visitor: boolean, participationId: string | null, onChange: () => Promise<void>, scopeKey = '', places: Place[] = [], activeVisit = false) {
  const [enabled, setEnabled] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const [points, setPoints] = useState<SavedPoint[]>([]);
  const [message, setMessage] = useState('Ative o GPS para acompanhar sua posição.');
  const [error, setError] = useState('');
  const [ended, setEnded] = useState(false);
  const breakPath = useRef(true);
  const context = useRef({ places, activeVisit }); context.current = { places, activeVisit };
  const watch = useRef<number | null>(null);
  const session = useRef('');
  const generation = useRef(0);
  useEffect(() => { setEnabled(false); setPosition(null); setPoints([]); setEnded(false); breakPath.current = true; session.current = ''; }, [userId, participationId, scopeKey]);
  useEffect(() => {
    if (!enabled) return;
    if (!navigator.geolocation) { setError('Este navegador não oferece localização.'); setEnabled(false); return; }
    const token = ++generation.current;
    if (!session.current) session.current = crypto.randomUUID();
    const sessionId = session.current;
    let latest: Position | null = null, lastSent = 0, busy = false;
    let wasNear = false;
    const record = (fix: GeolocationPosition) => {
      if (generation.current !== token) return;
      latest = { latitude: fix.coords.latitude, longitude: fix.coords.longitude, accuracy: fix.coords.accuracy, timestamp: fix.timestamp };
      setPosition(latest);
      const point = { ...latest, chave: crypto.randomUUID(), capturedAt: new Date(fix.timestamp).toISOString(), datahoracad: new Date(fix.timestamp).toISOString(), breakBefore: breakPath.current };
      breakPath.current = false;
      setPoints(prev => [...prev, point].slice(-10000));
    };
    const send = async () => {
      if (generation.current !== token) return;
      if (!visitor || !userId || !latest || busy || Date.now() - lastSent < TRACK_INTERVAL_MS || Date.now() - latest.timestamp > 30000 || document.visibilityState === 'hidden') return;
      const near = context.current.places.some(place => place.ativo && place.approval === 'APROVADO' && distanceMeters(latest!.latitude, latest!.longitude, place.latitude, place.longitude) <= place.radiusMeters + latest!.accuracy);
      if (!near && !wasNear && !context.current.activeVisit) return;
      wasNear = near;
      busy = true; lastSent = Date.now();
      try {
        const res = await fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'trackLocation', sessionId, participationId, location: latest }) });
        const result = await res.json() as TrackResponse & { error?: string };
        if (generation.current !== token) return;
        if (!res.ok) throw new Error(result.error || 'Não foi possível salvar sua posição.');
        setError(''); setMessage(result.message);
        if (result.changed) await onChange();
      } catch (e) { if (generation.current === token) setError((e as Error).message); }
      finally { busy = false; }
    };
    const watcher = navigator.geolocation.watchPosition(p => { record(p); setError(''); void send(); }, e => { if (generation.current !== token) return; latest = null; breakPath.current = true; setError(e.code === 1 ? 'Localização negada. Permita o GPS nas configurações do navegador e tente novamente.' : e.code === 3 ? 'O GPS demorou a responder. Vá para uma área aberta.' : 'Não foi possível localizar você. Verifique o sinal do GPS.'); if (e.code === 1) setEnabled(false); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    watch.current = watcher;
    let freshPending = false, lastFixAttempt = 0;
    const timer = setInterval(() => {
      // watchPosition can stop emitting while stationary. Request a fresh fix
      // rather than reusing an old GPS timestamp to validate dwell time.
      if (latest && Date.now() - latest.timestamp > 25000 && !freshPending && Date.now() - lastFixAttempt >= TRACK_INTERVAL_MS && document.visibilityState !== 'hidden') {
        freshPending = true; lastFixAttempt = Date.now();
        navigator.geolocation.getCurrentPosition(p => { freshPending = false; if (generation.current !== token) return; record(p); void send(); }, () => { freshPending = false; if (generation.current === token) setError('Aguardando uma posição atualizada do GPS.'); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
      }
      void send();
    }, 1000);
    return () => { generation.current++; navigator.geolocation.clearWatch(watcher); watch.current = null; clearInterval(timer); };
  }, [enabled, userId, visitor, participationId, onChange, scopeKey]);
  const start = useCallback(() => { if (!session.current) setPoints([]); setEnded(false); setError(''); setEnabled(true); setMessage('Rota iniciada. Acompanhando sua posição.'); }, []);
  const stop = useCallback(() => { generation.current++; if (watch.current !== null) navigator.geolocation.clearWatch(watch.current); breakPath.current = true; setEnabled(false); setMessage('GPS pausado. O tempo sem monitoramento não é validado.'); }, []);
  const end = useCallback(() => { stop(); session.current = ''; setEnded(true); setMessage('Rota encerrada. O caminho permanece no mapa até iniciar outra rota.'); }, [stop]);
  return { enabled, ended, position, points, message, error, start, stop, end };
}
