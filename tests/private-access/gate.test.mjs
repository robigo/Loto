import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createWorker} from '../../private-access/worker.mjs';
const pair = await webcrypto.subtle.generateKey({name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
  publicExponent: new Uint8Array([1,0,1]), hash: 'SHA-256'}, true, ['sign', 'verify']);
const jwk = {...await webcrypto.subtle.exportKey('jwk', pair.publicKey), kid: 'test-key', alg: 'RS256'};
const now = Math.floor(Date.now()/1000);
const base = {iss: 'https://loto-test.cloudflareaccess.com', aud: ['loto-aud'],
  sub: 'google-user', email: 'approved@example.test', iat: now-5, exp: now+300};
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
async function token(changes = {}, header = {}) {
  const unsigned = encode({alg: 'RS256', kid: 'test-key', ...header})+'.'+encode({...base, ...changes});
  const signature = await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, Buffer.from(unsigned));
  return unsigned+'.'+Buffer.from(signature).toString('base64url');
}
let assets = 0, keyReads = 0;
const env = {ACCESS_ISSUER: base.iss, ACCESS_AUD: 'loto-aud', APP_HOSTNAME: 'loto.example.test',
  APPROVED_EMAILS: base.email, ASSETS: {fetch: async () => {assets++; return new Response('private asset');}}};
const worker = createWorker(async url => {
  keyReads++; assert.equal(url, base.iss+'/cdn-cgi/access/certs'); return Response.json({keys: [jwk]});
});
const request = (jwt, pathname = '/', host = 'loto.example.test', method = 'GET') =>
  new Request('https://'+host+pathname, {method, headers: jwt ? {'Cf-Access-Jwt-Assertion': jwt} : {}});
async function denied(jwt, expected = 401, path = '/') {
  const before = assets;
  assert.equal((await worker.fetch(request(jwt, path), env)).status, expected);
  assert.equal(assets, before, 'denied request must never reach ASSETS');
}
test('all routes reject guests, including HTML/JS/data and old alternate HTML', async () => {
  for (const p of ['/', '/index.html', '/account.js', '/data/history.json', '/LOTO1.html', '/__access/identity']) await denied(null, 401, p);
});
test('reject unsigned, malformed and forged JWTs and identity headers', async () => {
  for (const t of ['a.b.c', 'not-a-jwt', await token({}, {alg: 'none'}), await token({}, {alg: 'HS256'}),
    (await token()).split('.').slice(0,2).join('.')+'.ZmFrZQ']) await denied(t);
  const r = request(null); r.headers.set('Cf-Access-Authenticated-User-Email', base.email);
  assert.equal((await worker.fetch(r, env)).status, 401);
});
test('reject wrong issuer, audience, expiry, future times, missing subject, service identity', async () => {
  for (const c of [{iss:'https://evil.test'}, {aud:['other']}, {aud:'loto-aud'}, {exp:now-1},
    {exp:null}, {iat:now+100}, {nbf:now+100}, {nbf:'bad'}, {sub:''}, {email:null}]) await denied(await token(c));
});
test('valid signed unapproved identity is denied', async () => { await denied(await token({email:'stranger@example.test'}), 403); });
test('unknown key and critical extensions denied', async () => {
  await denied(await token({}, {kid:'unknown'})); await denied(await token({}, {crit:['custom']}));
});
test('approved signed identity can fetch assets with no-store', async () => {
  const r = await worker.fetch(request(await token(), '/data/history.json'), env);
  assert.equal(r.status, 200); assert.equal(await r.text(), 'private asset');
  assert.equal(r.headers.get('cache-control'), 'private, no-store');
});
test('identity endpoint reveals only verified email', async () => {
  const r = await worker.fetch(request(await token(), '/__access/identity'), env);
  assert.deepEqual(await r.json(), {email:base.email});
});
test('alternate workers.dev and preview hosts cannot bypass gate', async () => {
  for (const host of ['loto.workers.dev','version-loto.workers.dev','old.github.io']) {
    assert.equal((await worker.fetch(request(await token(), '/', host), env)).status, 403);
  }
});
test('missing configuration, empty approval list and non-GET fail closed', async () => {
  for (const key of ['ACCESS_ISSUER','ACCESS_AUD','APP_HOSTNAME','APPROVED_EMAILS']) {
    assert.equal((await worker.fetch(request(await token()), {...env,[key]:''})).status, 503);
  }
  assert.equal((await worker.fetch(request(await token(), '/', env.APP_HOSTNAME, 'POST'), env)).status, 405);
});
test('key server failure denies assets without fallback', async () => {
  const issuer = 'https://failure-test.cloudflareaccess.com';
  const failing = createWorker(async () => {throw Error('network');});
  const before = assets;
  assert.equal((await failing.fetch(request(await token({iss:issuer})), {...env,ACCESS_ISSUER:issuer})).status, 401);
  assert.equal(assets, before); assert(keyReads > 0);
});
