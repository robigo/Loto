// A fixed-source, authenticated transport. Validation and publication stay in GitHub.
export const SOURCE = 'https://www.pais.co.il/Lotto/lotto_resultsDownload.aspx';
const MAX_BYTES = 5_000_000;
const headers = { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' };

export function createRelay(upstreamFetch = fetch) {
  return async function handle(request, env) {
    if (!env.RELAY_TOKEN || env.RELAY_TOKEN.length < 40 ||
        request.headers.get('Authorization') !== `Bearer ${env.RELAY_TOKEN}`) {
      return new Response('Unauthorized', { status: 401, headers });
    }
    const url = new URL(request.url);
    if (url.pathname !== '/results.csv' || url.search || request.method !== 'GET') {
      return new Response('Not found', { status: 404, headers });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    let upstreamStatus = 'not-received';
    try {
      const result = await upstreamFetch(SOURCE, {
        redirect: 'manual', signal: controller.signal,
        headers: { 'Accept': 'text/csv,*/*;q=0.1', 'User-Agent': 'LotoResultsUpdater/1.0',
                   'Cache-Control': 'no-cache' },
        cf: { cacheTtl: 0, cacheEverything: false }
      });
      upstreamStatus = String(result.status);
      if (result.status !== 200 || !result.body) {
        throw new Error('Upstream unavailable');
      }
      const declared = result.headers.get('Content-Length');
      if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_BYTES)) {
        throw new Error('Invalid size');
      }
      const reader = result.body.getReader();
      let size = 0;
      const chunks = [];
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_BYTES) throw new Error('Too large');
          chunks.push(value);
        }
      } catch (error) {
        await reader.cancel();
        throw error;
      }
      if (!size) throw new Error('Empty source');
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      const start = new TextDecoder().decode(bytes.subarray(0, 512)).toLowerCase();
      if (start.includes('<html') || start.includes('<!doctype')) throw new Error('HTML source');
      return new Response(bytes, { headers: {
        ...headers, 'Content-Type': 'text/csv', 'Content-Length': String(size),
        'X-Pais-Source': SOURCE, 'X-Retrieved-At': new Date().toISOString()
      } });
    } catch (error) {
      return new Response('Official source unavailable; no data published', { status: 502,
        headers: { ...headers, 'X-Relay-Upstream-Status': upstreamStatus,
                   'X-Relay-Colo': request.cf?.colo || 'unknown',
                   'X-Relay-Failure': ['Upstream unavailable', 'Invalid size', 'Too large',
                                      'Empty source', 'HTML source'].includes(error.message)
                     ? error.message : 'Transport error' } });
    } finally {
      clearTimeout(timer);
    }
  };
}

export default { fetch: createRelay() };
