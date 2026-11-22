import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRelay, SOURCE } from '../cloud/pais-relay/worker.mjs';
const env = { RELAY_TOKEN: 'x'.repeat(48) };
const req = (path = '/results.csv', token = env.RELAY_TOKEN) => new Request(`https://relay.test${path}`, {
  headers: { Authorization: `Bearer ${token}` }
});

test('missing configuration or wrong credential never contacts upstream', async () => {
  const relay = createRelay(() => { throw new Error('Must not fetch'); });
  assert.equal((await relay(req(), {})).status, 401);
  assert.equal((await relay(req('/results.csv', 'wrong'), env)).status, 401);
});
test('cannot proxy a caller-selected URL', async () => {
  const relay = createRelay(() => { throw new Error('Must not fetch'); });
  assert.equal((await relay(req('/results.csv?url=https://other.test'), env)).status, 404);
  assert.equal((await relay(req('/other'), env)).status, 404);
});
test('passes through original bytes only from fixed HTTPS source, with no redirects or cache', async () => {
  const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0xd7, 0x94, 0x2c, 0x31, 0x0d, 0x0a]);
  const relay = createRelay(async (url, options) => {
    assert.equal(url, SOURCE);
    assert.equal(options.redirect, 'manual');
    return new Response(bytes);
  });
  const response = await relay(req(), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('X-Pais-Source'), SOURCE);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
});
for (const [name, response] of [
  ['redirect', () => new Response(null, { status: 302, headers: { Location: 'https://other.test' } })],
  ['upstream failure', () => new Response('denied', { status: 403 })],
  ['HTML', () => new Response('<!DOCTYPE html><html>Denied</html>')],
  ['empty source', () => new Response('')],
  ['oversized stream', () => new Response(new Uint8Array(5_000_001))]
]) {
  test(`rejects ${name}`, async () => {
    assert.equal((await createRelay(async () => response())(req(), env)).status, 502);
  });
}
