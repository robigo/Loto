// Gate EVERY asset. No public origin, proxy to GitHub Pages, or client-only gate.
const cache = new Map();
const algorithm = {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'};
function decode(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw Error('encoding');
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}
function json(value) { return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(decode(value))); }
function reply(body, status = 200, type = 'text/plain; charset=utf-8') {
  return new Response(body, {status, headers: {
    'Content-Type': type, 'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "frame-ancestors 'none'", 'Vary': 'Cookie, Cf-Access-Jwt-Assertion'
  }});
}
export function createWorker(fetchKeys = fetch) {
  return {async fetch(request, env) {
    const {ACCESS_ISSUER: issuer, ACCESS_AUD: audience, APP_HOSTNAME: hostname} = env;
    const emails = new Set((env.APPROVED_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean));
    if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer || '') ||
        !audience || !hostname || !emails.size) return reply('Access is not configured.', 503);
    const url = new URL(request.url);
    if (url.protocol !== 'https:' || url.host !== hostname) return reply('Forbidden', 403);
    if (!['GET', 'HEAD'].includes(request.method)) return reply('Method not allowed', 405);
    let claims;
    try {
      const token = request.headers.get('Cf-Access-Jwt-Assertion') || '';
      if (token.length > 16384) throw Error('size');
      const parts = token.split('.');
      if (parts.length !== 3) throw Error('jwt');
      const header = json(parts[0]);
      claims = json(parts[1]);
      const now = Math.floor(Date.now() / 1000);
      if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.crit ||
          claims.iss !== issuer || !Array.isArray(claims.aud) || !claims.aud.includes(audience) ||
          !Number.isInteger(claims.exp) || claims.exp <= now ||
          !Number.isInteger(claims.iat) || claims.iat > now ||
          (claims.nbf !== undefined && (!Number.isInteger(claims.nbf) || claims.nbf > now)) ||
          typeof claims.sub !== 'string' || !claims.sub ||
          typeof claims.email !== 'string') throw Error('claims');
      // Never use a token-supplied jku/x5u/iss as a key URL.
      let entry = cache.get(issuer);
      if (!entry || entry.until <= Date.now()) {
        const response = await fetchKeys(issuer + '/cdn-cgi/access/certs', {
          redirect: 'error', signal: AbortSignal.timeout(5000)
        });
        if (!response.ok) throw Error('keys');
        const jwks = await response.json();
        if (!Array.isArray(jwks.keys)) throw Error('keys');
        entry = {keys: jwks.keys, until: Date.now() + 60000};
        cache.set(issuer, entry);
      }
      const jwk = entry.keys.find(k => k.kid === header.kid && k.kty === 'RSA' &&
        (!k.alg || k.alg === 'RS256') && (!k.use || k.use === 'sig'));
      if (!jwk) throw Error('key'); // Rotation may deny until the 60-second cache expires.
      const key = await crypto.subtle.importKey('jwk', jwk, algorithm, false, ['verify']);
      if (!await crypto.subtle.verify(algorithm, key, decode(parts[2]),
        new TextEncoder().encode(parts[0] + '.' + parts[1]))) throw Error('signature');
      if (!emails.has(claims.email.toLowerCase())) return reply('Forbidden', 403);
    } catch { return reply('Authentication required', 401); }
    if (url.pathname === '/__access/identity') {
      return reply(JSON.stringify({email: claims.email.toLowerCase()}), 200, 'application/json');
    }
    const asset = await env.ASSETS.fetch(request);
    const result = new Response(asset.body, asset);
    for (const [key, value] of reply('').headers) {
      if (key !== 'content-type') result.headers.set(key, value);
    }
    return result;
  }};
}
export default createWorker();
