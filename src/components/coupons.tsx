import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import QrScanner from 'qr-scanner';
import type { Place } from '../lib/types';
type Row = { chave: string; titulo: string; local: string; percentual: number; expiresAt?: string; limite?: number; usados?: number; token?: string; ativo?: boolean; datahoracad?: string };
async function request(action: string, data: Record<string, unknown> = {}) {
 const response = await fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...data }) });
 const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Não foi possível acessar os cupons.'); return result;
}
export default function Coupons({ visitor, places }: { visitor: boolean; places: Place[] }) {
 const [rows, setRows] = useState<Row[]>([]), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
 const [qr, setQr] = useState(''), [token, setToken] = useState(() => new URLSearchParams(location.search).get('coupon') || '');
 const [preview, setPreview] = useState<(Row & { disponivel: boolean }) | null>(null);
 const [scanning, setScanning] = useState(false);
 const video = useRef<HTMLVideoElement>(null);
 const refresh = async () => { const result = await request('couponList'); setRows(result.rows); };
 useEffect(() => { refresh().catch(e => setMessage(e.message)); }, []);
 useEffect(() => {
  if (!visitor || !token) return;
  let disposed = false; setPreview(null);
  request('couponPreview', { token }).then(r => { if (!disposed) setPreview(r.coupon); }).catch(e => { if (!disposed) setMessage(e.message); });
  return () => { disposed = true; };
 }, [token, visitor]);
 useEffect(() => {
  if (!scanning || !video.current) return;
  const scanner = new QrScanner(video.current, result => {
   try { const url = new URL(result.data); const value = url.searchParams.get('coupon'); if (url.origin !== location.origin || !value) throw new Error(); setToken(value); setScanning(false); setMessage('Confira o desconto antes de confirmar.'); }
   catch { setMessage('Este QR Code não é um cupom desta aplicação.'); }
  }, { preferredCamera: 'environment', returnDetailedScanResult: true });
  scanner.start().catch(() => { setScanning(false); setMessage('Não foi possível abrir a câmera. Permita o acesso ou abra o QR Code pela câmera do celular.'); });
  return () => { scanner.stop(); scanner.destroy(); };
 }, [scanning]);
 const perform = async (action: string, data: Record<string, unknown>) => {
  setBusy(true); setMessage('');
  try { const result = await request(action, data); setMessage(result.message); await refresh(); if (action === 'couponRedeem') { setPreview(null); setToken(''); history.replaceState(null, '', location.pathname + '#coupons'); } return true; }
  catch (e) { setMessage((e as Error).message); return false; } finally { setBusy(false); }
 };
 return <div className="panel"><h2>{visitor ? 'Meus cupons' : 'Cupons de desconto'}</h2><p>Um uso por visitante. O desconto é aplicado pela loja no atendimento.</p>
  {message && <p role="status" className="info-box">{message}</p>}
  {visitor ? <><button className="primary" onClick={() => setScanning(v => !v)}>{scanning ? 'Fechar câmera' : 'Escanear QR Code'}</button>{scanning && <video ref={video} style={{ width: '100%', maxWidth: 420 }} muted playsInline />}
   {preview && <div className="panel mt"><h3>{preview.titulo}</h3><p>{preview.percentual}% de desconto • {preview.local}</p><p>Válido até {new Date(preview.expiresAt!).toLocaleString('pt-BR')}</p><button className="primary" disabled={busy || !preview.disponivel} onClick={() => perform('couponRedeem', { token })}>{preview.disponivel ? 'Confirmar uso do cupom' : 'Cupom esgotado'}</button></div>}
  </> : <><form onSubmit={async e => { e.preventDefault(); const form = e.currentTarget; const data = Object.fromEntries(new FormData(form)); if (await perform('couponCreate', { ...data, expiresAt: new Date(String(data.expiresAt)).toISOString() })) form.reset(); }}>
   <label className="field">Estabelecimento<select name="placeId" required>{places.filter(p => p.ativo && p.approval === 'APROVADO').map(p => <option value={p.chave} key={p.chave}>{p.name}</option>)}</select></label>
   <label className="field">Nome do cupom<input name="titulo" required minLength={3} maxLength={120} placeholder="Desconto no café da tarde" /></label>
   <div className="form-grid"><label className="field">Desconto (%)<input name="percentual" type="number" min={1} max={100} required /></label><label className="field">Limite total de usos<input name="limite" type="number" min={1} max={100000} required /></label><label className="field">Válido até<input name="expiresAt" type="datetime-local" required /></label></div>
   <button className="primary" disabled={busy || !places.some(p => p.ativo && p.approval === 'APROVADO')}>Criar cupom</button>
  </form>{qr && <div className="panel mt"><h3>Escaneie para utilizar o cupom</h3><img src={qr} width={280} height={280} style={{ maxWidth: '100%', height: 'auto' }} alt="QR Code do cupom de desconto" /><button className="secondary" onClick={() => setQr('')}>Fechar QR Code</button></div>}</>}
  <h3 className="mt">{visitor ? 'Cupons utilizados' : 'Seus cupons e utilizações'}</h3><button className="secondary small" onClick={() => refresh().catch(e => setMessage(e.message))}>Atualizar contagem</button>
  {!rows.length && <p>Nenhum cupom registrado.</p>}{rows.map(row => <div className="table-row" key={row.chave}><div className="grow"><strong>{row.titulo} • {row.percentual}%</strong><small>{row.local}</small>{visitor ? <small>Utilizado em {new Date(row.datahoracad!).toLocaleString('pt-BR')}</small> : <small>{row.usados} de {row.limite} utilizados • {!row.ativo ? 'Desativado' : new Date(row.expiresAt!) < new Date() ? 'Expirado' : 'Ativo'}</small>}</div>{!visitor && <div className="row-actions"><button className="secondary small" disabled={!row.ativo || new Date(row.expiresAt!) < new Date() || row.usados! >= row.limite!} onClick={async () => { try { const url = new URL(location.pathname, location.origin); url.searchParams.set('coupon', row.token!); url.hash = 'coupons'; setQr(await QRCode.toDataURL(url.href, { width: 560, margin: 4 })); } catch { setMessage('Não foi possível gerar o QR Code.'); } }}>Exibir QR Code</button><button className="text-button" disabled={busy || !row.ativo} onClick={() => perform('couponDisable', { chave: row.chave })}>Desativar</button></div>}</div>)}
 </div>;
}
