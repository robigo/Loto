"""Validate official Pais bytes transported by our authenticated Cloudflare relay."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import time
import urllib.error
import urllib.request

import update_results as importer

ROOT = Path(__file__).resolve().parents[1]
RELAY_URL = 'https://loto-public-pais-relay.goshen-r.workers.dev/results.csv'
OFFICIAL_SOURCE = 'https://www.pais.co.il/Lotto/lotto_resultsDownload.aspx'


def download(token, opener=None):
    if not token or len(token) < 40:
        raise ValueError('PAIS_RELAY_TOKEN is not configured')
    opener = opener or urllib.request.build_opener(importer.NoRedirect())
    request = urllib.request.Request(RELAY_URL, headers={
        'Authorization': 'Bearer ' + token, 'User-Agent': 'LotoResultsUpdater/1.0',
        'Accept': 'text/csv', 'Cache-Control': 'no-cache'})
    for attempt in range(3):
        try:
            with opener.open(request, timeout=35) as response:
                if response.url != RELAY_URL or response.headers.get('X-Pais-Source') != OFFICIAL_SOURCE:
                    raise ValueError('Unexpected relay or source')
                raw = response.read(importer.MAX_BYTES + 1)
                if len(raw) > importer.MAX_BYTES:
                    raise ValueError('Source too large')
                length = response.headers.get('Content-Length')
                if length is not None and int(length) != len(raw):
                    raise ValueError('Incomplete relay response')
                return raw
        except urllib.error.HTTPError as error:
            if error.code not in {408, 429, 500, 502, 503, 504} or attempt == 2:
                raise
        except (urllib.error.URLError, TimeoutError):
            if attempt == 2:
                raise
        time.sleep(2 ** (attempt + 1))


def synchronize(token, root=ROOT, check=False):
    files = ('data/history.json', 'data/draws.json')
    before = {name: (root / name).read_bytes() for name in files}
    raw = download(token)
    validation = importer.update(raw, root=root, dry_run=True)
    if any((root / name).read_bytes() != before[name] for name in files):
        raise RuntimeError('Validation unexpectedly wrote data')
    result = validation if check else importer.update(raw, root=root)
    if not check and importer.update(raw, root=root, dry_run=True)['wouldUpdate']:
        raise RuntimeError('Written data failed idempotence check')
    return dict(result, source=OFFICIAL_SOURCE, transport='authenticated Cloudflare relay',
                sourceSha256=hashlib.sha256(raw).hexdigest(), check=check)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    try:
        result = synchronize(os.environ.get('PAIS_RELAY_TOKEN'), check=args.check)
    except Exception as error:
        # Never print headers, tokens or raw exception messages from network code.
        raise SystemExit('Cloud sync failed safely: ' + type(error).__name__) from None
    print(json.dumps(result))
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as output:
            output.write('updated=' + str(result['updated']).lower() + '\n')
            output.write('latest_id=' + result['latestId'] + '\n')


if __name__ == '__main__':
    main()
