import { useCallback, useEffect, useRef, useState } from 'react';
import { TRACK_INTERVAL_MS, type Position, type SavedPoint, type TrackResponse } from '@/lib/tracking';
export function useTracking(userId: string | undefined, visitor: boolean, participationId: string | null, onChange: () => Promise<void>, scopeKey = '') {
  const [enabled, setEnabled] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const [points, setPoints] = useState<SavedPoint[]>([]);
  const [message, setMessage] = useState('Ative o GPS para acompanhar sua posição.');
  const [error, setError] = useState('');
  const session = useRef('');
  const generation = useRef(0);
  useEffect(() => { setEnabled(false); setPosition(null); setPoints([]); session.current = ''; }, [userId, participationId, scopeKey]);
  useEffect(() => {
    if (!enabled) return;
    if (!navigator.geolocation) { setError('Este navegador não oferece localização.'); setEnabled(false); return; }
    const token = ++generation.current;
    if (!session.current) session.current = crypto.randomUUID();
    const sessionId = session.current;
    let latest: Position | null = null, lastSent = 0, busy = false;
    const send = async () => {
      if (!visitor || !userId || !latest || busy || Date.now() - lastSent < TRACK_INTERVAL_MS || Date.now() - latest.timestamp > 30000 || document.visibilityState === 'hidden') return;
      busy = true; lastSent = Date.now();
      try {
        const res = await fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'trackLocation', sessionId, participationId, location: latest }) });
        const result = await res.json() as TrackResponse & { error?: string };
        if (generation.current !== token) return;
        if (!res.ok) throw new Error(result.error || 'Não foi possível salvar sua posição.');
        setError(''); setMessage(result.message);
        if (result.point) setPoints(prev => [...prev.filter(p => p.chave !== result.point!.chave), result.point!].slice(-2000));
        if (result.changed) await onChange();
      } catch (e) { if (generation.current === token) setError((e as Error).message); }
      finally { busy = false; }
    };
    if (visitor) fetch(`/api/track?sessionId=${sessionId}`).then(r => r.ok ? r.json() : null).then(result => { if (result && generation.current === token) setPoints(prev => { const unique = new Map<string, SavedPoint>(); [...result.points, ...prev].forEach(p => unique.set(p.chave, p)); return [...unique.values()].sort((a, b) => a.datahoracad.localeCompare(b.datahoracad)); }); }).catch(() => {});
    const watcher = navigator.geolocation.watchPosition(p => { latest = { latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy, timestamp: p.timestamp }; setPosition(latest); setError(''); void send(); }, e => { latest = null; setError(e.code === 1 ? 'Localização negada. Permita o GPS nas configurações do navegador e tente novamente.' : e.code === 3 ? 'O GPS demorou a responder. Vá para uma área aberta.' : 'Não foi possível localizar você. Verifique o sinal do GPS.'); if (e.code === 1) setEnabled(false); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    let freshPending = false, lastFixAttempt = 0;
    const timer = setInterval(() => {
      // watchPosition can stop emitting while stationary. Request a fresh fix
      // rather than reusing an old GPS timestamp to validate dwell time.
      if (latest && Date.now() - latest.timestamp > 25000 && !freshPending && Date.now() - lastFixAttempt >= TRACK_INTERVAL_MS && document.visibilityState !== 'hidden') {
        freshPending = true; lastFixAttempt = Date.now();
        navigator.geolocation.getCurrentPosition(p => { freshPending = false; if (generation.current !== token) return; latest = { latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy, timestamp: p.timestamp }; setPosition(latest); void send(); }, () => { freshPending = false; if (generation.current === token) setError('Aguardando uma posição atualizada do GPS.'); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
      }
      void send();
    }, 1000);
    return () => { generation.current++; navigator.geolocation.clearWatch(watcher); clearInterval(timer); };
  }, [enabled, userId, visitor, participationId, onChange, scopeKey]);
  const start = useCallback(() => { setError(''); setEnabled(true); }, []);
  const stop = useCallback(() => { setEnabled(false); setMessage('GPS pausado. O tempo sem monitoramento não é validado.'); }, []);
  return { enabled, position, points, message, error, start, stop };
}
