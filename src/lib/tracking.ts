import { z } from 'zod';
export const TRACK_INTERVAL_MS = 25000;
export const locationInput = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), accuracy: z.number().min(0).max(100000), timestamp: z.number().refine(t => Math.abs(Date.now() - t) <= 30000, 'O GPS está desatualizado. Aguarde uma nova posição.') });
export type Position = z.infer<typeof locationInput>;
export type SavedPoint = { chave: string; latitude: number; longitude: number; accuracy: number; capturedAt: string; datahoracad: string; breakBefore?: boolean };
export type TrackResponse = { point?: SavedPoint; message: string; changed: boolean; throttled?: boolean };
export function markerStatus(completed: boolean, inside: boolean, special: boolean) {
  if (completed) return { color: '#229d70', label: 'Visita concluída' };
  if (inside) return { color: '#dca51b', label: 'Você está dentro do raio' };
  if (special) return { color: '#8854d0', label: 'Recompensa especial' };
  return { color: '#1765e5', label: 'Ainda não visitado' };
}
