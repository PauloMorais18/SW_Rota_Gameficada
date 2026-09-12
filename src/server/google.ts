import { randomBytes, createHash } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { cookies } from './http.js';
import { setSession } from '../lib/auth.js';
import { db } from '../lib/db.js';

const jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
export const googleEnabled = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
export async function googleLogin(request: Request): Promise<Response> {
  const jar = await cookies();
  const url = new URL(request.url);
  const fail = (code: string) => new Response(null, { status: 302, headers: { Location: `/?auth_error=${code}#home`, 'Cache-Control': 'no-store' } });
  if (!googleEnabled()) return fail('google_not_configured');
  try {
    if (url.searchParams.get('start') === '1') {
      const state = randomBytes(32).toString('base64url');
      const nonce = randomBytes(32).toString('base64url');
      const verifier = randomBytes(48).toString('base64url');
      jar.set('rota_google', JSON.stringify({ state, nonce, verifier, expires: Date.now() + 600000 }), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 600 });
      const target = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      target.search = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: process.env.GOOGLE_REDIRECT_URI!, response_type: 'code', scope: 'openid email profile', state, nonce, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', prompt: 'select_account' }).toString();
      return new Response(null, { status: 302, headers: { Location: target.href, 'Cache-Control': 'no-store' } });
    }
    const raw = jar.get('rota_google')?.value;
    jar.delete('rota_google');
    if (!raw) return fail('google_session');
    const flow = JSON.parse(raw);
    if (typeof flow.state !== 'string' || flow.state !== url.searchParams.get('state') || flow.expires < Date.now()) return fail('google_session');
    if (url.searchParams.has('error')) return fail('google_cancelled');
    const code = url.searchParams.get('code');
    if (!code) return fail('google_session');
    const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: process.env.GOOGLE_REDIRECT_URI!, grant_type: 'authorization_code', code_verifier: flow.verifier }), signal: AbortSignal.timeout(10000) });
    if (!response.ok) return fail('google_failed');
    const tokens = await response.json();
    const { payload } = await jwtVerify(tokens.id_token, jwks, { algorithms: ['RS256'], issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: process.env.GOOGLE_CLIENT_ID! });
    if (payload.nonce !== flow.nonce || !payload.sub || payload.email_verified !== true || typeof payload.email !== 'string') return fail('google_failed');
    let user = await db.user.findUnique({ where: { googleSubject: payload.sub } });
    if (!user) {
      // Never elevate or silently link an existing password account by matching email.
      if (await db.user.findUnique({ where: { email: payload.email.toLowerCase() } })) return fail('google_existing_account');
      user = await db.user.create({ data: { googleSubject: payload.sub, email: payload.email.toLowerCase(), name: typeof payload.name === 'string' ? payload.name.slice(0, 300) : 'Visitante', role: 'VISITANTE', passwordHash: await bcrypt.hash(randomBytes(48).toString('base64url'), 12) } });
    }
    if (!user.ativo) return fail('google_inactive');
    await setSession(user.chave);
    return new Response(null, { status: 302, headers: { Location: '/#dashboard', 'Cache-Control': 'no-store' } });
  } catch { return fail('google_failed'); }
}
