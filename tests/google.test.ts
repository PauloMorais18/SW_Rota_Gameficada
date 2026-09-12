import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatch } from '../src/server/http';
import { googleLogin } from '../src/server/google';
test('Google OAuth refuses callback without matching browser state before any token exchange', async () => {
  const previous = [process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI];
  Object.assign(process.env, { GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret', GOOGLE_REDIRECT_URI: 'http://localhost/api/google' });
  try {
    const result = await dispatch(new Request('http://localhost/api/google?code=fake&state=forged'), googleLogin);
    assert.equal(result.status, 302); assert.match(result.headers.get('location')!, /google_session/);
    const start = await dispatch(new Request('http://localhost/api/google?start=1'), googleLogin);
    const target = new URL(start.headers.get('location')!);
    assert.equal(target.origin, 'https://accounts.google.com');
    assert.equal(target.searchParams.get('code_challenge_method'), 'S256');
    assert.ok(target.searchParams.get('nonce')); assert.ok(target.searchParams.get('state'));
    assert.match(start.headers.get('set-cookie')!, /HttpOnly/);
  } finally {
    ['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_REDIRECT_URI'].forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; });
  }
});
